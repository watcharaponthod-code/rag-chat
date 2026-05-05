
export const freeVram = async () => {
    const host = process.env.OLLAMA_HOST || 'http://localhost:11434';
    // Collect all models used
    const models = [
        process.env.OLLAMA_CHAT_MODEL,
        process.env.OLLAMA_RERANK_MODEL,
        process.env.OLLAMA_MODEL // Embedding model
    ].filter(Boolean);

    const uniqueModels = [...new Set(models)];

    console.log('[LLM] 🧹 Freeing VRAM... Unloading:', uniqueModels.join(', '));

    try {
        await Promise.all(uniqueModels.map(model =>
            fetch(`${host}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: model,
                    keep_alive: 0 // <--- The magic key to unload immediately
                })
            }).then(res => {
                if (res.ok) console.log(`[LLM] ✅ Unloaded ${model}`);
            }).catch(e => console.warn(`[LLM] ⚠️ Failed to unload ${model}: ${e.message}`))
        ));
    } catch (e) {
        console.error('[LLM] Unload Error:', e);
    }
};
