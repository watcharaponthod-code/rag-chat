# แผนการติดตั้งระบบ SQL Agent (รวมศูนย์) - Master Implementation Plan

เอกสารนี้รวมเอา **แผนการติดตั้ง (Implementation Plan)** และ **แผนความปลอดภัย/Prompt (Strict Plan)** เข้าด้วยกัน เพื่อเป็นคัมภีร์หลัก (Single Source of Truth) ในการพัฒนาระบบ SQL Agent แบบ Hybrid ที่มีความปลอดภัยสูงสุด

---

## ส่วนที่ 1: ขั้นตอนการติดตั้ง (Step-by-Step Implementation)

### Step 1: สร้าง SQL Service (`server/services/sqlService.js`)
**หน้าที่:** เป็นสมองซีกตรรกะ ทำหน้าที่เรียก Model SQLCoder และตรวจสอบความปลอดภัยของ SQL

**โครงสร้าง Code ที่ต้องเขียน:**
1.  **Import**: `db` จาก config และ `llmService` (สำหรับเรียก Ollama)
2.  **`sanitizeAndValidateSQL(sql)`**: ฟังก์ชันตรวจสอบมหาโหด (ดูรายละเอียดในส่วนที่ 2)
3.  **`generateSQL(query)`**:
    -   เตรียม System Prompt (ดูรายละเอียดในส่วนที่ 2) โดยแทนที่ `{CURRENT_DATE}` ด้วยเวลาปัจจุบัน
    -   เรียก Ollama (SQLCoder Model)
4.  **`executeSQL(sql)`**:
    -   เรียก `sanitizeAndValidateSQL` ก่อน
    -   `try-catch` รัน `db.query()`
    -   ถ้า Error -> ส่ง Error กลับไปให้ AI แก้ (Self-Correction Loop 1 รอบ)
5.  **`formatResults(rows)`**: แปลง JSON Table ให้อ่านง่ายเป็น Markdown Table

### Step 2: ปรับ Intent Analysis (`server/services/llmService.js`)
**หน้าที่:** สอน Router ให้รู้จักว่าเมื่อไหร่ควรใช้ SQL

**สิ่งที่ต้องทำ:**
1.  แก้ Prompt ใน `analyzeIntent`:
    -   เพิ่ม Strategy ใหม่: **`sql_query`**
    -   สอน AI: *"ถ้า Users ถามหา 'จำนวน (Count)', 'ล่าสุด (Latest)', 'วันที่ (Date)', 'รายการ (List)' ของ Project/User -> ให้เลือก `sql_query`"*
2.  เพิ่ม Output JSON Field: `sql_query_needed: boolean` 

### Step 3: เชื่อมต่อ Controller (`server/controllers/chat.controller.js`)
**หน้าที่:** ควบคุม Flow การทำงาน

**สิ่งที่ต้องทำ:**
1.  เพิ่ม Logic ใน `sendMessage`:
    ```javascript
    if (intent.sql_query_needed) { // หรือ strategy === 'sql_query'
        // 1. เรียก SQL Service
        const sqlResult = await SQLService.processSQLRequest(message);
        
        // 2. ถ้าได้ผลลัพธ์ -> นำผลไปเป็น Context ให้ LLM ตอบ
        // 3. ถ้า Error หรือไม่เจอ -> Fallback ไปหา Vector Search เหมือนเดิม
    }
    ```

### Step 4: เพิ่ม Config (`server/config/ragConfig.js`)
**หน้าที่:** ตั้งค่า Model และ Table Schema

**สิ่งที่ต้องทำ:**
1.  เพิ่ม Section `sql_agent`:
    ```javascript
    sql_agent: {
        modelName: 'sqlcoder:latest', // ตาม Prompt ของคุณ
        tables: ['documents', 'document_chunks', 'document_images'],
        // ... config อื่นๆ
    }
    ```

---

## ส่วนที่ 2: ระบบความปลอดภัยและ Prompt (Security & Logic)

### 2.1 Prompt มหาโหด (Strict System Prompt)
Prompt นี้ออกแบบมาเพื่อควบคุมพฤติกรรม SQLCoder ให้ทำงานตาม Logic เฉพาะและกฎความปลอดภัย

```text
### Instructions:
Your task is to convert a question into a SQL query for the 'docsvt' database.
Adhere to these strict rules:

1. **Ranking Logic (Top/Latest/Oldest):** 
   - If the user asks for "ล่าสุด", "ใหม่สุด", "เพิ่งมา", ALWAYS use `ORDER BY created_at DESC LIMIT 1`.
   - If the user asks for "เก่าสุด" or "แรกสุด", ALWAYS use `ORDER BY created_at ASC LIMIT 1`.
   - Do NOT use exact date filtering (WHERE created_at = '...') for "latest" requests unless a specific date is mentioned.

2. **Reference Time:** Today is {CURRENT_DATE}. Use this ONLY if the user specifies "วันนี้", "เดือนนี้", or "ปีนี้".

3. **File Type Logic:** 
   - "อีเมล" -> `file_type = 'EMAIL'`
   - "รูปภาพ" -> `file_type = 'IMAGE'`
   - PDF, DOCX, XLSX, PPTX, UNKNOWN use their respective types.

4. **Safe JSONB Casting:** For page numbers, use `NULLIF(metadata->>'page', '')::integer`.
   
5. **Security & Safety:**
   - **SELECT ONLY:** You are FORBIDDEN to use INSERT, UPDATE, DELETE, DROP.
   - **LIMIT IS MANDATORY:** You MUST append `LIMIT 50` unless searching for a specific ID or COUNT.

6. **Output:** Return ONLY the SQL code inside markdown blocks. NO conversation.

### Input:
Question: "{USER_QUESTION}"

### Schema:
CREATE TABLE documents (
  id integer PRIMARY KEY,
  created_at timestamp,
  document_name text,
  file_type text,
  project_name text,
  client_name text,
  source_id text,
  content text
);

CREATE TABLE document_chunks (
  id bigint PRIMARY KEY,
  doc_id integer REFERENCES documents(id),
  content text,
  metadata jsonb -- e.g., {"page": 1}
);

CREATE TABLE document_images (
  id integer PRIMARY KEY,
  doc_id integer REFERENCES documents(id),
  description text,
  metadata jsonb -- e.g., {"page": 5}
);

### Response:
```

### 2.2 Code มหาโหด (The Merciless Validator)
ฟังก์ชัน Javascript ที่จะเชือด SQL อันตรายทิ้งทันที

```javascript
const sanitizeAndValidateSQL = (sqlQuery) => {
    // 0. Cleanup
    let cleanSQL = sqlQuery.replace(/```sql|```/g, '').trim();
    cleanSQL = cleanSQL.replace(/;+$/, ''); // ลบ Semicolon ท้าย
    const upperSQL = cleanSQL.toUpperCase();

    // 1. MUST START WITH SELECT
    if (!upperSQL.startsWith('SELECT') && !upperSQL.startsWith('WITH')) {
        throw new Error('SECURITY VIOLATION: SQL must start with SELECT or WITH.');
    }

    // 2. FORBIDDEN KEYWORDS (The Blacklist)
    const forbiddenKeywords = [
        'INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'TRUNCATE', 'RENAME',
        'GRANT', 'REVOKE', 'LOCK', 'COMMIT', 'ROLLBACK', 'SAVEPOINT',
        'EXEC', 'EXECUTE', 'PREPARE', 'DEALLOCATE', 'CREATE', 'REPLACE', 'COMMENT',
        'PG_SLEEP', 'PG_TERMINATE_BACKEND', 'PG_SHADOW', 'INFORMATION_SCHEMA'
    ];

    for (const word of forbiddenKeywords) {
        if (new RegExp(`\\b${word}\\b`, 'i').test(cleanSQL)) {
            throw new Error(`SECURITY VIOLATION: Forbidden keyword detected '${word}'`);
        }
    }

    // 3. MULTIPLE STATEMENTS CHECK
    if (cleanSQL.includes(';')) {
        throw new Error('SECURITY VIOLATION: Multiple statements are not allowed.');
    }

    // 4. Force LIMIT (Auto-Append)
    const isAggregate = /\bCOUNT\s*\(|\bSUM\s*\(|\bAVG\s*\(|\bMAX\s*\(|\bMIN\s*\(/.test(upperSQL);
    const hasLimit = /\bLIMIT\s+\d+/i.test(cleanSQL);
    if (!isAggregate && !hasLimit) {
        cleanSQL += ' LIMIT 50'; // Hard Limit 50
    }

    return cleanSQL;
};
```

---

## 3. แผนสำรอง (Fallback)
หาก SQLCoder ทำงานผิดพลาดบ่อย:
1.  **Switch Off:** ปิดฟีเจอร์นี้ผ่าน Config `ENABLE_SQL_AGENT = false` ระบบจะกลับไปใช้ Vector Search
2.  **Logic Fallback:** ถ้า `processSQLRequest` คืนค่า Error ให้ Controller วิ่งเข้า Flow ปกติ (RAG) โดยอัตโนมัติ เพื่อไม่ให้ User เจอหน้า Error
