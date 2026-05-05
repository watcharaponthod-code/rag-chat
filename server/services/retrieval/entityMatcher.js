import { vectorDb } from '../../config/db.js';
import Logger from '../loggerService.js';
import { getEmbedding } from './embedding.js';

let projectsCache = [];
let projectEmbeddingsCache = new Map();

// Helper to calculate cosine similarity between two numeric arrays
function cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function initEntityMatcher() {
    try {
        Logger.info("[EntityMatcher] Loading project names from database for Vector Embedding...");
        const res = await vectorDb.query(`
            SELECT DISTINCT project_name 
            FROM mantis_embeddings 
            WHERE project_name IS NOT NULL AND project_name != ''
        `);
        projectsCache = res.rows.map(r => r.project_name);
        
        Logger.info(`[EntityMatcher] Loaded ${projectsCache.length} unique projects. Sample: [${projectsCache.slice(0, 3).join(', ')}]`);
        Logger.info(`[EntityMatcher] Precomputing Vector Embeddings...`);
        
        // Pre-compute embeddings for all projects to make matching instant
        // We do this sequentially to prevent socket pool starvation/hanging from Ollama
        let embeddedCount = 0;
        for (const projectName of projectsCache) {
            try {
                const emb = await getEmbedding(projectName);
                if (emb && emb.length > 0) {
                    projectEmbeddingsCache.set(projectName, emb);
                    embeddedCount++;
                }
            } catch (err) {
                Logger.warn(`[EntityMatcher] Failed to embed project "${projectName}"`);
            }
        }
        
        Logger.info(`[EntityMatcher] Successfully precomputed ${embeddedCount} project embeddings.`);
    } catch (e) {
        Logger.error("[EntityMatcher] Failed to load projects:", e.message);
    }
}

/**
 * Matches the given query against all known project names using Vector Embeddings.
 * @param {string} query The extracted project keyword (e.g., "ไทยพาณิชย์", "กรุงเทพ")
 * @returns {Promise<string[]>} Array of matched project names above threshold
 */
export async function matchProjectName(query) {
    if (!projectsCache || projectsCache.length === 0) {
        await initEntityMatcher();
    }
    if (!projectsCache || projectsCache.length === 0) return [query]; // fallback to raw
    
    Logger.info(`[EntityMatcher] Vector Matching query: "${query}" against ${projectEmbeddingsCache.size} embedded projects...`);
    
    Logger.info(`[EntityMatcher] Vector Matching query: "${query}" against ${projectEmbeddingsCache.size} embedded projects...`);
    
    // Priority 1: Exact Match (Restored as per user request: projects are distinct)
    const exactMatches = projectsCache.filter(p => p.toLowerCase().trim() === query.toLowerCase().trim());
    if (exactMatches.length > 0) {
        Logger.info(`[EntityMatcher] 🎯 Exact Match found: [${exactMatches.join(', ')}]`);
        return exactMatches;
    }

    try {
        // Embed the user's query
        const queryEmb = await getEmbedding(query);
        if (!queryEmb || queryEmb.length === 0) return [];
        
        const scoredProjects = [];
        
        // Calculate Cosine Similarity with all cached project embeddings
        projectsCache.forEach(projectName => {
            const projEmb = projectEmbeddingsCache.get(projectName);
            let score = 0;
            
            if (projEmb) {
                // Returns 0.0 to 1.0 (Approx), multiply by 100 to map to 0-100 logic
                score = cosineSimilarity(queryEmb, projEmb) * 100;
            }
            
            // Heuristic Factors:
            // 1. Exact Match: Highest Priority (98)
            if (projectName.toLowerCase().trim() === query.toLowerCase().trim()) {
                score = Math.max(score, 98);
            }
            // 2. Exact Substring: Strong Priority (90)
            else if (projectName.toLowerCase().includes(query.toLowerCase()) || query.toLowerCase().includes(projectName.toLowerCase())) {
                score = Math.max(score, 90);
            }
            
            scoredProjects.push({ projectName, score });
        });
        
        // Sort descending
        scoredProjects.sort((a, b) => b.score - a.score);
        
        // Vector Threshold (Cosine threshold)
        // bge-m3 usually outputs very high cosine sim for positive pairs (>0.5 -> 50)
        const THRESHOLD = 55; // Tunable minimum similarity
        const validMatches = scoredProjects.filter(sp => sp.score >= THRESHOLD);

        if (validMatches.length === 0) {
            const fallbackTop = scoredProjects[0]?.score || 0;
            Logger.info(`[EntityMatcher] ❌ Could not resolve "${query}" with high confidence (Max score: ${fallbackTop.toFixed(1)} < threshold)`);
            return [];
        }

        const topScore = validMatches[0].score;
        // Widened margin (10 points) to catch primary projects alongside "(Support)" or "(Enhancement)" variants
        const bestMatches = validMatches.filter(sp => sp.score >= topScore - 10).map(sp => sp.projectName);
        
        Logger.info(`[EntityMatcher] Top matches for "${query}": ${validMatches.slice(0, 3).map(m => `${m.projectName}(${m.score.toFixed(1)})`).join(', ')}`);
        
        if (bestMatches.length > 0) {
            Logger.info(`[EntityMatcher] ✅ Resolved "${query}" -> [${bestMatches.join(', ')}] in Vector Mode`);
            return bestMatches;
        }
        
        Logger.info(`[EntityMatcher] ❌ Could not resolve "${query}" with high confidence (Max score: ${topScore.toFixed(1)} < threshold)`);
        return [];
        
    } catch (e) {
        Logger.error(`[EntityMatcher] Error in vector matching:`, e.message);
        return [];
    }
}
