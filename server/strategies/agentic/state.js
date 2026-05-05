/**
 * 📦 Agentic RAG State Definition
 * Part of Phase 5.3: High Precision & Diversity
 */

export const GraphState = {
    query: { value: (x, y) => y !== undefined ? y : x, default: () => "" },
    intent: { value: (x, y) => ({ ...x, ...y }), default: () => ({}) },
    search_plan: { value: (x, y) => y || x, default: () => [] },
    search_history: { value: (x, y) => [...(x || []), ...(y || [])], default: () => [] },
    documents: {
        value: (x, y) => {
            if (!y || y.length === 0) return x;
            // Prevent exact ID duplicates
            const existingIds = new Set(x.map(d => d.id));
            return [...x, ...y.filter(d => !existingIds.has(d.id))];
        },
        default: () => [],
    },
    sql_results: { value: (x, y) => [...(x || []), ...(y || [])], default: () => [] },
    sql_errors: { value: (x, y) => [...(x || []), ...(y || [])], default: () => [] },
    knowledge_map: { value: (x, y) => y || x, default: () => null },
    feedback: { value: (x, y) => y !== undefined ? y : x, default: () => "" },
    loop_count: { value: (x, y) => y !== undefined ? y : x, default: () => 0 },
    final_response: { value: (x, y) => y !== undefined ? y : x, default: () => "" },
    reflection_passed: { value: (x, y) => y !== undefined ? y : x, default: () => false },
    sub_agent_reports: { value: (x, y) => [...(x || []), ...(y || [])], default: () => [] },

    thoughts: {
        value: (x, y) => {
            const current = [...x];
            if (!y) return current;
            y.forEach(newThought => {
                const idx = current.findIndex(t => t.id === newThought.id);
                if (idx >= 0) current[idx] = { ...current[idx], ...newThought };
                else current.push(newThought);
            });
            return current;
        },
        default: () => [],
    }
};

export const MAX_LOOPS = 3;
export const MAX_DOCS_IN_STATE = 40;  // Pre-rerank cap
export const MAX_DOCS_FINAL = 12;     // Post-rerank cap
