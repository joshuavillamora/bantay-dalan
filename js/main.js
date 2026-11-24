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
import { initRoutingRegion, selectDefaultRegion } from './features/routing-region.js';
import { showStudyArea } from './map/map.js';
import { $, setMessage } from './utils/dom.js';

initWorkspace();
initAlgorithmPanel();
initClosures();
initRoutePoints();
initPlaceSearch();
initChokepoints();
initRunController();
initComparison();
initRoutingRegion();
initWelcome();
setDefaultPoints();
showStudyArea();

async function initializeGraph() {
  $('graphRetry').hidden = true;
  setStatus('Loading road network…');
  setMessage();
  try {
    const result = await selectDefaultRegion();
    if (result.cancelled) {
      setStatus('Road network loading cancelled');
      $('graphRetry').hidden = false;
    }
  } catch (error) {
    console.error('Could not load the default road graph', error);
    setStatus('Road network unavailable');
    setMessage('Could not load the road data. Open the app on localhost or HTTPS, then retry.');
    $('graphRetry').hidden = false;
  }
}
$('graphRetry').onclick = initializeGraph;
initializeGraph();
