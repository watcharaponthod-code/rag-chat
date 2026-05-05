/**
 * 🛠️ RAG Configuration
 * Centralized config for Ingestion, Retrieval, and Generation.
 */
export default {
    ingestion: {
        chunkSize: 1800,       // Characters per chunk
        chunkOverlap: 200,    // Characters overlap
        minChunkSize: 100,    // Ignore chunks smaller than this
        separators: ['\n\n', '\n', ' ', ''], // Priority order for splitting
        batchSize: 15,        // Embedding batch size
    },
    embedding: {
        model: process.env.OLLAMA_MODEL || 'bge-m3:latest', // 1024 dim
        dimensions: 1024,
        timeout: 60000,       // 60s timeout for embedding generation
        maxRetries: 3
    },
    search: {
        // Hybrid Weights (0.0 - 1.0)
        vectorWeight: 0.7,
        keywordWeight: 0.3,

        // Thresholds (Basic)
        minSimilarity: 0.05,  // Minimum vector score to consider
        projectFuzzyThreshold: 0.4, // Similarity threshold for project name matching

        // 🛡️ Smart Filtering Config (Phase 1)
        useSmartFilter: true,
        thresholds: {
            minScore: 0.25,          // ABSOLUTE: Lowered for broader recall (was 0.40)
            relativeGap: 0.65,       // RELATIVE: Item score must be >= TopScore * 0.65 (was 0.75)
            finalLimit: 60,          // HARD LIMIT: Send top 25 chunks to LLM (Balancing context and speed)
            minConfidenceScore: 0.48 // NO-SIGNAL GATE: If top doc score < this AND no keyword match → treat as empty (prevents hallucination on garbage queries)
        },

        // 🔀 Diversity Config
        diversity: {
            enabled: true,
            maxPerDoc: 5             // Allow up to 5 contiguous chunks from one document
        },

        // Scoring
        keywordBaseScore: 0.5,
        keywordRankIncrement: 0.05,
        hybridBoostFactor: 1.2,

        // Image Scoring
        imageBaseScore: 0.5,

        // Limits
        defaultTopK: 80
    },
    rerank: {
        model: process.env.OLLAMA_MODEL_RERANKER,
        enabled: true,
        minScore: -1.5,       // Logit score threshold
        topK: 25,             // Final results to LLM (was 15)

        // Filter Thresholds
        relativeThreshold: 1.5, // Drop if score is too far from top
        absoluteThreshold: 0.00 // Drop if score is below this
    },
    preRetrieval: {
        enabled: true,
        useHyDE: true,        // Generate hypothetical documents
        useRewrite: true,     // Break down complex queries into sub-queries
        model: process.env.OLLAMA_CHAT_MODEL, // Model for generation (could be smaller/faster)
        maxSubQueries: 3,     // Limit number of generated sub-queries
        applyOnlyToDeep: true // If true, only applies to intent.strategy === 'deep'
    },
    context: {
        maxCharsPerChunk: 1000, // Limit context injected into LLM
        maxTotalContext: 12000, // Max chars total context (Updated from 8000)
        dbFetchLimit: 100,      // Enterprise Accuracy: Fetch 100 rows for broad ranking (Updated from 60)
        mantisFetchLimit: 50    // Limit for mantis issues (Updated from 15)
    },
    llm: {
        model: process.env.OLLAMA_CHAT_MODEL,
        temperature: 0.1,       // คุมความนิ่งเพื่อลดอาการหลอนวนลูป
        maxTokens: 16384,
        numCtx: 32768,          // จัดเต็มสำหรับการทำ RAG
        options: {
            num_ctx: 32768,
            num_predict: 4096,
            repeat_penalty: 1.2, // ป้องกันการพูดซ้ำ (Anti-looping)
            top_k: 40,
            top_p: 0.9,
            seed: 42
        }
    },
    debug: {
        logRetrievalDetails: true,
        logIngestionProgress: true
    },
    sql_agent: {
        modelName: 'sqlcoder:latest' // Dedicated SQL model
    }
};
