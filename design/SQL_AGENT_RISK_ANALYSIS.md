# วิเคราะห์จุดอ่อนและแผนการอุดช่องโหว่ของระบบ Text-to-SQL

เอกสารนี้มุ่งเน้นการวิเคราะห์ "จุดตาย" (Fatal Flaws) และ "ความเสี่ยง" ของการนำโมเดล Text-to-SQL มาใช้งานจริง พร้อมนำเสนอวิธีแก้ไขทางเทคนิคที่มั่นใจได้ (Robust Solutions) เพื่อให้ระบบทำงานได้อย่างสมบูรณ์แบบไร้จุดอ่อน

## 1. จุดอ่อนด้านความปลอดภัย (Security Risks) - 🚨 CRITICAL

### จุดอ่อน 1.1: SQL Injection & Destructive Commands
**ปัญหา:** ถึงแม้เราจะใช้โมเดลเขียน SQL แต่ถ้าโมเดลถูกหลอก (Prompt Injection) หรือเกิด Hallucination ให้เขียนคำสั่ง `DROP TABLE`, `DELETE`, `UPDATE` หรือ `GRANT` ข้อมูลทั้งหมดของระบบอาจสูญหายหรือถูกขโมยได้
**วิธีแก้ไข (The Solution):**
1.  **Database Permission (Level 1):** สร้าง DB User ใหม่ชื่อ `ai_reader` ที่มีสิทธิ์ **`SELECT` เท่านั้น** ห้ามมีสิทธิ์ `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER` โดยเด็ดขาด นี่คือกำแพงด่านสุดท้ายที่แข็งแกร่งที่สุด
2.  **Regular Expression Guardian (Level 2):** ก่อนส่ง SQL ไปรัน ใช้ Code (Regex) ตรวจสอบอีกชั้นว่าห้ามมีคำสั่งต้องห้าม (เช่น `DROP`, `DELETE`, `TRUNCATE`, `EXEC`, `ALTER`) ถ้าเจอให้ Throw Error ทันที
3.  **Schema Isolation (Level 3):** ถ้าเป็นไปได้ ให้ AI เข้าถึงเฉพาะ View (SQL View) ที่เตรียมไว้ แทนที่จะเข้าถึง Table จริง เพื่อซ่อน Column ที่ Sensitive (เช่น รหัสผ่าน, เงินเดือน)

---

## 2. จุดอ่อนด้านความแม่นยำ (Accuracy Weaknesses)

### จุดอ่อน 2.1: Schema Hallucination (มั่วชื่อตาราง/คอลัมน์)
**ปัญหา:** โมเดลอาจจะจำชื่อคอลัมน์ผิด (เช่น `created_date` แทน `created_at` หรือ `usr_name` แทน `username`) ทำให้ Query Error
**วิธีแก้ไข (The Solution):**
1.  **Dynamic Schema Loader:** เขียน Script ให้ระบบดึง Schema จริง (Table Name, Column Name, Type) จาก DB มาใส่ใน Prompt ทุกครั้งที่ถาม เพื่อให้ AI เห็น Schema ล่าสุดเสมอ
2.  **Schema Linking:** ใน Prompt ต้องระบุ Explicitly ว่า "ใช้ตารางและคอลัมน์ตามรายการนี้เท่านั้น ห้ามคิดชื่อเอง"
3.  **Retry Mechanism:** เขียน Loop ในโค้ด:
    - ถ้า Query Error ให้ส่ง Error Message กลับไปให้ AI อ่าน
    - ให้ AI แก้ Query ใหม่ (Self-Correction) แล้วลองรันอีกครั้ง (จำกัด 3 รอบ)

### จุดอ่อน 2.2: Logic Ambiguity (ความกำกวมของภาษา)
**ปัญหา:** คำถามมนุษย์กำกวม เช่น "ยอดขายปีนี้" (ปีปฏิทิน vs ปีงบประมาณ?), "ลูกค้า Active" (Login ใน 7 วัน หรือ 30 วัน?) AI อาจตีความผิด
**วิธีแก้ไข (The Solution):**
1.  **Business Logic Dictionary:** สร้าง "พจนานุกรมความหมาย" ใส่ใน System Prompt เช่น:
    - *"ถ้าถามถึง Active User ให้หมายถึง users ที่ last_login > 30 วัน"*
    - *"ถ้าถามถึง 'งานด่วน' ให้หมายถึง priority = 'High' หรือ 'Critical'"*
    - *"ปีนี้ ให้ใช้ CURRENT_YEAR"*
2.  **Clarification Loop:** ถ้า AI ไม่แน่ใจ (ค่า Probability ต่ำ) ให้ AI ถามกลับ User ก่อน แทนที่จะเดาเขียน SQL ไปเลย

---

## 3. จุดอ่อนด้านประสิทธิภาพ (Performance Bottlenecks)

### จุดอ่อน 3.1: Heavy Query (ล้ม DB ด้วย Query มหาโหด)
**ปัญหา:** AI อาจเขียน Query ที่ไม่มีประสิทธิภาพ เช่น `SELECT *` จากตารางที่มีล้านแถว หรือการ JOIN หลายตารางโดยไม่มี Index ทำให้ Database ค้าง (Hang)
**วิธีแก้ไข (The Solution):**
1.  **Strict Limits:** บังคับเติม `LIMIT 50` หรือ `LIMIT 100` ต่อท้ายคำสั่ง `SELECT` เสมอใน Code ก่อนส่งไปรัน
2.  **Query Timestamp Timeout:** ตั้งค่า `statement_timeout` ใน PostgreSQL ไว้ที่ 2-5 วินาที สำหรับ User `ai_reader` ถ้า Query นานกว่านี้ให้ตัดทิ้งทันที
3.  **Prohibit SELECT *:** สั่งใน Prompt ว่าห้าม `SELECT *` ให้เลือกเฉพาะ Column ที่จำเป็น หรือเขียน Code ดักจับ

---

## 4. แผนผังการทำงานที่ "ไร้จุดอ่อน" (The Invincible Architecture)

```mermaid
graph TD
    UserQuery[User Query: "โปรเจ็คเดือนนี้มีอะไรบ้าง"] --> Router{Router AI}
    
    Router -- ถามความรู้ทั่วไป --> VectorRAG[Vector Search]
    Router -- ถามข้อมูล/เวลา --> Text2SQL[SQLCoder Model]
    
    subgraph "Safe SQL Zone"
        Text2SQL -->|1. Generate SQL| Validator[Regex Guard / Logic Check]
        Validator -- ผ่าน --> Executor[DB Runner (Read-Only User + Timeout)]
        Validator -- ไม่ผ่าน/อันตราย --> ErrorHandle[Return "ไม่สามารถทำรายการได้"]
        
        Executor -- SQL Error --> Corrector[ส่ง Error กลับไปให้ AI แก้]
        Corrector --> Text2SQL
        
        Executor -- Success --> ResultFormater[แปลงผล Table เป็นข้อความ]
    end
    
    ResultFormater --> FinalAnswer[ตอบ User]
```

## 5. สรุปความคุ้มค่าของการอุดช่องโหว่

การลงทุนลงแรงทำ 3 อย่างนี้จะปิดตายความเสี่ยงได้เกือบ 100%:
1.  **สำคัญที่สุด**: สร้าง **`Read-Only DB User`** (ป้องกันข้อมูลหาย 100%)
2.  **สำคัญรองลงมา**: ระบบ **Self-Correction** (แก้ปัญหาส่วนใหญ่ที่ AI เขียนชื่อผิด)
3.  **สำคัญที่สาม**: **Limit & Timeout** (ปกป้อง Server ไม่ให้ล่ม)

ด้วยโครงสร้างนี้ ระบบ Text-to-SQL จะกลายเป็นเครื่องมือที่ทรงพลังและปลอดภัยพอที่จะใช้งานในระดับ Production Enterprise ได้จริงครับ
