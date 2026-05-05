# แผนการอุดช่องโหว่ (ฉบับโค้ดมหาโหด + Custom Prompt มหาโหด)

เอกสารนี้ปรับปรุงแผนการรักษาความปลอดภัยและโครงสร้างระบบ SQL Agent โดยใช้ User-Defined Prompt ที่ออกแบบมาเพื่อจัดการความแม่นยำ (Accuracy) ผสานกับ Code ตรวจสอบความปลอดภัย (Security Code) แบบเข้มข้น

---

## 🛡️ Layer 1: Prompt มหาโหด (Custom Engineered Prompt)
Prompt นี้ออกแบบมาเพื่อควบคุมพฤติกรรม SQLCoder ให้ทำงานตาม Logic เฉพาะขององค์กร (เช่น การตีความ "ล่าสุด", การจัดการ JSONB และการใช้เวลาปัจจุบัน)

### System Prompt Template (ใช้จริง)
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

---

## 🛡️ Layer 2: Code มหาโหด (The Merciless Validator) - [UPDATED]
ฟังก์ชัน Javascript (Node.js) ที่จะทำหน้าที่เป็น "ยามเฝ้าประตู" คอยตรวจสอบ SQL ที่ AI ส่งมาก่อนจะอนุญาตให้ผ่านไปถึง Database ถ้าผิดกฎแม้แต่นิดเดียว -> **Kill ทันที**

### Validator Function Logic

```javascript
/**
 * ฟังก์ชันตรวจสอบความปลอดภัย SQL แบบเข้มข้น (Strict Mode)
 * @param {string} sqlQuery - SQL ที่ AI สร้างมา
 * @returns {string} - SQL ที่ผ่านการตรวจสอบและปรับปรุงแล้ว (หรือ Throw Error)
 */
const sanitizeAndValidateSQL = (sqlQuery) => {
    // 0. Cleanup: ลบ Markdown code blocks (```sql ... ```)
    let cleanSQL = sqlQuery.replace(/```sql|```/g, '').trim();
    
    // ลบ Semicolon ท้ายประโยคออกชั่วคราวเพื่อเช็คได้ง่ายขึ้น
    cleanSQL = cleanSQL.replace(/;+$/, '');

    const upperSQL = cleanSQL.toUpperCase();

    // ⛔ GATES OF HELL (ด่านตรวจจับคำต้องห้าม) ⛔
    
    // 1. MUST START WITH SELECT
    // อนุญาตให้ขึ้นต้นด้วย WITH (CTE) ได้ แต่สุดท้ายต้องจบด้วย SELECT
    if (!upperSQL.startsWith('SELECT') && !upperSQL.startsWith('WITH')) {
        throw new Error('SECURITY VIOLATION: SQL must start with SELECT or WITH.');
    }

    // 2. FORBIDDEN KEYWORDS (The Blacklist)
    // เช็คแบบ Whole Word Boundary (\b) เพื่อป้องกัน false positive
    const forbiddenKeywords = [
        'INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'TRUNCATE', 'RENAME',
        'GRANT', 'REVOKE', 'LOCK', 'COMMIT', 'ROLLBACK', 'SAVEPOINT',
        'EXEC', 'EXECUTE', 'PREPARE', 'DEALLOCATE',
        'CREATE', 'REPLACE', 'COMMENT',
        'PG_SLEEP', 'PG_TERMINATE_BACKEND', 'PG_SHADOW', 'INFORMATION_SCHEMA' // กันยุ่งกับ System
    ];

    for (const word of forbiddenKeywords) {
        // Regex: \bWORD\b (Case Insensitive)
        const regex = new RegExp(`\\b${word}\\b`, 'i');
        if (regex.test(cleanSQL)) {
            throw new Error(`SECURITY VIOLATION: Forbidden keyword detected '${word}'`);
        }
    }

    // 3. MULTIPLE STATEMENTS CHECK
    // ห้ามมีเครื่องหมาย ; ตรงกลางประโยค (ป้องกัน SQL Injection แบบ chaining)
    if (cleanSQL.includes(';')) {
        throw new Error('SECURITY VIOLATION: Multiple statements are not allowed.');
    }

    // ✅ FORCE IMPROVEMENTS (บังคับปรับปรุง Query) ✅
    
    // 4. Force LIMIT (ถ้าใน Query ไม่มี LIMIT ให้เติมต่อท้ายเลย)
    // ยกเว้นกรณี COUNT(*) หรือ Aggregate ที่ได้มาแถวเดียวอยู่แล้ว
    const isAggregate = /\bCOUNT\s*\(|\bSUM\s*\(|\bAVG\s*\(|\bMAX\s*\(|\bMIN\s*\(/.test(upperSQL);
    const hasLimit = /\bLIMIT\s+\d+/i.test(cleanSQL);

    if (!isAggregate && !hasLimit) {
        cleanSQL += ' LIMIT 50'; // 🔒 Hard Limit ป้องกัน Database ระเบิด
        console.log('[SafeSQL] Auto-appended LIMIT 50');
    }

    return cleanSQL;
};
```

---

## 3. สรุปความเปลี่ยนแปลง
*   **Prompt**: ใช้ Custom Prompt ของคุณที่เพิ่ม Logic ภาษาไทย ("ล่าสุด", "อีเมล") และ Schema เฉพาะ (`documents`, `document_chunks`) เข้าไปแทนที่ Template มาตรฐาน
*   **Safety Code**: คงความโหดเหมือนเดิม เพื่อเป็นตาข่ายกันพลาดชั้นสุดท้าย

**Note:** วันที่ใน Prompt (`2026-01-23`) จะถูกแทนที่ด้วย `new Date().toISOString().split('T')[0]` ใน Runtime เพื่อให้เป็น Real-time เสมอ
