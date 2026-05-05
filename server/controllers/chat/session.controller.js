import db from '../../config/db.js';

export const getSessions = async (req, res) => {
    const userId = req.user.id;
    try {
        const result = await db.query(
            'SELECT * FROM chat_sessions WHERE user_id = $1 ORDER BY updated_at DESC',
            [userId]
        );
        res.json(result.rows);
    } catch (e) {
        res.status(500).json([]);
    }
};

export const getSessionMessages = async (req, res) => {
    const { sessionId } = req.params;
    try {
        const result = await db.query(
            'SELECT * FROM chat_history WHERE session_id = $1 AND user_id = $2 ORDER BY timestamp ASC',
            [sessionId, req.user.id]
        );
        res.json(result.rows);
    } catch (e) {
        res.status(500).json([]);
    }
};

export const deleteSession = async (req, res) => {
    const { sessionId } = req.params;
    try {
        await db.query('DELETE FROM chat_sessions WHERE id = $1', [sessionId]);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

export const getHistory = async (req, res) => {
    const userId = req.user.id;
    try {
        const result = await db.query('SELECT * FROM chat_history WHERE user_id = $1 ORDER BY timestamp ASC', [userId]);
        res.json(result.rows);
    } catch (e) {
        res.status(500).json([]);
    }
};
