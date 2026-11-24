import { map, tooltipText } from './map.js';

const closedRenderer = L.canvas({ pane: 'closures' });
const previewRenderer = L.canvas({ pane: 'closurePreview' });
const lines = new Map();
let casing, interactive = true;

const draftStyle = {
  pane: 'closurePreview', className: 'analysis-outline', color: '#775015', weight: 3,
  interactive: false, smoothFactor: 0
};

export const closureDraft = () => L.polyline([], draftStyle).addTo(map);
export const closureArea = points => L.polygon(points, { ...draftStyle, fillColor: '#ffce4d', fillOpacity: .16 }).addTo(map);
export const closurePreview = segments => L.polyline(segments, {
  pane: 'closurePreview', renderer: previewRenderer, color: '#925300', weight: 5, lineCap: 'butt', interactive: false, smoothFactor: 0
}).addTo(map);

export function setClosedRoadInteraction(enabled) {
  interactive = enabled;
  for (const line of lines.values()) line.options.interactive = enabled;
}

export function showClosedRoads(closures, reopen) {
  const union = [], seen = new Set(), visible = new Set();
  const style = { pane: 'closures', renderer: closedRenderer, lineCap: 'butt', smoothFactor: 0 };
  if (closures.length && !casing) {
    casing = L.polyline([], { ...style, color: '#fff5f6', opacity: .92, weight: 6, interactive: false }).addTo(map);
  }
  // Draw the union once. Where groups overlap, let the newest group own the map click.
  for (let i = closures.length - 1; i >= 0; i--) {
    const closure = closures[i], roads = [];
    for (const [key, segment] of closure.segments) {
      if (seen.has(key)) continue;
      seen.add(key);
      roads.push(segment);
      union.push(segment);
    }
    if (!roads.length) continue;
    visible.add(closure.id);
    let line = lines.get(closure.id);
    if (line) line.setLatLngs(roads);
    else {
      line = L.polyline(roads, { ...style, color: '#d7263d', weight: 3.5, interactive, bubblingMouseEvents: false })
        .bindTooltip(tooltipText(`Closure #${closure.id} · click to reopen`), { sticky: true })
        .on('click', () => { if (interactive) reopen(closure); }).addTo(map);
      lines.set(closure.id, line);
    }
  }
  for (const [id, line] of lines) {
    if (visible.has(id)) continue;
    line.remove();
    lines.delete(id);
  }
  if (union.length) casing.setLatLngs(union);
  else { casing?.remove(); casing = null; }
}
