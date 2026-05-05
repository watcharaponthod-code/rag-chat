# 🚀 สรุปแผนปรับปรุงประสิทธิภาพระบบ RAG

## 📊 ภาพรวม

### ⏱️ สถานะปัจจุบัน
```
┌─────────────────────────────────────────────────────────────────────┐
│ User Query                                                          │
│   ↓                                                                 │
│ [1] Intent Analysis ████████████ (1-2s)                            │
│   ↓                                                                 │
│ [2] Embedding ████ (0.5s)                                          │
│   ↓                                                                 │
│ [3] Hybrid Search ██████████ (1-1.5s)                              │
│   ↓                                                                 │
│ [4] Rerank Text ████████████████ (2-3s)                            │
│   ↓                                                                 │
│ [5] Rerank Images ████████████████ (2-3s)                          │
│   ↓                                                                 │
│ [6] LLM Response ████████████████████████ (3-5s)                   │
│                                                                     │
│ ⏱️ รวม: 10-17 วินาที                                               │
└─────────────────────────────────────────────────────────────────────┘
```

### 🎯 เป้าหมาย
```
┌─────────────────────────────────────────────────────────────────────┐
│ User Query                                                          │
│   ↓                                                                 │
│ [Optimized Pipeline] ████████ (2-4s)                               │
│   ↓                                                                 │
│ Response                                                            │
│                                                                     │
│ ⏱️ รวม: 2-4 วินาที (ลดลง 70-80%)                                   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🎯 แผนการทำงาน 3 Phases

### 🔴 Phase 1: Quick Wins (1-2 วัน)
**เป้าหมาย:** ลดเวลาจาก 10-17s → 4-7s (ลด 60%)

| # | การปรับปรุง | เวลาที่ลด | Effort | ไฟล์ที่แก้ |
|---|-------------|-----------|--------|------------|
| 1.1 | **Parallel Reranking** | -2 to -3s | 15 min | `chat.controller.js` L97-100 |
| 1.2 | **ปิด Image Reranking** | -2 to -3s | 10 min | `chat.controller.js` L100 |
| 1.3 | **Cache Embedding** | -0.3 to -0.5s | 1 hr | `retrievalService.js` L8-29 |
| 1.4 | **Rule-Based Intent** | -0.8 to -1.5s | 2 hr | `llmService.js` L72-128 |

**ผลลัพธ์:** ลดเวลา **5-8 วินาที** (60% improvement)

---

### 🟡 Phase 2: Medium Impact (2-3 วัน)
**เป้าหมาย:** ลดเวลาจาก 4-7s → 2-4s (ลด 75-80%)

| # | การปรับปรุง | เวลาที่ลด | Effort | ไฟล์ที่แก้ |
|---|-------------|-----------|--------|------------|
| 2.1 | **Conditional Rerank** | -1 to -2s | 1 hr | `llmService.js` L132-190 |
| 2.2 | **ลด Context Size** | -1 to -2s | 5 min | `ragConfig.js` L26-41 |
| 2.3 | **HTTP Keep-Alive** | -0.5 to -1.5s | 30 min | `llmService.js` L4-32 |

**ผลลัพธ์:** ลดเวลาอีก **2.5-5.5 วินาที** (75-80% total improvement)

---

### 🟢 Phase 3: Advanced (3-5 วัน)
**เป้าหมาย:** ลดเวลาจาก 2-4s → 1-3s (ลด 85-90%)

| # | การปรับปรุง | เวลาที่ลด | Effort | ไฟล์ที่แก้ |
|---|-------------|-----------|--------|------------|
| 3.1 | **Smaller Intent Model** | -0.8 to -1.6s | 1 hr | `.env` + `llmService.js` |
| 3.2 | **Database Index** | -0.7 to -1s | 2 hr | SQL migrations |
| 3.3 | **ปิด Debug Logging** | -0.05 to -0.1s | 5 min | `ragConfig.js` L49-53 |

**ผลลัพธ์:** ลดเวลาอีก **1.5-2.7 วินาที** (85-90% total improvement)

---

## 📈 ผลลัพธ์รวม

```
┌──────────────┬─────────────┬──────────────┬─────────────────┐
│ Phase        │ เวลาเฉลี่ย  │ ลดลง         │ Improvement     │
├──────────────┼─────────────┼──────────────┼─────────────────┤
│ ปัจจุบัน     │ 13.5s       │ -            │ Baseline        │
│ Phase 1      │ 5.5s        │ -8s          │ 60% ⚡          │
│ Phase 1+2    │ 3s          │ -10.5s       │ 78% ⚡⚡        │
│ All Phases   │ 2s          │ -11.5s       │ 85% ⚡⚡⚡      │
└──────────────┴─────────────┴──────────────┴─────────────────┘
```

---

## 🔥 Top 5 Bottlenecks (เรียงตามผลกระทบ)

### 1. 🥇 **Sequential Reranking** (Impact: -4 to -6s)
```javascript
// ❌ ปัจจุบัน (ช้า)
const rerankedText = await LLMService.rerank(...);    // รอ 2-3s
const rerankedImages = await LLMService.rerank(...);  // รอ 2-3s อีก

// ✅ แก้ไข (เร็ว)
const [rerankedText, rerankedImages] = await Promise.all([
    LLMService.rerank(...),
    imageResults.sort((a, b) => b.similarity - a.similarity).slice(0, 5)
]);
```

### 2. 🥈 **Intent Analysis ทุกครั้ง** (Impact: -0.8 to -1.5s)
```javascript
// ✅ ใช้ Rule-Based Detection ก่อน
if (query.includes('@mantis')) {
    return { search_mantis: true, ... };  // ไม่ต้องเรียก LLM
}
```

### 3. 🥉 **Embedding ไม่มี Cache** (Impact: -0.3 to -0.5s)
```javascript
// ✅ เพิ่ม LRU Cache
const embeddingCache = new LRUCache({ max: 500, ttl: 86400000 });
```

### 4. **Reranking ทุกครั้ง** (Impact: -1 to -2s)
```javascript
// ✅ Skip reranking ถ้า score สูง
if (topScore > 0.85) {
    return docs.sort(...).slice(0, topK);  // ไม่ต้องเรียก LLM
}
```

### 5. **Context ยาวเกินไป** (Impact: -1 to -2s)
```javascript
// ✅ ลด context size
maxChunksToLLM: 12,      // จาก 20
maxCharsPerChunk: 1200,  // จาก 1600
```

---

## 🛠️ ขั้นตอนการทำงาน (Quick Start)

### วันที่ 1: Phase 1.1 + 1.2 (25 นาที)
```bash
# 1. เปิดไฟล์
code c:\Sycapt\redcore-ai-workspace\server\controllers\chat.controller.js

# 2. แก้บรรทัด 97-100 เป็น:
const [rerankedText, rerankedImages] = await Promise.all([
    LLMService.rerank(rewrittenQuery, textResults, RagConfig.context.maxChunksToLLM),
    imageResults.sort((a, b) => (b.similarity || 0) - (a.similarity || 0)).slice(0, 5)
]);

# 3. ทดสอบ
npm run dev
# ลองถาม query และดูเวลาที่ลดลง
```

### วันที่ 1: Phase 1.3 (1 ชั่วโมง)
```bash
# 1. ติดตั้ง package
npm install lru-cache

# 2. แก้ไฟล์ retrievalService.js
# (ดูรายละเอียดใน optimize-performance.md)

# 3. ทดสอบ
npm run dev
```

### วันที่ 1-2: Phase 1.4 (2 ชั่วโมง)
```bash
# 1. แก้ไฟล์ llmService.js - analyzeIntent function
# (ดูรายละเอียดใน optimize-performance.md)

# 2. ทดสอบ
npm run dev
```

---

## 📊 วิธีวัดผล

### เพิ่ม Performance Logging
```javascript
// ใน chat.controller.js
const startTime = Date.now();

// ... existing code ...

console.log(`[Performance] Total: ${Date.now() - startTime}ms`);
```

### ทดสอบกับ Test Cases
```javascript
// สร้างไฟล์ test_performance.js
const queries = [
    "VHQ คืออะไร",
    "@mantis bug login",
    "รูป UI dashboard",
    "ขั้นตอนการติดตั้ง"
];

for (const query of queries) {
    const start = Date.now();
    // ... send query ...
    console.log(`${query}: ${Date.now() - start}ms`);
}
```

---

## ⚠️ ข้อควรระวัง

### 1. Accuracy vs Speed Trade-off
- ✅ **Phase 1.1** (Parallel): ไม่กระทบความแม่นยำ
- ⚠️ **Phase 1.2** (ปิด Image Rerank): อาจลดความแม่นยำ 5-10%
- ⚠️ **Phase 2.1** (Conditional Rerank): อาจพลาดเอกสารที่สำคัญ 3-5%

### 2. Testing Required
- ทดสอบกับ test cases ที่มีอยู่
- เปรียบเทียบผลลัพธ์ก่อน-หลัง
- ตรวจสอบว่า accuracy ไม่ลดลงเกิน 10%

### 3. Rollback Plan
- แต่ละ Phase สามารถ rollback ได้อิสระ
- เก็บ backup ของไฟล์ก่อนแก้
- ใช้ Git commit แยกต่าง Phase

---

## ✅ Checklist

### Phase 1 (วันที่ 1-2)
- [ ] 1.1 Parallel Reranking (15 min)
- [ ] 1.2 ปิด Image Reranking (10 min)
- [ ] 1.3 Cache Embedding (1 hr)
- [ ] 1.4 Rule-Based Intent (2 hr)
- [ ] ทดสอบ Performance
- [ ] ทดสอบ Accuracy

### Phase 2 (วันที่ 3-4)
- [ ] 2.1 Conditional Rerank (1 hr)
- [ ] 2.2 ลด Context Size (5 min)
- [ ] 2.3 HTTP Keep-Alive (30 min)
- [ ] ทดสอบ Performance
- [ ] ทดสอบ Accuracy

### Phase 3 (วันที่ 5-7)
- [ ] 3.1 Smaller Intent Model (1 hr)
- [ ] 3.2 Database Index (2 hr)
- [ ] 3.3 ปิด Debug Logging (5 min)
- [ ] ทดสอบ Performance Final
- [ ] ทดสอบ Accuracy Final
- [ ] Deploy to Production

---

## 📚 เอกสารเพิ่มเติม

- **แผนละเอียด:** `.agent/workflows/optimize-performance.md`
- **โค้ดตัวอย่าง:** ดูในแผนละเอียด
- **Database Schema:** `server/config/db.js`

---

**สร้างเมื่อ:** 2026-01-16  
**ผู้สร้าง:** Antigravity AI  
**สถานะ:** Ready to Implement 🚀
