import * as Prompts from '../../config/prompts/searchPrompts.js';
import { callOllama } from './ollamaClient.js';
import RagConfig from '../../config/ragConfig.js';

export const rerank = async (query, docs, topK = 12, candidateLimit = null) => {
    if (!docs || docs.length === 0) return [];

    const rerankModel = RagConfig.rerank.model;
    const effectiveLimit = Math.min(docs.length, candidateLimit || topK, 30);
    const candidates = docs.slice(0, effectiveLimit);
    const prompt = Prompts.RERANK_PROMPT(query, candidates);

    try {
        const responseText = await callOllama(rerankModel, prompt, '', false, {
            temperature: 0.1,
            format: 'json',
            num_predict: 512
        });

        if (responseText.startsWith('[System Error]')) {
            console.warn(`[Rerank] Skipped: ${responseText}`);
            return docs.slice(0, topK);
        }

        const cleanText = responseText.replace(/```json|```/g, '').trim();
        const jsonMatch = cleanText.match(/\[[\d\s,]*\]/);

        if (jsonMatch) {
            const rankedIds = JSON.parse(jsonMatch[0]);
            const reranked = [];
            const docMap = new Map(candidates.map(d => [d.id, d]));

            rankedIds.forEach(id => {
                if (docMap.has(id)) {
                    reranked.push(docMap.get(id));
                    docMap.delete(id);
                } else if (docMap.has(Number(id))) {
                    reranked.push(docMap.get(Number(id)));
                    docMap.delete(Number(id));
                }
            });

            docMap.forEach(doc => reranked.push(doc));
            console.log(`[Rerank] Automatically improved ranking for ${reranked.length} docs.`);
            return reranked.slice(0, topK);
        }
    } catch (e) {
        console.warn(`[Rerank] Failed to rerank: ${e.message}. Returning original order.`);
    }

    return docs.sort((a, b) => (b.similarity || 0) - (a.similarity || 0)).slice(0, topK);
};
