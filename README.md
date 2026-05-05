# 📖 WebClient AI Workspace - System Overview & Architecture

โปรเจกต์นี้คือระบบแชทผู้ช่วย AI สำหรับใช้งานภายในองค์กร (WebClient) ที่ถูกออกแบบมาเพื่อวิเคราะห์ข้อมูล ค้นหาบัค (Mantis DB) และค้นหาเอกสารความรู้ (Document RAG) โดยอาศัยเทคโนโลยี **Agentic RAG**, **Ollama**, **LangChain**, และ **LangGraph**

นี่คือคำอธิบายระบบอย่างละเอียดตั้งแต่การเชื่อมต่อ, เครื่องมือ, การจัดการทรัพยากร จนถึงระดับคณิตศาสตร์ของ Vector

---

## 🛠️ 1. เครื่องมือและภาษาที่ใช้ (Tech Stack)
*   **Frontend:** React 18, Vite, TailwindCSS (สำหรับการจัดการ UI, Animation และ Markdown Rendering)
*   **Backend / Gateway Server:** Node.js, Express.js (ทำหน้าที่เป็น Gateway หลักเชื่อมต่อกับฐานข้อมูลและ Ollama)
*   **AI & Logic Chains:** 
    *   **LangChain:** สำหรับการจัดการ Prompt, ห่อหุ้มโมเดล LLM, และจัดการ History
    *   **LangGraph:** ระบบ State Machine สำหรับควบคุมลำดับความคิด (Thoughts) และบังคับพฤติกรรมของ Agent
    *   **LlamaIndex:** สำหรับงานขั้นสูง เช่น Advanced Re-ranking, การสรุปผลแบบ TreeSummarize และสร้าง VectorStore จำลอง (In-memory)
*   **ฐานข้อมูล (Database):**
    *   **PostgreSQL (พร้อม `pgvector`):** สำหรับเก็บข้อมูลเอกสารและทำ Vector/Hybrid Search
    *   **MySQL:** สำหรับเชื่อมต่อและดึงข้อมูลระบบ Mantis (Bug Tracker)..

---

## 🌐 2. ระบบ Gateway ที่เชื่อมต่อกับ Ollama จาก Host
Backend (Node.js/Express) ทำตัวเป็น **API Gateway** ที่รับคำสั่งจาก Frontend (ผ่าน Web HTTP) และส่งต่อไปยัง **Ollama Host** ผ่าน `fetch` แบบ HTTP request การเชื่อมต่อนี้มีกลไกสำคัญคือ:

1.  **KeepAlive Agent:** มีการสร้าง `http.Agent({ keepAlive: true })` เพื่อลดโอเวอร์เฮดของการเปิด-ปิด Connection ทุกครั้งที่คุยกับ AI
2.  **Streaming:** ฝั่ง Gateway รับข้อมูลจาก Ollama แบบ Stream Token-by-Token (`stream: true`) และใช้ `res.write()` ปล่อยข้อมูลตรงถึง Frontend ทันที (รองรับ Server-Sent Events) ทำให้ผู้ใช้ไม่ต้องรอนาน
3.  **Thought Process Interception:** หากเปิดโมเดลที่รองรับการคิด (Thinking Pattern) Gateway จะตรวจจับ Token ของความคิด นำมาวิเคราะห์และส่งผ่านเป็นหน้าต่างสถานะ (Thoughts) ให้ผู้ใช้ดูก่อนคำตอบสุดท้าย

---

## 🧠 3. การทำงานของ RAG (Retrieval-Augmented Generation) 
โปรเจกต์นี้ใช้ RAG ประเภท **Advanced Agentic RAG** (ผสมกับ Hybrid RAG) รูปแบบการทำงานแบ่งออกเป็น **3 State (สถานะ)** แตกต่างกันดังนี้:

### State 1: ก่อนการค้นหา (Pre-Retrieval)
เป้าหมายคือการเตรียมคำถามให้มีประสิทธิภาพสูงสุดก่อนไปถามฐานข้อมูล:
*   **Intent Analyzer:** LLM จะวิเคราะห์ "เจตนา" ว่าคำถามเกี่ยวข้องกับ ค้นหาทั่วไป (Text), รูปภาพ (Image), ดูบัคโครงการ (Mantis), หรือเขียน SQL
*   **Query Augmentation (การเสริมคำถาม):** 
    *   **HyDE (Hypothetical Document Embeddings):** สั่งให้ LLM สร้าง "คำตอบจำลองหลอกๆ" ขึ้นมาก่อน แล้วนำคำตอบนั้นไปแปลงเป็น Vector (หลักการคือคำตอบจำลอง มักจะมีคำศัพท์คล้ายกับเอกสารจริงมากกว่าคำถามสั้นๆ ของผู้ใช้)
    *   **Rewrite:** หากคำถามมีความซับซ้อน จะถูกแตกย่อยแยกเป็น Sub-queries (สูงสุด 3 คำถาม) ก่อนนำไปค้นหา

### State 2: ระหว่างการค้นหา (Retrieval)
*   **Hybrid Search:** นำคำถาม (ทั้งต้นฉบับและส่วนที่ Rewrite) ส่งไปหาใน **PostgreSQL**:
    1.  **Vector Search:** ค้นหาเนื้อหาด้วยมิติคณิตศาสตร์ ผ่าน `pgvector`
    2.  **Full-Text Search (FTS):** ค้นหาคำเป๊ะๆ ด้วยฟังก์ชัน `to_tsvector` ของข้อความเดิม
    *(ดึงผลลัพธ์มารวมกันและให้คะแนนถ่วงน้ำหนักตามสูตร เช่น Vector 70% + Keyword 30%)*
*   **Mantis Action:** หากลูปการทำงานถูกส่งผ่าน LangGraph เข้ามาใน "Mantis Strategy" ระบบจะไม่ดึง Vector แต่จะให้ LLM แยกแยะสถานะและยิง SQL Command สดๆ หาฐานข้อมูล MySQL

### State 3: หลังการค้นหา (Post-Retrieval)
*   **Smart Filtering:** หลังจากขุดข้อมูลมาได้นับร้อยบรรทัด ระบบจะกรองเอกสารทิ้ง:
    *   **การตัดคะแนน (Thresholds):** โยนเอกสารที่มีเปอร์เซ็นต์ความคล้ายคลึง (Similarity) ต่ำทิ้ง
    *   **ความหลากหลาย (Diversity):** จำกัดจำนวน Chunk ไม่ให้มาจากเอกสารหน้าเดียวกันมากเกินไป
*   **Advanced Re-ranking:** นำเอกสารที่ผ่านการกรอง (Top K) ไปสร้าง Vector Index แบบชั่วคราวฉบับย่อด้วย **LlamaIndex** และให้ Re-ranker LLM ให้คะแนนลำดับใหม่ เพื่อรีดเอาความถูกต้องที่เป๊ะที่สุดอีกชั้น
*   **Synthesis (การสังเคราะห์):** นำเอกสารที่ผ่าน Rerank เข้ายัดรวมส่งเข้าไปในรูปแบบ XML Tags แล้วให้ LLM หลักใช้อ่านและ "ตอบคำถามสุดท้าย" แก่ผู้ใช้ 

---

## 🧮 4. Vectorize Data ทำงานอย่างไร? (อธิบายลึกซึ้ง)
เอกสารที่อยู่ในระบบ ไม่ได้เก็บเป็นแค่ข้อความยาวๆ แต่เก็บในรูปแบบตัวเลข
1.  **การแยกส่วน (Chunking):** เอกสารถูกหั่นเป็นชิ้นๆ (Chunk) ขนาดละประมาณ 1800 ตัวอักษร โดยมีระยะซ้อนทับ (Overlap) 200 ตัวอักษร เพื่อไม่ให้บริบท (Context) ขาดตอน
2.  **หน้าตาของเวกเตอร์ (Embeddings):** ก่อนดึงข้อมูล เอกสารเหล่านั้นจะถูกแปลงด้วย Embedding Model (`bge-m3:latest`) ให้ออกมาเป็น **Float Array จำนวนมหาศาล (จำนวนมิติ = 1024 มิติ)**
    *   *หน้าตาข้อมูล:* `[ 0.0456, -0.0123, 0.8876, 0.0032, ... (ครบ 1024 ตัวค่าตัวเลข) ]`
3.  **หลักการคณิตศาสตร์ (Cosine Similarity):** 
    *   เวลาผู้ใช้พิมพ์ตั้งคำถาม คำถามนั้นจะถูกแปลงเป็นมิติ 1024 ชุดตัวเลขเช่นกัน
    *   ฐานข้อมูล (`pgvector`) จะใช้สมการการหาค่าความคล้ายทางโคไซน์ (Cosine Distance `1 - (A • B) / (||A|| * ||B||)`) วัด "มุม" ระหว่างเส้นของเวกเตอร์คำถาม และเส้นเวกเตอร์เอกสารต่างๆ ในช่องว่าง 1024 มิติ
    *   ถ้าเนื้อหามีความสอดคล้องกันเวกเตอร์พุ่งไปทิศเดียวกัน มุมจะแคบ และค่าคะแนน Cosine Similarity จะมีค่า **เข้าใกล้ 1.0 (100%)**

---

## ⚙️ 5. บทบาทของ LangChain และ LangGraph (ทำไมถึงใช้ขั้นตอนนี้?)
*   **LangChain:** เป็นโครงสร้างพื้นฐาน ถูกนำมาใช้ในการเชื่อมมาตรฐาน (Format) ทำให้ไม่ต้องเขียน Prompt โล้นๆ เอง เช่น `HumanMessage`, `SystemMessage` และประสานการเรียก History มาต่อกันให้เป็นลูปแชทต่อเนื่อง 
*   **LangGraph:** นำมาใช้ใน Agent Strategy (เช่น Mantis) ในการสร้าง "State Machine"
    *   แทนที่จะปล่อยให้ AI คิดเองลอยๆ ว่าจะหาข้อมูลจากไหน LangGraph จะสร้างเส้นทางเดินรถบังคับให้ AI ทำงานตามป้าย
    *   **ตัวอย่าง State Mantis:** 
        1.  จุดสตาร์ท (`START`) -> เข้า Node `analyze_bug_request` (บังคับวิเคราะห์ชื่อโครงการและสถานะ)
        2.  วิเคราะห์เสร็จ -> ส่งตัวแปร Filters (เช่น สถานะ Closed) มาให้ Node `search_mantis_db`
        3.  ยิง SQL ตาม Filters สดๆ 
        4.  ย้ายข้อมูลทั้งหมดไปเข้า Node `synthesize` (เพื่อสรุปผล) -> (`END`)
    *   *ผลพลอยได้:* เราสามารถบันทึกตัวแปร `thoughts` ควบคู่ไปกับ State เพื่อแสดงรูปไอคอนให้ผู้ใช้เห็นว่า ตอนนี้แวะป้ายไหนอยู่

---

## 🔥 6. ความท้าทายหลัก: การแก้ปัญหา VRAM 16 GB กับ RAM ระบบ 120 GB
ความท้าทายที่ยากที่สุดในการทำโปรเจกต์นี้คือ **ขีดจำกัดของ Hardware:**
VRAM รวมของเซิร์ฟเวอร์มีเพียงก้อนเดียว **(16 GB GPU VRAM)** แต่ระบบต้องใช้งาน LLM ถึง **4 โมเดลสลับกันไปมา**:
1.  **Main Chat Model:** สำหรับสรุป (ขนาดใหญ่ กิน VRAM เยอะ)
2.  **Embedding Model (`bge-m3`):** สำหรับเทียบระยะเวกเตอร์ตัวเลข
3.  **Reranker Model (`qllama/bge-reranker-v2-m3:f16`):** สำหรับการ Rerank 
4.  **SQL Agent Model (`sqlcoder`):** สำหรับการแปลงภาษาเป็น Query

หากยัดทั้ง 4 โมเดลลงไปใน VRAM 16 GB พร้อมกัน ระบบจะระเบิดและแครช (Out of Memory)

### 💡 การจัดสรรทรัพยากร (Memory Management & Model Swapping)
เพื่อให้ทั้ง 4 โมเดลทำหน้าที่ประสานเป็น RAG ให้ได้ ระบบจึงใช้เทคนิค **Model Unloading (การสลับเข้าออก)** โดยดึงประโยชน์จาก **RAM ของ System (120 GB RAM)** มาเป็น Buffer มหาศาล:

1.  **อัดฉีดแล้วเอาออก (Keep Alive Limits):** สังเกตใน `ollamaClient.js` จะมีฟังก์ชัน `freeVram(model, keep_alive = 0)`
2.  **ขั้นตอนการทำงาน (Workflow):**
    *   เมื่อมี Request เข้ามา ระบบจะสั่งเรียก Embedding Model ให้เข้า VRAM (โหลดไว เพราะดึงจาก 120GB RAM เข้าการ์ดจอ)
    *   พอฝังข้อมูลเสร็จ ระบบอาจจะสั่ง `keep_alive: 0` เตะ Embedding Model ออกจาก VRAM
    *   โหลด Rerank Model หรือ SQL Coder เข้าไปในพื้นที่ VRAM ที่ว่างแทนเพื่อใช้ตรวจสอบความถูกต้อง
    *   เตะ Reranker ออก และโหลดโมเดล Chat Model ตัวหลักสุดเข้ามายัง VRAM เพื่อขมวดปมสุดท้าย (Synthesize)
3.  **ใช้ Cache ประหยัดแรง:** มีการทำ `CacheService` สำหรับคำที่ค้นหาบ่อย (ทั้ง Embedding Cache และ Unified Search Cache) ถ้าคำถามซ้ำ จะไม่ปลุก Embedding Model ลง VRAM เด็ดขาด หันไปดึงจาก JSON Cache ธรรมดาแทน

### ⚠️ เพราะเหตุใดจึงยากต่อการผลิตโปรเจกต์นี้?
1.  **Latency:** การรอคอยให้การ์ดจอสลับโมเดลเข้าออกทำให้เกิด Latency (หน่วง) ในการประมวลผล การจูนระบบ Streaming Token มาระหว่างกระบวนการคิด (Thoughts) เพื่อหลอกตาผู้ใช้งานให้เห็นว่า "ระบบกำลังทำงานอยู่ ไม่ได้ค้าง" จึงสำคัญมาก
2.  **Context Overflow Limit:** เมื่อเราพยายามยัดบริบทการอธิบายและรายละเอียดยิบย่อยลงไปให้ AI อ่าน เราต้องทำ **Lean Context Mapping** ตัดฟิลด์ที่ไม่จำเป็นทิ้ง เช่น บัคบางตัวรายละเอียดเป็นพันบรรทัด ต้องเขียนฟังก์ชันตัดให้เหลือ `<description>{truncate(doc.description)}</description>` (ตามไฟล์ `nodes.js`) เพื่อไม่ให้ Token เฟ้อเกินลิมิต 12000 ตัวอักษร
3.  **Logic Chaining ความเสี่ยงสูง:** ถ้า SQL Coder ทำงานพัง หรือ Reranker ทำงานหลุดจาก Thresholds กติกา ระบบทั้ง Pipeline จะรวน การเขียน Fallback (ย้อนกลับไปใช้ค่า Basic) เมื่อเกิด Error ของ Agent แต่ละตัวอย่างแน่นหนาจึงเป็นแกนกลางของความเสถียร

---

## 🔄 7. Dataflow (กระแสการไหลของข้อมูล)
การทำงานเมื่อผู้ใช้พิมพ์คำถามผ่าน UI มีลำดับดังนี้:
1. **Frontend (React/Vite):** ผู้ใช้พิมพ์ข้อความผ่าน `App.tsx` ระบบจะเรียกใช้ฟังก์ชัน `sendMessageStream` ผ่าน `clientApi.ts` เพื่อส่ง HTTP POST Request แบบ Streaming ไปที่ Backend `/api/chat/send`
2. **Controller (`chat.controller.js`):** รับ Request ผ่าน Middleware (Auth) และส่งเข้าฟังก์ชันการจัดการข้อความ
3. **Master Orchestrator (`masterGraph.js`):** ตัวจัดการหลัก (LangGraph) จะรับข้อความและกำหนด Intent:
   - ตรวจสอบ Mode (Doc, Mantis, Agent)
   - วิเคราะห์เจตนา (Intent Analysis) ผ่าน LLM เพื่อประเมินบริบท (เช่น เป็นการถามเอกสาร หรือ หาบัคของระบบ)
4. **Strategy Execution:** ระบบเลือก Strategy (เช่น `fastStrategy`, `mantisStrategy`, `reactAgentStrategy`)
5. **Retrieval (ดึงข้อมูล):** 
   - **ถ้าเป็นเอกสารทั่วไป:** ส่งคำถามไปดึงข้อมูลใน VectorDB (PostgreSQL `pgvector`) ผ่าน `hybridSearch.js` และทำ LlamaIndex Re-ranker เพื่อคัดเลือกเอกสารที่ตรงที่สุด
   - **ถ้าเป็นงานระบบบัค (Mantis):** Agent จะแปลงคำถามเป็น SQL (SQL Coder) เพื่อยิงหาข้อมูลสดๆ ใน Main Database/MySQL
6. **Synthesis (สังเคราะห์คำตอบ):** รวบรวมข้อมูลทั้งหมดที่ได้ ส่งให้โมเดลภาษา (Ollama Chat Model) สร้างคำตอบ
7. **Streaming:** ผลลัพธ์ในรูปแบบของขั้นตอนความคิด (Thoughts), แหล่งอ้างอิง (Citations), และตัวหนังสือคำตอบ (Tokens) จะถูก Stream กลับไปที่ Frontend แบบ Real-time ทันที
8. **Frontend Update:** Zustand Store ของแอป (และ UI components) จะรับ Stream Content มาแสดงผลให้ผู้ใช้เห็นทันทีทีละตัวอักษร

---

## 🏗️ 8. Infrastructure & CI/CD (โครงสร้างพื้นฐานและการจัดการโค้ด)
ระบบถูกออกแบบมาให้รองรับการรันบน **Kubernetes (K8s)** และมีระบบ **CI/CD Automations** ผ่าน GitLab:

1. **Local Development (Docker Compose):**
   - ใช้ `docker-compose.yml` สำหรับสร้าง Container ให้ทำงานรันร่วมกันในเครื่อง Local
   - ควบคุม Environment Variables (ฐานข้อมูล, ตำแหน่งที่ตั้งของโมเดล Ollama, Ports) ได้อย่างครบถ้วน
2. **Containerization (Docker):**
   - ไฟล์ `Dockerfile` ทำงานแบบ **Multi-stage Build**:
     - *Stage 1 (Builder):* Build โค้ดส่วน Frontend (Vite) ให้กลายเป็น Static Files ไว้ที่โฟลเดอร์ `dist`
     - *Stage 2 (Runner):* ดึง `dist` มาวางร่วมกับ Backend (Express) และลงเฉพาะ Library ที่ต้องใช้จริง (Production ready) ลดขนาด Image 
3. **GitLab CI/CD Pipeline (`.gitlab-ci.yml`):** ทำงานอัตโนมัติ 4 Stages หลัก:
   - **build:** เริ่มต้นเมื่อมีการ push โค้ดเข้า branch ใดๆ จะใช้ Docker-in-Docker (dind) build image และ push เข้า Private Registry ของโปรเจกต์
   - **deploy-staging:** นำ Image ล่าสุดไป Deploy ลงระบบทดสอบบน Kubernetes (Namespace: `ai-research`) ผ่านคำสั่ง `kubectl apply` 
   - **deploy-production:** หากมีการ Merge โค้ดเข้า Branch `dev` หรือ `main` ระบบจะดึง Image ตัวสมบูรณ์ Deploy ขึ้นเซิร์ฟเวอร์หลัก (Production K8s) ให้โดยอัตโนมัติ
   - **rollback-production:** มีปุ่มกดสวิทช์เพื่อ Rollback เวอร์ชันก่อนหน้าในกรณีที่ระบบมีปัญหา (กดใช้บน `main` แบบ Manual)

---

## 🎨 9. Prompt สำหรับนำไปสร้าง Diagram
คุณสามารถคัดลอก **Prompt ด้านล่างนี้** นำไปวางใน ChatGPT, Claude หรือเครื่องมือออกแบบ Diagram (เช่น Mermaid Live, Eraser.io, Draw.io AI) เพื่อสร้างภาพสถาปัตยกรรม (Architecture Diagram) ที่สมบูรณ์แบบได้ทันที:

### 📥 คัดลอก Prompt ด้านล่างนี้

> Please generate an Architecture and Dataflow Diagram using Mermaid.js (or standard box-and-arrow notation) for the "WebClient AI Workspace" system based on the following details. 
> 
> **1. Key System Components:**
> - **Frontend (Client UI):** React 18, Vite, Zustand, TailwindCSS. Uses HTTP streaming (SSE) to display responses in real-time.
> - **API Gateway (Backend):** Node.js & Express.js. Handles REST APIs, Auth, and routes requests. Serves static frontend files in production.
> - **AI Orchestrator (LangChain & LangGraph):** The core intelligence brain (`masterGraph.js`). Analyzes User Intent and routes execution to specific functional strategies (Strategies: Fast Document Search, Mantis Bug Tracker, ReAct Agent).
> - **LLM Engine (Ollama Host):** Runs local models. Has strict VRAM limits (16GB), so it manages resources using "Model Swapping" (e.g., swapping embedding models, re-rankers, and chat models in and out of GPU RAM).
> - **Databases:**
>   - *VectorDB (PostgreSQL + pgvector):* Stores and retrieves RAG document chunks using Hybrid Search (Cosine Similarity + FTS).
>   - *MainDB / MantisDB (MySQL/PostgreSQL):* Stores user data and is queried dynamically by the SQL Agent for bug reports.
> 
> **2. CI/CD & Infrastructure:**
> - **GitLab CI/CD Pipeline:** Stages include Build (Docker Image), Deploy Staging (K8s), and Deploy Production (K8s Namespace: `ai-research`).
> - **Kubernetes (K8s):** The orchestrator running the Containerized Frontend+Backend App.
> 
> **3. Dataflow Steps to display:**
> 1. User submits a query via Frontend.
> 2. API Gateway receives the HTTP POST stream request.
> 3. API Gateway hands off to the LangGraph Orchestrator.
> 4. Orchestrator extracts "Intent" using the LLM Engine.
> 5. Orchestrator executes a Strategy based on the Intent.
> 6. Strategy performs Retrieval: either Hybrid Search on VectorDB or SQL querying on MainDB.
> 7. Strategy applies "Smart Filtering" and sends retrieved context to LLM Engine for "Advanced Re-ranking".
> 8. Re-ranked context is synthesized by the Main Chat Model.
> 9. LLM Engine streams "Thoughts", "Citations", and final "Text" back to the Orchestrator -> API Gateway -> Frontend.
> 
> Please map out the relationships clearly. Use distinct boundaries/boxes for "Frontend", "Kubernetes Cluster (Backend)", "LLM Server (Ollama)", "Databases", and "CI/CD Pipeline".