/* Preview analysis results without changing road availability. */
import { map, fitTrip, setLegend, tooltipText } from './map.js';

const group = L.layerGroup().addTo(map);
let lines = [];

export function showChokepoints(list) {
  clearChokepoints();
  list.forEach((c, i) => {
    const title = `Rank ${i + 1}: ${c.name}`;
    const line = L.polyline(c.coords, {
      className: 'analysis-outline', color: '#694897', weight: 6, opacity: i === 0 ? .95 : .68, dashArray: '5 4', bubblingMouseEvents: false
    }).bindTooltip(tooltipText(title), { sticky: true }).addTo(group);
    const mid = c.coords[Math.floor(c.coords.length / 2)];
    L.marker(mid, {
      icon: L.divIcon({ className: '', html: `<div class="choke-pin">${i + 1}</div>`, iconSize: [24, 24], iconAnchor: [12, 12] }),
      title, alt: title
    }).bindTooltip(tooltipText(title)).addTo(group);
    lines.push(line);
  });
  setLegend('chokepoints', !!lines.length);
}
export function focusChokepoint(i) {
  lines.forEach((line, k) => line.setStyle({ weight: k === i ? 9 : 5, opacity: k === i ? 1 : .55 }));
  if (lines[i]) {
    lines[i].bringToFront();
    fitTrip(lines[i].getLatLngs(), 17);
  }
}
export function clearChokepoints() {
  group.clearLayers(); lines = []; setLegend('chokepoints', false);
}
