/**
 * 🛠️ Master Orchestrator Nodes
 */

import { StrategyFactory } from "../strategyFactory.js";
import * as LLMService from "../../services/llmService.js";
import Logger from "../../services/loggerService.js";
import { mergeMantisFilters } from '../../services/mantisContextStore.js';

// Mock Response Streamer to safely buffer parallel agent outputs
export class MockRes {
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

/**
 * ROUTER NODE:
 * Analyzes the user message and determines the appropriate RAG strategy.
 */
export async function nodeRouter(state) {
    const lastMessage = state.messages[state.messages.length - 1].content;
    const history = state.messages.slice(0, -1);

    const mantisContext = state.config?.mantisContext?.filters || {};
    const hasMantisContext = Object.keys(mantisContext).length > 0;

    Logger.info(`[MasterGraph] Analyzing Intent: "${lastMessage}"`);

    const chatMode = state.config.chatMode || 'doc';

    // 1. Doc Mode (Direct to document search only - NO mantis/AI routing)
    if (chatMode === 'doc') {
        const mergedFilters = mergeMantisFilters(mantisContext, state.config.filters || {});
        Logger.info('[MasterGraph] UI Mode: Doc -> Direct Document Search ONLY');
        return {
            intent: {
                strategy: 'fast',
                search_mantis: false,
                search_text: true,
                search_images: true,
                filters: mergedFilters,
                project_name: mergedFilters.project_name,
                client_name: mergedFilters.client_name
            }
        };
    }

    // 2. Mantis Mode (Direct to Mantis Strategy - NO document search)
    if (chatMode === 'mantis') {
        const mergedFilters = mergeMantisFilters(mantisContext, state.config.filters || {});
        Logger.info('[MasterGraph] UI Mode: Mantis -> Direct Mantis Search ONLY');
        return {
            intent: {
                strategy: 'mantis',
                search_mantis: true,
                search_text: false,
                search_images: false,
                filters: mergedFilters,
                project_name: mergedFilters.project_name,
                client_name: mergedFilters.client_name
            }
        };
    }

    // 3. Agent Mode (ReAct Agent with full capabilities)
    if (chatMode === 'agent') {
        const mergedFilters = mergeMantisFilters(mantisContext, state.config.filters || {});
        Logger.info('[MasterGraph] UI Mode: Agent -> ReAct Agent v7.0 (parallel RAG + SQL reasoning)');
        return {
            intent: {
                strategy: 'react_agent',
                search_text: true,
                search_images: true,
                search_mantis: true,
                filters: mergedFilters,
                project_name: mergedFilters.project_name,
                client_name: mergedFilters.client_name
            }
        };
    }

    // 4. Fallback Path (for unknown modes only)
    const lowerQuery = lastMessage.toLowerCase();

    // Explicit command tags remain deterministic; all other routing is AI-first.
    if (lowerQuery.includes('@lab') || lowerQuery.includes('@virtuallab') || lowerQuery.includes('@deepresearch')) {
        Logger.info('[MasterGraph] Heuristic Match: Virtual Lab Strategy (Concurrency)');
        return {
            intent: {
                strategy: 'virtual_lab',
                filters: state.config.filters || {}
            }
        };
    }

    // 2. AI-based Intent Analysis (Pure Agentic Routing)

    let aiIntent = null;
    Logger.info('[MasterGraph] Calling Smart AI Router (Pure Agentic)...');
    aiIntent = await LLMService.analyzeIntent(lastMessage, history, { pureAgentic: true });

    // Unload intent model immediately
    const intentModel = process.env.OLLAMA_INTENT_MODEL || process.env.OLLAMA_CHAT_MODEL;
    LLMService.freeVram(intentModel).catch(e => console.warn(`[MasterGraph] Async VRAM free failed: ${e.message}`));

    // Combine results
    const finalIntent = {
        strategy: aiIntent?.strategy || (chatMode === 'doc' ? 'fast' : 'agentic_rag'),
        search_mantis: Boolean(aiIntent?.search_mantis),
        search_text: aiIntent?.search_text ?? true,
        search_images: aiIntent?.search_images ?? true,
        filters: {
            ...(hasMantisContext && aiIntent?.search_mantis ? mantisContext : {}),
            ...aiIntent?.filters,
            ...(state.config.filters || {})
        }
    };

    if (hasMantisContext && aiIntent?.search_mantis) {
        finalIntent.filters = mergeMantisFilters(mantisContext, mergeMantisFilters(aiIntent?.filters || {}, state.config.filters || {}));
    }

    if (finalIntent.filters?.project_name && !finalIntent.project_name) {
        finalIntent.project_name = finalIntent.filters.project_name;
    }
    if (finalIntent.filters?.client_name && !finalIntent.client_name) {
        finalIntent.client_name = finalIntent.filters.client_name;
    }

    // If AI explicitly picked Mantis, route to Mantis handler.
    const suggestsMantis = finalIntent.strategy === 'mantis' || finalIntent.search_mantis;

    if (suggestsMantis) {
        finalIntent.strategy = 'mantis';
        finalIntent.search_mantis = true;
        Logger.info('[MasterGraph] Smart Route: Mantis detected (AI)');
        return { intent: finalIntent };
    }

    // Otherwise respect the chatMode for orchestrating the RAG
    if (chatMode === 'agent' && finalIntent.strategy === 'fast') {
        // AI said fast, but agent mode is on → upgrade to ReAct Agent for better coverage
        finalIntent.strategy = 'react_agent';
        finalIntent.search_mantis = true;
    }

    Logger.info(`[MasterGraph] Final Route: ${finalIntent.strategy}`);
    return { intent: finalIntent };
}

/**
 * COORDINATOR NODE:
 * Hands off the actual work to the selected strategy or orchestrates multiple for Virtual Lab.
 */
export async function nodeCoordinator(state) {
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

/**
 * CONSENSUS NODE:
 * Merges parallel reports into a final answer.
 */
export async function nodeConsensus(state) {
    const { sub_results, config, messages } = state;
    const lastMessage = messages[messages.length - 1].content;

    Logger.info(`[MasterGraph] 🟢 VIRTUAL LAB CONSENSUS: Merging ${sub_results.length} reports`);

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
        consensusPrompt,
        '',
        { temperature: 0.3 },
        config.res,
        consensusThoughts
    );

    consensusThoughts[1].status = 'completed';
    config.res.write(`data: ${JSON.stringify({ type: 'thoughts', thoughts: consensusThoughts })}\n\n`);

    config.res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    config.res.end();

    return { result: { content: finalContent, type: 'consensus' } };
}
