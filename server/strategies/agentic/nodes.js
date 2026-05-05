/**
 * 🛠️ Agentic RAG Nodes Logic
 * Separated from main strategy for clarity
 */

import * as LLMService from '../../services/llmService.js';
import * as RetrievalService from '../../services/retrievalService.js';
import * as SQLService from '../../services/sqlService.js';
import RagConfig from '../../config/ragConfig.js';
import { MAX_LOOPS, MAX_DOCS_IN_STATE, MAX_DOCS_FINAL } from './state.js';

// ─────────────────────────────────────────────────────────────────────────
// NODE 1: classify_and_plan (Improved Memory)
// ─────────────────────────────────────────────────────────────────────────
export async function nodeClassifyAndPlan(state) {
    const loopIdx = state.loop_count;
    this.log("info", `→ [Node] classify_and_plan (Round ${loopIdx + 1})`);

    const thoughts = [{
        id: `ag-plan-${loopIdx}`,
        icon: 'brain',
        description: `วิจัยรอบที่ ${loopIdx + 1}: ${state.feedback ? 'ปรับแผนตามผลลัพธ์เดิม' : 'วิเคราะห์เป้าหมาย'}`,
        status: 'active'
    }];

    const history = state.search_history || [];
    const sqlErrors = state.sql_errors || [];
    const schemaInfo = `
Table: mantis_embeddings (Bug Tracker - Hybrid Search (Vector + FTS))
- Columns: id, ref_id (bug_id), project_name, category_name, summary, description, status, resolution, steps_to_reproduce, additional_information, comments, bug_updated_at (Strict TEXT YYYY-MM-DD), created_at (timestamp)
- Search capabilities: Uses both Vector (semantic) and Full-Text Search (FTS keyword match) for high accuracy.
- Status: 'new', 'assigned', 'resolved', 'closed', 'feedback'
- **CRITICAL SQL SQLITE BAN**: When asking SQL to filter dates here, NEVER ask for \`strftime\`. Request standard PostgreSQL string matching or EXTRACT.
Table: documents (Knowledge Base)
- Columns: id, document_name, project_name, file_type ('PDF', 'DOCX', 'EMAIL', 'IMAGE'), content
`;

    const plannerPrompt = `Answer the following question by outlining a research plan to gather necessary information.
You have access to the following tools:

- mantis_agent: Trigger if user mentions '@mantis', 'bug', 'error', 'fails', or asks for historical issue analysis. This searches the bug database using Powerful Hybrid Search.
  ⚠️ CRITICAL: The \`query\` string for this tool MUST BE PURE NATURAL LANGUAGE (e.g., "bugs reported this month", "login error timeout"). DO NOT write SQL fragments like "created_at > '2026'".
- virtual_lab: Trigger if user mentions '@virtuallab', 'deep research', or asks complex "how" / "why" questions requiring parallel context.
- vector: Trigger if you want to search knowledge base documents (e.g. manuals, flowcharts, specifications).
- sql: Trigger for structured reporting/aggregation based on the schema above. ONLY this tool accepts SQL syntax.

Use the following context to make your decision:
Database Schema:
${schemaInfo}
History of past queries: [${history.join(', ')}]
Errors encountered so far: [${sqlErrors.join(' | ')}]
Current State: Found ${state.documents.length} docs, ${state.sql_results.length} SQL rows.
Critique / Feedback on previous steps: "${state.feedback || 'Start discovery'}"

CRITICAL RULES:
1. NO EARLY QUIT: If total documents = 0 and round < 3, you MUST try a new approach.
2. DEDUPLICATION: Do not repeat EXACT queries, but you can refine them.
3. If SQL Fail: Try searching for keywords in 'mantis_agent' or 'vector' tools.

You MUST respond using the following JSON format mapping your thoughts and desired actions. Note that "tool" MUST be exactly one of the tool names listed above.

Request: "${state.query}"
Research Round: ${loopIdx + 1}/3
Response JSON Array:
[
  {
    "tool": "tool_name_here",
    "query": "query_string_here",
    "reason": "Thought: I need to use this tool because..."
  }
]
`;

    try {
        const raw = await LLMService.callOllama(RagConfig.llm.model, plannerPrompt, '', false, { format: 'json', temperature: 0.1 });
        const plan = JSON.parse(raw.replace(/```json|```/g, '').trim());

        // Strict Semantic Deduplication Check
        const filteredPlan = plan.filter(p => {
            const isExact = history.includes(p.query);
            const isTooSimilar = history.some(prev =>
                p.query.toLowerCase().includes(prev.toLowerCase()) ||
                prev.toLowerCase().includes(p.query.toLowerCase())
            );
            return !isExact && !isTooSimilar;
        });

        thoughts[0].description = filteredPlan.length > 0
            ? `แผนงานรอบที่ ${loopIdx + 1}: ${filteredPlan.map(p => `${p.tool}(${p.query.substring(0, 15)}..)`).join(', ')}`
            : "มีข้อมูลเพียงพอแล้ว หรือไม่มีมุมค้นหาใหม่ที่มีประสิทธิภาพ";
        thoughts[0].status = 'completed';

        return { search_plan: filteredPlan, search_history: filteredPlan.map(p => p.query), thoughts };
    } catch (e) {
        return { search_plan: [], thoughts: [{ id: `ag-plan-${loopIdx}`, status: 'completed', description: 'Planner skip.' }] };
    }
}

// ─────────────────────────────────────────────────────────────────────────
// NODE 2: parallel_search (Dynamic Scaling)
// ─────────────────────────────────────────────────────────────────────────
export async function nodeParallelSearch(state) {
    const loopIdx = state.loop_count;
    const plan = state.search_plan || [];
    const currentDocCount = state.documents.length;

    const thoughts = [{
        id: `ag-search-${loopIdx}`,
        icon: 'layers',
        description: plan.length > 0
            ? `⚡ ดำเนินการค้นหาควบคู่ ${plan.length} แหล่ง...`
            : "⏭️ ข้ามการค้นหา (ใช้ข้อมูลเดิม)",
        status: 'active'
    }];

    if (plan.length === 0 || currentDocCount >= MAX_DOCS_IN_STATE) {
        thoughts[0].status = 'completed';
        return { documents: [], sql_results: [], thoughts };
    }

    const intent = state.intent || {};
    const filters = { client_name: intent.client_name, project_name: intent.project_name };

    // Dynamic Scaling: Reduce 'k' if we already have many documents to maintain precision
    const kValue = currentDocCount > 30 ? 3 : (currentDocCount > 15 ? 5 : 10);

    const results = await Promise.allSettled(plan.map(async (item) => {
        try {
            if (item.tool === 'sql') {
                const res = await SQLService.processSQLRequest(item.query, filters);
                if (res.error) {
                    return { sql_errors: [`SQL Error Round ${loopIdx + 1}: ${res.error}`] };
                }
                return { sql_results: [{ sql: res.sql, markdown: 'Markdown output hidden', summary: `SQL [Round ${loopIdx + 1}]:\n${(res.results || []).slice(0, 10).map(r => JSON.stringify(r)).join('\n')}` }] };
            }

            if (item.tool === 'mantis_agent') {
                const { MantisStrategy } = await import('../mantisStrategy.js');
                const agent = new MantisStrategy();
                const dummyRes = {
                    writableEnded: false,
                    write: () => { },
                    end: function () { this.writableEnded = true; }
                };
                const results = await agent.execute(item.query, filters, "sub-agent", {}, dummyRes, []);
                return { sub_agent_reports: [`[MANTIS AGENT REPORT]: ${results.content}`] };
            }

            if (item.tool === 'virtual_lab') {
                const { MantisStrategy } = await import('../mantisStrategy.js');
                const mantisAgent = new MantisStrategy();
                const dummyRes = {
                    writableEnded: false,
                    write: () => { },
                    end: function () { this.writableEnded = true; }
                };
                const [mRes, vRes] = await Promise.all([
                    mantisAgent.execute(item.query, filters, "vl-sub", {}, dummyRes, []),
                    RetrievalService.unifiedSearch(item.query, filters, 15)
                ]);
                return {
                    sub_agent_reports: [`[VIRTUAL LAB CONSENSUS]: Bugs: ${mRes.content.substring(0, 500)}... Codebase Docs found.`],
                    documents: (vRes.textResults || []).map(d => ({ ...d, source_type: 'deep_research', round: loopIdx + 1 }))
                };
            }

            if (item.tool === 'mantis') {
                const res = await RetrievalService.searchMantis(item.query, filters, kValue);
                return { documents: res.map(d => ({ ...d, source_type: 'mantis_issue', round: loopIdx + 1 })) };
            }
            const res = await RetrievalService.unifiedSearch(item.query, filters, kValue);
            return { documents: (res.textResults || []).map(d => ({ ...d, source_type: 'document', round: loopIdx + 1 })) };
        } catch (e) {
            return { documents: [], sql_results: [], sub_agent_reports: [], thoughts: [{ id: `err-${Date.now()}`, description: `Tool ${item.tool} failed: ${e.message}`, status: 'completed' }] };
        }
    }));

    let newDocs = [];
    let newSQL = [];
    let newErrors = [];
    let newSubReports = [];


    results.forEach(r => {
        if (r.status === 'fulfilled' && r.value) {
            if (r.value.documents) newDocs.push(...r.value.documents);
            if (r.value.sql_results) newSQL.push(...r.value.sql_results);
            if (r.value.sql_errors) newErrors.push(...r.value.sql_errors);
            if (r.value.sub_agent_reports) newSubReports.push(...r.value.sub_agent_reports);
        }
    });

    thoughts[0].description = newSubReports.length > 0
        ? `✅ เอเจนท์ย่อยตอบกลับแล้ว ${newSubReports.length} รายงาน`
        : (newErrors.length > 0
            ? `⚠️ การค้นหาบางส่วนขัดข้อง: ${newErrors[0].substring(0, 40)}`
            : `✅ พบข้อมูลใหม่: ${newDocs.length} items (Total: ${currentDocCount + newDocs.length})`);
    thoughts[0].status = 'completed';

    return { documents: newDocs, sql_results: newSQL, sql_errors: newErrors, sub_agent_reports: newSubReports, thoughts };
}

// ─────────────────────────────────────────────────────────────────────────
// NODE 3: rerank_evidence (Strict Pruning)
// ─────────────────────────────────────────────────────────────────────────
export async function nodeRerankEvidence(state) {
    const loopIdx = state.loop_count;
    const docs = state.documents || [];
    if (docs.length === 0) return { documents: [] };

    const thoughts = [{
        id: `ag-rerank-${loopIdx}`,
        icon: 'filter',
        description: `ปรับลำดับความสำคัญและลด Noise (${docs.length} รายการ)...`,
        status: 'active'
    }];

    const projects = {};
    docs.forEach(d => {
        const p = d.project_name || 'Global';
        if (!projects[p]) projects[p] = [];
        projects[p].push(d);
    });

    const selectedDocs = [];
    Object.values(projects).forEach(pDocs => {
        const sorted = pDocs.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));
        selectedDocs.push(...sorted.slice(0, 4)); // Keep top 4 per project
    });

    const finalDocs = selectedDocs
        .sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
        .slice(0, MAX_DOCS_FINAL);

    thoughts[0].description = `🎯 คัดเฉพาะหลักฐานที่มีคุณภาพสูง ${finalDocs.length} รายการ (ลดจาก ${docs.length})`;
    thoughts[0].status = 'completed';

    return { documents: finalDocs, thoughts };
}

// ─────────────────────────────────────────────────────────────────────────
// NODE 4: deep_synthesize
// ─────────────────────────────────────────────────────────────────────────
export async function nodeDeepSynthesize(state) {
    const thoughts = [{ id: 'ag-synthesize', icon: 'sparkles', description: 'สังเคราะห์คำตอบสุดท้าย...', status: 'completed' }];
    const context = (state.documents || []).map((d, i) => `[Doc-${i + 1}] ${d.document_name}\n${(d.content || '').substring(0, 600)}`).join('\n\n');
    const sqlContext = (state.sql_results || []).map(s => s.summary).join('\n\n');

    const subReports = (state.sub_agent_reports || [])
        .map(r => r.length > 1500 ? r.substring(0, 1500) + '... [TRUNCATED FOR CONTEXT]' : r)
        .join('\n\n');


    const prompt = `### TASK
Synthesize a final answer for: "${state.query}"

### AVAILABLE DATA
${subReports ? `**Sub-Agent Reports:**\n${subReports}\n` : ''}
**Project Documents:**
${context}
${sqlContext ? `\n**SQL Query Results:**\n${sqlContext}` : ''}

### INSTRUCTIONS
1. Determine if the data comes from Project Documents or Bug Reports, and frame the answer accordingly.
2. Answer in the SAME language as the user's question. When answering in Thai, keep all technical terms in English.
3. Hidden Citations (CRITICAL): Cite sources using **[[Source: filename]]** immediately after each referenced piece of information. These will be hidden and converted into UI widgets.
4. If related but not exact information exists, provide the best answer from it. If nothing is relevant, state that clearly.
5. Do NOT invent architecture, interfaces, or mechanisms not present in the documents.
6. Use headings, bullet points, and bold text for scannability. No emojis.
7. If images are present in the documents, include them using the provided Markdown tag.
8. **CRITICAL TIME RULE**: When mentioning dates/months from the provided text, ensure you translate to the correct Thai month (e.g., '03' or 'March' is 'มีนาคม'). DO NOT output 'มกราคม' unless it is actually January.
9. **Flexible Project Context**: Do NOT assume the user is asking about a specific project (e.g., ปิดไว้นะจ๊ะ, ปิดไว้นะจ๊ะ, UOB) unless they explicitly state it OR the retrieved documents overwhelmingly belong to a single project. If the context contains mixed projects or is too broad, you MUST ask the user for clarification before providing a definitive answer.`;
    return { final_response: prompt, thoughts };
}

// ─────────────────────────────────────────────────────────────────────────
// NODE 5: reflect
// ─────────────────────────────────────────────────────────────────────────
export async function nodeReflect(state) {
    const loopIdx = state.loop_count;
    const thoughts = [{ id: `ag-reflect-${loopIdx}`, icon: 'shield-check', description: 'Evaluator: ตรวจสอบสถานะ...', status: 'active' }];

    if (loopIdx >= (MAX_LOOPS - 1)) {
        thoughts[0].description = "✅ สิ้นสุดการค้นหา (ครบขีดจำกัด)";
        thoughts[0].status = 'completed';
        return { reflection_passed: true, thoughts };
    }

    const reflectionPrompt = `Evaluate Research: "${state.query}"\nFound: ${state.documents.length} docs.\nIs this enough? JSON: { "is_sufficient": boolean, "critique": "string" }`;
    try {
        const raw = await LLMService.callOllama(RagConfig.llm.model, reflectionPrompt, '', false, { format: 'json', temperature: 0 });
        const result = JSON.parse(raw.replace(/```json|```/g, '').trim());
        thoughts[0].description = result.is_sufficient ? "✅ ข้อมูลเพียงพอแล้ว" : `🔄 ยังไม่พอ: ${result.critique.substring(0, 40)}`;
        thoughts[0].status = 'completed';
        return { reflection_passed: result.is_sufficient, feedback: result.critique, loop_count: loopIdx + 1, thoughts };
    } catch (e) {
        return { reflection_passed: true, thoughts };
    }
}
