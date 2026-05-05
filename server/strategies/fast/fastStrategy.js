import { BaseStrategy } from '../baseStrategy.js';
import * as LLMService from '../../services/llmService.js';
import * as RetrievalService from '../../services/retrievalService.js';
import * as MemoryService from '../../services/memoryService.js';
import RagConfig from '../../config/ragConfig.js';
import StrategyConfig from '../../config/strategies.config.js';
import * as SystemPrompts from '../../config/prompts/systemPrompts.js';

export class FastStrategy extends BaseStrategy {
    async execute(query, intent, sessionId, user, res, history) {
        this.log('info', `Executing Fast Search for: "${query}"`);

        try {
            // 1. Send Thinking State
            const thoughts = [
                { id: '1', icon: 'zap', description: `Fast Search: "${query}"`, status: 'active' }
            ];
            this.sendThoughts(res, thoughts);

            // 2. Retrieval using Config
            const { searchLimit, rerankLimit, finalChunkLimit } = StrategyConfig.fast;

            // Memory Lookup
            const memoryContextResult = MemoryService.getMemoriesForContext(sessionId, query);

            // Perform Search
            const searchRes = await RetrievalService.unifiedSearch(query, intent.filters || {}, intent, searchLimit);
            let textResults = searchRes.textResults;
            let imageResults = searchRes.imageResults;

            thoughts[0].status = 'completed';
            thoughts.push({ id: '2', icon: 'database', description: `Found ${textResults.length} docs`, status: 'completed' });
            this.sendThoughts(res, thoughts);

            // 3. Lightweight Rerank
            const rerankedText = textResults.slice(0, rerankLimit);
            const filteredImages = imageResults.slice(0, 5);

            // 4. Smart Filtering & Context Construction
            const filterRes = RetrievalService.processResponseAndSources(rerankedText);
            let baseDocs = filterRes.filteredDocs.slice(0, finalChunkLimit * 2);

            // 🛡️ No-Signal Gate: prevent hallucination on garbage/off-topic queries
            // If ALL results are pure vector (no FTS keyword match) AND top score is low → treat as empty
            const minConfidence = RagConfig.search.thresholds?.minConfidenceScore || 0.48;
            const hasKeywordSignal = baseDocs.some(d => d.source === 'hybrid' || (d.raw_keyword || 0) > 0);
            if (baseDocs.length > 0 && !hasKeywordSignal && (baseDocs[0]?.similarity || 0) < minConfidence) {
                this.log('warn', `[FastStrategy] No-signal gate triggered (topScore=${(baseDocs[0]?.similarity * 100).toFixed(1)}%, no keyword match). Returning empty context.`);
                baseDocs = [];
            }

            // LlamaIndex Refinement Phase
            const { processWithLlamaIndex } = await import('../../services/llamaIndexService.js');
            const llamaRes = await processWithLlamaIndex(query, baseDocs, finalChunkLimit);
            const finalDocs = llamaRes.refinedDocs;
            const contextText = llamaRes.contextText;

            // Update Thoughts
            thoughts[1].description = `Available: ${textResults.length} -> Used: ${finalDocs.length}`;
            thoughts.push({ id: '3', icon: 'filter', description: `LlamaIndex Refined relevance`, status: 'completed' });
            this.sendThoughts(res, thoughts);

            // Deduplication
            const uniqueDocs = [];
            const seenIds = new Set();
            finalDocs.forEach(doc => {
                if (doc && !seenIds.has(doc.id)) {
                    seenIds.add(doc.id);
                    uniqueDocs.push(doc);
                }
            });

            // 5. Build Images
            const formattedImages = filteredImages.filter(img => img.similarity > 0.3).map((img, idx) => ({
                id: img.id.toString(),
                refIndex: idx + 1,
                url: `/api/chat/images/${img.id}`,
                description: img.description || 'Image'
            }));

            if (formattedImages.length > 0) {
                res.write(`data: ${JSON.stringify({ type: 'related_images', images: formattedImages })} \n\n`);
            }

            // Send Citations
            const citations = uniqueDocs.map((doc, idx) => ({
                id: idx.toString(),
                title: doc.document_name,
                url: '#',
                score: Math.round(doc.similarity * 100)
            }));
            res.write(`data: ${JSON.stringify({ type: 'citations', citations })} \n\n`);

            // 6. Memory & System Prompt
            let effortInstruction = '';
            if (intent.reasoning_effort === 'high') {
                thoughts.push({ id: 'effort', icon: 'brain', description: 'Reasoning Effort: High (Strict Deep Analysis)', status: 'completed' });
                effortInstruction = '\n\nระดับการคิด: high\n- แม้ใช้การคิดระดับสูง: ต้องใช้เฉพาะ facts ที่เอกสารระบุ\n- ห้ามเชื่อมโยงช่องว่างด้วยการคาดเดา\n- หากการคิดต้องใช้ข้อมูลที่ไม่มี: ให้หยุด และระบุว่าเอกสารไม่เพียงพอ';
            } else {
                thoughts.push({ id: 'effort', icon: 'zap', description: 'Reasoning Effort: Medium (Strict Summary)', status: 'completed' });
                effortInstruction = '\n\nระดับการคิด: medium\n- อนุญาต: เรียบเรียง, สรุป, แจกแจงรายการ\n- ห้าม: วิเคราะห์เชิงเหตุผล, เชื่อมโยงข้อมูลข้ามส่วน';
            }
            this.sendThoughts(res, thoughts);

            const imageCtx = formattedImages.length > 0
                ? `\n\n### 🖼️ Available Visuals:\n${formattedImages.map(img => `- [Figure ${img.refIndex}] ${img.description}`).join('\n')}`
                : '';

            const mem = await memoryContextResult;
            const systemPrompt = SystemPrompts.RAG_SYSTEM_PROMPT_TEMPLATE(
                (contextText || "NO DOCUMENTS FOUND.") + imageCtx + '\n' + (mem || ''),
                intent.roleHint + effortInstruction
            );

            // 7. LLM Stream
            const fullContent = await LLMService.streamResponse(
                RagConfig.llm.model,
                history,
                systemPrompt,
                { temperature: RagConfig.llm.temperature },
                res,
                thoughts
            );

            this.endStream(res);

            return {
                content: fullContent,
                thoughts: thoughts,
                citations: { sources: citations, related_images: formattedImages }
            };
        } catch (error) {
            this.handleError(res, error);
        }
    }
}
