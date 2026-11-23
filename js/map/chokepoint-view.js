/* Numbered red markers and highlighted road links for the chokepoint list. */
import { map, fitPad } from './map.js';

const group = L.layerGroup().addTo(map);
let lines = [];

export function showChokepoints(list) {
  clearChokepoints();
  list.forEach((c, i) => {
    const line = L.polyline(c.coords, { color: '#d1242f', weight: 8, opacity: i === 0 ? .95 : .7, lineCap: 'round' })
      .bindTooltip(`#${i + 1} ${c.name}`, { sticky: true }).addTo(group);
    const mid = c.coords[Math.floor(c.coords.length / 2)];
    L.marker(mid, { icon: L.divIcon({ className: '', html: `<div class="choke-pin">${i + 1}</div>`, iconSize: [24, 24], iconAnchor: [12, 12] }) }).addTo(group);
    lines.push(line);
  });
}
export function focusChokepoint(i) {
  lines.forEach((l, k) => l.setStyle({ weight: k === i ? 12 : 8, opacity: k === i ? 1 : .55 }));
  if (lines[i]) map.fitBounds(lines[i].getBounds(), { maxZoom: 17, ...fitPad() });
}
export function clearChokepoints() { group.clearLayers(); lines = []; }
