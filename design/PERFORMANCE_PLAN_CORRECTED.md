# 🚀 แผนการปรับปรุงประสิทธิภาพ (ฉบับปรับแก้ตามคอนเซ็ปต์ที่ถูกต้อง)

## 📋 คอนเซ็ปต์ที่ถูกต้อง

### การรวมข้อมูล (Data Fusion)

```
DEFAULT MODE (Query ธรรมดา):
┌─────────────────────────────────────┐
│ Text Search    ──┐                  │
│                  ├──→ Combined      │
│ Image Search  ───┘     Context      │
└─────────────────────────────────────┘

MANTIS MODE (Query + @mantis/@bug/@error):
┌─────────────────────────────────────┐
│ Text Search    ──┐                  │
│                  │                  │
│ Image Search  ───┼──→ Combined      │
│                  │     Context      │
│ Mantis Search ───┘                  │
└─────────────────────────────────────┘
```

**กฎสำคัญ:**
- ✅ **Text + Images** = รวมกันเสมอ (ทุก query)
- ✅ **Mantis** = รวมเฉพาะเมื่อมี `@mantis`, `@bug`, `@error`

---

## 🎯 แผนการปรับปรุงที่ถูกต้อง

### 🔴 Phase 1: Quick Wins (1-2 วัน)

| # | การปรับปรุง | เวลาที่ลด | Effort | หมายเหตุ |
|---|-------------|-----------|--------|----------|
| 1.1 | **Parallel Reranking** | -2 to -3s | 15 min | ✅ รัน Text + Images พร้อมกัน |
| 1.2 | **Cache Embedding** | -0.3 to -0.5s | 1 hr | ✅ ลด overhead ของ embedding |
| 1.3 | **Rule-Based Intent** | -0.8 to -1.5s | 2 hr | ✅ ลด LLM calls |
| 1.4 | **ลด Context Size** | -1 to -2s | 5 min | ✅ ลด token ที่ส่งให้ LLM |

**รวม Phase 1:** ลดเวลา **4-7 วินาที** (จาก 10-17s → 6-10s)

---

### 🟡 Phase 2: Medium Impact (2-3 วัน)

| # | การปรับปรุง | เวลาที่ลด | Effort | หมายเหตุ |
|---|-------------|-----------|--------|----------|
| 2.1 | **Conditional Rerank** | -1 to -2s | 1 hr | ⚠️ Skip rerank ถ้า score สูง |
| 2.2 | **HTTP Keep-Alive** | -0.5 to -1.5s | 30 min | ✅ ลด TCP overhead |
| 2.3 | **Optimize Mantis Search** | -0.3 to -0.5s | 1 hr | ✅ เฉพาะเมื่อมี @command |

**รวม Phase 2:** ลดเวลาอีก **1.8-4 วินาที** (จาก 6-10s → 4-6s)

---

### 🟢 Phase 3: Advanced (3-5 วัน)

| # | การปรับปรุง | เวลาที่ลด | Effort | หมายเหตุ |
|---|-------------|-----------|--------|----------|
| 3.1 | **Smaller Intent Model** | -0.8 to -1.6s | 1 hr | ✅ ใช้ qwen2.5:0.5b |
| 3.2 | **Database Index** | -0.7 to -1s | 2 hr | ✅ HNSW index |
| 3.3 | **ปิด Debug Logging** | -0.05 to -0.1s | 5 min | ✅ Production mode |

**รวม Phase 3:** ลดเวลาอีก **1.5-2.7 วินาที** (จาก 4-6s → 2-3s)

---

## 🔥 Top 5 Bottlenecks (ปรับแก้ใหม่)

### 1. 🥇 Sequential Reranking (Impact: -2 to -3s)
```javascript
// ❌ ปัจจุบัน (ช้า)
const rerankedText = await LLMService.rerank(...);    // รอ 2-3s
const rerankedImages = await LLMService.rerank(...);  // รอ 2-3s อีก

// ✅ แก้ไข (เร็ว) - รัน Parallel
const [rerankedText, rerankedImages] = await Promise.all([
    LLMService.rerank(rewrittenQuery, textResults, RagConfig.context.maxChunksToLLM),
    LLMService.rerank(rewrittenQuery, imageResults, 5)
]);
```
**หมายเหตุ:** ⚠️ **ไม่ปิด Image Reranking** เพราะรูปภาพเป็นส่วนสำคัญของ context

---

### 2. 🥈 Intent Analysis ทุกครั้ง (Impact: -0.8 to -1.5s)
```javascript
// ✅ ใช้ Rule-Based Detection ก่อน
export const analyzeIntent = async (query, history = []) => {
    const lowerQuery = query.toLowerCase();
    
    // Fast Path: Check for @commands
    if (lowerQuery.includes('@mantis') || lowerQuery.includes('@bug')) {
        return {
            search_text: true,
            search_images: true,
            search_mantis: true,  // ✅ เปิดเฉพาะเมื่อมี @command
            extracted_query: query.replace(/@mantis|@bug|@error/gi, '').trim()
        };
    }
    
    // Fast Path: Short queries
    if (query.length < 10) {
        return {
            search_text: true,
            search_images: true,
            search_mantis: false,  // ✅ ปิดสำหรับ query ธรรมดา
            extracted_query: query
        };
    }
    
    // Slow Path: LLM Analysis (only for complex queries)
    // ... existing LLM code ...
};
```

---

### 3. 🥉 Embedding ไม่มี Cache (Impact: -0.3 to -0.5s)
```javascript
// ✅ เพิ่ม LRU Cache
import { LRUCache } from 'lru-cache';

const embeddingCache = new LRUCache({ max: 500, ttl: 86400000 });

const getEmbedding = async (text) => {
    const cacheKey = text.substring(0, 200).trim().toLowerCase();
    if (embeddingCache.has(cacheKey)) {
        return embeddingCache.get(cacheKey);
    }
    // ... create embedding ...
    embeddingCache.set(cacheKey, embedding);
    return embedding;
};
```

---

### 4. Context ยาวเกินไป (Impact: -1 to -2s)
```javascript
// ✅ ลด context size ใน ragConfig.js
context: {
    dbFetchLimit: 60,        // ลดจาก 80
    maxChunksToLLM: 12,      // ลดจาก 20
    maxCharsPerChunk: 1200,  // ลดจาก 1600
}
```

---

### 5. HTTP Connection Overhead (Impact: -0.5 to -1.5s)
```javascript
// ✅ เพิ่ม Keep-Alive
import { Agent } from 'http';

const ollamaAgent = new Agent({
    keepAlive: true,
    keepAliveMsecs: 30000,
    maxSockets: 10
});

// ใช้ใน fetch calls
fetch(url, { agent: ollamaAgent, ... });
```

---

## 🚀 Quick Start Guide

### ขั้นตอนที่ 1: Phase 1.1 - Parallel Reranking (15 นาที)

```javascript
// ไฟล์: server/controllers/chat.controller.js
// บรรทัด: 95-100

// ❌ เดิม
const rerankedText = await LLMService.rerank(rewrittenQuery, textResults, RagConfig.context.maxChunksToLLM);
const rerankedImages = await LLMService.rerank(rewrittenQuery, imageResults, 5);

// ✅ ใหม่
const [rerankedText, rerankedImages] = await Promise.all([
    LLMService.rerank(rewrittenQuery, textResults, RagConfig.context.maxChunksToLLM),
    LLMService.rerank(rewrittenQuery, imageResults, 5)
]);
```

**ผลลัพธ์:** ลดเวลา **2-3 วินาที** ทันที! 🎉

---

### ขั้นตอนที่ 2: Phase 1.2 - Cache Embedding (1 ชั่วโมง)

```bash
# 1. ติดตั้ง package
npm install lru-cache

# 2. แก้ไข retrievalService.js
# (ดูตัวอย่างใน .optimization-examples/phase1-embedding-cache.js)
```

---

### ขั้นตอนที่ 3: Phase 1.3 - Rule-Based Intent (2 ชั่วโมง)

```bash
# แก้ไข llmService.js - analyzeIntent function
# (ดูตัวอย่างใน .optimization-examples/phase1-rule-based-intent.js)
```

---

### ขั้นตอนที่ 4: Phase 1.4 - ลด Context Size (5 นาที)

```javascript
// ไฟล์: server/config/ragConfig.js

context: {
    dbFetchLimit: 60,        // ลดจาก 80
    maxChunksToLLM: 12,      // ลดจาก 20
    maxCharsPerChunk: 1200,  // ลดจาก 1600
}
```

---

## 📊 ผลลัพธ์ที่คาดหวัง

```
┌──────────────┬─────────────┬──────────────┬─────────────────┐
│ Phase        │ เวลาเฉลี่ย  │ ลดลง         │ Improvement     │
├──────────────┼─────────────┼──────────────┼─────────────────┤
│ ปัจจุบัน     │ 13.5s       │ -            │ Baseline        │
│ Phase 1      │ 8s          │ -5.5s        │ 40% ⚡          │
│ Phase 1+2    │ 5s          │ -8.5s        │ 63% ⚡⚡        │
│ All Phases   │ 3s          │ -10.5s       │ 78% ⚡⚡⚡      │
└──────────────┴─────────────┴──────────────┴─────────────────┘
```

---

## ⚠️ สิ่งที่ต้องระวัง

### 1. ไม่ปิด Image Reranking
- ❌ **ห้าม** ปิด Image Reranking
- ✅ **ควร** ทำ Parallel แทน
- **เหตุผล:** รูปภาพเป็นส่วนสำคัญของ context ที่ต้องรวมกับ Text เสมอ

### 2. Mantis Search
- ✅ Mantis รวมเฉพาะเมื่อมี `@mantis`, `@bug`, `@error`
- ✅ ตรวจสอบว่า `unifiedSearch` ทำงาน Parallel อยู่แล้ว

### 3. Accuracy Testing
- ทดสอบกับ test cases ที่มีอยู่
- ตรวจสอบว่า accuracy ไม่ลดลงเกิน 5-10%

---

## ✅ Checklist (ปรับแก้ใหม่)

### Phase 1 (วันที่ 1-2)
- [ ] 1.1 Parallel Reranking (15 min) - ลด 2-3s
- [ ] 1.2 Cache Embedding (1 hr) - ลด 0.3-0.5s
- [ ] 1.3 Rule-Based Intent (2 hr) - ลด 0.8-1.5s
- [ ] 1.4 ลด Context Size (5 min) - ลด 1-2s
- [ ] ทดสอบ Performance
- [ ] ทดสอบ Accuracy

### Phase 2 (วันที่ 3-4)
- [ ] 2.1 Conditional Rerank (1 hr) - ลด 1-2s
- [ ] 2.2 HTTP Keep-Alive (30 min) - ลด 0.5-1.5s
- [ ] 2.3 Optimize Mantis Search (1 hr) - ลด 0.3-0.5s
- [ ] ทดสอบ Performance
- [ ] ทดสอบ Accuracy

### Phase 3 (วันที่ 5-7)
- [ ] 3.1 Smaller Intent Model (1 hr)
- [ ] 3.2 Database Index (2 hr)
- [ ] 3.3 ปิด Debug Logging (5 min)
- [ ] ทดสอบ Performance Final
- [ ] Deploy to Production

---

**สร้างเมื่อ:** 2026-01-16 (ปรับแก้ตามคอนเซ็ปต์ที่ถูกต้อง)  
**ผู้สร้าง:** Antigravity AI  
**สถานะ:** Ready to Implement 🚀
