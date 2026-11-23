/* Algorithm registry. To add an algorithm: write a generator file and add one entry here;
   the dropdown, descriptions and comparison table pick it up automatically.
   handlesClosures: true means the algorithm tracks closures itself (it receives the unfiltered graph). */
import { astar } from './astar.js';
import { dijkstra } from './dijkstra.js';
import { bidirectional } from './bidirectional.js';
import { lpaSearch } from './lpa-star.js';

export const ALGORITHMS = {
  astar:{name:'A*',run:astar,info:'Adds the cost so far to a straight-line guess of what is left. Explores far fewer roads than Dijkstra and still finds the best route.'},
  dijkstra:{name:'Dijkstra',run:dijkstra,info:'Always explores the cheapest road next, so it spreads out in every direction. Guarantees the best route.'},
  bidir:{name:'Bidirectional Dijkstra',run:bidirectional,info:'Runs Dijkstra from the start and from the destination at the same time, and stops when the two searches meet. Finds the same best route as Dijkstra but explores far fewer roads.'},
  lpa:{name:'LPA*',run:lpaSearch,handlesClosures:true,info:'Lifelong Planning A*. Searches like A* the first time, but remembers what it learned. Draw or remove a road closure afterwards and it repairs only the part that changed instead of starting over.'}
};
