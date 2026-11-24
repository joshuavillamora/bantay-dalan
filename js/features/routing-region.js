import { emit, on } from '../events.js';
import { state } from '../state.js';
import { $, setMessage } from '../utils/dom.js';
import { setLoadedGraph } from '../graph/road-graph.js';
import { initialRegion, presentationRegion, routingRegions } from '../graph/region-manifest.js';
import { createRegionManager } from '../graph/regions.js';
import { setMapRegion, showLocalRoads } from '../map/map.js';
import { connectionMessage } from './route-status.js';
import { regionGroups, regionLabel } from '../ui/region-labels.js';
import { initRegionPicker } from '../ui/region-picker.js';

const regions = createRegionManager(routingRegions, {
  progress(region, phase, percent) {
    $('regionProgress').hidden = !region;
    $('regionCancel').hidden = !region;
    const message = region
      ? `${regionLabel(region)} · ${phase}${percent === undefined ? '…' : ` ${percent}%`}`
      : '';
    if ($('regionProgress').textContent !== message) $('regionProgress').textContent = message;
  },
  activate({ region, graph }) {
    graph.region = region;
    setLoadedGraph(graph);
    showLocalRoads(graph, region === presentationRegion || region.id.startsWith('iloilo-'));
    $('routingRegion').value = region.id;
    $('routingRegion').title = regionLabel(region);
    const [west, south, east, north] = region.bounds.map(value => value.toFixed(2));
    const extent = `${south}–${north}° N, ${west}–${east}° E`;
    const area = region.coverageUrl
      ? `Network prepared from the mapped boundary of ${regionLabel(region)} within ${extent}. The outline shows the reference boundary. Real bridges can extend over water between anchors in the same region.`
      : region.scope === 'iloilo-city-province'
      ? `Iloilo City and 43 provincial cities and municipalities within ${extent}. The extract follows municipal boundaries.`
      : `Prepared road extract for ${regionLabel(region)} within ${extent}.`;
    $('networkCoverage').textContent = `${area} Routes require connected modeled roads in one network. Ferries are unavailable.`;
    emit('graph:ready', graph);
    setMapRegion(region, !(region === presentationRegion && firstLoad &&
      new URLSearchParams(location.search).get('network') === presentationRegion.id));
    firstLoad = false;
  }
});

export const regionsForPoint = point => regions.forPoint(point);
let firstLoad = true;
export const selectDefaultRegion = () => regions.select(initialRegion);
export const cancelRegionLoad = () => regions.cancel();

const loadError = 'Could not load the routing region. Try again. The previous network is still available.';

export const currentTripGraph = () => regions.currentTrip(state.start, state.end);

export function prepareTripRegion() {
  const graph = currentTripGraph();
  if (graph) return { graph };
  const { reason, alternative } = regions.suggestTrip(state.start, state.end);
  const offer = $('tripRegionOffer');
  offer.hidden = !alternative;
  offer.textContent = alternative ? `Switch to ${regionLabel(alternative)}` : '';
  offer.onclick = alternative ? () => selectRoutingRegion(alternative) : null;
  return { reason, message: connectionMessage(reason) };
}

export async function selectRoutingRegion(region) {
  setMessage();
  try { return await regions.select(region); }
  catch (error) { console.error('Routing region load failed', error); setMessage(loadError); }
}

export function initRoutingRegion() {
  const select = $('routingRegion');
  for (const [name, entries] of regionGroups) {
    const group = document.createElement('optgroup');
    group.label = name;
    for (const [id, label] of entries) {
      if (routingRegions.some(region => region.id === id)) group.append(new Option(label, id));
    }
    if (group.childElementCount) select.append(group);
  }
  // A newly prepared graph remains selectable before a geographic group is assigned.
  for (const region of routingRegions) {
    if (![...select.options].some(option => option.value === region.id)) select.append(new Option(regionLabel(region), region.id));
  }
  select.value = initialRegion.id;
  select.onchange = async () => {
    const requested = routingRegions.find(region => region.id === select.value);
    select.value = regions.active?.region.id ?? initialRegion.id;
    await selectRoutingRegion(requested);
  };
  $('regionCancel').onclick = () => { cancelRegionLoad(); setMessage('Road network loading cancelled.'); };
  const syncPicker = initRegionPicker(select);
  const hideOffer = () => { $('tripRegionOffer').hidden = true; };
  on('graph:ready', () => { select.disabled = false; syncPicker(); hideOffer(); });
  const cancelSwitch = () => { if (regions.active) cancelRegionLoad(); };
  on('route:changed', () => { cancelSwitch(); hideOffer(); });
  on('settings:changed', cancelSwitch);
  on('workspace:changed', cancelSwitch);
}
