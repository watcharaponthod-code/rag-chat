import express from 'express';
import {
    sendMessage,
    getHistory,
    getSessions,
    getSessionMessages,
    deleteSession,
    getImage,
    getClients
} from '../controllers/chat.controller.js';
import authenticateToken from '../middleware/auth.middleware.js';

const router = express.Router();

router.post('/send', authenticateToken, sendMessage);
router.get('/history', authenticateToken, getHistory); // Legacy/All history
router.get('/clients', authenticateToken, getClients); // New: Client Selection List

// Session-based routes
router.get('/sessions', authenticateToken, getSessions);
router.get('/sessions/:sessionId', authenticateToken, getSessionMessages);
router.delete('/sessions/:sessionId', authenticateToken, deleteSession);

// Image serving (No auth required for img src, or handle via cookie if strictly needed)
router.get('/images/:id', getImage);

export default router;
