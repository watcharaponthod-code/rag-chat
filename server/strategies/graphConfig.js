import { MantisStrategy } from './mantisStrategy.js';
import { AgenticRagStrategy } from './agenticRagStrategy.js';

const mantisStrategy = new MantisStrategy();
export const mantisGraph = mantisStrategy.graph;

const agenticStrategy = new AgenticRagStrategy();
export const agenticGraph = agenticStrategy.graph;
