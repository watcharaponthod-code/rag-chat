# แผนการติดตั้งระบบ SQL Agent แบบครบวงจร (Implementation Plan)

เอกสารนี้ระบุขั้นตอนการปรับปรุงแก้ไขโค้ด (Code Changes) เพื่อติดตั้งระบบ SQL Agent โดยใช้กลยุทธ์ "Double Defense" (Code มหาโหด + Prompt มหาโหด) เข้ากับระบบปัจจุบัน

## 1. ภาพรวมการเปลี่ยนแปลง (Overview)

เราจะต้องเพิ่มและแก้ไขไฟล์ในฝั่ง Server เพื่อรองรับการทำงานแบบ Hybrid (Vector + SQL) ดังนี้:

| ลำดับ | การกระทำ | ไฟล์เป้าหมาย (File Path) | รายละเอียด |
| :--- | :--- | :--- | :--- |
| 1 | สร้างใหม่ | `server/services/sqlService.js` | พื้นที่สำหรับ Code มหาโหด (Validator) และ Logic การเรียก SQL Model |
| 2 | แก้ไข | `server/services/llmService.js` | เพิ่มฟังก์ชัน `analyzeIntent` ให้รู้จัก intent แบบใหม่ (`search_sql`) |
| 3 | แก้ไข | `server/controllers/chat.controller.js` | เพิ่ม Logic การตัดสินใจ (Router) ให้เรียกใช้ `sqlService` เมื่อจำเป็น |
| 4 | แก้ไข | `server/config/ragConfig.js` | เพิ่ม config สำหรับ SQL Model (ชื่อ Model, Tables Schema) |

---

## 2. รายละเอียดการปรับโค้ด (Step-by-Step)

### Step 1: ปรับ Intent Analysis (`server/services/llmService.js`)
**เป้าหมาย:** สอนให้ Router รู้ว่าคำถามแบบไหน "ต้องใช้ SQL" (เช่น ถามเวลา, ถามจำนวน, ถามสถานะล่าสุด)

**แผนการแก้:**
1.  แก้ Prompt ใน `analyzeIntent`:
    -   เพิ่ม Strategy ใหม่: **`sql_query`**
    -   สอน AI: *"ถ้า Users ถามหา 'จำนวน (Count)', 'ล่าสุด (Latest)', 'วันที่ (Date)', 'รายการ (List)' ของ Project/User -> ให้เลือก `sql_query`"*
2.  เพิ่ม Output JSON Field: `sql_query_needed: boolean`

### Step 2: สร้าง SQL Service (`server/services/sqlService.js`)
**เป้าหมาย:** สร้าง "สมองซีกตรรกะ" ที่ทำหน้าที่เขียนและรัน SQL อย่างปลอดภัย

**เนื้อหาไฟล์ (โครงสร้าง):**
1.  **Import**: `db` จาก config
2.  **`sanitizeAndValidateSQL(sql)`**: ฟังก์ชันตรวจสอบมหาโหด (Copy จากแผนที่แล้วมาใส่)
3.  **`generateSQL(query)`**:
    -   เรียก Ollama (SQLCoder Model)
    -   ส่ง **System Prompt มหาโหด** (Schema + Rules)
    -   รับ SQL กลับมา
4.  **`executeSQL(sql)`**:
    -   เรียก `sanitizeAndValidateSQL` ก่อน
    -   `try-catch` รัน `db.query()`
    -   ถ้า Error -> ส่ง Error กลับไปให้ AI แก้ (Self-Correction Loop 1 รอบ)
5.  **`formatResults(rows)`**: แปลง JSON Table ให้อ่านง่ายเป็น Markdown Table

### Step 3: เชื่อมต่อ Controller (`server/controllers/chat.controller.js`)
**เป้าหมาย:** เป็น "Conductor" ที่ควบคุมว่าจะเรียกใครมาตอบ

**แผนการแก้:**
1.  รับผลจาก `analyzeIntent`
2.  **Logic ใหม่**:
    ```javascript
    if (intent.sql_query_needed) {
        // 1. เรียก SQL Service
        const sqlResult = await SQLService.processSQLRequest(message);
        
        // 2. ถ้าได้ผลลัพธ์ -> ส่งให้ LLM สรุปตอบ
        // 3. ถ้า Error หรือไม่เจอ -> Fallback ไปหา Vector Search เหมือนเดิม
    } else {
        // Flow เดิม (Vector Search)
    }
    ```
3.  ปรับ System Prompt ของ Chat ให้รองรับ Context ที่เป็น "ตารางข้อมูล" (ไม่ได้มีแค่ Text Chunks)

### Step 4: เพิ่ม Config (`server/config/ragConfig.js`)
**เป้าหมาย:** รวมศูนย์การตั้งค่า ไม่ให้ Hardcode

**แผนการแก้:**
1.  เพิ่ม Section `sql_agent`:
    ```javascript
    sql_agent: {
        modelName: 'sqlcoder:7b', // หรือ model ที่คุณใช้
        tables: ['users', 'projects', 'mantis_issues'], // รายชื่อตาราง
        schema_description: `...` // รายละเอียด Schema ย่อๆ
    }
    ```

---

## 3. สิ่งที่ต้องเตรียม (Prerequisites)

ก่อนเริ่มเขียนโค้ด ต้องเตรียมสิ่งเหล่านี้:
1.  **Model**: ต้อง `ollama pull sqlcoder:7b` (หรือ starcoder2) เตรียมไว้ในเครื่อง
2.  **Schema Knowledge**: ต้องลิสต์ชื่อตารางและคอลัมน์จริงๆ ของ Database ที่จะให้ AI ใช้ (เพื่อเอาไปใส่ใน Prompt)

## 4. แผนสำรอง (Fallback Plan)

ถ้า SQLCoder เขียนผิดบ่อย หรือ Query ช้า:
1.  **Quick Disable**: ใส่ Flag `ENABLE_SQL_AGENT = false` ใน `.env` เพื่อปิดฟีเจอร์นี้ทันทีและกลับไปใช้ Vector Search 100%
2.  **Manual Queries**: เขียน Pre-defined SQL สำหรับคำถามฮิตๆ (เช่น "ยอดรวมวันนี้") ไว้ใน Code เลย ไม่ต้องให้ AI เขียน (Hybrid Rule-Based)

---
**สถานะ:** พร้อมเริ่ม Implement ตาม Step 1-4 ทันทีที่คุณอนุมัติแผนงานนี้ครับ
