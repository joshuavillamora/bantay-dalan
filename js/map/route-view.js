/* The active search position, current route, and its pre-closure reference. */
import { map, reducedMotion, setLegend, tooltipText } from './map.js';

let head, pathLine, pathCase, previous, pathRaf;

export function showHead(g, i) {
  hideHead();
  head = L.marker([g.lat[i], g.lng[i]], {
    icon: L.divIcon({ className: '', html: '<div class="head"></div>', iconSize: [14, 14], iconAnchor: [7, 7] }),
    interactive: false, keyboard: false
  }).addTo(map);
}
export const moveHead = (g, i) => head?.setLatLng([g.lat[i], g.lng[i]]);
export function hideHead() { head?.remove(); head = null; }

export const cancelRouteAnimation = () => cancelAnimationFrame(pathRaf);
export function clearRoute() {
  cancelRouteAnimation();
  hideHead();
  pathLine?.remove(); pathCase?.remove();
  pathLine = pathCase = null;
  setLegend('route', false);
}

export function showPreviousRoute(points) {
  previous?.remove();
  previous = points?.length > 1 ? L.polyline(points, {
    pane: 'previousRoute', className: 'analysis-outline', color: '#626b75', weight: 5, dashArray: '8 7', interactive: false
  }).addTo(map) : null;
  setLegend('previous', !!previous);
}

export function animateRoute(points, stillCurrent, animate = true) {
  const hasLine = points.length > 1;
  pathCase = L.polyline([], { color: '#fff', weight: 9, opacity: .94, interactive: false }).addTo(map);
  pathLine = L.polyline([], { color: '#1e4ba8', weight: 5, bubblingMouseEvents: false })
    .bindTooltip(tooltipText('Current route'), { sticky: true }).addTo(map);
  setLegend('route', hasLine);
  const perFrame = animate && !reducedMotion() ? Math.max(4, Math.ceil(points.length / 20)) : points.length;
  let shown = 0;
  const draw = () => {
    if (!stillCurrent()) return;
    shown += perFrame;
    const segment = points.slice(0, shown);
    pathCase.setLatLngs(segment); pathLine.setLatLngs(segment);
    if (shown < points.length) pathRaf = requestAnimationFrame(draw);
  };
  draw();
}
