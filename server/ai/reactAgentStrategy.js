import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatOllama } from "@langchain/ollama";
import { BaseStrategy } from '../baseStrategy.js';
import RagConfig from '../../config/ragConfig.js';
import { HumanMessage, SystemMessage, AIMessage } from "@langchain/core/messages";

// Tools
import { codebaseTool } from './tools/codebaseTool.js';
import { mantisTool } from './tools/mantisTool.js';
import { sqlTool } from './tools/sqlTool.js';

const TOOLS = [codebaseTool, mantisTool, sqlTool];

export class ReActAgentStrategy extends BaseStrategy {
    constructor() {
        super();
        this.agent = this.buildAgent();
    }

    buildAgent() {
        const llm = new ChatOllama({
            baseUrl: process.env.OLLAMA_HOST,
            model: RagConfig.llm.model,
            temperature: 0.1,
            numCtx: RagConfig.llm.numCtx || 8192,
        });

        // Initialize the low-code ReAct agent from LangChain
        return createReactAgent({
            llm,
            tools: TOOLS,
        });
    }

    async execute(query, intent, sessionId, user, res, history) {
        try {
            let thoughts = [{ id: 'ag-init', icon: 'bot', description: 'LangChain ReAct Agent Activated...', status: 'completed' }];
            this.sendThoughts(res, thoughts);

            const systemPrompt = `You are a helpful and intelligent assistant. You have access to tools that can search the codebase, check mantis bugs, and run SQL queries.
Use the appropriate tools to answer the human's question. 
If filtering tools by project_name is an option, use the following context if applicable:
Client Name: ${intent?.client_name || 'N/A'}
Project Name: ${intent?.project_name || 'N/A'}

Tool Usage Rules:
- If the human asks about "recent bugs", "บัคช่วงนี้", or something broadly involving time, you should use the \`search_mantis_bugs\` tool and provide an estimated \`from_date\` (e.g., '2024-01-01' or a month ago) and \`to_date\` (today's date) to narrow down the search.

Output Formatting Rules:
- Always answer in Thai but keep technical keywords in English. 
- Provide a final comprehensive answer formatting in markdown.
- 🔴 CRITICAL TIME RULE: If presenting dates/months from the database, ensure correct Thai translations (e.g., "03" or "March" MUST translate to "มีนาคม", NOT "มกราคม"). DO NOT hallucinate month names.`;

            // Transform previous history if valid
            const previousMessages = (history || []).map(m => {
                if (m.role === 'user') return new HumanMessage(m.content);
                if (m.role === 'assistant') return new AIMessage(m.content);
                return new AIMessage(m.content); // Default fallback
            });

            // Setup input
            const inputMessages = [
                new SystemMessage(systemPrompt),
                ...previousMessages,
                new HumanMessage(query)
            ];

            let finalContent = "";
            let toolCallCount = 0;
            let generatingFinalAnswer = false;

            // Stream from the agent using Event Streaming API
            const stream = await this.agent.streamEvents(
                { messages: inputMessages },
                { version: "v2" }
            );

            for await (const event of stream) {
                if (event.event === "on_chat_model_stream") {
                    // Streaming Tokens back to UI once we are generating the actual message 
                    // (Ollama tool calls might also stream, but usually as blank or specific tool_call chunks)
                    if (event.data.chunk?.content) {
                        if (!generatingFinalAnswer) {
                            generatingFinalAnswer = true;
                            const t = { id: `react-answer`, icon: 'sparkles', description: `กำลังสังเคราะห์คำตอบสุดท้าย...`, status: 'active' };
                            thoughts.filter(th => th.status === 'active').forEach(th => th.status = 'completed');
                            thoughts.push(t);
                            this.sendThoughts(res, thoughts);
                        }

                        finalContent += event.data.chunk.content;
                        res.write(`data: ${JSON.stringify({ type: 'token', content: event.data.chunk.content })}\n\n`);
                    }
                }
                else if (event.event === "on_tool_start") {
                    generatingFinalAnswer = false;
                    toolCallCount++;
                    const toolName = event.name;
                    const toolInput = event.data.input;

                    const t = {
                        id: `tool-${toolCallCount}`,
                        icon: 'zap',
                        description: `เรียกใช้เครื่องมือ ${toolName}: ${JSON.stringify(toolInput)}`,
                        status: 'active'
                    };

                    // Complete previous active thoughts
                    thoughts.filter(th => th.status === 'active').forEach(th => th.status = 'completed');
                    thoughts.push(t);
                    this.sendThoughts(res, thoughts);
                }
                else if (event.event === "on_tool_end") {
                    const activeThought = thoughts.find(th => th.status === 'active');
                    if (activeThought) {
                        activeThought.description = `✅ ได้รับข้อมูลจาก ${event.name} เรียบร้อยแล้ว`;
                        activeThought.status = 'completed';
                        this.sendThoughts(res, thoughts);
                    }
                }
            }

            thoughts.filter(th => th.status === 'active').forEach(th => th.status = 'completed');
            this.sendThoughts(res, thoughts);

            this.endStream(res);
            return { content: finalContent, thoughts };
        } catch (err) {
            this.handleError(res, err);
            throw err;
        }
    }
}
