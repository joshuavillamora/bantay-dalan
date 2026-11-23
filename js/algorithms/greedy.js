/* Greedy best-first: only looks at the straight-line estimate. Fast and focused, but the route may be longer. */
import { bestFirst } from './best-first.js';
export const greedy = (g, s, t, mode) => bestFirst(g, s, t, mode, { priority: (cost, est) => est, greedy: true });
