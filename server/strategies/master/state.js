/**
 * 📦 Master Orchestrator State Definition
 */

import { Annotation } from "@langchain/langgraph";

export const MasterState = Annotation.Root({
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
