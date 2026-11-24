/* The baseline participates in comparisons and stays out of the primary selector. */
import { astar } from './astar.js';
import { dijkstra } from './dijkstra.js';
import { bidirectional } from './bidirectional.js';
import { lpaSearch } from './lpa-star.js';

export const ALGORITHMS = {
  bidir: { name: 'Bidirectional Dijkstra', run: bidirectional, info: 'Searches from both endpoints, using the two frontiers to bound the best route cost.' },
  astar: { name: 'A*', run: astar, info: 'Uses a straight-line estimate to guide the search toward the destination.' },
  lpa: { name: 'LPA*', run: lpaSearch, handlesClosures: true, info: 'Lifelong Planning A* can reuse search state when roads close or reopen for the same trip.' },
  dijkstra: { name: 'Dijkstra (baseline)', run: dijkstra, baseline: true }
};
