/**
 * ⚙️ Strategy Configuration
 * Centralized settings for all chat strategies to allow easy tuning.
 */
export default {
    fast: {
        searchLimit: 100, // Get initial candidates (was 30)
        rerankLimit: 25, // Light rerank (was 15)
        finalChunkLimit: 15, // TARGET: 15 High Quality Chunks (was 10)
        useReranker: false,
        hybridWeights: { vector: 0.7, keyword: 0.3 }
    },
    deep: {
        searchLimit: 100, // Cast wider net (Optimized from 60)
        rerankLimit: 25, // Cross-encode top 25 (Optimized from 12 for accuracy)
        finalChunkLimit: 30, // More context allowed in deep mode (was 20)
        targetSimilarity: 0.6,
        forceRerank: true, // Always use Cross-Encoder
        systemPromptExtra: "(Important: This is a DEEP ANALYSIS request. Be extremely comprehensive. If comparing, use a table. Trace root causes if applicable.)"
    },
    agentic: {
        searchLimit: 100, // Enterprise: Fetch 100 for broad coverage
        finalChunkLimit: 25 // Send 25 chunks max to LLM (Speed vs Context balance)
    },
    sql: {
        maxRows: 100,
        timeout: 10000, // 10s timeout for SQL generation/execution
        vectorContextLimit: 8, // Semantic context to fetch alongside SQL
        fallbackToText: true // If SQL fails, auto-switch to Text Search?
    },
    cache: {
        enabled: true,
        ttl: {
            embedding: 1000 * 60 * 60 * 24, // 24 Hours
            search: 1000 * 60 * 5,          // 5 Minutes
            sql: 1000 * 60 * 10             // 10 Minutes
        }
    }
};
