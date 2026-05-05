/**
 * 🐞 Mantis Agent Strategy
 */

import { BaseStrategy } from '../baseStrategy.js';
import * as LLMService from '../../services/llmService.js';
import RagConfig from '../../config/ragConfig.js';
import { StateGraph, END, START } from "@langchain/langgraph";
import { HumanMessage } from "@langchain/core/messages";

// Extracted parts
import { GraphState } from './state.js';
import * as Nodes from './nodes.js';

export class MantisStrategy extends BaseStrategy {

    constructor() {
        super();
        this.graph = this.buildGraph();
    }

    // Conditional Routing
    shouldSearch(state) {
        if (state.needs_clarification) return "synthesize";
        return "search_mantis_db";
    }

    // Build the LangGraph
    buildGraph() {
        const workflow = new StateGraph({ channels: GraphState });

        // Add Nodes
        workflow.addNode("analyze_bug_request", Nodes.nodeAnalyzeBugRequest.bind(this));
        workflow.addNode("search_mantis_db", Nodes.nodeSearchMantisDB.bind(this));
        workflow.addNode("synthesize", Nodes.nodeSynthesize.bind(this));

        // Add Edges
        workflow.addEdge(START, "analyze_bug_request");
        workflow.addConditionalEdges("analyze_bug_request", this.shouldSearch.bind(this));
        workflow.addEdge("search_mantis_db", "synthesize");
        workflow.addEdge("synthesize", END);

        return workflow.compile();
    }

    async execute(query, intent, sessionId, user, res, history) {
        this.log('info', `Executing LangGraph Mantis Agent for: "${query}"`);

        try {
            const initialThoughts = [
                { id: 'agent-init', icon: 'bot', description: `Spawning Mantis Agent Workflow...`, status: 'active' }
            ];
            this.sendThoughts(res, initialThoughts);

            // Run the Graph
            const inputs = {
                query: query,
                intent: intent,
                sessionId: sessionId,
                messages: [new HumanMessage(query)],
                thoughts: initialThoughts
            };

            const finalState = await this.graph.invoke(inputs);

            // Forward thoughts generated in graph
            initialThoughts[0].status = 'completed';
            this.sendThoughts(res, finalState.thoughts);

            // Create citations from state.retrieved_bugs
            const citations = finalState.retrieved_bugs.map((doc, idx) => ({
                id: idx.toString(),
                title: doc.document_name || `Mantis Issue #${doc.ref_id || doc.id || idx}`,
                url: '#',
                score: Math.round((doc.similarity || 0.8) * 100)
            }));

            res.write(`data: ${JSON.stringify({ type: 'citations', citations })} \n\n`);

            // Execute standard streaming utilizing node's computed system prompt
            const systemPrompt = finalState.final_response; // Pass down the built prompt

            const fullContent = await LLMService.streamResponse(
                RagConfig.llm.model,
                history,
                systemPrompt,
                {
                    temperature: 0.2,
                    num_ctx: RagConfig.llm.numCtx,
                    num_predict: 4096,
                    repeat_penalty: 1.35,
                    top_p: 0.9,
                    loopGuard: true,
                    maxRepeatedLine: 2
                },
                res,
                finalState.thoughts
            );

            this.endStream(res);

            return {
                content: fullContent,
                thoughts: finalState.thoughts,
                citations: { sources: citations, related_images: [] }
            };

        } catch (error) {
            this.handleError(res, error);
            throw error;
        }
    }
}
