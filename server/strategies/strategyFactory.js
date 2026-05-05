/**
 * 🏭 Strategy Factory
 * Selects the appropriate strategy based on the Router's intent.
 */
import { FastStrategy } from './fast/fastStrategy.js';
import { DeepStrategy } from './deep/deepStrategy.js';
import { SqlStrategy } from './sql/sqlStrategy.js';
import { MantisStrategy } from './mantis/mantisStrategy.js';
import { AgenticRagStrategy } from './agentic/agenticRagStrategy.js';
import { ReActAgentStrategy } from './react/reactAgentStrategy.js';

// Singleton Instances
const fastStrategy = new FastStrategy();
const deepStrategy = new DeepStrategy();
const sqlStrategy = new SqlStrategy();
const mantisStrategy = new MantisStrategy();
const agenticRagStrategy = new AgenticRagStrategy();
const reactAgentStrategy = new ReActAgentStrategy();

export class StrategyFactory {
    /**
     * Returns the correct strategy based on intent.
     * @param {object} intent - The analyzed intent (strategy: 'fast' | 'deep' | 'sql_query')
     * @returns {object} The strategy instance
     */
    static getStrategy(intent) {
        if (intent.sql_query_needed || intent.strategy === 'sql_query') {
            console.log(`[Factory] Selected: SQL Strategy`);
            return sqlStrategy;
        }

        if (intent.strategy === 'deep') {
            console.log(`[Factory] Selected: DEEP Strategy`);
            return deepStrategy;
        }

        if (intent.search_mantis || intent.strategy === 'mantis') {
            console.log(`[Factory] Selected: MANTIS Agent Strategy`);
            return mantisStrategy;
        }

        // ReAct Agent (v7.0): UI agent mode toggle → always retrieves docs+mantis then SQL loop
        if (intent.strategy === 'react_agent') {
            console.log(`[Factory] Selected: ReAct Agent Strategy (v7.0 — parallel RAG + SQL loop)`);
            return reactAgentStrategy;
        }

        // Feature Flag: If environment variable is set or Intent forces agentic_rag, use new ReAct node
        if (intent.strategy === 'agentic_rag' || process.env.ENABLE_AGENTIC_RAG === 'true') {
            console.log(`[Factory] Selected: Agentic RAG Strategy (Deep Research Loop)`);
            return agenticRagStrategy;
        }

        // Default to Fast
        console.log(`[Factory] Selected: FAST Strategy`);
        return fastStrategy;
    }
}
