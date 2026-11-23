/* Canvas layer that draws the search as it runs: explored roads (orange lines) and found roads (cyan dots). */
import { map } from './map.js';

const ExploreLayer = L.Layer.extend({
  initialize() { this.e = []; },
  onAdd(m) {
    this.c = document.createElement('canvas'); this.c.style.pointerEvents = 'none';
    m.getPanes().overlayPane.appendChild(this.c);
    m.on('moveend zoomend resize', this.reset, this); this.reset();
  },
  onRemove(m) { this.c.remove(); m.off('moveend zoomend resize', this.reset, this); },
  reset() {
    const m = this._map, s = m.getSize();
    L.DomUtil.setPosition(this.c, m.containerPointToLayerPoint([0, 0]));
    this.c.width = s.x; this.c.height = s.y; this.ctx = this.c.getContext('2d'); this.redraw();
  },
  draw(a) {
    const m = this._map, x = this.ctx, p = m.latLngToContainerPoint([a[0], a[1]]);
    if (a.length === 2) { x.fillStyle = 'rgba(34,184,207,.9)'; x.beginPath(); x.arc(p.x, p.y, 2.6, 0, 6.3); x.fill(); return; }
    const q = m.latLngToContainerPoint([a[2], a[3]]);
    x.strokeStyle = 'rgba(240,140,0,.85)'; x.lineWidth = 1.8; x.lineCap = 'round';
    x.beginPath(); x.moveTo(p.x, p.y); x.lineTo(q.x, q.y); x.stroke();
  },
  add(a) { this.e.push(a); this.draw(a); },
  redraw() { this.ctx.clearRect(0, 0, this.c.width, this.c.height); this.e.forEach(a => this.draw(a)); },
  clear() { this.e = []; if (this.ctx) this.redraw(); }
});

export const exploreLayer = new ExploreLayer().addTo(map);
