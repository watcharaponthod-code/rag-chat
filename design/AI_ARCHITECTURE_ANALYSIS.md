# วิเคราะห์โครงสร้าง AI Architecture ปัจจุบัน vs LangChain

เอกสารชุดนี้วิเคราะห์เปรียบเทียบระหว่างสถาปัตยกรรม AI ปัจจุบัน (Current Custom Implementation) กับการนำ LangChain เข้ามาใช้งาน เพื่อช่วยตัดสินใจในการปรับปรุงระบบ

## 1. วิเคราะห์ระบบปัจจุบัน (Current Custom Implementation)

จากการตรวจสอบโค้ดใน `chat.controller.js`, `llmService.js` และ `retrievalService.js` พบว่าระบบมีลักษณะเป็น **"Custom Optimized RAG Pipeline"** โดยมีความพิเศษดังนี้:

### สถาปัตยกรรมหลัก (Architecture Pattern)
ระบบใช้รูปแบบ **Sequential Imperative Pipeline** ที่เขียนควบคุม Flow เองทั้งหมดใน Controller ประกอบด้วยขั้นตอน:
1.  **Rewrite**: ปรับปรุง Query โดยใช้ประวัติการสนทนา (Historical Context)
2.  **Intent Classification**: แยกแยะเจตนา (หาข้อมูลทั่วไป, หาบั๊ก Mantis, หรือถามเล่นทั่วไป) พร้อม Logic การ "ถามกลับ" (Clarification)
3.  **Hybrid Retrieval (Highly Customized)**: หัวใจสำคัญของระบบอยู่ที่ฟังก์ชัน `hybridSearch` ใน `retrievalService.js` ซึ่งทำการ:
    -   Combined Search: Vector Similarity + Full Text Search (FTS)
    -   Custom Scoring: มีสูตรคำนวณคะแนนเฉพาะตัว (`RagConfig.search.hybridBoostFactor`)
    -   Specific Filters: รองรับการกรอง Metadata เฉพาะทาง เช่น `project_name`
4.  **Reranking**: ใช้ LLM (Ollama) เข้ามาจัดลำดับผลลัพธ์รอบสุดท้าย
5.  **Generation**: สร้างคำตอบพร้อมแนบอ้างอิงภาพ (Images) และ Mantis IDs

### จุดแข็งของระบบปัจจุบัน
1.  **ประสิทธิภาพสูง (Performance Optimized)**:
    -   การเขียน SQL Query เองใน `retrievalService.js` ทำให้ใช้ฟีเจอร์ของ PostgreSQL (`pgvector`, `tsvector`, `jsonb_ops`) ได้เต็มประสิทธิภาพสูงสุด โดยไม่มี Layer ของ ORM หรือ Library มาขวาง
    -   สามารถจัดการ Connection Pool และ Keep-Alive Agent ของ Ollama ได้เองโดยตรง (สำคัญมากสำหรับ Local Model)
2.  **ความยืดหยุ่นเต็มที่ (Max Flexibility)**:
    -   Logic การค้นหาแบบ Hybrid ที่ซับซ้อน (Vector 70% + Keyword 30% + Boost if both match) สามารถเขียนได้ดั่งใจ
    -   การจัดการ "Mantis Search" ที่ต้อง join ตารางแบบพิเศษ ทำได้ง่ายกว่าการพยายามยัดลง Generic Interface
3.  **Debug ง่าย (Transparency)**:
    -   โครงสร้างเป็นแบบ Function calls ธรรมดา ไล่โค้ดได้ง่าย ทราบได้ทันทีว่า Error เกิดที่บรรทัดไหน ไม่ต้องทำความเข้าใจ Abstraction ภายในของ Library

### จุดอ่อนของระบบปัจจุบัน
1.  **Boilerplate Code เยอะ**: ต้องเขียน SQL String, การจัดการ HTTP Request, Retry Logic เองทั้งหมด (แต่เขียนเสร็จแล้ว)
2.  **ผูกติดกับ Ollama API**: (แต่เนื่องจากเป็น Corporate Model ที่ไม่เปลี่ยน จึงไม่ใช่ข้อเสียในบริบทนี้)

---

## 2. การวิเคราะห์หากนำ LangChain เข้ามาใช้งาน (LangChain Adoption)

หากนำ LangChain (JS/Node) เข้ามาใช้งาน จะส่งผลกระทบต่อส่วนต่างๆ ดังนี้:

### ส่วนที่ LangChain ทำได้ดี (Potential Wins) -> แต่อาจไม่จำเป็นสำหรับโปรเจ็คนี้

| ส่วนประกอบ | สิ่งที่ LangChain เข้ามาช่วย | ความคุ้มค่าในบริบทนี้ |
| :--- | :--- | :--- |
| **LLM Connector** | Abstract การเรียก API หลายค่าย | **ต่ำมาก** (เพราะเราใช้ Corporate Model ตัวเดียว ไม่ย้ายค่าย) |
| **Prompt Templates** | จัดการ Prompt Structure | **ปานกลาง** (Code ปัจจุบันใช้ Template String ก็เพียงพอแล้ว) |
| **Chains** | จัดการ Sequence การทำงาน | **ต่ำ** (Flow ปัจจุบันใช้ if-else ธรรมดา อ่านง่ายกว่า) |
| **Dependency** | เพิ่ม Libraries ภายนอก | **ติดลบ** (เพิ่มขนาดโปรเจ็คโดยไม่จำเป็น และอาจกระทบ Performance) |

---

## 3. ข้อสรุปและการตัดสินใจ (Final Decision)

จากการวิเคราะห์ร่วมกับเงื่อนไขสำคัญคือ **"ใช้งาน Corporate Model / Local Model และไม่มีแผนจะย้ายค่าย"**

### ฟันธง: **✅ ไม่เปลี่ยนไปใช้ LangChain (Stick with Custom Architecture)**

**เหตุผลสนับสนุน:**

1.  **Zero Switching Cost Benefit**: ข้อดีหลักของ LangChain คือ "ความง่ายในการย้าย Model Provider" (เช่น ย้ายจาก GPT-4 ไป Claude 3) แต่เมื่อเรามีเงื่อนไขว่า **"ใช้ model ของบริษัทและไม่ย้ายแน่นอน"** ข้อดีนี้จึงกลายเป็นศูนย์ทันที
2.  **Performance Control**: การใช้ Local/Corporate Model มักต้องจูนเรื่อง Network Connection (Keep-Alive) และ Timeouts อย่างละเอียด การใช้ Custom `fetch` + `http.Agent` แบบปัจจุบัน ทำให้เราคุมพฤติกรรมนี้ได้ 100% ต่างจาก LangChain ที่ซ่อนเรื่องนี้ไว้
3.  **Risk Reduction**: การนำ Library ใหญ่ๆ เข้ามาใส่ในระบบที่ Stable อยู่แล้ว เป็นความเสี่ยงที่ไม่จำเป็น (Technical Debt ในอนาคตเมื่อ Library อัปเดต)
4.  **Deep Optimization**: Search Logic ปัจจุบันของเรา (`hybridSearch`) มีความซับซ้อนและฉลาดกว่า Standard Retriever ของ LangChain มาก การจะ Port ไปลง LangChain ต้องเสียเวลาเขียน Custom Class เยอะมาก และอาจได้ Performance ที่แย่ลง

### แผนดำเนินการต่อ (Action Plan)
*   [x] **Architecture**: ยืนยันใช้โครงสร้างปัจจุบัน (Custom Controller + Service)
*   [ ] **Optimization**: มุ่งเน้นพัฒนาที่ `retrievalService.js` และการจูน SQL Query ให้แม่นยำขึ้น แทนที่จะเสียเวลา Refactor โค้ด
*   [ ] **Maintenance**: รักษา Code ส่วน `llmService.js` ให้ Clean และ update ตาม API ของ Model บริษัทหากมีการเปลี่ยนแปลง version
