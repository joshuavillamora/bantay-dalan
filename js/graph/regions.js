/* Only the active graph and one candidate are held by the loader. */
import { ROUTE_ROAD_PROXIMITY_METRES } from '../config.js';
import { astar } from '../algorithms/astar.js';
import { runInSlices } from '../utils/work-slices.js';
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

  async function run(action) {
    cancel();
    const job = request = new AbortController();
    const { signal } = job;
    const prior = settled;
    let finish;
    settled = new Promise(resolve => { finish = resolve; });
    const notify = (region, phase, percent) => { if (request === job) progress(region, phase, percent); };
    const read = async region => {
      if (active?.region === region) return active;
      notify(region, 'Requesting roads');
      const graph = await load(region.url, {
        dataset: region, signal, onProgress: (phase, percent) => notify(region, phase, percent)
      });
      signal.throwIfAborted();
      return { region, graph };
    };
    const commit = candidate => {
      signal.throwIfAborted();
      if (candidate !== active) {
        active = candidate;
        activate(candidate);
      }
      return { graph: active.graph };
    };
    try {
      // Let the aborted job release its candidate before starting another graph load.
      await prior;
      signal.throwIfAborted();
      return await action(read, commit, signal, notify);
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
      const candidates = forPair(start, end);
      if (candidates.length !== 1 || candidates[0] !== active?.region) return;
      const { s, t } = snapRouteEndpoints(active.graph, start, end);
      if (s < 0 || t < 0) return;
      cancel();
      return active.graph;
    },
    cancel,
    select: region => run(async (read, commit) => commit(await read(region))),
    forTrip: (start, end, mode) => run(async (read, commit, signal, notify) => {
      if (!forPoint(start).length || !forPoint(end).length) return { reason: 'outside' };
      const candidates = forPair(start, end);
      if (!candidates.length) return { reason: 'differentRegions' };
      // Keep the current scenario in an overlap if it already models the journey.
      if (active && candidates.includes(active.region)) {
        candidates.splice(candidates.indexOf(active.region), 1);
        candidates.unshift(active.region);
      }
      let activeDisconnected = false, disconnected = false;
      for (const region of candidates) {
        const candidate = await read(region);
        const { graph } = candidate;
        const { s, t } = snapRouteEndpoints(graph, start, end);
        if (s < 0 || t < 0) continue;
        if (candidates.length === 1) return commit(candidate);
        notify(region, 'Checking connections');
        const path = await runInSlices(astar(graph, s, t, mode), { keepGoing: () => !signal.aborted });
        signal.throwIfAborted();
        if (path.value) return commit(candidate);
        activeDisconnected ||= candidate === active;
        disconnected = true;
      }
      if (activeDisconnected) return commit(active);
      return { reason: disconnected ? 'disconnected' : 'noRoad' };
    })
  };
}
