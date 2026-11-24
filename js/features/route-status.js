import { shortestPath } from '../algorithms/solve.js';

export function connectionMessage(reason) {
  if (reason === 'outside') return "This location is outside CHOKEPOINT's current routing coverage.";
  if (reason === 'differentRegions') return 'No loaded or downloadable road network covers both endpoints. A route across separate datasets is unavailable.';
  if (reason === 'disconnected') return 'These locations are not connected in the modeled road network.';
  return 'No suitable modeled road connection was found near this location.';
}

// A closure-related failure requires a route between the same endpoints on the open graph.
export function noRouteMessage(base, s, t, mode, hasClosures) {
  return hasClosures && shortestPath(base, s, t, mode)
    ? 'No route is available under the current road closures.'
    : 'These locations are not connected in the modeled road network.';
}
