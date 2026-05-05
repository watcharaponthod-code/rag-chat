import http from 'http';
import * as crypto from 'crypto';
import RagConfig from '../../config/ragConfig.js';
import CacheService from '../cacheService.js';
import Logger from '../loggerService.js';
import Monitor from '../monitoringService.js';

const ollamaAgent = new http.Agent({
    keepAlive: true,
    keepAliveMsecs: 30000,
    maxSockets: 10,
    maxFreeSockets: 5
});

export const getEmbedding = async (text) => {
    const host = process.env.OLLAMA_HOST;
    const model = process.env.OLLAMA_MODEL || 'bge-m3:latest';

    const textHash = crypto.createHash('md5').update(text).digest('hex');
    const cached = CacheService.get('embedding', textHash);

    if (cached) {
        if (RagConfig.debug.logRetrievalDetails) Logger.debug('[Retrieval] ⚡ Embedding Cache Hit', { textHash });
        return cached;
    }

    try {
        Monitor.startTimer(textHash, 'embedding');
        const response = await fetch(`${host}/api/embeddings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            agent: ollamaAgent,
            body: JSON.stringify({
                model: model,
                prompt: text.substring(0, 8000)
            })
        });
        if (!response.ok) throw new Error(`Embedding failed: ${response.statusText}`);
        const data = await response.json();
        Monitor.endTimer(textHash, 'embedding');

        const embedding = data.embedding;
        CacheService.set('embedding', textHash, embedding);

        return embedding;
    } catch (error) {
        Logger.warn('Embedding Warning: Ollama unreachable, using mock.', { error: error.message });
        return new Array(1024).fill(0.01);
    }
};

export const clearEmbeddingCache = () => {
    CacheService.flush('embedding');
};
