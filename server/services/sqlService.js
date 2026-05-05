import { vectorDb as db } from '../config/db.js';
export { db };
import { callOllama } from './llmService.js';
import RagConfig from '../config/ragConfig.js';

/**
 * ฟังก์ชันตรวจสอบความปลอดภัย SQL แบบเข้มข้น (Strict Mode)
 * @param {string} sqlQuery - SQL ที่ AI สร้างมา
 * @returns {string} - SQL ที่ผ่านการตรวจสอบและปรับปรุงแล้ว (หรือ Throw Error)
 */
const sanitizeAndValidateSQL = (sqlQuery) => {
    // 0. Cleanup: Remove Markdown code blocks
    let cleanSQL = sqlQuery.replace(/```sql/gi, '').replace(/```/g, '').trim();

    // Remove trailing semicolons
    cleanSQL = cleanSQL.replace(/;+$/, '').trim();

    // ── SMART EXTRACTION ─────────────────────────────────────────────────────
    // LLMs often return explanatory text before the actual SQL.
    // Extract just the SQL block starting from SELECT or WITH.
    const selectMatch = cleanSQL.match(/((?:WITH|SELECT)[\s\S]+)/i);
    if (selectMatch) {
        cleanSQL = selectMatch[1].trim().replace(/;+$/, '').trim();
        console.log(`[SafeSQL] Extracted SQL from noisy LLM output.`);
    }
    // ─────────────────────────────────────────────────────────────────────────

    const upperSQL = cleanSQL.toUpperCase();

    // ⛔ SECURITY GATES ⛔

    // 1. MUST START WITH SELECT or WITH
    if (!upperSQL.startsWith('SELECT') && !upperSQL.startsWith('WITH')) {
        throw new Error('SECURITY VIOLATION: SQL must start with SELECT or WITH.');
    }

    // 2. FORBIDDEN KEYWORDS
    const forbiddenKeywords = [
        'INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'TRUNCATE', 'RENAME',
        'GRANT', 'REVOKE', 'LOCK', 'COMMIT', 'ROLLBACK', 'SAVEPOINT',
        'EXEC', 'EXECUTE', 'PREPARE', 'DEALLOCATE',
        'CREATE', 'REPLACE', 'COMMENT',
        'PG_SLEEP', 'PG_TERMINATE_BACKEND', 'PG_SHADOW', 'INFORMATION_SCHEMA'
    ];

    for (const word of forbiddenKeywords) {
        const regex = new RegExp(`\\b${word}\\b`, 'i');
        if (regex.test(cleanSQL)) {
            throw new Error(`SECURITY VIOLATION: Forbidden keyword detected '${word}'`);
        }
    }

    // 3. MULTIPLE STATEMENTS CHECK
    if (cleanSQL.includes(';')) {
        throw new Error('SECURITY VIOLATION: Multiple statements are not allowed.');
    }

    // ✅ FORCE LIMIT if missing
    const isAggregate = /\bCOUNT\s*\(|\bSUM\s*\(|\bAVG\s*\(|\bMAX\s*\(|\bMIN\s*\(|\bGROUP\s+BY\b/.test(upperSQL);
    const hasLimit = /\bLIMIT\s+\d+/i.test(cleanSQL);

    if (!isAggregate && !hasLimit) {
        cleanSQL += ' LIMIT 50';
        console.log('[SafeSQL] Auto-appended LIMIT 50');
    }

    return cleanSQL;
};

/**
 * แปลงคำถามภาษาธรรมชาติเป็น SQL และรันผลลัพธ์
 * @param {string} query - คำถามจาก User
 * @param {object} filters - ตัวกรองจาก Intent Router (project_name, client_name)
 * @returns {Promise<{results: any[], sql: string, error?: string}>}
 */
export const processSQLRequest = async (query, filters = {}) => {
    // 1. Prepare Prompt with Current Date
    const currentDate = new Date().toISOString().split('T')[0];

    // Build context-aware instructions for filters (Fuzzy matching for better recall)
    let filterInstructions = "";
    if (filters.client_name) {
        filterInstructions += `- **CLIENT FILTER**: You MUST include \`client_name ILIKE '%' || '${filters.client_name}' || '%'\` in your WHERE clause.\n`;
    }
    if (filters.project_name && filters.project_name !== 'ALL' && filters.project_name !== 'ทั้งหมด') {
        filterInstructions += `- **PROJECT FILTER**: You MUST include \`project_name ILIKE '%' || '${filters.project_name}' || '%'\` in your WHERE clause.\n`;
    } else if (filters.project_name === 'ALL' || filters.project_name === 'ทั้งหมด') {
        filterInstructions += `- **ALL PROJECTS**: The user wants to search across ALL projects. Do NOT filter by a specific project_name (unless asked in text), but keep the client filter if applicable.\n`;
    }

    const systemPrompt = `### Instructions:
Your task is to convert a question into a SQL query for the 'docsvt' database.
Adhere to these strict rules:

1. **Ordering & Ranking Logic:** 
   - **LATEST/RECENT**: For "ล่าสุด", "ใหม่สุด", "เพิ่งมา", "เพิ่งอัปเดต", use \`ORDER BY created_at DESC LIMIT 1\` (or more if they ask for 'Top X').
   - **OLDEST/FIRST**: For "เก่าสุด", "แรกสุด", "เก่ามาก", use \`ORDER BY created_at ASC LIMIT 1\`.
   - **COUNT/TOTAL**: For "กี่อัน", "กี่ประเด็น", "จำนวน", "สรุปจำนวน", use \`COUNT(*)\` or \`COUNT(id)\`. Do NOT use LIMIT 1.
   - **LIST ALL**: For "ทั้งหมด", "รายการ", "โชว์มา", use \`ORDER BY created_at DESC\` and the mandatory \`LIMIT 50\`.
   - **GENERAL**: If no specific order is mentioned, default to \`ORDER BY created_at DESC\`.

2. **Reference Time:** Today is ${currentDate}. Use this ONLY if the user specifies "วันนี้", "เดือนนี้", หรือ "ปีนี้".

3. **File Type Logic:** 
   - "อีเมล" -> \`file_type = 'EMAIL'\`
   - "รูปภาพ" -> \`file_type = 'IMAGE'\`
   - PDF, DOCX, PPTX use their respective types.

4. **Safe JSONB Casting:** For page numbers, use \`NULLIF(metadata->>'page', '')::integer\`.

5. **Contextual Filters (IMPORTANT):**
${filterInstructions || "- No specific project/client filters provided."}

6. **Security & Syntax (VITAL):**
   - **SELECT ONLY:** You are FORBIDDEN to use INSERT, UPDATE, DELETE, DROP.
   - **DATABASE ENGINE:** You MUST use standard **PostgreSQL** syntax ONLY. 
     - 🚫 DO NOT use SQLite functions like \`strftime\`. 
     - ✅ Use PostgreSQL functions like \`TO_CHAR(created_at, 'YYYY-MM')\` or \`EXTRACT(MONTH FROM created_at)\`.
   - **NO CODE OTHER THAN SQL:** Do NOT return Python code, ORM code, or any explanation. ONLY valid SQL.
   - **LIMIT IS MANDATORY:** You MUST append \`LIMIT 50\` unless searching for a specific ID or COUNT.

7. **Selecting Columns (*):**
   - If the user asks for "ทั้งหมด", "รายละเอียด", "โชว์มา", or "Show all", use \`SELECT * \` to provide full details.
   - For specific questions, select only the relevant columns (e.g., COUNT, filename, etc.).

8. **Output:** Return ONLY the SQL code inside markdown code blocks. NO conversation.

### Input:
Question: "${query}"

### Schema:

--- TABLE: documents (Uploaded files and knowledge base) ---
CREATE TABLE documents (
  id integer PRIMARY KEY,
  created_at timestamp,        -- Proper timestamp, CAN use EXTRACT(YEAR FROM created_at)
  document_name text,
  file_type text,              -- 'PDF', 'DOCX', 'EMAIL', 'IMAGE', 'PPTX'
  project_name text,
  client_name text,
  source_id text,
  content text
);

--- TABLE: mantis_embeddings (Bug tracker / Mantis issues) ---
CREATE TABLE mantis_embeddings (
  id bigint PRIMARY KEY,
  ref_id bigint,               -- The bug/issue ID number (e.g. 20456)
  project_name text,           -- Project name this bug belongs to
  category_name text,          -- Bug category
  summary text,                -- Bug title/summary
  description text,
  status text,                 -- 'new', 'assigned', 'resolved', 'closed', 'feedback'
  resolution text,
  steps_to_reproduce text,
  additional_information text,
  comments text,
  bug_updated_at text,         -- ⚠️ STORED AS TEXT in format 'YYYY-MM-DD HH:mm:ss'
                               -- ⚠️ DO NOT use EXTRACT() on this column — it will FAIL
                               -- ✅ Use SUBSTRING(bug_updated_at, 1, 4) = '2025' for year
                               -- ✅ Use SUBSTRING(bug_updated_at, 1, 7) = '2025-03' for month
  created_at timestamp,        -- Proper timestamp, can use EXTRACT(YEAR FROM created_at)
  updated_at timestamp,
  metadata jsonb,
  content text
);

### SQL Examples (follow these patterns exactly):

-- Count bugs in 2025 grouped by project:
SELECT project_name, COUNT(*) as bug_count
FROM mantis_embeddings
WHERE SUBSTRING(bug_updated_at, 1, 4) = '2025'
GROUP BY project_name
ORDER BY bug_count DESC;

-- Compare bug counts: 2024 vs 2025:
SELECT SUBSTRING(bug_updated_at, 1, 4) as year, project_name, COUNT(*) as bug_count
FROM mantis_embeddings
WHERE SUBSTRING(bug_updated_at, 1, 4) IN ('2024', '2025')
GROUP BY year, project_name
ORDER BY year, bug_count DESC;

-- List all projects:
SELECT DISTINCT project_name, COUNT(*) as total_issues
FROM mantis_embeddings
GROUP BY project_name
ORDER BY total_issues DESC;

-- Count all bugs by status:
SELECT status, COUNT(*) as cnt
FROM mantis_embeddings
GROUP BY status
ORDER BY cnt DESC;

### Response:
\`\`\`sql`; // Pre-fill formatting to force SQL output


    const sqlModel = RagConfig.sql_agent?.modelName || 'sqlcoder:latest';

    try {
        // ── FAST PATH ────────────────────────────────────────────────────────
        // If the query already IS valid SQL (starts with SELECT or WITH),
        // skip the SQL model entirely and execute it directly.
        // This handles the case where the ReAct Agent writes SQL itself.
        const trimmedQuery = query.trim().toUpperCase();
        if (trimmedQuery.startsWith('SELECT') || trimmedQuery.startsWith('WITH')) {
            console.log(`[SQL Agent] ⚡ FAST PATH: Direct SQL execution (bypassing LLM)`);
            const safeSQL = sanitizeAndValidateSQL(query.trim());
            console.log(`[SQL Agent] Executing direct SQL: ${safeSQL}`);
            const directRes = await db.query(safeSQL);
            console.log(`[SQL Agent] Direct result: ${directRes.rows.length} rows`);

            if (directRes.rows.length === 0) {
                return { results: [], sql: safeSQL, rowCount: 0, summary: 'ไม่พบข้อมูลที่ตรงกับเงื่อนไข' };
            }
            return {
                results: directRes.rows,
                sql: safeSQL,
                rowCount: directRes.rows.length
            };
        }
        // ─────────────────────────────────────────────────────────────────────

        console.log(`[SQL Agent] Generating SQL for: "${query}" using ${sqlModel}...`);

        // SQLCoder is a completion model — pass everything as the main (user) message
        // so it continues from the pre-filled ```sql block at the end of the prompt.
        const rawResponse = await callOllama(
            sqlModel,
            systemPrompt,   // full prompt as user message
            '',             // empty system prompt
            false,
            { temperature: 0.0, num_predict: 350 }
        );

        console.log(`[SQL Agent] Raw Output (first 400): ${rawResponse.substring(0, 400)}`);

        // Validate & Sanitize (with smart SQL extraction)
        const safeSQL = sanitizeAndValidateSQL(rawResponse);

        // 4. Execute Query
        const res = await db.query(safeSQL);

        // 5. Format Results
        if (res.rows.length === 0) {
            return { results: [], sql: safeSQL, summary: "ไม่พบข้อมูลที่ตรงกับเงื่อนไขครับ" };
        }

        return {
            results: res.rows,
            sql: safeSQL,
            rowCount: res.rowCount
        };

    } catch (error) {
        console.error(`[SQL Agent] Error: ${error.message}`);
        // Optional: Implement Self-Correction here if needed
        return { error: error.message };
    }
};

/**
 * Format Data Rows into Markdown Table
 */
export const formatSQLResultsToMarkdown = (rows) => {
    if (!rows || rows.length === 0) return "ไม่พบข้อมูล";

    const headers = Object.keys(rows[0]);
    const headerRow = `| ${headers.join(' | ')} |`;
    const separatorRow = `| ${headers.map(() => '---').join(' | ')} |`;

    const dataRows = rows.map(row => {
        return `| ${headers.map(h => {
            const val = row[h];
            if (val instanceof Date) return val.toISOString().split('T')[0]; // Format Date
            if (typeof val === 'object') return JSON.stringify(val).substring(0, 20) + '...'; // Truncate objects
            return String(val).replace(/\|/g, '\\|'); // Escape pipes
        }).join(' | ')} |`;
    }).join('\n');

    return `${headerRow}\n${separatorRow}\n${dataRows}`;
};
