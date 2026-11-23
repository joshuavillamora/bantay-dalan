/* The moving "search head" dot and the final route line (drawn with a short animation). */
import { map } from './map.js';

let head = null, pathLine = null, pathCase = null, pathRaf = null;

export function showHead(g, i) {
  hideHead();
  head = L.marker([g.lat[i], g.lng[i]], {
    icon: L.divIcon({ className: '', html: '<div class="head"></div>', iconSize: [14, 14], iconAnchor: [7, 7] }), interactive: false }).addTo(map);
}
export const moveHead = (g, i) => { if (head) head.setLatLng([g.lat[i], g.lng[i]]); };
export function hideHead() { if (head) { head.remove(); head = null; } }

export const cancelRouteAnimation = () => cancelAnimationFrame(pathRaf);
export function clearRoute() {
  cancelRouteAnimation();
  [pathLine, pathCase, head].forEach(x => x && x.remove());
  pathLine = pathCase = head = null;
}

/* draws pts progressively; stops if stillCurrent() turns false (a newer run started) */
export function animateRoute(pts, stillCurrent) {
  pathCase = L.polyline([], { color: '#fff', weight: 10, opacity: .9 }).addTo(map);
  pathLine = L.polyline([], { color: getComputedStyle(document.documentElement).getPropertyValue('--best').trim() || '#0f766e', weight: 6 }).addTo(map);
  const total = pts.length, per = Math.max(1, Math.ceil(total / 70)); let k = 0;
  const draw = () => {
    if (!stillCurrent()) return;
    k = Math.min(total, k + per); const seg = pts.slice(0, k);
    pathCase.setLatLngs(seg); pathLine.setLatLngs(seg);
    if (k < total) pathRaf = requestAnimationFrame(draw);
  };
  draw();
}
