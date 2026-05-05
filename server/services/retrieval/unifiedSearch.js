import * as crypto from 'crypto';
import RagConfig from '../../config/ragConfig.js';
import CacheService from '../cacheService.js';
import Logger from '../loggerService.js';
import Monitor from '../monitoringService.js';
import { hybridSearch } from './hybridSearch.js';
import { searchImages } from './imageSearch.js';
import { searchMantis } from './mantisSearch.js';
import { augmentQuery } from './queryAugmentation.js';

export const unifiedSearch = async (query, filters = {}, intent = null, topK = 60) => {
    const cacheKeyInput = JSON.stringify({ query: query.trim().toLowerCase(), filters, topK });
    const cacheKey = crypto.createHash('md5').update(cacheKeyInput).digest('hex');

    const cached = CacheService.get('search', cacheKey);
    if (cached) return cached;

    const requestId = crypto.randomUUID();
    Monitor.startTimer(requestId, 'unified_search');

    try {
        let shouldSearchMantis = intent?.search_mantis ?? false;
        let shouldSearchImages = intent?.search_images ?? true;
        let shouldSearchText = intent?.search_text ?? true;

        const baseLimit = topK || RagConfig.context.dbFetchLimit;
        const textLimit = shouldSearchMantis ? Math.floor(baseLimit / 2) : baseLimit;
        const imageLimit = shouldSearchMantis ? 5 : 10;

        let textDocs = [];
        if (shouldSearchText) {
            // Augment the query (Rewrite + HyDE) before searching
            const augmentedQueries = await augmentQuery(query, intent);
            textDocs = await hybridSearch(augmentedQueries, filters, textLimit);
        }

        const [textResults, mantisResults, imageResults] = await Promise.all([
            Promise.resolve(textDocs),
            shouldSearchMantis ? searchMantis(query, filters, RagConfig.context.mantisFetchLimit) : Promise.resolve([]),
            shouldSearchImages ? searchImages(query, filters, imageLimit) : Promise.resolve([])
        ]);

        const combinedResults = {
            textResults: [...mantisResults, ...textResults],
            imageResults
        };

        CacheService.set('search', cacheKey, combinedResults);
        Monitor.endTimer(requestId, 'unified_search');
        return combinedResults;

    } catch (err) {
        Logger.error('Unified search fatal error', err, { requestId });
        return { textResults: [], imageResults: [] };
    }
};

export const processResponseAndSources = (docs) => {
    if (!docs || docs.length === 0) return { filteredDocs: [], criticMessage: 'No documents found.' };

    const { thresholds, diversity } = RagConfig.search;
    const minScore = thresholds?.minScore || 0.3;
    const relativeGap = thresholds?.relativeGap || 0.7;
    const useDiversity = diversity?.enabled || true;
    const maxPerDoc = diversity?.maxPerDoc || 3;
    const finalLimit = thresholds?.finalLimit || 10;

    const topScore = docs[0].similarity;
    let filtered = docs.filter(d => d.similarity >= minScore);

    if (filtered.length > 0) {
        const cutoff = topScore * relativeGap;
        filtered = filtered.filter(d => d.similarity >= cutoff);
    }

    if (useDiversity) {
        const docCounts = {};
        const diverseDocs = [];
        for (const doc of filtered) {
            const docKey = doc.doc_id || doc.document_name;
            if (!docCounts[docKey]) docCounts[docKey] = 0;
            if (docCounts[docKey] < maxPerDoc) {
                diverseDocs.push(doc);
                docCounts[docKey]++;
            }
        }
        filtered = diverseDocs;
    }

    filtered = filtered.slice(0, finalLimit);

    let criticMessage = 'No relevant documents found.';
    if (filtered.length > 0) {
        const bestMatch = filtered[0].similarity;
        if (bestMatch > 0.8) criticMessage = `Critic: High relevance match(${(bestMatch * 100).toFixed(0)}%).`;
        else if (bestMatch > 0.5) criticMessage = `Critic: Moderate relevance(${(bestMatch * 100).toFixed(0)}%).`;
        else criticMessage = `Critic: Low relevance(${(bestMatch * 100).toFixed(0)}%), but proceeding.`;
    }

    return { filteredDocs: filtered, criticMessage };
};
