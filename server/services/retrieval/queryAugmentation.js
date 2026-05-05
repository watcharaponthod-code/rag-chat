import RagConfig from '../../config/ragConfig.js';
import * as Prompts from '../../config/prompts/searchPrompts.js';
import { callOllama } from '../llm/ollamaClient.js';
import Logger from '../loggerService.js';

/**
 * Augments the original query using Query Decomposition and HyDE.
 * Returns an array of strings containing the original query, sub-queries, and hypothetical documents.
 */
export const augmentQuery = async (originalQuery, intent) => {
    const config = RagConfig.preRetrieval;
    if (!config || !config.enabled) return [originalQuery];

    // Check if we should limit this to 'deep' strategy only
    if (config.applyOnlyToDeep && intent?.strategy !== 'deep') {
        return [originalQuery];
    }

    const { model, useHyDE, useRewrite, maxSubQueries } = config;
    let queriesToProcess = [originalQuery];
    let augmentedResults = [originalQuery];

    try {
        // 1. Query Decomposition (Rewrite)
        if (useRewrite) {
            const rewritePrompt = Prompts.QUERY_DECOMPOSITION_PROMPT(originalQuery);
            const rewriteResponse = await callOllama(model, rewritePrompt, '', false, { temperature: 0.1 });

            try {
                // Try to parse JSON array from response
                const jsonMatch = rewriteResponse.match(/\[[\s\S]*\]/);
                if (jsonMatch) {
                    let subQueries = JSON.parse(jsonMatch[0]);
                    if (Array.isArray(subQueries) && subQueries.length > 0) {
                        // Filter out the original if it exactly matches, limit the number
                        subQueries = subQueries
                            .filter(q => q.toLowerCase() !== originalQuery.toLowerCase())
                            .slice(0, maxSubQueries);

                        queriesToProcess = [originalQuery, ...subQueries];
                        augmentedResults = [...augmentedResults, ...subQueries];
                        Logger.info(`[Augment] Decomposed into: ${subQueries.join(', ')}`);
                    }
                }
            } catch (e) {
                Logger.warn(`[Augment] Failed to parse decomposition:`, e.message);
            }
        }

        // 2. HyDE Generation
        if (useHyDE) {
            // Generate HyDE for the original query and each sub-query concurrently
            const hydePromises = queriesToProcess.map(async (q) => {
                const hydePrompt = Prompts.HYDE_PROMPT(q);
                const doc = await callOllama(model, hydePrompt, '', false, { temperature: 0.3 });
                if (doc && !doc.startsWith('[System Error]')) {
                    // Remove quotes or think block if model hallucinates them
                    return doc.replace(/<think>[\s\S]*?<\/think>\s*/gi, '').trim();
                }
                return null;
            });

            const hydeDocs = await Promise.all(hydePromises);
            const validHydeDocs = hydeDocs.filter(doc => doc !== null && doc.length > 10);

            if (validHydeDocs.length > 0) {
                augmentedResults = [...augmentedResults, ...validHydeDocs];
                Logger.info(`[Augment] Generated ${validHydeDocs.length} HyDE docs.`);
            }
        }

    } catch (error) {
        Logger.error(`[Augment] Augmentation failed:`, error.message);
    }

    // Deduplicate and return
    return [...new Set(augmentedResults)];
};
