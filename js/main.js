/* Entry point: initialise each feature, then set the default route. */
import { initAlgorithmPanel } from './features/algorithm-panel.js';
import { initClosures } from './features/closures.js';
import { initRoutePoints, setDefaultPoints } from './features/route-points.js';
import { initPlaceSearch } from './features/place-search.js';
import { initChokepoints } from './features/chokepoints.js';
import { initRunController } from './features/run-controller.js';
import { initWelcome } from './ui/welcome.js';

initAlgorithmPanel();
initClosures();
initRoutePoints();
initPlaceSearch();
initChokepoints();
initRunController();
setDefaultPoints();
initWelcome();
