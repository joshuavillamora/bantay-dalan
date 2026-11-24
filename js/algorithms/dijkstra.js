// With nonnegative weights, the next unsettled node with the smallest cost can be finalized.
import { bestFirst } from './best-first.js';
export const dijkstra = (g, s, t, mode) => bestFirst(g, s, t, mode);
