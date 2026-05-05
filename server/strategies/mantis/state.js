/**
 * 📦 Mantis Graph State Definition
 */

import { BaseMessage } from "@langchain/core/messages";

export const GraphState = {
    sessionId: {
        value: (x, y) => y || x,
        default: () => null,
    },
    messages: {
        value: (x, y) => x.concat(y),
        default: () => [],
    },
    query: {
        value: (x, y) => y,
        default: () => "",
    },
    intent: {
        value: (x, y) => { return { ...x, ...y, filters: { ...x?.filters, ...y?.filters } } },
        default: () => ({}),
    },
    needs_clarification: {
        value: (x, y) => y,
        default: () => false,
    },
    clarification_message: {
        value: (x, y) => y,
        default: () => "",
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
