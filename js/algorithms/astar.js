// A* adds a lower bound on the remaining cost to each queue priority.
import { bestFirst } from './best-first.js';
export const astar = (g, s, t, mode, workspace) => bestFirst(g, s, t, mode, true, workspace);
