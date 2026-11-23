/* Search events are painted on a canvas without intercepting map clicks. */
import { map, setLegend } from './map.js';

const colors = { explored: '#a46a13', frontier: '#a46a13', forward: '#a46a13', backward: '#7a3fb5', repair: '#0e9f8e' };
const photoColors = { explored: '#ffc251', frontier: '#ffc251', forward: '#ffc251', backward: '#dbabff', repair: '#64e5d2' };
const redrawEvents = 'moveend zoomend resize basemapchange';
const ExploreLayer = L.Layer.extend({
  initialize() { this.entries = []; },
  onAdd(m) {
    this.canvas = document.createElement('canvas');
    this.canvas.style.pointerEvents = 'none';
    m.getPanes().overlayPane.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    m.on(redrawEvents, this.scheduleReset, this);
    this.reset();
  },
  onRemove(m) {
    cancelAnimationFrame(this.resetFrame);
    this.resetFrame = 0;
    this.canvas.remove();
    m.off(redrawEvents, this.scheduleReset, this);
  },
  scheduleReset() {
    if (this.resetFrame) return;
    this.resetFrame = requestAnimationFrame(() => {
      this.resetFrame = 0;
      this.reset();
    });
  },
  reset() {
    const m = this._map, size = m.getSize();
    this.photo = m.getContainer().classList.contains('photo-basemap');
    const ratio = devicePixelRatio || 1;
    this.size = size;
    L.DomUtil.setPosition(this.canvas, m.containerPointToLayerPoint([0, 0]));
    this.canvas.style.width = size.x + 'px';
    this.canvas.style.height = size.y + 'px';
    const width = Math.round(size.x * ratio), height = Math.round(size.y * ratio);
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.redraw();
  },
  draw([kind, from, to]) {
    const ctx = this.ctx, a = this._map.latLngToContainerPoint(from);
    const color = (this.photo ? photoColors : colors)[kind];
    const b = to ? this._map.latLngToContainerPoint(to) : a;
    const { x: width, y: height } = this.size;
    if (Math.max(a.x, b.x) < -3 || Math.min(a.x, b.x) > width + 3 ||
        Math.max(a.y, b.y) < -3 || Math.min(a.y, b.y) > height + 3) return;
    ctx.beginPath();
    if (!to) {
      ctx.fillStyle = color;
      ctx.arc(a.x, a.y, kind === 'repair' ? 3 : 1.75, 0, Math.PI * 2);
      if (this.photo) {
        ctx.strokeStyle = '#1b1f24'; ctx.lineWidth = 2; ctx.setLineDash([]); ctx.stroke();
      }
      ctx.fill();
      return;
    }
    ctx.setLineDash(kind === 'backward' ? [4, 3] : []);
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    if (this.photo) {
      ctx.strokeStyle = '#1b1f24'; ctx.lineWidth = 4; ctx.stroke();
    }
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
  },
  add(kind, from, to) {
    const entry = [kind, from, to];
    this.entries.push(entry); this.draw(entry); setLegend(kind, true);
  },
  redraw() {
    this.ctx.clearRect(0, 0, this.size.x, this.size.y);
    this.entries.forEach(entry => this.draw(entry));
  },
  clear() {
    this.entries = [];
    this.redraw();
    Object.keys(colors).forEach(kind => setLegend(kind, false));
  }
});

export const exploreLayer = new ExploreLayer().addTo(map);
