/* A*: cost so far + straight-line estimate of what is left. Best route, far fewer roads explored. */
import { bestFirst } from './best-first.js';
export const astar = (g, s, t, mode) => bestFirst(g, s, t, mode, { priority: (cost, est) => cost + est });
