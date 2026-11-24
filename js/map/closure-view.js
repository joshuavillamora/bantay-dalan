import { map, tooltipText } from './map.js';

export const closureDraft = point => L.polyline([point, point], {
  pane: 'closures', className: 'analysis-outline', color: '#d7263d', weight: 3, dashArray: '5 5', interactive: false
}).addTo(map);

export function showClosure(segments, label, reopen) {
  return L.polyline(segments, {
    pane: 'closures', className: 'analysis-outline', color: '#d7263d', weight: 6, dashArray: '7 4', bubblingMouseEvents: false
  }).bindTooltip(tooltipText(`${label} · click to reopen`), { sticky: true })
    .on('click', reopen).addTo(map);
}
