/* Start and destination pins. */
import { map } from './map.js';

const icon = c => L.divIcon({ className: '', html: `<div class="dot" style="background:${c}"></div>`, iconSize: [16, 16], iconAnchor: [8, 8] });
const pins = { s: null, e: null };
const style = { s: ['#16a34a', 'Start: '], e: ['#dc2626', 'Destination: '] };

export function setPointMarker(which, ll, name) {
  if (pins[which]) pins[which].remove();
  pins[which] = L.marker(ll, { icon: icon(style[which][0]) }).addTo(map).bindTooltip(style[which][1] + name);
}
