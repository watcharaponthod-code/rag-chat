import {
    Document,
    VectorStoreIndex,
    Settings,
    SummaryIndex
} from 'llamaindex';
import { Ollama, OllamaEmbedding } from '@llamaindex/ollama';

import RagConfig from '../config/ragConfig.js';
import Logger from './loggerService.js';

// ============================================================================
// LlamaIndex Initialization
// ============================================================================
export const initLlamaIndex = () => {
    // Check if OLLAMA_HOST starts with http, otherwise LlamaIndex might fail.
    let host = process.env.OLLAMA_HOST || 'http://10.0.2.191:11434';
    if (!host.startsWith('http')) host = `http://${host}`;

    // Explicitly select models from env for LlamaIndex
    const chatModel = process.env.OLLAMA_CHAT_MODEL;
    const embedModelName = process.env.OLLAMA_MODEL || 'bge-m3:latest';

    // 1. Setup LLM for LlamaIndex internal reasoning (Agent/Routing)
    Settings.llm = new Ollama({
        model: chatModel,
        config: { host },
        options: { temperature: 0.1 }
    });

    // 2. Setup Embedding Model for In-Memory Vector Operations
    Settings.embedModel = new OllamaEmbedding({
        model: embedModelName,
        config: { host }
    });

    Logger.info(`[LlamaIndex] Initialized with models: LLM=${chatModel}, Embed=${embedModelName} at ${host}`);
};

// Initialize on load
initLlamaIndex();

/**
 * ADVANCED RETRIEVAL: 
 * Takes Hybrid SQL results, creates transient LlamaIndex nodes,
 * and performs advanced re-ranking and retrieval.
 */
export const processWithLlamaIndex = async (query, rawDocs, topK = 5) => {
    if (!rawDocs || rawDocs.length === 0) return { contextText: '', refinedDocs: [] };

    try {
        Logger.info(`[LlamaIndex] Building Advanced Index from ${rawDocs.length} base documents...`);

        const docMap = new Map(rawDocs.map((d, idx) => [d.id || String(idx), d]));

        // 1. Convert DB Records to LlamaIndex Documents
        const documents = rawDocs.map((doc, idx) => {
            const projectName = doc.project_name || doc.metadata?.project_name || 'General';
            const docName = doc.document_name || doc.ref_id || `Doc#${doc.id || idx}`;

            // Re-construct meaningful text for the node
            const nodeText = doc.source === 'exact' || doc.ref_id
                ? `[Mantis Issue #${doc.ref_id} | Project: ${projectName}]:\nSummary: ${doc.summary || ''}\nContent: ${doc.content}`
                : `[Project: ${projectName} | Doc: ${docName}]: ${doc.content}`;

            return new Document({
                text: nodeText,
                metadata: {
                    id: doc.id || String(idx),
                    docName,
                    projectName,
                    similarity: doc.similarity || 0,
                    source: doc.source || "db",
                    refId: doc.ref_id ? String(doc.ref_id) : ''
                }
            });
        });

        // 2. Build In-Memory VectorStoreIndex (Semantic Chunking & Embedding)
        // This is fast because we only embed the pre-filtered top ~10-30 chunks
        const index = await VectorStoreIndex.fromDocuments(documents);

        // 3. Advanced LlamaIndex Retrieval
        const retriever = index.asRetriever({ similarityTopK: topK });
        const nodes = await retriever.retrieve({ query });

        Logger.info(`[LlamaIndex] Refined down to ${nodes.length} highly relevant nodes.`);

        const contextText = nodes.map(n => n.node.text).join('\n\n');

        // Map back to original document structure expected by LangGraph execution
        const refinedDocs = nodes.map(n => {
            const originalDoc = docMap.get(n.node.metadata.id) || {};
            return {
                ...originalDoc,
                score_llamaindex: n.score // Inject LlamaIndex's confidence score
            };
        });

        return { contextText, refinedDocs };

    } catch (error) {
        Logger.error(`[LlamaIndex] Processing Error: ${error.stack || error.message}`);
        // Fallback to original SQL hybrid ranking
        const fallbackDocs = rawDocs.slice(0, topK);
        const fallbackContext = fallbackDocs.map(doc => {
            const projectName = doc.project_name || doc.metadata?.project_name || 'General';
            return `[Project: ${projectName} | Doc: ${doc.document_name || doc.ref_id}]: ${doc.content}`;
        }).join('\n\n');

        return { contextText: fallbackContext, refinedDocs: fallbackDocs };
    }
};

/**
 * SYNTHESIZER:
 * Ask LlamaIndex to read the chunks and generate an answer directly.
 * Useful for complex queries where SubQuestionQueryEngine or TreeSummarize is needed.
 */
export const synthesizeAnswer = async (query, rawDocs) => {
    if (!rawDocs || rawDocs.length === 0) return null;
    try {
        const documents = rawDocs.map(doc => new Document({ text: doc.content }));
        const index = await SummaryIndex.fromDocuments(documents);

        const queryEngine = index.asQueryEngine();
        const response = await queryEngine.query({ query });

        return response.response;
    } catch (e) {
        Logger.error(`[LlamaIndex] Synthesis Error: ${e.message}`);
        return null; // Let LangGraph handle fallback
    }
};
