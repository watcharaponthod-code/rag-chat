import http from 'http';
import RagConfig from '../../config/ragConfig.js';

const ollamaAgent = new http.Agent({
    keepAlive: true,
    keepAliveMsecs: 30000,
    maxSockets: 10,
    maxFreeSockets: 5
});

export const callOllama = async (model, prompt, system = '', stream = false, options = {}) => {
    const host = process.env.OLLAMA_HOST || 'http://localhost:11434';
    const normalizedModel = typeof model === 'string' ? model.trim() : '';
    if (!normalizedModel) {
        const message = '[System Error] AI model is not configured (empty model name).';
        console.warn(`Ollama Warning: ${message}`);
        return message;
    }
    const finalOptions = {
        num_ctx: RagConfig.llm.numCtx || 4096,
        temperature: 0.5,
        ...options
    };

    try {
        const response = await fetch(`${host}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            agent: ollamaAgent,
            body: JSON.stringify({
                model: normalizedModel,
                prompt: prompt,
                system: system,
                stream: stream,
                options: finalOptions
            })
        });
        if (!response.ok) throw new Error(`Ollama Chat Error: ${response.statusText}`);
        const data = await response.json();
        return data.response;
    } catch (error) {
        if (error.name === 'AbortError') throw error;
        console.warn(`Ollama Warning: AI Service unreachable at ${host}. Using mock response. Error:`, error.message);
        return `[System Error] Unable to connect to AI Engine (${normalizedModel}).`;
    }
};

export const streamResponse = async (model, input, systemPrompt, options, res, existingThoughts = []) => {
    const host = process.env.OLLAMA_HOST;
    const normalizedModel = typeof model === 'string' ? model.trim() : '';
    if (!normalizedModel) {
        throw new Error('AI model is not configured (empty model name).');
    }
    const isChat = Array.isArray(input);
    const {
        loopGuard = false,
        maxRepeatedLine = 2,
        ...modelOptions
    } = options || {};

    const buildPayload = (messages) => ({
        model: normalizedModel,
        messages,
        stream: true,
        options: {
            temperature: RagConfig.llm.temperature || 0.1,
            num_ctx: RagConfig.llm.numCtx || 32768,
            num_predict: (modelOptions && modelOptions.num_predict) ? modelOptions.num_predict : (RagConfig.llm.options?.num_predict || 4096),
            ...modelOptions
        }
    });

    const baseMessages = isChat
        ? (systemPrompt ? [{ role: 'system', content: systemPrompt }, ...input] : input)
        : [
            { role: 'system', content: systemPrompt || '' },
            { role: 'user', content: input }
        ];

    const streamOnce = async (payload, allowLoopGuard = false) => {
        const response = await fetch(`${host}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            agent: ollamaAgent,
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Unable to generate response: ${response.status} ${response.statusText} - ${errText}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let text = '';
        let lineBuffer = '';
        const recentLines = [];
        let loopDetected = false;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const json = JSON.parse(line);
                    const thinking = json.thinking || json.message?.thinking || json.reasoning_content;
                    const isThinkingEnabled = process.env.ENABLE_THINKING === 'true';

                    if (thinking && isThinkingEnabled) {
                        const thoughtId = 'ai-reasoning-stream';
                        let thoughtStep = existingThoughts.find(t => t.id === thoughtId);
                        if (!thoughtStep) {
                            thoughtStep = { id: thoughtId, icon: 'brain', description: '', status: 'active' };
                            const prevActive = existingThoughts.find(t => t.status === 'active' && t.id !== thoughtId);
                            if (prevActive) prevActive.status = 'completed';
                            existingThoughts.push(thoughtStep);
                        }
                        thoughtStep.description += thinking;
                        res.write(`data: ${JSON.stringify({ type: 'thoughts', thoughts: existingThoughts })}\n\n`);
                    }

                    const content = json.message?.content || '';
                    if (!content) continue;

                    text += content;
                    res.write(`data: ${JSON.stringify({ type: 'token', content: content })}\n\n`);

                    if (allowLoopGuard) {
                        lineBuffer += content;
                        const completedLines = lineBuffer.split('\n');
                        lineBuffer = completedLines.pop() || '';

                        for (const ln of completedLines) {
                            const normalized = ln.toLowerCase().replace(/\s+/g, ' ').trim();
                            if (!normalized) continue;

                            recentLines.push(normalized);
                            if (recentLines.length > 24) recentLines.shift();

                            const repeatInWindow = recentLines.filter(x => x === normalized).length;
                            const isLongLine = normalized.length >= 24;
                            const isShortAckLoop = normalized.length <= 10;

                            if ((isLongLine && repeatInWindow > maxRepeatedLine) || (isShortAckLoop && repeatInWindow >= 6)) {
                                loopDetected = true;
                                await reader.cancel();
                                break;
                            }
                        }
                    }
                } catch (e) { }
            }

            if (loopDetected) break;
        }

        return { text, loopDetected };
    };

    try {
        let fullResponse = '';
        const firstPass = await streamOnce(buildPayload(baseMessages), loopGuard);
        fullResponse += firstPass.text;

        if (loopGuard && firstPass.loopDetected && fullResponse.trim()) {
            const checkpointThought = {
                id: 'ai-loop-guard',
                icon: 'shield',
                description: 'Detected repetitive output, continuing from a memory checkpoint...',
                status: 'completed'
            };
            const exists = existingThoughts.find(t => t.id === checkpointThought.id);
            if (!exists) existingThoughts.push(checkpointThought);
            res.write(`data: ${JSON.stringify({ type: 'thoughts', thoughts: existingThoughts })}\n\n`);

            const continuationMessages = [
                ...baseMessages,
                { role: 'assistant', content: fullResponse },
                {
                    role: 'user',
                    content: 'Continue from the next unfinished point only. Do not repeat any sentence, ref_id, or action already mentioned.'
                }
            ];
            const secondPass = await streamOnce(buildPayload(continuationMessages), false);
            fullResponse += secondPass.text;
        }

        // Fallback: some reasoning-enabled models may emit only thinking tokens and no answer content.
        if (!fullResponse.trim()) {
            const fallbackThought = {
                id: 'ai-answer-fallback',
                icon: 'message-circle',
                description: 'Reasoning completed. Forcing final answer output...',
                status: 'completed'
            };
            const exists = existingThoughts.find(t => t.id === fallbackThought.id);
            if (!exists) existingThoughts.push(fallbackThought);
            res.write(`data: ${JSON.stringify({ type: 'thoughts', thoughts: existingThoughts })}\n\n`);

            const fallbackMessages = [
                ...baseMessages,
                {
                    role: 'user',
                    content: 'Return the FINAL user-facing answer now in concise Thai. No reasoning, no analysis trace, no repetition.'
                }
            ];
            const fallbackPass = await streamOnce(buildPayload(fallbackMessages), false);
            fullResponse += fallbackPass.text;
        }

        return fullResponse;
    } catch (error) {
        console.error('[StreamResponse] Stream Error:', error);
        res.write(`data: ${JSON.stringify({ type: 'token', content: '\n\n**Interrupted:** AI Generation stopped unexpectedly.' })}\n\n`);
        return '';
    }
};

export const freeVram = async (targetModel = null, keepAlive = 0) => {
    const host = process.env.OLLAMA_HOST || 'http://localhost:11434';

    let modelsToUnload = [];
    if (targetModel) {
        modelsToUnload = [targetModel];
    } else {
        modelsToUnload = [
            process.env.OLLAMA_CHAT_MODEL,
            process.env.OLLAMA_RERANK_MODEL,
            process.env.OLLAMA_MODEL
        ].filter(Boolean);
    }

    const uniqueModels = [...new Set(modelsToUnload)];

    console.log(`[LLM] 🧹 Freeing VRAM... Unloading: ${uniqueModels.join(', ')} (keep_alive: ${keepAlive}s)`);

    try {
        await Promise.all(uniqueModels.map(model =>
            fetch(`${host}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: model,
                    keep_alive: keepAlive
                })
            }).then(res => {
                if (res.ok) console.log(`[LLM] ✅ Unloaded ${model}`);
            }).catch(e => console.warn(`[LLM] ⚠️ Failed to unload ${model}: ${e.message}`))
        ));
    } catch (e) {
        console.error('[LLM] Unload Error:', e);
    }
};
