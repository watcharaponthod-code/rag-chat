import { BaseStrategy } from './baseStrategy.js';
import * as LLMService from '../services/llmService.js';
import * as RetrievalService from '../services/retrievalService.js';
import RagConfig from '../config/ragConfig.js';
import * as SystemPrompts from '../config/prompts/systemPrompts.js';
import { vectorDb } from '../config/db.js';

// LangGraph Modules
import { StateGraph, END, START } from "@langchain/langgraph";
import { BaseMessage, AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";

// 1. Define State Type
const GraphState = {
    messages: {
        value: (x, y) => x.concat(y),
        default: () => [],
    },
    query: {
        value: (x, y) => y,
        default: () => "",
    },
    intent: {
        value: (x, y) => { return { ...x, ...y } },
        default: () => ({}),
    },
    is_bug_found: {
        value: (x, y) => y,
        default: () => false,
    },
    retrieved_bugs: {
        value: (x, y) => y,
        default: () => [],
    },
    final_response: {
        value: (x, y) => y,
        default: () => "",
    },
    thoughts: {
        value: (x, y) => {
            const current = [...x];
            // Update existing or add new
            y.forEach(newThought => {
                const idx = current.findIndex(t => t.id === newThought.id);
                if (idx >= 0) {
                    current[idx] = { ...current[idx], ...newThought };
                } else {
                    current.push(newThought);
                }
            });
            return current;
        },
        default: () => [],
    }
};

export class MantisStrategy extends BaseStrategy {

    constructor() {
        super();
        this.graph = this.buildGraph();
    }

    // Define Graph Nodes Functionality
    async nodeAnalyzeBugRequest(state) {
        console.log("-> [Agent Node] analyze_bug_request");
        const thoughts = [{ id: 'agent-1', icon: 'brain', description: `Agent analyzing request details...`, status: 'active' }];

        // Check for exact Issue ID request (e.g. "issue 20250", "bug 1234")
        let exactRefId = null;
        const idMatch = state.query.match(/(?:issue|bug|ticket|item|ref|#|หมายเลข|บัค|ทิกเก็ต|ตั๋ว)?\s*(\d{4,8})\b/i);
        if (idMatch && idMatch[1]) {
            exactRefId = idMatch[1];
            thoughts.push({ id: 'agent-1a', icon: 'search', description: `Extracted Target ID: ${exactRefId}`, status: 'active' });
        }

        return {
            intent: { ...state.intent, exact_ref_id: exactRefId }, // merge into intent
            thoughts: [{ id: 'agent-1', status: 'completed' }]
        };
    }

    async nodeSearchMantisDB(state) {
        console.log("-> [Agent Node] search_mantis_db");
        const query = state.query;

        try {
            const thoughts = [{ id: 'agent-2', icon: 'database', description: `Agent calling Mantis DB tools...`, status: 'active' }];

            // Direct call to searchMantis service which strictly queries the `mantis_embeddings` table
            const filters = { ...state.intent.filters };
            if (state.intent.exact_ref_id) {
                filters.exactRefId = state.intent.exact_ref_id;
            }

            // Fetch a larger pool for smart filtering (Use Config Limit)
            const fetchLimit = RagConfig.context.mantisFetchLimit || 20;
            const rawBugs = await RetrievalService.searchMantis(query, filters, fetchLimit);

            // Apply Smart Filtering & Re-ranking logic
            const filterRes = RetrievalService.processResponseAndSources(rawBugs);
            const retrievedBugs = filterRes.filteredDocs;

            const isFound = retrievedBugs.length > 0;

            thoughts.push({
                id: 'agent-2',
                description: `Agent executed Mantis SQL. Found ${rawBugs.length} issues, kept ${retrievedBugs.length} relevant ones.`,
                status: 'completed'
            });

            return {
                retrieved_bugs: retrievedBugs,
                is_bug_found: isFound,
                thoughts: thoughts
            };
        } catch (e) {
            console.error(e);
            return { is_bug_found: false, thoughts: [{ id: 'agent-2', description: `Agent SQL Tool Failed: ${e.message}`, status: 'completed' }] };
        }
    }

    async nodeSynthesize(state) {
        console.log("-> [Agent Node] synthesize");

        let finalContext = "";

        if (state.retrieved_bugs.length > 0) {
            // Incorporate LlamaIndex for refinement ONLY if we are looking for a specific issue
            // For broad questions ("what bugs recently?"), LlamaIndex semantic filtering drops too many valid results.
            if (state.intent.exact_ref_id) {
                const { processWithLlamaIndex } = await import('../services/llamaIndexService.js');
                const llamaRes = await processWithLlamaIndex(state.query, state.retrieved_bugs, 10);

                // Update retrieved bugs state with refined docs so the execute() method cites the right sources
                state.retrieved_bugs = llamaRes.refinedDocs;
            }

            // Re-map to ensure we have all necessary metadata for formatting
            finalContext = state.retrieved_bugs.map((doc, idx) => {
                return `<mantis_issue ref_id="${doc.ref_id || doc.id || idx}">
<project_name>${doc.project_name || 'N/A'}</project_name>
<category_name>${doc.category_name || 'N/A'}</category_name>
<status>${doc.status || 'N/A'}</status>
<summary>${doc.summary || 'N/A'}</summary>
<description>${doc.description || 'N/A'}</description>
<steps_to_reproduce>${doc.steps_to_reproduce || 'N/A'}</steps_to_reproduce>
<resolution>${doc.resolution || 'N/A'}</resolution>
<additional_information>${doc.additional_information || 'N/A'}</additional_information>
<comments>${doc.comments || 'N/A'}</comments>
<original_content>${doc.content || ''}</original_content>
</mantis_issue>`;
            }).join('\n\n');

        } else {
            finalContext = "NO MANTIS ISSUES FOUND.";
        }

        const systemPrompt = SystemPrompts.RAG_SYSTEM_PROMPT_TEMPLATE(
            finalContext,
            "You are a Mantis Tracking Agent. Answer the user based on historical bug fixes provided. CRITICAL: If the user asks for a general update, recent bugs, or what bugs exist, you MUST summarize the provided tickets. Do NOT ask for specific Bug IDs or more info if tickets are provided in the context."
        );

        // Note: The actual streaming happens in execute() where we pass res object
        return {
            final_response: systemPrompt,
            retrieved_bugs: state.retrieved_bugs,
            thoughts: [{ id: 'agent-3', icon: 'pen-tool', description: 'Agent synthesizing the final answer from tickets...', status: 'active' }]
        };
    }

    // Conditional Routing
    shouldSearch(state) {
        return "search_mantis_db";
    }

    // Build the LangGraph
    buildGraph() {
        const workflow = new StateGraph({ channels: GraphState });

        // Add Nodes
        workflow.addNode("analyze_bug_request", this.nodeAnalyzeBugRequest.bind(this));
        workflow.addNode("search_mantis_db", this.nodeSearchMantisDB.bind(this));
        workflow.addNode("synthesize", this.nodeSynthesize.bind(this));

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
                messages: [new HumanMessage(query)],
                thoughts: initialThoughts
            };

            // Stream graph execution events if needed, or await full state
            // For simplicity in this v1, await invoke
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
                { temperature: 0.3, num_ctx: RagConfig.llm.numCtx }, // Lower temp for agent
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
