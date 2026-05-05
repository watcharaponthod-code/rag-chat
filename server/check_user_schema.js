import { mainDb } from './config/db.js';

async function checkUserSchema() {
    try {
        const query = `
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_schema = 'public' 
              AND table_name = 'user';
        `;
        const res = await mainDb.query(query);
        console.log('Columns in "user" table:');
        console.log(JSON.stringify(res.rows, null, 2));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkUserSchema();
