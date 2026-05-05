import { vectorDb } from './config/db.js';

async function checkSchema() {
    try {
        const query = `
            SELECT table_name, column_name 
            FROM information_schema.columns 
            WHERE table_schema = 'public' 
              AND table_name IN ('documents', 'document_chunks') 
            ORDER BY table_name, column_name;
        `;
        const res = await vectorDb.query(query);
        console.log(JSON.stringify(res.rows, null, 2));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkSchema();
