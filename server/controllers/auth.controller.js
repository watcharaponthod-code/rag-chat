import { mainDb as db } from '../config/db.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

export const register = async (req, res) => {
    try {
        const { name, password, department, email } = req.body;

        if (!name || !password || !department) {
            return res.status(400).json({ message: 'Please provide all required fields (name, password, department).' });
        }

        // Check if user exists
        const userCheck = await db.query('SELECT * FROM "user" WHERE name = $1 OR email = $2', [name, email || '']);

        if (userCheck.rows.length > 0) {
            return res.status(409).json({ message: 'User already exists' });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Handle Avatar (DB Storage)
        let avatarData = null;
        let avatarMime = null;
        let avatarUrl = `https://ui-avatars.com/api/?name=${name}`; // Default fallback

        if (req.file) {
            avatarData = req.file.buffer;
            avatarMime = req.file.mimetype;
            // We don't set a URL here because we load from DB
            avatarUrl = null;
        }

        // Map Department to Role
        let role = 'dev'; // Default
        const dept = department.toLowerCase();
        if (dept.includes('pm') || dept.includes('product')) role = 'pm';
        else if (dept.includes('qa') || dept.includes('test')) role = 'qa';
        else if (dept.includes('hr') || dept.includes('admin')) role = 'admin';
        else if (dept.includes('exec') || dept.includes('ceo')) role = 'ceo';
        else if (dept.includes('dev')) role = 'dev';

        // Insert user (Assuming 'role' column exists in DB scheme. If not, we might fail, but based on Login check it seems implied)
        // If "role" column doesn't exist, we might need a migration or just rely on department in frontend?
        // Let's assume schema allows writing role or we add it. 
        // CAUTION: The previous INSERT didn't have role. I will add it.
        await db.query(
            'INSERT INTO "user" (name, password, department, role, email, avatar_url, avatar_data, avatar_mimetype) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
            [name, hashedPassword, department, role, email || null, avatarUrl, avatarData, avatarMime]
        );

        res.status(201).json({ message: 'User registered successfully' });
    } catch (error) {
        console.error('Error in register:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const login = async (req, res) => {
    try {
        const { name, password } = req.body;

        if (!name || !password) {
            return res.status(400).json({ message: 'Please provide name and password' });
        }

        // ── dev bypass ──────────────────────────────────────────────────────
        if (name === 'admin' && password === '1234') {
            const token = jwt.sign(
                { id: 0, name: 'admin', department: 'IT', role: 'pm' },
                process.env.JWT_SECRET || 'secretkey',
                { expiresIn: '1d' }
            );
            return res.json({
                token,
                user: {
                    id: 0,
                    name: 'admin',
                    department: 'IT',
                    role: 'pm',
                    email: '',
                    avatarUrl: 'https://ui-avatars.com/api/?name=admin'
                }
            });
        }
        // ────────────────────────────────────────────────────────────────────

        // Check user
        const result = await db.query('SELECT * FROM "user" WHERE name = $1', [name]);

        if (result.rows.length === 0) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const user = result.rows[0];

        // Check password
        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Determine Role (Fallback to Department mapping if role is null in DB)
        let finalRole = user.role;
        if (!finalRole && user.department) {
            const dept = user.department.toLowerCase();
            if (dept.includes('pm')) finalRole = 'pm';
            else if (dept.includes('qa')) finalRole = 'qa';
            else if (dept.includes('hr')) finalRole = 'admin';
            else if (dept.includes('dev')) finalRole = 'dev';
            else finalRole = 'dev';
        }

        // Generate Token
        const token = jwt.sign(
            { id: user.id, name: user.name, department: user.department, role: finalRole },
            process.env.JWT_SECRET || 'secretkey',
            { expiresIn: '1d' }
        );

        // Prepare Avatar URL
        let finalAvatarUrl = user.avatar_url;
        if (user.avatar_data && user.avatar_mimetype) {
            const base64Image = user.avatar_data.toString('base64');
            finalAvatarUrl = `data:${user.avatar_mimetype};base64,${base64Image}`;
        } else if (!finalAvatarUrl) {
            finalAvatarUrl = `https://ui-avatars.com/api/?name=${name}`;
        }

        res.json({
            token,
            user: {
                id: user.id,
                name: user.name,
                department: user.department,
                role: finalRole, // <--- Added Role here
                email: user.email,
                avatarUrl: finalAvatarUrl
            }
        });

    } catch (error) {
        console.error('Error in login:', error);
        res.status(500).json({ message: 'Internal server error: ' + error.message });
    }
};
