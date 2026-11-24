/* Three evaluated searches and one independently verified reference search. */
import { astar } from './astar.js';
import { dijkstra } from './dijkstra.js';
import { bidirectional } from './bidirectional.js';
import { lpaSearch } from './lpa-star.js';

export const ALGORITHMS = {
  bidir: { name: 'Bidirectional Dijkstra', run: bidirectional, info: 'Searches from both ends of the trip.' },
  astar: { name: 'A*', run: astar, info: 'Uses a straight-line estimate to guide the search.' },
  lpa: { name: 'LPA*', run: lpaSearch, handlesClosures: true, info: 'Can reuse search state when roads close or reopen.' },
  dijkstra: { name: 'Dijkstra (baseline)', run: dijkstra, baseline: true }
};
