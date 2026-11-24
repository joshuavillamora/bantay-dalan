import { shortestPath } from '../algorithms/solve.js';

export function connectionMessage(reason) {
  return reason === 'outside'
    ? "This location is outside CHOKEPOINT's current road-network coverage."
    : 'No suitable road connection was found near this location.';
}

// A closure-related failure requires a route between the same endpoints on the open graph.
export function noRouteMessage(base, s, t, mode, hasClosures) {
  return hasClosures && shortestPath(base, s, t, mode)
    ? 'No route is available under the current road closures.'
    : 'These locations are not connected in the modeled road network.';
}
