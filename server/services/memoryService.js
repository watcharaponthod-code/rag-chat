
import { mainDb } from '../config/db.js';
import * as RetrievalService from './retrievalService.js';
import * as LLMService from './llmService.js';

export const addMemory = async (sessionId, summary, metadata = {}) => {
    try {
        // 1. Generate Embedding
        const embedding = await RetrievalService.getEmbedding(summary);

        // 2. Save to DB
        // We use to_tsvector for simple english/thai mix
        const sql = `
            INSERT INTO conversation_memories (session_id, summary, metadata, embedding, fts)
            VALUES ($1, $2, $3, $4, to_tsvector('simple', $2))
            RETURNING id;
        `;
        // Ensure embedding format [x,y,z]
        const vectorStr = `[${embedding.join(',')}]`;

        const res = await mainDb.query(sql, [sessionId, summary, metadata, vectorStr]);
        return res.rows[0].id;
    } catch (err) {
        console.error('Memory Add Error:', err);
        return null;
    }
};

export const searchMemories = async (sessionId, query, limit = 5) => {
    // Session-Scoped Hybrid Search
    try {
        const embedding = await RetrievalService.getEmbedding(query);
        if (!embedding) return [];

        const vectorStr = `[${embedding.join(',')}]`;

        // Logic: 
        // 1. Filter by session_id (Mandatory)
        // 2. Vector Search (Embedding similarity)
        // 3. Keyword Search (FTS)
        // 4. Fusion

        const sql = `
            WITH vector_matches AS (
                SELECT id, summary, metadata, GREATEST(1.0 - (embedding <=> $3), 0.0) as vector_score
                FROM conversation_memories
                WHERE session_id = $1
                ORDER BY embedding <=> $3
                LIMIT $2 * 2
            ),
            keyword_matches AS (
                SELECT id, summary, metadata, ts_rank_cd(fts, plainto_tsquery('simple', $4)) as text_score
                FROM conversation_memories
                WHERE session_id = $1
                AND fts @@ plainto_tsquery('simple', $4)
                LIMIT $2 * 2
            )
            SELECT 
                COALESCE(v.id, k.id) as id,
                COALESCE(v.summary, k.summary) as summary,
                COALESCE(v.metadata, k.metadata) as metadata,
                COALESCE(v.vector_score, 0) as v_score,
                COALESCE(k.text_score, 0) as t_score,
                -- Scoring Formula
                (COALESCE(v.vector_score, 0) + (LEAST(COALESCE(k.text_score, 0), 1.0) * 0.3) + 0.1) * 1.5 as similarity
            FROM vector_matches v
            FULL OUTER JOIN keyword_matches k ON v.id = k.id
            ORDER BY similarity DESC
            LIMIT $2
        `;

        const res = await mainDb.query(sql, [sessionId, limit, vectorStr, query]);
        return res.rows;
    } catch (err) {
        console.error('Memory Search Error:', err);
        return [];
    }
};

export const checkAndSummarize = async (sessionId) => {
    const MEMORY_WINDOW = 4; // Tuning: Lowered to 4 for faster feedback loop

    try {
        console.log(`[MemoryDebug] Start Check for Session: ${sessionId}`);

        // 1. Check existing memories count
        const memRes = await mainDb.query('SELECT COUNT(*) FROM conversation_memories WHERE session_id = $1', [sessionId]);
        const memoryCount = parseInt(memRes.rows[0].count);

        // 2. Check total messages
        const msgRes = await mainDb.query('SELECT COUNT(*) FROM chat_history WHERE session_id = $1', [sessionId]);
        const messageCount = parseInt(msgRes.rows[0].count);

        // 3. Logic: Have we accumulated enough new messages?
        const targetOffset = memoryCount * MEMORY_WINDOW;

        console.log(`[MemoryDebug] Msgs: ${messageCount} | Mems: ${memoryCount} | Target >= ${targetOffset + MEMORY_WINDOW}`);

        if (messageCount >= targetOffset + MEMORY_WINDOW) {
            console.log(`[Memory] 🧠 Triggering summarization for Session ${sessionId} (Chunk: ${targetOffset} - ${targetOffset + MEMORY_WINDOW})`);

            // 4. Fetch the chunk
            const historySql = `
                SELECT role, content FROM chat_history 
                WHERE session_id = $1 
                ORDER BY timestamp ASC 
                LIMIT $2 OFFSET $3
            `;
            const historyRes = await mainDb.query(historySql, [sessionId, MEMORY_WINDOW, targetOffset]);
            const messages = historyRes.rows;

            if (messages.length > 0) {
                // 5. Summarize
                const summary = await LLMService.summarizeMessages(messages);
                if (summary) {
                    console.log(`[Memory] ✅ New Memory Stored: "${summary.substring(0, 50)}..."`);
                    await addMemory(sessionId, summary);
                }
            }
        }
    } catch (e) {
        console.error('[Memory] Background Check Failed:', e);
    }
};

// Function provided for Background Summarization (To be called by controller)
export const getMemoriesForContext = async (sessionId, query) => {
    const memories = await searchMemories(sessionId, query, 3); // Get top 3
    if (memories.length === 0) return '';

    return `### 🧠 Relevant Memories (From this chat):\n${memories.map(m => `- ${m.summary}`).join('\n')}\n`;
};
