import { shortestPath } from '../algorithms/solve.js';

export function connectionMessage(reason) {
  if (reason === 'outside') return "This location is outside CHOKEPOINT's current routing coverage.";
  if (reason === 'outsideActive') return 'This location is outside the selected road network.';
  if (reason === 'differentRegions') return 'No loaded or downloadable road network covers both endpoints. A route across separate datasets is unavailable.';
  if (reason === 'disconnected') return 'These locations are not connected in the modeled road network.';
  return 'No suitable modeled road connection was found near this location.';
}

// A closure-related failure requires a route between the same endpoints on the open graph.
export function noRouteMessage(base, s, t, mode, hasClosures) {
  if (hasClosures && shortestPath(base, s, t, mode)) return 'No route is available under the current road closures.';
  if (shortestPath(base, t, s, mode)) return 'No valid route exists in this direction in the modeled road network.';
  return 'No route was found between these locations in the selected road network.';
}
