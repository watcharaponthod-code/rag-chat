import db from '../../config/db.js';
import * as MemoryService from '../../services/memoryService.js';
import * as LLMService from '../../services/llmService.js';
import { getMantisContext } from '../../services/mantisContextStore.js';

export const sendMessage = async (req, res) => {
    const { message, sessionId } = req.body;
    const userId = req.user.id;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
        let currentSessionId = sessionId;

        if (!currentSessionId) {
            const sessionRes = await db.query(
                'INSERT INTO chat_sessions (user_id, title) VALUES ($1, $2) RETURNING id',
                [userId, message.substring(0, 50)]
            );
            currentSessionId = sessionRes.rows[0].id;
            res.write(`data: ${JSON.stringify({ type: 'session_created', sessionId: currentSessionId })}\n\n`);
        } else {
            await db.query('UPDATE chat_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [currentSessionId]);
        }

        await db.query(
            'INSERT INTO chat_history (session_id, user_id, role, content) VALUES ($1, $2, $3, $4)',
            [currentSessionId, userId, 'user', message]
        );

        let history = [];
        try {
            if (currentSessionId) {
                const historyRes = await db.query(
                    'SELECT role, content FROM chat_history WHERE session_id = $1 ORDER BY timestamp DESC LIMIT 6',
                    [currentSessionId]
                );
                history = historyRes.rows.reverse();
            }
        } catch (e) {
            console.error('[Controller] History fetch failed', e);
        }

        const userProvidedFilters = req.body.filters || req.body.context || {};
        if (req.body.clientName) userProvidedFilters.client_name = req.body.clientName;

        ['client_name', 'project_name'].forEach(key => {
            const val = userProvidedFilters[key];
            if (!val || val === 'Filter Context' || val === 'null' || val === 'undefined' || val === 'ทั้งหมด' || val === 'Filter Project') {
                delete userProvidedFilters[key];
            }
        });

        const { masterGraph } = await import('../../strategies/master/masterGraph.js');

        const mantisContext = getMantisContext(currentSessionId);

        const initialState = {
            messages: [...history, { role: 'user', content: message }],
            config: {
                sessionId: currentSessionId,
                user: req.user,
                res: res,
                filters: userProvidedFilters,
                agentMode: req.body.chatMode === 'agent',
                mantisMode: req.body.chatMode === 'mantis',
                chatMode: req.body.chatMode || 'doc',
                mantisContext: mantisContext
            }
        };

        console.log(`[Controller] Calling Master Orchestrator (LangGraph)...`);
        const finalState = await masterGraph.invoke(initialState);
        let result = finalState.result;

        if (result && result.content) {
            await db.query(
                'INSERT INTO chat_history (session_id, user_id, role, content, thoughts, citations) VALUES ($1, $2, $3, $4, $5, $6)',
                [currentSessionId, userId, 'assistant', result.content, JSON.stringify(result.thoughts || []), JSON.stringify(result.citations || {})]
            );
        }

        if (currentSessionId) {
            setTimeout(() => MemoryService.checkAndSummarize(currentSessionId).catch(console.error), 1000);
        }

    } catch (error) {
        console.error('SendMessage Error:', error);
        if (!res.writableEnded) {
            res.write(`data: ${JSON.stringify({ type: 'token', content: `\n\n**System Error:** ${error.message}` })} \n\n`);
            res.write(`data: ${JSON.stringify({ type: 'done' })} \n\n`);
            res.end();
        }
    } finally {
        LLMService.freeVram().catch(e => console.error('[Controller] VRAM Cleanup Error:', e));
    }
};
