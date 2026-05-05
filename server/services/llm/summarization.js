import * as Prompts from '../../config/prompts/searchPrompts.js';
import { callOllama } from './ollamaClient.js';

export const rewriteQuery = async (lastQuestion, history) => {
    const chatModel = process.env.OLLAMA_CHAT_MODEL;
    const recentHistory = history.slice(-6);
    const historyText = recentHistory.map(h => `${h.role}: ${h.content}`).join('\n');
    const prompt = Prompts.REWRITE_PROMPT(historyText, lastQuestion);

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const rewritten = await callOllama(chatModel, prompt, '', false, {
            temperature: 0.2,
            signal: controller.signal
        });

        clearTimeout(timeoutId);
        return rewritten.trim().replace(/^"|"$/g, '');
    } catch (e) {
        console.warn(`[Rewrite Skip] ${e.name === 'AbortError' ? 'Timeout' : e.message}`);
        return lastQuestion;
    }
};

export const summarizeMessages = async (messages) => {
    const model = process.env.OLLAMA_CHAT_MODEL;
    const textDict = messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n');
    const prompt = Prompts.SUMMARIZE_PROMPT(textDict);

    try {
        const summary = await callOllama(model, prompt, '', false, { temperature: 0.2 });
        if (summary.startsWith('[System Error]')) return null;
        return summary.trim();
    } catch (e) {
        console.error('Summarization Error:', e);
        return null;
    }
};
