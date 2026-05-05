/**
 * 🕸️ Master Orchestrator Graph
 */

import { StateGraph, START, END } from "@langchain/langgraph";
import { MasterState } from "./state.js";
import * as Nodes from "./nodes.js";

// Edge Router
function determineNextStep(state) {
    if (state.requires_consensus) {
        return "consensus";
    }
    return "end";
}

// Define the Workflow
const workflow = new StateGraph(MasterState)
    .addNode("router", Nodes.nodeRouter)
    .addNode("coordinator", Nodes.nodeCoordinator)
    .addNode("consensus", Nodes.nodeConsensus)
    .addEdge(START, "router")
    .addEdge("router", "coordinator")
    .addConditionalEdges("coordinator", determineNextStep, {
        consensus: "consensus",
        end: END
    })
    .addEdge("consensus", END);

export const masterGraph = workflow.compile();
