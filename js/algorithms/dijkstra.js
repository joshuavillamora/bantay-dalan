/* Dijkstra: always expands the cheapest road next. Guarantees the best route. */
import { bestFirst } from './best-first.js';
export const dijkstra = (g, s, t, mode) => bestFirst(g, s, t, mode);
