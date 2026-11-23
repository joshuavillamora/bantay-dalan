/* Initialise the workbench and load the local network for all four modes. */
import { initAlgorithmPanel } from './features/algorithm-panel.js';
import { initClosures } from './features/closures.js';
import { initRoutePoints, setDefaultPoints } from './features/route-points.js';
import { initPlaceSearch } from './features/place-search.js';
import { initChokepoints } from './features/chokepoints.js';
import { initRunController } from './features/run-controller.js';
import { initComparison } from './features/comparison.js';
import { initWorkspace } from './ui/workspace.js';
import { initWelcome } from './ui/welcome.js';
import { setStatus } from './ui/dashboard.js';
import { emit } from './events.js';
import { loadGraph } from './graph/road-graph.js';
import { showLocalRoads, showStudyArea } from './map/map.js';
import { $, setMessage } from './utils/dom.js';

initWorkspace();
initAlgorithmPanel();
initClosures();
initRoutePoints();
initPlaceSearch();
initChokepoints();
initRunController();
initComparison();
initWelcome();
setDefaultPoints();

async function initializeGraph() {
  $('graphRetry').hidden = true;
  setStatus('Loading road network…');
  setMessage();
  try {
    const graph = await loadGraph();
    showLocalRoads(graph);
    showStudyArea();
    emit('graph:ready', graph);
  } catch {
    setStatus('Road network unavailable');
    setMessage('Could not load the local road data. Start the project with a local web server, then retry.');
    $('graphRetry').hidden = false;
  }
}
$('graphRetry').onclick = initializeGraph;
initializeGraph();
