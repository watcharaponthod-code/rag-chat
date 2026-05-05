import express from 'express';
import { register, login } from '../controllers/auth.controller.js';
import upload from '../middleware/upload.middleware.js';

const router = express.Router();

router.post('/register', upload.single('avatar'), register);
router.post('/login', login);

export default router;
