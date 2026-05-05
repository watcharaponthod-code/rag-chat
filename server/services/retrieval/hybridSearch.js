import { vectorDb } from '../../config/db.js';
import RagConfig from '../../config/ragConfig.js';
import { tokenizeText } from '../../utils/tokenizer.js';
import { getEmbedding } from './embedding.js';

export const hybridSearch = async (augmentedQueries, filters = {}, topK = RagConfig.context.dbFetchLimit) => {
    try {
        // Ensure it's an array
        const queries = Array.isArray(augmentedQueries) ? augmentedQueries : [augmentedQueries];

        // Optimize: Get embeddings for all queries concurrently
        const embeddings = await Promise.all(queries.map(q => getEmbedding(q)));

        let allVectorDocs = [];
        let allKeywordDocs = [];

        let filterSQL = "COALESCE(d.document_name, '') NOT ILIKE '%.xlsx'";

        // 1. Vector Search for all queries
        for (let i = 0; i < embeddings.length; i++) {
            const embedding = embeddings[i];
            if (embedding) {
                const vectorParams = [`[${embedding.join(',')}]`, topK];
                let vSqlWhere = filterSQL;

                if (filters.project_name) {
                    vSqlWhere += ` AND (d.project_name ILIKE '%' || $${vectorParams.length + 1} || '%' OR d.metadata->>'project_name' ILIKE '%' || $${vectorParams.length + 1} || '%')`;
                    vectorParams.push(filters.project_name);
                }
                if (filters.client_name) {
                    vSqlWhere += ` AND d.client_name = $${vectorParams.length + 1}`;
                    vectorParams.push(filters.client_name);
                }

                const vectorSql = `
                SELECT dc.id, dc.doc_id, dc.content, dc.metadata, d.document_name, d.project_name, d.client_name,
                       GREATEST(1.0 - (dc.embedding <=> $1), 0.0) as similarity, 'vector' as source
                FROM document_chunks dc
                JOIN documents d ON dc.doc_id = d.id
                WHERE ${vSqlWhere}
                ORDER BY dc.embedding <=> $1
                LIMIT $2
            `;
                try {
                    const res = await vectorDb.query(vectorSql, vectorParams);
                    allVectorDocs = [...allVectorDocs, ...res.rows];
                } catch (e) { console.error('Vector search error:', e.message); }
            }
        }

        // 2. Keyword Search for all queries
        for (const q of queries) {
            let tokenizedQuery = tokenizeText(q);
            if (tokenizedQuery) {
                tokenizedQuery = tokenizedQuery.split(/\s+/).join(' | ');
                const keywordParams = [tokenizedQuery, topK];
                let kSqlWhere = filterSQL;

                if (filters.project_name) {
                    kSqlWhere += ` AND (d.project_name ILIKE '%' || $${keywordParams.length + 1} || '%' OR d.metadata->>'project_name' ILIKE '%' || $${keywordParams.length + 1} || '%')`;
                    keywordParams.push(filters.project_name);
                }
                if (filters.client_name) {
                    kSqlWhere += ` AND d.client_name = $${keywordParams.length + 1}`;
                    keywordParams.push(filters.client_name);
                }

                const keywordSql = `
                SELECT dc.id, dc.doc_id, dc.content, dc.metadata, d.document_name, d.project_name, d.client_name,
                       LEAST(ts_rank_cd(dc.fts, to_tsquery('simple', $1)), 1.0) as similarity, 'keyword' as source
                FROM document_chunks dc
                JOIN documents d ON dc.doc_id = d.id
                WHERE ${kSqlWhere} AND dc.fts @@ to_tsquery('simple', $1)
                ORDER BY similarity DESC
                LIMIT $2
            `;
                try {
                    const res = await vectorDb.query(keywordSql, keywordParams);
                    allKeywordDocs = [...allKeywordDocs, ...res.rows];
                } catch (e) { console.error('Keyword search error:', e.message); }
            }
        }

        // 3. Fusion & Deduplication
        const combined = new Map();
        const { vectorWeight, keywordWeight, hybridBoostFactor } = RagConfig.search;

        allVectorDocs.forEach(doc => {
            const finalScore = doc.similarity * vectorWeight;
            if (combined.has(doc.id)) {
                // Keep the best score if same doc found by multiple sub-queries
                const existing = combined.get(doc.id);
                if (finalScore > existing.similarity) {
                    existing.similarity = finalScore;
                    existing.raw_vector = doc.similarity;
                }
            } else {
                combined.set(doc.id, {
                    ...doc,
                    similarity: finalScore,
                    raw_vector: doc.similarity,
                    raw_keyword: 0
                });
            }
        });

        allKeywordDocs.forEach(doc => {
            const rawKeyScore = doc.similarity;
            const weightedKeyScore = rawKeyScore * keywordWeight;

            if (combined.has(doc.id)) {
                const existing = combined.get(doc.id);
                existing.raw_keyword = rawKeyScore;
                existing.similarity = (existing.raw_vector * vectorWeight) + weightedKeyScore;
                existing.similarity *= hybridBoostFactor;
                existing.source = 'hybrid';
            } else {
                combined.set(doc.id, {
                    ...doc,
                    similarity: weightedKeyScore,
                    raw_vector: 0,
                    raw_keyword: rawKeyScore
                });
            }
        });

        const validResults = Array.from(combined.values())
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, topK);

        return validResults;
    } catch (err) {
        console.error('Hybrid search fatal error:', err);
        return [];
    }
};
