import { BaseStrategy } from './baseStrategy.js';
import * as LLMService from '../services/llmService.js';
import * as RetrievalService from '../services/retrievalService.js';
import * as MemoryService from '../services/memoryService.js';
import RagConfig from '../config/ragConfig.js';
import StrategyConfig from '../config/strategies.config.js';
import * as SystemPrompts from '../config/prompts/systemPrompts.js';

export class DeepStrategy extends BaseStrategy {
    async execute(query, intent, sessionId, user, res, history) {
        this.log('info', `Executing Deep Research for: "${query}"`);

        try {
            // 1. Initial Thoughts
            const thoughts = [
                { id: '1', icon: 'brain', description: `Deep Analysis: "${query}"`, status: 'active' }
            ];
            this.sendThoughts(res, thoughts);

            // 2. Retrieval (Docs + Memory)
            const { searchLimit, rerankLimit, finalChunkLimit, forceRerank, systemPromptExtra } = StrategyConfig.deep;

            // Memory Lookup
            const memoryContext = await MemoryService.getMemoriesForContext(sessionId, query);
            if (memoryContext) {
                thoughts.push({ id: 'mem', icon: 'history', description: 'Found relevant past memories', status: 'completed' });
                this.sendThoughts(res, thoughts);
            }

            // Perform Retrieval
            const searchRes = await RetrievalService.unifiedSearch(query, intent.filters || {}, intent, searchLimit);
            let textResults = searchRes.textResults;
            let imageResults = searchRes.imageResults;

            thoughts[0].status = 'completed';
            thoughts.push({ id: '2', icon: 'search', description: `Retrieved ${textResults.length} docs (Deep Mode)`, status: 'active' });
            this.sendThoughts(res, thoughts);

            // 3. Heavy Reranking
            let rerankedText = textResults;
            let rerankedImages = imageResults;

            if (forceRerank && (textResults.length > 0 || imageResults.length > 0)) {
                this.log('info', '⚖️ Running Cross-Encoder Rerank...');
                const [rankedDocs, rankedImgs] = await Promise.all([
                    LLMService.rerank(query, textResults, rerankLimit, rerankLimit), // Top 20
                    LLMService.rerank(query, imageResults, 5, 5)
                ]);
                rerankedText = rankedDocs;
                rerankedImages = rankedImgs;
            }

            thoughts[1].status = 'completed';
            thoughts.push({ id: '3', icon: 'list-check', description: `Reranked to top ${rerankedText.length} relevant items`, status: 'completed' });
            this.sendThoughts(res, thoughts);

            // 4. Filtering & Context
            const filterRes = RetrievalService.processResponseAndSources(rerankedText);
            const baseDocs = filterRes.filteredDocs.slice(0, finalChunkLimit * 2);

            // LlamaIndex Refinement Phase
            const { processWithLlamaIndex } = await import('../services/llamaIndexService.js');
            const llamaRes = await processWithLlamaIndex(query, baseDocs, finalChunkLimit);
            const finalDocs = llamaRes.refinedDocs;

            // Update Thoughts
            thoughts[2].description = `Reranked: ${rerankedText.length} -> Used: ${finalDocs.length}`;
            thoughts.push({ id: '5', icon: 'filter', description: `LlamaIndex Refined relevance`, status: 'completed' });
            this.sendThoughts(res, thoughts);

            // Deduplication (ID-based)
            const uniqueDocs = [];
            const seenIds = new Set();
            finalDocs.forEach(doc => {
                if (doc && !seenIds.has(doc.id)) {
                    seenIds.add(doc.id);
                    uniqueDocs.push(doc);
                }
            });

            // Rebuild context using XML formatting optimized for Deep mode
            const contextText = uniqueDocs.map(doc => {
                const limit = 2000; // Increased context limit for deep mode
                const projectName = doc.project_name || doc.metadata?.project_name || 'General';
                return `<document index="${doc.id}" source="${doc.document_name}" project="${projectName}">
${doc.content.substring(0, limit)}
</document>`;
            }).join('\n\n') || "NO DOCUMENTS FOUND.";

            // Images (Optimized threshold: 0.4 instead of 0.6 to avoid losing reranked items)
            const formattedImages = rerankedImages.filter(img => img.similarity > 0.4).map((img, idx) => ({
                id: img.id.toString(),
                refIndex: idx + 1,
                url: `/api/chat/images/${img.id}`,
                description: img.description || 'Image'
            }));

            if (formattedImages.length > 0) {
                res.write(`data: ${JSON.stringify({ type: 'related_images', images: formattedImages })} \n\n`);
            }

            // Citations
            const citations = uniqueDocs.map((doc, idx) => ({
                id: idx.toString(),
                title: doc.document_name,
                url: '#',
                score: Math.round(doc.similarity * 100)
            }));
            res.write(`data: ${JSON.stringify({ type: 'citations', citations })} \n\n`);

            // 5. System Prompt
            const imageCtx = formattedImages.length > 0
                ? `\n\n### 🖼️ Available Visuals:\n${formattedImages.map(img => `- [Figure ${img.refIndex}] ${img.description}`).join('\n')}`
                : '';

            let effortInstruction = '';
            if (intent.reasoning_effort === 'high') {
                effortInstruction = '\n\nระดับการคิด: high\n- แม้ใช้การคิดระดับสูง: ต้องใช้เฉพาะ facts ที่เอกสารระบุ\n- ห้ามเชื่อมโยงช่องว่างด้วยการคาดเดา\n- หากการคิดต้องใช้ข้อมูลที่ไม่มี: ให้หยุด และระบุว่าเอกสารไม่เพียงพอ';
            } else {
                effortInstruction = '\n\nระดับการคิด: medium\n- อนุญาต: เรียบเรียง, สรุป, แจกแจงรายการ\n- ห้าม: วิเคราะห์เชิงเหตุผล, เชื่อมโยงข้อมูลข้ามส่วน';
            }

            let systemPrompt = SystemPrompts.RAG_SYSTEM_PROMPT_TEMPLATE(
                contextText + imageCtx + '\n' + memoryContext,
                (intent.roleHint || '') + effortInstruction
            );

            // Add Specific Instruction via Config
            if (systemPromptExtra) {
                systemPrompt += `\n\n${systemPromptExtra}`;
            }

            thoughts.push({ id: '4', icon: 'pen-tool', description: 'Synthesizing Detailed Answer...', status: 'active' });
            this.sendThoughts(res, thoughts);

            // 6. LLM Stream
            const fullContent = await LLMService.streamResponse(
                RagConfig.llm.model,
                history,
                systemPrompt,
                { temperature: RagConfig.llm.temperature, num_ctx: RagConfig.llm.numCtx },
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
            throw error; // Rethrow to let Controller know execution failed
        }
    }
}
