# 🧠 แผนการพัฒนา Conversational Memory (Zep Style Implementation)

แผนงานนี้มีเป้าหมายเพื่อสร้าง **"ระบบความจำระยะยาว" (Long-Term Memory)** ให้กับ AI โดยใช้แนวคิด **Hybrid Search (Vector + Keyword)** เลียนแบบสถาปัตยกรรมของ [Zep AI](https://www.getzep.com/) เพื่อให้ AI สามารถ "จำ" บริบทในอดีต แยกแยะรายละเอียดของโปรเจกต์ และเรียนรู้จากการสนทนาเก่าๆ ได้ เหมือนกับเป็น "สมอง" ที่แท้จริง

---

## 🏗️ Architecture Overview

เราจะแบ่งความจำออกเป็น 2 ส่วนหลัก ตามหลักจิตวิทยาความจำ (Cognitive Architecture):

1.  **Short-Term Memory (Context Window):**
    - คือสิ่งที่อยู่ใน `chat_history` ปัจจุบัน (20-50 ข้อความล่าสุด)
    - **หน้าที่:** ให้ AI ต่อบทสนทนาได้ไหลลื่นในปัจจุบัน
    - **สถานะ:** ✅ มีแล้ว (ใน `chat.controller.js`)

2.  **Long-Term Memory (Episodic Store):**
    - คือการจัดเก็บความทรงจำจาก "Session เก่าๆ" หรือ "ข้อความที่หลุด Context Window ไปแล้ว"
    - **หน้าที่:** ทำให้ AI จำได้ว่า "User เคยบอกว่าชอบสีแดง" หรือ "เมื่อวานคุยเรื่อง Bug Login กันค้างไว้"

---

## 🧐 "Session-Scoped" vs "Global" Memory : แบบไหนดีกว่ากัน?

ตามที่คุณถามมาว่า _"สร้าง long-term Memory ในเฉพาะแชทนั้นๆ แยกกันนะแบบนี้ดีมั้ย"_

**คำตอบ:** **ดีมากครับ** (สำหรับ Use Case ส่วนใหญ่ของการทำงาน) โดยมีเหตุผลดังนี้:

### ✅ ข้อดีของแบบแยกแชท (Session-Scoped)

1.  **ลดความสับสน (Context Purity):** ถ้าคุณคุยเรื่อง Project A ในแชทหนึ่ง แล้วไปคุยเรื่อง Project B ในอีกแชท AI จะไม่เอาข้อมูลของ A มาปนกับ B ซึ่งสำคัญมากในการทำงานที่ต้องการความแม่นยำ
2.  **Infinite Context:** เปรียบเสมือนการขยาย RAM ของแชทนั้นๆ ให้คุยได้ยาวไม่จำกัดหน้ากระดาษ (Infinite Scroll) โดยไม่ลืมเรื่องที่คุยไปเมื่อ 2 ชั่วโมงก่อน
3.  **Privacy/Security:** การจัดการข้องมูลปลอดภัยกว่า ข้อมูลไม่รั่วไหลข้ามห้องสนทนา

### ❌ ข้อจำกัด

- **เริ่มใหม่ = ลืมหมด:** ถ้าคุณเปิด New Chat เพื่อคุยเรื่องเดิม AI จะจำไม่ได้ว่าคุยอะไรไปแล้ว (ต้องเริ่มปูพื้นใหม่)

**สรุปทิศทาง:** แผนงานนี้จะโฟกัสไปที่ **"Session-Scoped Long-Term Memory"** (แยกความจำรายแชท) เป็นหลัก เพื่อทำหน้าที่เป็น **Infinite Context Window** ให้แชทฉลาดขึ้นในระยะยาวครับ

## 🛠️ Technical Design: The "Brain" Engine

เราจะใช้ **PostgreSQL + pgvector** ที่มีอยู่แล้ว ทำหน้าที่เป็น Memory Store ไม่ต้องติดตั้ง Database ใหม่ โดยใช้เทคนิค **Hybrid Search** เพื่อความแม่นยำสูงสุด

### 1. Database Schema Design (New Tables)

เราต้องเพิ่มตารางเพื่อเก็บ "สรุปความจำ" (Memory Summaries) และ "Embeddings"

```sql
-- ตารางเก็บ "ความจำสรุป" (Episodic Memory)
CREATE TABLE conversation_memories (
    id BIGSERIAL PRIMARY KEY,
    session_id UUID REFERENCES chat_sessions(id),

    -- เนื้อหาความจำที่ถูกสรุปมาแล้ว (Summary)
    -- เช่น "User แจ้งว่าระบบ Login มีปัญหาที่ API V2 และต้องการให้แก้ด่วน"
    summary TEXT NOT NULL,

    -- Entities ที่สกัดได้ (ใช้สำหรับ Filter)
    -- เช่น {"project": "ปิดไว้นะจ๊ะ", "topic": "Login", "urgency": "high"}
    metadata JSONB DEFAULT '{}',

    -- Vector Embedding (768 dimensions for bge-m3)
    embedding vector(1024),

    -- Full Text Search Vector (สำหรับ Keyword Search)
    fts tsvector,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexing เพื่อความเร็ว
CREATE INDEX idx_memory_embedding ON conversation_memories USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_memory_fts ON conversation_memories USING GIN (fts);
```

### 2. The Process Flow (กระบวนการทำงาน)

#### 📥 Step A: Ingestion (การบันทึกความจำ)

ไม่ใช่การบันทึกทุก Chat (เปลือง Token) แต่จะทำ **"Background Summarization"** เมื่อ Session จบลง หรือเมื่อข้อความครบ X จำนวน (เช่น ทุกๆ 10 ข้อความ)

1.  **Trigger:** ผู้ใช้หยุดพิมพ์ 5 นาที หรือ จบ Session
2.  **Summarize:** ใช้ LLM (Model เล็ก เช่น `qwen2.5:7b` หรือ `llama3:8b`) สรุป Chat ล่าสุด
    - _Prompt:_ "Summarize the following conversation into key facts. Extract entities (Client, Project)."
3.  **Embed:** ส่ง Summary ไปทำ Vector Embedding (ใช้ `bge-m3` ตัวเดิม)
4.  **Store:** บันทึกลงตาราง `conversation_memories`

#### 🔍 Step B: Retrieval (การรื้อฟื้นความจำ)

เมื่อ User พิมพ์ข้อความใหม่เข้ามา (`User Query`)

1.  **Intent Analysis:** (ทำอยู่แล้ว)
2.  **Memory Search (Parallel with Doc Search):**
    - ค้นหาใน `conversation_memories` ด้วย **Hybrid Search**:
      - **Filter Strict:** `WHERE session_id = current_session_id` (จำกัดเฉพาะความทรงจำในแชทนี้เท่านั้น)
      - **Vector:** หาความหมายที่คล้ายกัน (เช่น "คุยเรื่อง Login" จะเจอ memory เก่าของแชทนี้ที่คุยเรื่อง "API Authen Error")
      - **Keyword:** หาคำเฉพาะ (เช่น "ปิดไว้นะจ๊ะ", "Error 500")
3.  **Context Injection:**
    - นำ Memory ที่เจอ มาแปะไว้ส่วนบนของ System Prompt
    - _Format:_
    ```text
    ### 🧠 Relevant Memories:
    - (Session #123): User previously reported Login Bug on Project ปิดไว้นะจ๊ะ.
    - (Session #110): User prefers code examples in Python.
    ```

---

## 📝 Implementation Plan (แผนงาน)

### Phase 1: Database & Storage (Foundation)

- [ ] สร้าง Migration SQL สำหรับตาราง `conversation_memories`
- [ ] สร้าง `MemoryService.js` สำหรับจัดการ CRUD (Create, Read, Update, Delete) ของ Memory
- [ ] สร้าง Function `generateEmbedding` ที่ Reuse `retrievalService.js` ได้

### Phase 2: Summarization Engine (The "Hippocampus")

- [ ] สร้างฟังก์ชัน `summarizeMessages(messages)` ใน `llmService.js`
- [ ] สร้าง Trigger ใน `chat.controller.js`:
  - เมื่อจบ Request -> เช็คว่า Chat History ยาวเกินกำหนดหรือไม่?
  - ถ้าใช่ -> สั่ง `summarizeMessages` แบบ Background (Fire-and-forget) แล้วบันทึกลง DB

### Phase 3: Retrieval & Integration

- [ ] อัปเกรด `retrievalService.js` เพิ่มฟังก์ชัน `searchMemories(query)`
- [ ] ปรับ Hybrid Search ให้รองรับการค้นหา Memory (ไม่ใช่แค่ Document)
- [ ] แก้ไข `chat.controller.js` ให้นำ Memory ที่เจอ ใส่เข้าไปใน Context ก่อนส่งให้ LLM

### Phase 4: Entity Extraction (Zep Features)

- [ ] เพิ่ม Logic ให้ LLM ดึง "Entities" ออกมาระหว่าง Summarize
  - Output JSON: `{ "project": "...", "client": "...", "topic": "..." }`
- [ ] เก็บลง column `metadata` ใน DB
- [ ] ใช้ Metadata นี้ช่วย Filter ตอนค้นหา (เช่น `WHERE metadata->>'project' = 'ปิดไว้นะจ๊ะ'`)

---

## 💡 Example Scenario (ตัวอย่างการทำงาน)

**Session 1 (อดีต):**

- **User:** "ช่วยแก้ Bug หน้า Login ของโปรเจกต์ ปิดไว้นะจ๊ะ ให้หน่อย มันขึ้น 500"
- **AI:** (ช่วยแก้ปัญหา...)
- _(Background Process: AI สรุปว่า "User พบปัญหา Login 500 ที่โปรเจกต์ ปิดไว้นะจ๊ะ" -> เก็บเข้า Memory)_

**Session 5 (ปัจจุบัน - 7 วันต่อมา):**

- **User:** "ที่คุยกันคราวก่อน ได้เรื่องยัง?" (คำถามกำกวมมาก)
- **Without Memory:** AI: "เรื่องอะไรครับ? ขอรายละเอียดเพิ่มหน่อย" (เริ่มใหม่หมด)
- **With Memory:**
  1.  AI ค้นหา Memory ด้วยคำว่า "ที่คุยกันคราวก่อน" + กรองเฉพาะ `session_id` ปัจจุบัน
  2.  เจอ Memory (ของแชทนี้เอง): "User เคยแจ้งเรื่อง Bug Login 500 ของโปรเจกต์ ปิดไว้นะจ๊ะ ไว้เมื่อช่วงต้นแชท"
  3.  **AI Response:** "จากที่เราคุยกันตอนแรกเรื่อง **Bug Login ของโปรเจกต์ ปิดไว้นะจ๊ะ**..." (AI เชื่อมโยงบริบทต้นแชทได้ แม้จะคุยเรื่องอื่นแทรกไปนานแล้ว)

---

## ✅ Benefits (ประโยชน์ที่ได้รับ)

1.  **Personalized Experience:** AI จำ User ได้ รู้ใจ ไม่ต้องเล่าซ้ำ
2.  **Context Continuity:** คุยข้าม Session ได้อย่างต่อเนื่อง
3.  **Less Tokens Used:** ไม่ต้องอัด Chat History ทั้งหมดใส่ Context Window (ที่แพงและมีจำกัด) แต่ดึงมาเฉพาะ "ความจำที่เกี่ยวข้อง" เท่านั้น
