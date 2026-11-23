/* Helpers shared by the search algorithms.
   Every algorithm is a generator:  run(graph, startNode, goalNode, mode, closures)
   - yields { u, p, found, q } once per expanded road node (so the UI can animate it)
   - returns the path as an array of node indices, or null if there is no route. */
import { hav } from '../utils/geo.js';
import { MAX_SPEED_MS } from '../config.js';

/* cost of one road segment: seconds in 'fast' mode, metres in 'short' mode */
export const edgeCost = (mode, d, sp) => mode === 'fast' ? d / (sp / 3.6) : d;

/* straight-line estimate from node v to the goal, in the same unit as edgeCost */
export const heuristic = (g, goal, mode) => v =>
  hav(g.lat[v], g.lng[v], g.lat[goal], g.lng[goal]) / (mode === 'fast' ? MAX_SPEED_MS : 1);

/* follow prev[] pointers back from the goal */
export function tracePath(prev, goal) {
  const path = [];
  for (let v = goal; v >= 0; v = prev[v]) path.push(v);
  return path.reverse();
}
