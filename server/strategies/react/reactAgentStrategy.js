/**
 * 🧠 ReAct Agent Strategy — v7.0
 *
 * Flow:
 *   START → retrieve (ALWAYS: codebase + mantis parallel)
 *         → think (decide if more data needed)
 *         → action (SQL only if needed)  ↰
 *         → finalize → END
 *
 * Design rule: Agent Mode ALWAYS retrieves RAG context first.
 * The reasoning loop can only call SQL for additional numeric data.
 */

import { StateGraph, END, START } from "@langchain/langgraph";
import { BaseStrategy } from '../baseStrategy.js';
import * as LLMService from '../../services/llmService.js';
import RagConfig from '../../config/ragConfig.js';

import { codebaseTool } from '../../ai/tools/codebaseTool.js';
import { mantisTool } from '../../ai/tools/mantisTool.js';
import { sqlTool } from '../../ai/tools/sqlTool.js';

// Only SQL is available in the reasoning loop (codebase + mantis are mandatory and run upfront)
const LOOP_TOOLS = [sqlTool];

export class ReActAgentStrategy extends BaseStrategy {
    constructor() {
        super();
        this.graph = this.buildGraph();
    }

    buildGraph() {
        const workflow = new StateGraph({
            channels: {
                messages: { value: (x, y) => x.concat(y), default: () => [] },
                thoughts: { value: (x, y) => this.mergeThoughts(x, y), default: () => [] },
                filters: { value: (x, y) => ({ ...x, ...y }), default: () => ({}) },
                next_step: { value: (x, y) => y, default: () => "think" },
                loop_count: { value: (x, y) => y, default: () => 0 },
                action_data: { value: (x, y) => y, default: () => null },
                rag_context: { value: (x, y) => y ?? x, default: () => "" },
                next_action: { value: (x, y) => y, default: () => null }
            }
        });

        workflow.addNode("retrieve", this.nodeRetrieve.bind(this));
        workflow.addNode("think", this.nodeThink.bind(this));
        workflow.addNode("action", this.nodeAction.bind(this));
        workflow.addNode("finalize", this.nodeFinalize.bind(this));

        // 🔒 retrieve is ALWAYS the first node — no skipping
        workflow.addEdge(START, "retrieve");
        workflow.addEdge("retrieve", "think");
        workflow.addConditionalEdges("think", (s) => s.next_step, {
            "action": "action",
            "finalize": "finalize"
        });
        workflow.addEdge("action", "think");
        workflow.addEdge("finalize", END);

        return workflow.compile();
    }

    mergeThoughts(x, y) {
        const current = [...(x || [])];
        if (!y) return current;
        y.forEach(newT => {
            const idx = current.findIndex(t => t.id === newT.id);
            if (idx >= 0) current[idx] = { ...current[idx], ...newT };
            else current.push(newT);
        });
        return current;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // NODE 0: retrieve — mandatory parallel RAG (codebase + mantis)
    // ─────────────────────────────────────────────────────────────────────────
    async nodeRetrieve(state, config) {
        const res = config.configurable.res;
        const { filters, messages, intent } = state;
        const rawQuery = messages[0]?.content || "";
        // Use extracted keywords for better RAG precision, fallback to raw query
        const searchQuery = intent?.extracted_query || rawQuery;

        const thoughts = [
            { id: 'rag-doc', icon: 'database', description: `สืบค้นข้อมูล: ${searchQuery.substring(0, 30)}...`, status: 'active' },
            { id: 'rag-bug', icon: 'bug', description: 'ตรวจสอบประวัติบั๊ก...', status: 'active' },
        ];
        this.sendThoughts(res, this.mergeThoughts(state.thoughts, thoughts));

        // Parallel RAG — always runs regardless of question type
        const [docResult, bugResult] = await Promise.allSettled([
            codebaseTool.invoke({ query: searchQuery, project_name: filters.project_name }),
            mantisTool.invoke({ query: searchQuery, project_name: filters.project_name }),
        ]);

        const docText = docResult.status === 'fulfilled' ? docResult.value : '(ไม่สามารถดึงเอกสารได้)';
        const bugText = bugResult.status === 'fulfilled' ? bugResult.value : '(ไม่สามารถดึงข้อมูล Mantis ได้)';

        thoughts[0].status = 'completed';
        thoughts[0].description = docResult.status === 'fulfilled'
            ? 'พบเอกสารอ้างอิงที่เกี่ยวข้อง' : 'ไม่พบเอกสารที่ตรงกัน';

        thoughts[1].status = 'completed';
        thoughts[1].description = bugResult.status === 'fulfilled'
            ? 'พบประวัติบั๊กที่เกี่ยวข้อง' : 'ไม่พบบั๊กที่ตรงกัน';

        this.sendThoughts(res, this.mergeThoughts(state.thoughts, thoughts));

        const ragContext = [
            "=== MANDATORY REFERENCE CONTEXT ===",
            "",
            "[CODEBASE DOCUMENTS]",
            docText,
            "",
            "[MANTIS BUG HISTORY]",
            bugText,
            "",
            "=== END OF REFERENCE CONTEXT ===",
        ].join("\n");

        return {
            thoughts,
            rag_context: ragContext,
            messages: [{ role: 'system', content: ragContext }]
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // NODE 1: think — decide if SQL is needed or answer is ready
    // ─────────────────────────────────────────────────────────────────────────
    async nodeThink(state, config) {
        const res = config.configurable.res;
        const loopIdx = state.loop_count;

        if (loopIdx >= 4) return { next_step: "finalize" };

        const thoughtId = `think-${loopIdx}`;
        const thoughts = [{ id: thoughtId, icon: 'brain', description: `วิเคราะห์ข้อมูล (รอบ ${loopIdx + 1})...`, status: 'active' }];
        this.sendThoughts(res, this.mergeThoughts(state.thoughts, thoughts));

        const toolPrompt = `You are an Advanced ReAct Agent for SYCAPT.
Codebase documents and Mantis bug data have ALREADY been retrieved and are in the conversation history.

### TASK
Decide the next action based on the retrieved context above and the user query.

### RULES:
1. If the retrieved context is SUFFICIENT to answer → {"action": "finalize"}
2. If the user query is AMBIGUOUS or you are missing CRITICAL identifiers (like project name) needed for a good search → {"action": "clarify", "args": {"question": "What specifically do you need to know? (e.g., Which project?)"}}
3. If you need statistics, counts, or numeric data → use 'query_database_sql'
4. If SQL or RAG returned NOTHING and you cannot provide a helpful answer → use 'clarify' to ask the user for more details.

### TOOL SCHEMAS (REQUIRED):
- query_database_sql: { "sql_request": "string", "project_name": "string (optional)" }
- clarify: { "question": "The question to ask the user to narrow down the search (MANDATORY)" }

Available tools for this step:
${LOOP_TOOLS.map(t => `- ${t.name}: ${t.description}`).join('\n')}
- clarify: Use this to ask the user for more information or clarification.

Recent History:
${state.messages.slice(-3).map(m => `[${m.role}]: ${m.content.substring(0, 300)}`).join('\n')}

Respond ONLY as JSON: {"action": "query_database_sql", "args": {...}}, {"action": "clarify", "args": {...}} or {"action": "finalize"}
JSON:`;

        try {
            const raw = await LLMService.callOllama(
                RagConfig.llm.model, toolPrompt,
                'You are a precise JSON-output reasoning agent.',
                false, { format: 'json', temperature: 0.05 }
            );
            const decision = JSON.parse(raw.replace(/```json|```/g, '').trim());

            if (decision.action === 'finalize' || !decision.action) {
                thoughts[0].status = 'completed';
                thoughts[0].description = "ข้อมูลเพียงพอ — พร้อมสรุปคำตอบ";
                this.sendThoughts(res, this.mergeThoughts(state.thoughts, thoughts));
                return { next_step: "finalize", thoughts };
            }

            const tool = LOOP_TOOLS.find(t => t.name === decision.action);
            if (!tool) {
                thoughts[0].status = 'completed';
                this.sendThoughts(res, this.mergeThoughts(state.thoughts, thoughts));
                return { next_step: "finalize", thoughts };
            }

            thoughts[0].description = `ต้องการข้อมูลเพิ่มเติม → ${decision.action}`;
            thoughts[0].status = 'completed';
            this.sendThoughts(res, this.mergeThoughts(state.thoughts, thoughts));

            return {
                next_step: "action",
                action_data: decision,
                next_action: decision.action, // Track what we are doing
                thoughts,
                loop_count: loopIdx + 1
            };
        } catch (e) {
            console.error("[ReAct] Think Error:", e.message);
            return { next_step: "finalize" };
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // NODE 2: action — execute a loop tool (SQL only)
    // ─────────────────────────────────────────────────────────────────────────
    async nodeAction(state, config) {
        const res = config.configurable.res;
        const { action_data, filters } = state;
        const tool = LOOP_TOOLS.find(t => t.name === action_data.action);
        const thoughtId = `act-${state.loop_count}`;

        const thoughts = [{ id: thoughtId, icon: 'cpu', description: `รัน ${action_data.action}...`, status: 'active' }];
        this.sendThoughts(res, this.mergeThoughts(state.thoughts, thoughts));

        if (action_data.action === 'clarify') {
            thoughts[0].description = "ต้องการข้อมูลเพิ่มเติมจากผู้ใช้";
            thoughts[0].status = 'completed';
            this.sendThoughts(res, this.mergeThoughts(state.thoughts, thoughts));
            return {
                next_step: "finalize", // Go straight to finalize to ask the question
                messages: [{ role: 'system', content: `REQUEST_CLARIFICATION: ${action_data.args.question}` }],
                thoughts
            };
        }

        if (!tool) {
            thoughts[0].status = 'completed';
            thoughts[0].description = `ไม่พบเครื่องมือ: ${action_data.action}`;
            this.sendThoughts(res, this.mergeThoughts(state.thoughts, thoughts));
            return { messages: [{ role: 'system', content: `Tool not found: ${action_data.action}` }], thoughts };
        }

        try {
            // Defensive: Normalize arguments for common LLM mistakes (handle 'query' vs 'sql_request')
            const args = { ...action_data.args };
            if (!args.sql_request && args.query) args.sql_request = args.query;

            const result = await tool.invoke({ ...args, project_name: filters.project_name });
            thoughts[0].description = `${action_data.action} สำเร็จ`;
            thoughts[0].status = 'completed';
            this.sendThoughts(res, this.mergeThoughts(state.thoughts, thoughts));
            return {
                messages: [{ role: 'user', content: `SQL Result:\n${result}` }],
                thoughts
            };
        } catch (e) {
            thoughts[0].description = `ขัดข้อง: ${e.message}`;
            thoughts[0].status = 'completed';
            this.sendThoughts(res, this.mergeThoughts(state.thoughts, thoughts));
            return { messages: [{ role: 'system', content: `Tool Error: ${e.message}` }], thoughts };
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // NODE 3: finalize — trigger final LLM synthesis (happens in execute())
    // ─────────────────────────────────────────────────────────────────────────
    async nodeFinalize(state, config) {
        const res = config.configurable.res;
        const thoughts = [{ id: 'finalize', icon: 'check-circle', description: 'รวบรวมคำตอบ...', status: 'completed' }];
        this.sendThoughts(res, this.mergeThoughts(state.thoughts, thoughts));
        return { thoughts };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // execute() — main entry point
    // ─────────────────────────────────────────────────────────────────────────
    async execute(query, intent, sessionId, user, res, history) {
        try {
            const initialThoughts = [{
                id: 'ag-init', icon: 'zap',
                description: 'ReAct Agent — ค้นหาข้อมูลอ้างอิงก่อนวิเคราะห์...',
                status: 'completed'
            }];
            this.sendThoughts(res, initialThoughts);

            const inputs = {
                messages: [{ role: 'user', content: query }],
                thoughts: initialThoughts,
                filters: intent?.filters || {},
                intent: intent, // Pass full intent for extracted_query access
                loop_count: 0,
                rag_context: ""
            };

            const graphConfig = { configurable: { res, sessionId } };
            const finalState = await this.graph.invoke(inputs, graphConfig);

            // Final synthesis: always has RAG context injected by nodeRetrieve
            const isClarifying = finalState.next_action === 'clarify';

            const systemPrompt = isClarifying
                ? `### ROLE
You are "Sycapt Assistant". You need more information from the user to provide an accurate answer.

### INSTRUCTIONS
1. Based on the "REQUEST_CLARIFICATION" message in the history, ask the user for the missing details politely in Thai.
2. Explain WHY you need this information (e.g., to narrow down a search in a specific project).
3. Do not provide a partial or incorrect answer if you are unsure.`
                : `### ROLE
You are "Sycapt Assistant" — a Technical Support AI for Sycapt employees.
The conversation history ALREADY contains retrieved codebase documents and Mantis bug data.

### INSTRUCTIONS
1. Analyze whether the retrieved data is from Project Documents or Bug Reports, and frame your answer accordingly.
2. Answer in the SAME language as the user (Thai <-> Thai). When answering in Thai, keep all technical terms in English.
3. Hidden Citations (CRITICAL): Cite sources using **[[Source: filename]]** immediately after each referenced piece of information. These will be hidden and converted into UI widgets.
4. If the answer is not explicitly stated but related info exists, provide the best answer from that. If nothing is relevant or you are still unsure, ask for clarification.
5. Do NOT invent architecture, interfaces, or mechanisms not present in the documents.

### FORMATTING RULES
- Clean text only. No emojis.
- Use headings, bullet points, and bold text for scannability.
- If images are in the context, MUST include them with the provided Markdown tag.`;

            const fullContent = await LLMService.streamResponse(
                RagConfig.llm.model,
                [...(history || []), ...finalState.messages],
                systemPrompt,
                { temperature: 0.1 },
                res,
                finalState.thoughts
            );

            this.endStream(res);
            return { content: fullContent, thoughts: finalState.thoughts };
        } catch (err) {
            this.handleError(res, err);
            throw err;
        }
    }
}
