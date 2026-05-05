import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import { StrategyFactory } from "./strategyFactory.js";
import * as LLMService from "../services/llmService.js";
import Logger from "../services/loggerService.js";

/**
 * 🕸️ Master Orchestrator Graph
 * This graph replaces the manual routing logic in chat.controller.js
 * It centralizes intent analysis and strategy selection.
 */

// Mock Response Streamer to safely buffer parallel agent outputs
class MockRes {
    constructor(realRes, agentName) {
        this.realRes = realRes;
        this.agentName = agentName;
        this.buffer = "";
        this.thoughts = [];
        this.citations = [];
    }
    write(chunk) {
        const textChunk = chunk.toString();
        const parts = textChunk.split('\n\n');
        for (const pt of parts) {
            if (pt.startsWith('data: ')) {
                const jsonStr = pt.substring(6).trim();
                if (!jsonStr) continue;
                try {
                    const parsed = JSON.parse(jsonStr);
                    if (parsed.type === 'token') {
                        this.buffer += parsed.content;
                    } else if (parsed.type === 'thoughts') {
                        const brandedThoughts = parsed.thoughts.map(t => ({
                            ...t,
                            id: `${this.agentName}-${t.id}`,
                            description: `[${this.agentName.toUpperCase()}] ${t.description}`
                        }));
                        this.thoughts = brandedThoughts;
                        if (this.realRes) {
                            this.realRes.write(`data: ${JSON.stringify({ type: 'thoughts', thoughts: brandedThoughts })}\n\n`);
                        }
                    } else if (parsed.type === 'citations') {
                        this.citations.push(...parsed.citations);
                    }
                } catch (e) { }
            }
        }
    }
    end() { }
}

// Define the state for our master graph
const MasterState = Annotation.Root({
    messages: Annotation({
        reducer: (x, y) => x.concat(y),
        default: () => [],
    }),
    intent: Annotation({
        reducer: (x, y) => ({ ...x, ...y }),
        default: () => ({}),
    }),
    result: Annotation({
        reducer: (x, y) => y,
        default: () => null,
    }),
    sub_results: Annotation({
        reducer: (x, y) => x.concat(y),
        default: () => [],
    }),
    requires_consensus: Annotation({
        reducer: (x, y) => y !== undefined ? y : x,
        default: () => false,
    }),
    config: Annotation({
        reducer: (x, y) => ({ ...x, ...y }),
        default: () => ({}),
    }),
});

/**
 * ROUTER NODE:
 * Analyzes the user message and determines the appropriate RAG strategy.
 */
async function nodeRouter(state) {
    const lastMessage = state.messages[state.messages.length - 1].content;
    const history = state.messages.slice(0, -1);
    const chatMode = state.config.chatMode || 'doc';

    Logger.info(`[MasterGraph] Analyzing Intent: "${lastMessage}"`);

    // Direct modes from UI: skip intent router and route immediately.
    if (chatMode === 'doc') {
        Logger.info('[MasterGraph] UI Mode: Doc -> Direct Document Search ONLY');
        return {
            intent: {
                strategy: 'fast',
                search_mantis: false,
                search_text: true,
                search_images: true,
                filters: {
                    ...(state.config.filters || {})
                }
            }
        };
    }

    if (chatMode === 'mantis') {
        Logger.info('[MasterGraph] UI Mode: Mantis -> Direct Mantis Search ONLY');
        return {
            intent: {
                strategy: 'mantis',
                search_mantis: true,
                search_text: false,
                search_images: false,
                filters: {
                    ...(state.config.filters || {})
                }
            }
        };
    }

    if (chatMode === 'agent') {
        Logger.info('[MasterGraph] UI Mode: Agent -> ReAct Agent (Doc + Mantis)');
        return {
            intent: {
                strategy: 'react_agent',
                search_mantis: true,
                search_text: true,
                search_images: true,
                filters: {
                    ...(state.config.filters || {})
                }
            }
        };
    }

    // 1. Base Intent via AI (Always analyze to get good keywords/extracted_query)
    const aiIntent = await LLMService.analyzeIntent(lastMessage, history);

    // 🧹 PROACTIVE VRAM MANAGEMENT: 
    const intentModel = process.env.OLLAMA_INTENT_MODEL || process.env.OLLAMA_CHAT_MODEL;
    LLMService.freeVram(intentModel).catch(e => console.warn(`[MasterGraph] Async VRAM free failed: ${e.message}`));

    // 2. Overrides & Heuristics
    let strategyOverride = null;
    const lowerQuery = lastMessage.toLowerCase();

    if (lowerQuery.includes('@lab') || lowerQuery.includes('@virtuallab') || lowerQuery.includes('@deepresearch')) {
        strategyOverride = 'virtual_lab';
    } else if (['@mantis', '@bug', '@error'].some(tag => lowerQuery.includes(tag))) {
        strategyOverride = 'mantis';
    }

    // Merge everything
    const finalIntent = {
        ...aiIntent,
        strategy: strategyOverride || aiIntent.strategy || 'fast',
        // Force search flags based on chatMode
        search_mantis: chatMode === 'mantis' ? true : (aiIntent.search_mantis ?? false),
        search_text: chatMode === 'mantis' ? false : (aiIntent.search_text ?? true),
        search_images: chatMode === 'mantis' ? false : (aiIntent.search_images ?? true),
        filters: {
            ...aiIntent.filters,
            ...(state.config.filters || {})
        }
    };

    Logger.info(`[MasterGraph] Final Route: ${finalIntent.strategy} | Query: ${finalIntent.extracted_query || 'raw'}`);
    return { intent: finalIntent };
}

/**
 * COORDINATOR NODE:
 * Hands off the actual work to the selected strategy or orchestrates multiple for Virtual Lab.
 */
async function nodeCoordinator(state) {
    const { intent, messages, config } = state;
    const lastMessage = messages[messages.length - 1].content;
    const history = messages.slice(0, -1);

    try {
        if (intent.strategy === 'virtual_lab') {
            Logger.info(`[MasterGraph] 🔵 VIRTUAL LAB COORDINATOR: Spawning Parallel Agents`);

            config.res.write(`data: ${JSON.stringify({ type: 'thoughts', thoughts: [{ id: 'vl-init', icon: 'server', description: 'Virtual Lab: Coordinating multiple agents...', status: 'active' }] })}\n\n`);

            const mantisStream = new MockRes(config.res, 'mantis');
            const ragStream = new MockRes(config.res, 'agenticRAG');

            const mantisIntent = { ...intent, strategy: 'mantis', search_mantis: true, search_text: false };
            const ragIntent = { ...intent, strategy: 'agentic_rag', search_mantis: false, search_text: true, search_images: true };

            const [mantisResult, ragResult] = await Promise.all([
                StrategyFactory.getStrategy(mantisIntent).execute(lastMessage, mantisIntent, config.sessionId, config.user, mantisStream, history),
                StrategyFactory.getStrategy(ragIntent).execute(lastMessage, ragIntent, config.sessionId, config.user, ragStream, history)
            ]);

            const totalCitations = [
                ...(mantisResult.citations?.sources || []),
                ...(ragResult.citations?.sources || [])
            ];

            const sub_results = [];
            if (mantisStream.buffer) sub_results.push(`[MANTIS AGENT REPORT]\n${mantisStream.buffer}`);
            if (ragStream.buffer) sub_results.push(`[RAG AGENT REPORT]\n${ragStream.buffer}`);

            if (totalCitations.length > 0) {
                config.res.write(`data: ${JSON.stringify({ type: 'citations', citations: totalCitations })} \n\n`);
            }

            return { sub_results, requires_consensus: true };
        } else {
            // Normal Single Execution
            Logger.info(`[MasterGraph] Single Execution: ${intent.strategy}`);
            const strategy = StrategyFactory.getStrategy(intent);
            const result = await strategy.execute(lastMessage, intent, config.sessionId, config.user, config.res, history);
            return { result, requires_consensus: false };
        }
    } catch (error) {
        Logger.error(`[MasterGraph] Execution Error: ${error.message}`);
        if (error.message.includes('fetch failed') || error.message.includes('VRAM') || error.message.includes('OOM')) {
            Logger.warn('[MasterGraph] Potential Resource Exhaustion. Attempting emergency VRAM sweep...');
            await LLMService.freeVram();
        }
        throw error;
    }
}

async function nodeConsensus(state) {
    const { sub_results, config, messages } = state;
    const lastMessage = messages[messages.length - 1].content;

    Logger.info(`[MasterGraph] 🟢 VIRTUAL LAB CONSENSUS: Merging ${sub_results.length} reports`);

    // Prepare combined thoughts to maintain history 
    const consensusThoughts = [
        { id: 'vl-init', icon: 'server', description: 'Virtual Lab: Coordinating multiple agents...', status: 'completed' },
        { id: 'vl-merge', icon: 'git-merge', description: 'Virtual Lab: Synthesizing final consensus...', status: 'active' }
    ];

    config.res.write(`data: ${JSON.stringify({ type: 'thoughts', thoughts: consensusThoughts })}\n\n`);

    if (sub_results.length === 0) {
        Logger.warn('[MasterGraph] No sub-results found for consensus. Falling back.');
        config.res.write(`data: ${JSON.stringify({ type: 'token', content: "I encountered an issue gathering data from the specialized agents. Let me try a general search instead." })}\n\n`);
        config.res.end();
        return { result: { content: "Error: No agent reports.", type: 'error' } };
    }

    const now = new Date().toLocaleString('th-TH', { dateStyle: 'full', timeStyle: 'short' });
    const consensusPrompt = `You are the Virtual Lab Lead Coordinator.
วันเวลาปัจจุบัน: ${now}
Two of your specialized AI agents have researched the user's query in parallel and provided their independent reports.

USER QUERY:
"${lastMessage}"

--- MANTIS AGENT REPORT ---
${sub_results.find(r => r.includes('[MANTIS')) || 'No report generated.'}

--- RAG AGENT (CODEBASE) REPORT ---
${sub_results.find(r => r.includes('[RAG')) || 'No report generated.'}

INSTRUCTIONS:
Synthesize both reports into a SINGLE beautiful, coherent final answer in THAI. 
Do not say "The Mantis agent said..." or "According to the RAG agent...". Speak directly to the user as one unified intelligent entity combining all facts. Resolve any conflicting information.`;

    const finalContent = await LLMService.streamResponse(
        process.env.OLLAMA_CHAT_MODEL,
        consensusPrompt, // We send this as a direct prompt string for streamResponse
        '',
        { temperature: 0.5 },
        config.res,
        consensusThoughts
    );

    // Final thought cleanup
    consensusThoughts[1].status = 'completed';
    config.res.write(`data: ${JSON.stringify({ type: 'thoughts', thoughts: consensusThoughts })}\n\n`);

    // Close the SSE stream since we bypassed normal controller execution logic
    config.res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    config.res.end();

    return { result: { content: finalContent, type: 'consensus' } };
}

// Edge Router
function determineNextStep(state) {
    if (state.requires_consensus) {
        return "consensus";
    }
    return "end";
}

// Define the Workflow
const workflow = new StateGraph(MasterState)
    .addNode("router", nodeRouter)
    .addNode("coordinator", nodeCoordinator)
    .addNode("consensus", nodeConsensus)
    .addEdge(START, "router")
    .addEdge("router", "coordinator")
    .addConditionalEdges("coordinator", determineNextStep, {
        consensus: "consensus",
        end: END
    })
    .addEdge("consensus", END);

export const masterGraph = workflow.compile();
