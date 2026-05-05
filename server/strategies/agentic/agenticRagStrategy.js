/**
 * 🧠 Agentic RAG Strategy — Phase 5.3: High Precision & Diversity
 */

import { BaseStrategy } from '../baseStrategy.js';
import * as LLMService from '../../services/llmService.js';
import RagConfig from '../../config/ragConfig.js';
import { StateGraph, END, START, MemorySaver } from "@langchain/langgraph";

// Extracted parts
import { GraphState } from './state.js';
import * as Nodes from './nodes.js';

export class AgenticRagStrategy extends BaseStrategy {

    constructor() {
        super();
        this.checkpointer = new MemorySaver();
        this.graph = this.buildGraph();
    }

    buildGraph() {
        const workflow = new StateGraph({ channels: GraphState });

        // Bind nodes to 'this' so they can access BaseStrategy methods (log, sendThoughts, etc.)
        workflow.addNode("classify_and_plan", Nodes.nodeClassifyAndPlan.bind(this));
        workflow.addNode("parallel_search", Nodes.nodeParallelSearch.bind(this));
        workflow.addNode("rerank_evidence", Nodes.nodeRerankEvidence.bind(this));
        workflow.addNode("deep_synthesize", Nodes.nodeDeepSynthesize.bind(this));
        workflow.addNode("reflect", Nodes.nodeReflect.bind(this));

        workflow.addEdge(START, "classify_and_plan");
        workflow.addEdge("classify_and_plan", "parallel_search");
        workflow.addEdge("parallel_search", "rerank_evidence");
        workflow.addEdge("rerank_evidence", "deep_synthesize");
        workflow.addEdge("deep_synthesize", "reflect");

        workflow.addConditionalEdges("reflect", (s) => s.reflection_passed ? "end" : "loop", { "end": END, "loop": "classify_and_plan" });
        return workflow.compile({ checkpointer: this.checkpointer });
    }

    async execute(query, intent, sessionId, user, res, history) {
        try {
            const initialThoughts = [{ id: 'ag-init', icon: 'zap', description: 'Initializing High-Precision Agent v5.3...', status: 'active' }];
            this.sendThoughts(res, initialThoughts);

            const inputs = { query, intent: intent || {}, documents: [], sql_results: [], search_history: [], loop_count: 0, thoughts: initialThoughts };
            const config = { configurable: { thread_id: sessionId || 'default' } };
            const finalState = await this.graph.invoke(inputs, config);

            // ── RESEARCH: LOG HISTORY ────────────────────────────────────────
            const historyState = await this.graph.getState(config);
            this.log('info', `[History] Node history for thread ${config.configurable.thread_id} captured.`);

            this.sendThoughts(res, finalState.thoughts);
            const fullContent = await LLMService.streamResponse(
                RagConfig.llm.model, [...(history || []), { role: 'user', content: query }],
                finalState.final_response, { temperature: 0.1 }, res, finalState.thoughts
            );
            this.endStream(res);
            return { content: fullContent, thoughts: finalState.thoughts };
        } catch (err) {
            this.handleError(res, err);
            throw err;
        }
    }
}
