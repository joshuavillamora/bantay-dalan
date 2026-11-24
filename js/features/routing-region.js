import { emit, on } from '../events.js';
import { state } from '../state.js';
import { $, setMessage } from '../utils/dom.js';
import { setLoadedGraph } from '../graph/road-graph.js';
import { defaultRegion, routingRegions } from '../graph/region-manifest.js';
import { createRegionManager } from '../graph/regions.js';
import { showLocalRoads } from '../map/map.js';
import { connectionMessage } from './route-status.js';

const regions = createRegionManager(routingRegions, {
  progress(region, phase, percent) {
    $('regionProgress').hidden = !region;
    $('regionCancel').hidden = !region;
    const message = region
      ? `${region.name} · ${phase}${percent === undefined ? '…' : ` ${percent}%`}`
      : '';
    if ($('regionProgress').textContent !== message) $('regionProgress').textContent = message;
  },
  activate({ region, graph }) {
    graph.region = region;
    setLoadedGraph(graph);
    showLocalRoads(graph, region === defaultRegion);
    $('routingRegion').value = region.id;
    emit('graph:ready', graph);
  }
});

export const regionsForPoint = point => regions.forPoint(point);
export const selectDefaultRegion = () => regions.select(defaultRegion);
export const cancelRegionLoad = () => regions.cancel();

const loadError = 'Could not load the routing region. Try again. The previous network is still available.';

export const currentTripGraph = () => regions.currentTrip(state.start, state.end);

export async function prepareTripRegion() {
  const { start, end, mode } = state;
  try {
    const result = await regions.forTrip(start, end, mode);
    if (result.cancelled || state.start !== start || state.end !== end || state.mode !== mode) return {};
    return result.reason ? { reason: result.reason, message: connectionMessage(result.reason) } : result;
  } catch (error) {
    console.error('Routing region load failed', error);
    return { reason: 'loadFailed', message: loadError };
  }
}

export function initRoutingRegion() {
  const select = $('routingRegion');
  for (const region of routingRegions) select.append(new Option(region.name, region.id));
  select.onchange = async () => {
    const requested = routingRegions.find(region => region.id === select.value);
    select.value = regions.active?.region.id ?? defaultRegion.id;
    setMessage();
    try { await regions.select(requested); }
    catch (error) { console.error('Routing region load failed', error); setMessage(loadError); }
  };
  $('regionCancel').onclick = () => { cancelRegionLoad(); setMessage('Road network loading cancelled.'); };
  on('graph:ready', () => { select.disabled = false; });
  const cancelSwitch = () => { if (regions.active) cancelRegionLoad(); };
  on('route:changed', cancelSwitch);
  on('settings:changed', cancelSwitch);
  on('workspace:changed', cancelSwitch);
}
