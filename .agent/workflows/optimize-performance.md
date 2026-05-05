---
description: แผนการปรับปรุงประสิทธิภาพระบบให้แม่นยำและเร็วขึ้น
---

# 🚀 แผนการปรับปรุงประสิทธิภาพระบบ RAG (Speed + Accuracy)

## 📊 สรุปผลการวิเคราะห์ Bottleneck

จากการวิเคราะห์โค้ดพบ **7 จุดที่ทำให้ช้า** ในไปป์ไลน์การตอบสนอง:

### ⏱️ Timeline ปัจจุบัน (ประมาณการ)
```
User Query → [1] Intent Analysis (1-2s) → [2] Embedding (0.5s) → [3] Hybrid Search (1-1.5s) 
→ [4] Rerank Text (2-3s) → [5] Rerank Images (2-3s) → [6] LLM Response (3-5s)
= รวม 10-17 วินาที
```

### 🎯 เป้าหมาย
```
User Query → [Optimized Pipeline] → Response
= รวม 2-4 วินาที (ลดลง 70-80%)
```

---

## 📋 แผนการทำงาน (Priority-Based Roadmap)

### 🔴 **Phase 1: Quick Wins (Impact สูง, Effort ต่ำ)** — 1-2 วัน

#### 1.1 ทำ Parallel Processing แทน Sequential
**ปัญหา:** ตอนนี้ `rerank` Text และ Images ทำงานแบบ sequential (รอกันและกัน)
```javascript
// ❌ ปัจจุบัน (ช้า)
const rerankedText = await LLMService.rerank(...);    // รอ 2-3s
const rerankedImages = await LLMService.rerank(...);  // รอ 2-3s อีก
```

**แก้ไข:**
```javascript
// ✅ ใหม่ (เร็ว)
const [rerankedText, rerankedImages] = await Promise.all([
    LLMService.rerank(rewrittenQuery, textResults, RagConfig.context.maxChunksToLLM),
    LLMService.rerank(rewrittenQuery, imageResults, 5)
]);
```
**ผลลัพธ์:** ลดเวลา 2-3 วินาที (จาก 4-6s → 2-3s)

---

#### 1.2 ลด/ปิด Reranking สำหรับ Images
**ปัญหา:** Image reranking ใช้ LLM ซึ่งช้า แต่ผลลัพธ์ไม่ได้ช่วยมากนัก (เพราะ similarity score จาก vector search ดีอยู่แล้ว)

**แก้ไข:**
```javascript
// ✅ ใช้ Simple Sorting แทน LLM Reranking
const rerankedImages = imageResults
    .sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
    .slice(0, 5);
```
**ผลลัพธ์:** ลดเวลา 2-3 วินาที + ลดภาระ Ollama

---

#### 1.3 Cache Embedding สำหรับ Query ที่ซ้ำ
**ปัญหา:** ทุกครั้งที่มี query เข้ามา ต้องสร้าง embedding ใหม่ (0.5s) แม้จะเป็น query เดิม

**แก้ไข:** สร้าง LRU Cache
```javascript
// ใน retrievalService.js
import { LRUCache } from 'lru-cache';

const embeddingCache = new LRUCache({
    max: 500,  // เก็บ 500 queries
    ttl: 1000 * 60 * 60 * 24  // 24 ชั่วโมง
});

const getEmbedding = async (text) => {
    const cacheKey = text.substring(0, 200);  // ใช้ 200 ตัวอักษรแรกเป็น key
    
    if (embeddingCache.has(cacheKey)) {
        console.log('[Cache Hit] Using cached embedding');
        return embeddingCache.get(cacheKey);
    }
    
    // ... existing code ...
    const embedding = data.embedding;
    embeddingCache.set(cacheKey, embedding);
    return embedding;
};
```
**ผลลัพธ์:** ลดเวลา 0.5s สำหรับ query ที่ซ้ำ (30-40% ของ queries)

---

#### 1.4 ปรับ Intent Analysis ให้เร็วขึ้น
**ปัญหา:** `analyzeIntent` เรียก LLM ทุกครั้ง (1-2s) แม้จะเป็น query ธรรมดา

**แก้ไข:** ใช้ Rule-Based Detection ก่อน, เรียก LLM เฉพาะกรณีซับซ้อน
```javascript
export const analyzeIntent = async (query, history = []) => {
    // 🚀 Fast Path: Rule-Based Detection
    const lowerQuery = query.toLowerCase();
    
    // Check for explicit tags
    if (lowerQuery.includes('@mantis') || lowerQuery.includes('@bug') || lowerQuery.includes('@error')) {
        return {
            search_text: true,
            search_images: false,
            search_mantis: true,
            extracted_query: query.replace(/@mantis|@bug|@error/gi, '').trim(),
            filters: {}
        };
    }
    
    // Check for simple keywords (no LLM needed)
    const imageKeywords = ['รูป', 'ภาพ', 'screenshot', 'ui', 'design', 'mockup'];
    const hasImageKeyword = imageKeywords.some(kw => lowerQuery.includes(kw));
    
    if (query.length < 10 && !hasImageKeyword) {
        // Short query, likely keyword search
        return {
            search_text: true,
            search_images: true,
            search_mantis: false,
            extracted_query: query,
            filters: {}
        };
    }
    
    // 🐌 Slow Path: LLM Analysis (only for complex queries)
    // ... existing LLM code ...
};
```
**ผลลัพธ์:** ลดเวลา 1-2 วินาที สำหรับ 60-70% ของ queries

---

### 🟡 **Phase 2: Medium Impact (Accuracy + Speed)** — 2-3 วัน

#### 2.1 ปรับ Reranking Strategy
**ปัญหา:** Reranking ใช้ LLM ทุกครั้ง แม้ว่า hybrid score จะดีอยู่แล้ว

**แก้ไข:** ใช้ Conditional Reranking
```javascript
export const rerank = async (query, docs, topK = 12) => {
    if (!docs || docs.length === 0) return [];
    
    // 🚀 Fast Path: ถ้า top results มี score สูง (>0.8) ไม่ต้อง rerank
    const topScore = Math.max(...docs.map(d => d.similarity || 0));
    if (topScore > 0.85 && docs.length <= topK) {
        console.log('[Rerank Skip] High confidence scores, using hybrid ranking');
        return docs.sort((a, b) => (b.similarity || 0) - (a.similarity || 0)).slice(0, topK);
    }
    
    // 🐌 Slow Path: LLM Reranking (only when needed)
    // ... existing LLM reranking code ...
};
```
**ผลลัพธ์:** ลดเวลา 2-3 วินาที สำหรับ 40-50% ของ queries

---

#### 2.2 ลด Context Size ที่ส่งให้ LLM
**ปัญหา:** ส่ง context ยาวเกินไป (20 chunks × 1600 chars = 32,000 chars) ทำให้ LLM ช้า

**แก้ไข:** ลดจำนวน chunks และความยาว
```javascript
// ใน ragConfig.js
context: {
    dbFetchLimit: 60,        // ลดจาก 80 → 60
    maxChunksToLLM: 12,      // ลดจาก 20 → 12
    maxCharsPerChunk: 1200,  // ลดจาก 1600 → 1200
}
```
**ผลลัพธ์:** ลดเวลา LLM generation 1-2 วินาที + เพิ่มความแม่นยำ (less noise)

---

#### 2.3 เพิ่ม HTTP Keep-Alive สำหรับ Ollama
**ปัญหา:** ทุกครั้งที่เรียก Ollama ต้องสร้าง TCP connection ใหม่ (100-300ms overhead)

**แก้ไข:**
```javascript
// ใน llmService.js
import { Agent } from 'http';

const ollamaAgent = new Agent({
    keepAlive: true,
    keepAliveMsecs: 30000,
    maxSockets: 10
});

export const callOllama = async (model, prompt, system = '', stream = false, options = {}) => {
    const host = process.env.OLLAMA_HOST || 'http://localhost:11434';
    // ... existing code ...
    
    const response = await fetch(`${host}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        agent: ollamaAgent,  // ✅ เพิ่มบรรทัดนี้
        body: JSON.stringify({...})
    });
    // ... rest of code ...
};
```
**ผลลัพธ์:** ลดเวลา 100-300ms ต่อ LLM call (×4-5 calls = 0.5-1.5s total)

---

### 🟢 **Phase 3: Advanced Optimization (Long-term)** — 3-5 วัน

#### 3.1 ใช้ Smaller/Faster Model สำหรับ Intent & Rerank
**ปัญหา:** ใช้ `llama3.2` (3B params) สำหรับงานง่าย ๆ

**แก้ไข:** ใช้ `qwen2.5:14b` สำหรับ intent analysis
```bash
# model รันบน server ซึ่งกำหนดไว้แล้วใน .env
```

```javascript
// ใน .env
OLLAMA_INTENT_MODEL=qwen2.5:0.5b  # เร็วกว่า llama3.2 ถึง 5-10 เท่า
OLLAMA_CHAT_MODEL=llama3.2:latest # ใช้ model ใหญ่สำหรับคำตอบหลัก
```
**ผลลัพธ์:** ลดเวลา Intent Analysis จาก 1-2s → 0.2-0.4s

---

#### 3.2 Database Query Optimization
**ปัญหา:** Vector search ช้าเพราะไม่มี index ที่เหมาะสม

**แก้ไข:**
```sql
-- เพิ่ม HNSW index สำหรับ vector search (เร็วกว่า IVFFlat)
CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding_hnsw 
ON document_chunks USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- เพิ่ม index สำหรับ project filtering
CREATE INDEX IF NOT EXISTS idx_documents_project_name 
ON documents (project_name);

-- เพิ่ม GIN index สำหรับ FTS
CREATE INDEX IF NOT EXISTS idx_document_chunks_fts_gin 
ON document_chunks USING GIN (fts);
```
**ผลลัพธ์:** ลดเวลา Vector Search จาก 1-1.5s → 0.3-0.5s

---

#### 3.3 ปิด Debug Logging ใน Production
**ปัญหา:** `console.log` ทุกขั้นตอนทำให้ช้า (10-50ms overhead)

**แก้ไข:**
```javascript
// ใน ragConfig.js
debug: {
    logRetrievalDetails: process.env.NODE_ENV === 'development',
    logPrompt: process.env.NODE_ENV === 'development',
}
```
**ผลลัพธ์:** ลดเวลา 50-100ms

---

## 📊 สรุปผลลัพธ์ที่คาดหวัง

| Phase | การปรับปรุง | เวลาที่ลดลง | Effort | Priority |
|-------|-------------|-------------|--------|----------|
| 1.1 | Parallel Reranking | -2 to -3s | 15 min | 🔴 สูงสุด |
| 1.2 | ปิด Image Reranking | -2 to -3s | 10 min | 🔴 สูงสุด |
| 1.3 | Cache Embedding | -0.3 to -0.5s | 1 hr | 🔴 สูง |
| 1.4 | Rule-Based Intent | -0.8 to -1.5s | 2 hr | 🔴 สูง |
| 2.1 | Conditional Rerank | -1 to -2s | 1 hr | 🟡 กลาง |
| 2.2 | ลด Context Size | -1 to -2s | 5 min | 🟡 กลาง |
| 2.3 | HTTP Keep-Alive | -0.5 to -1.5s | 30 min | 🟡 กลาง |
| 3.1 | Smaller Intent Model | -0.8 to -1.6s | 1 hr | 🟢 ต่ำ |
| 3.2 | DB Index | -0.7 to -1s | 2 hr | 🟢 ต่ำ |
| 3.3 | ปิด Debug Log | -0.05 to -0.1s | 5 min | 🟢 ต่ำ |
| **รวม** | **All Phases** | **-9 to -16s** | **~9 hr** | |

### 🎯 ผลลัพธ์สุดท้าย
- **ก่อน:** 10-17 วินาที
- **หลัง (Phase 1):** 4-7 วินาที (ลด 60%)
- **หลัง (Phase 1+2):** 2-4 วินาที (ลด 75-80%)
- **หลัง (All Phases):** 1-3 วินาที (ลด 85-90%)

---

## 🚀 ขั้นตอนการทำงาน (Step-by-Step)

### วันที่ 1: Phase 1 Quick Wins
```bash
# 1. Parallel Processing (15 min)
# แก้ไข chat.controller.js บรรทัด 97-100

# 2. ปิด Image Reranking (10 min)
# แก้ไข chat.controller.js บรรทัด 100

# 3. ติดตั้ง LRU Cache (1 hr)
npm install lru-cache
# แก้ไข retrievalService.js

# 4. Rule-Based Intent (2 hr)
# แก้ไข llmService.js - analyzeIntent function

# ทดสอบ
npm run dev
# ทดสอบด้วย query ต่าง ๆ และวัดเวลา
```

### วันที่ 2: Phase 2 Medium Impact
```bash
# 1. Conditional Rerank (1 hr)
# แก้ไข llmService.js - rerank function

# 2. ลด Context Size (5 min)
# แก้ไข ragConfig.js

# 3. HTTP Keep-Alive (30 min)
# แก้ไข llmService.js และ retrievalService.js

# ทดสอบ
npm run dev
```

### วันที่ 3-5: Phase 3 Advanced (Optional)
```bash
# 1. ติดตั้ง Lightweight Model
ollama pull qwen2.5:0.5b

# 2. Database Optimization
psql -U postgres -d redcore_ai
# รัน SQL commands

# 3. ปิด Debug Logging
# แก้ไข ragConfig.js

# ทดสอบ Performance
npm run dev
```

---

## 📈 วิธีวัดผล (Monitoring)

### เพิ่ม Performance Metrics
```javascript
// ใน chat.controller.js
export const sendMessage = async (req, res) => {
    const startTime = Date.now();
    const metrics = {};
    
    // ... existing code ...
    
    metrics.intentTime = Date.now() - startTime;
    const searchStart = Date.now();
    
    const { textResults, imageResults } = await RetrievalService.unifiedSearch(...);
    metrics.searchTime = Date.now() - searchStart;
    
    const rerankStart = Date.now();
    const [rerankedText, rerankedImages] = await Promise.all([...]);
    metrics.rerankTime = Date.now() - rerankStart;
    
    const llmStart = Date.now();
    let fullAnswer = await LLMService.streamResponse(...);
    metrics.llmTime = Date.now() - llmStart;
    
    metrics.totalTime = Date.now() - startTime;
    
    console.log('[Performance]', JSON.stringify(metrics));
    // ส่งไปยัง monitoring service (optional)
};
```

---

## ⚠️ ข้อควรระวัง

1. **Accuracy vs Speed Trade-off**
   - การปิด Reranking อาจลดความแม่นยำเล็กน้อย (5-10%)
   - แนะนำให้ทดสอบกับ test cases ที่มีอยู่

2. **Cache Invalidation**
   - ต้อง clear cache เมื่อมีการอัพเดตเอกสาร
   - ตั้งค่า TTL ให้เหมาะสม

3. **Resource Usage**
   - Keep-Alive จะใช้ memory มากขึ้นเล็กน้อย
   - ตั้งค่า `maxSockets` ให้เหมาะสมกับ server

---

## ✅ Checklist

- [ ] Phase 1.1: Parallel Reranking
- [ ] Phase 1.2: ปิด Image Reranking
- [ ] Phase 1.3: Cache Embedding
- [ ] Phase 1.4: Rule-Based Intent
- [ ] Phase 2.1: Conditional Rerank
- [ ] Phase 2.2: ลด Context Size
- [ ] Phase 2.3: HTTP Keep-Alive
- [ ] Phase 3.1: Smaller Intent Model
- [ ] Phase 3.2: Database Index
- [ ] Phase 3.3: ปิด Debug Logging
- [ ] ทดสอบ Performance
- [ ] ทดสอบ Accuracy
- [ ] Deploy to Production

---

**หมายเหตุ:** แผนนี้ออกแบบให้ทำได้ทีละ Phase โดยไม่กระทบระบบที่ทำงานอยู่ แต่ละ Phase สามารถ rollback ได้หากพบปัญหา