/* Keep the active graph usable until the explicitly requested network is ready. */
import { ROUTE_ROAD_PROXIMITY_METRES } from '../config.js';
import { fetchRoadGraph, snapRouteEndpoints } from './road-graph.js';

export function pointInRegion(region, [lat, lng]) {
  const [west, south, east, north] = region.bounds;
  const dy = ROUTE_ROAD_PROXIMITY_METRES / 110000;
  const dx = dy / Math.cos(lat * Math.PI / 180);
  return lat >= south - dy && lat <= north + dy && lng >= west - dx && lng <= east + dx;
}

export function createRegionManager(regions, { load = fetchRoadGraph, progress = () => {}, activate = () => {} } = {}) {
  let active, request, settled = Promise.resolve();
  const forPoint = point => point ? regions.filter(region => pointInRegion(region, point)) : [];
  const forPair = (start, end) => {
    const ends = forPoint(end);
    return forPoint(start).filter(region => ends.includes(region));
  };
  const cancel = () => request?.abort();

  async function select(region) {
    if (!regions.includes(region)) throw Error('Unknown road network');
    cancel();
    const job = request = new AbortController();
    const { signal } = job;
    const prior = settled;
    let finish;
    settled = new Promise(resolve => { finish = resolve; });
    const notify = (region, phase, percent) => { if (request === job) progress(region, phase, percent); };
    try {
      // Let the aborted job release its candidate before starting another graph load.
      await prior;
      signal.throwIfAborted();
      if (active?.region !== region) {
        notify(region, 'Requesting roads');
        const graph = await load(region.url, {
          dataset: region, signal, onProgress: (phase, percent) => notify(region, phase, percent)
        });
        signal.throwIfAborted();
        active = { region, graph };
        activate(active);
      }
      return { graph: active.graph };
    }
    catch (error) {
      if (signal.aborted) return { cancelled: true };
      throw error;
    } finally {
      if (request === job) { request = undefined; progress(); }
      finish();
    }
  }

  return {
    get active() { return active; },
    forPoint,
    currentTrip(start, end) {
      if (!active || !start || !end) return;
      const { s, t } = snapRouteEndpoints(active.graph, start, end);
      if (s < 0 || t < 0) return;
      return active.graph;
    },
    cancel,
    select,
    suggestTrip(start, end) {
      if (!forPoint(start).length || !forPoint(end).length) return { reason: 'outside' };
      const candidates = forPair(start, end);
      if (!candidates.length) return { reason: 'differentRegions' };
      const alternative = candidates.find(region => region !== active?.region);
      return { reason: !candidates.includes(active?.region) ? 'outsideActive' : 'noRoad', alternative };
    }
  };
}
