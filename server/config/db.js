import pkg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pkg;

// Hardcoded configuration to bypass .env variable expansion issues with '$' character
const config = {
    host: process.env.DB_HOST || '10.0.1.159',
    user: process.env.DB_USER || 'admin',
    password: process.env.DB_PASSWORD || 'dummy_password',
    port: parseInt(process.env.DB_PORT || '30104'),
    max: 10,
    idleTimeoutMillis: 30000
};

// Main App DB (Users, Chat History)
export const mainDb = new Pool({
    ...config,
    database: process.env.DB_NAME || 'sycapt_chatai'
});

// Vector DB (RAG Documents)
export const vectorDb = new Pool({
    ...config,
    database: process.env.VECTOR_DB_NAME || 'docsvt'
});

mainDb.on('error', (err) => console.error('MainDB Error:', err));
vectorDb.on('error', (err) => console.error('VectorDB Error:', err));

// Default export for backward compatibility (points to Main DB)
export default mainDb;
