/* Three evaluated searches and one independently verified reference search. */
import { astar } from './astar.js';
import { dijkstra } from './dijkstra.js';
import { bidirectional } from './bidirectional.js';
import { lpaSearch } from './lpa-star.js';

export const ALGORITHMS = {
  bidir: { name: 'Bidirectional Dijkstra', color: '#2563EB', backward: '#06B6D4', run: bidirectional, info: 'Searches from both ends of the trip.' },
  astar: { name: 'A*', color: '#D9A400', run: astar, info: 'Uses a straight-line estimate to guide the search.' },
  lpa: { name: 'LPA*', color: '#9333EA', run: lpaSearch, handlesClosures: true, info: 'Can reuse search state when roads close or reopen.' },
  dijkstra: { name: 'Dijkstra', color: '#64748B', run: dijkstra, baseline: true }
};

export const RETAINED_SEARCH_COLOR = '#8E78A8';
export const REPAIR_SEARCH_STYLE = { name: 'LPA* · incremental repair', color: '#C084FC' };
export const searchColor = (key, direction) => key === 'repair' ? REPAIR_SEARCH_STYLE.color
  : direction === 'backward' ? ALGORITHMS.bidir.backward : ALGORITHMS[key].color;
export const searchSwatch = ({ color, backward }) => backward
  ? `linear-gradient(90deg, ${color} 50%, ${backward} 50%)` : color;
