/**
 * 🚀 Phase 1.1 + 1.2: Parallel Processing & Disable Image Reranking
 * 
 * แก้ไขในไฟล์: server/controllers/chat.controller.js
 * บรรทัด: 95-100
 * 
 * ผลลัพธ์: ลดเวลา 4-6 วินาที
 */

// ❌ โค้ดเดิม (ช้า - Sequential)
/*
const rerankedText = await LLMService.rerank(rewrittenQuery, textResults, RagConfig.context.maxChunksToLLM);
const rerankedImages = await LLMService.rerank(rewrittenQuery, imageResults, 5);
*/

// ✅ โค้ดใหม่ (เร็ว - Parallel + Simple Sorting)
const rerankStart = Date.now();

const [rerankedText, rerankedImages] = await Promise.all([
    // Text: ยังใช้ LLM Reranking (สำคัญสำหรับความแม่นยำ)
    LLMService.rerank(rewrittenQuery, textResults, RagConfig.context.maxChunksToLLM),

    // Images: ใช้ Simple Sorting แทน LLM (เร็วกว่า 2-3 วินาที)
    Promise.resolve(
        imageResults
            .sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
            .slice(0, 5)
    )
]);

console.log(`[Performance] Rerank Time: ${Date.now() - rerankStart}ms`);

// ส่วนที่เหลือของโค้ดไม่ต้องแก้ไข
