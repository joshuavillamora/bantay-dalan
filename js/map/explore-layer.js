/* Search events are painted on a canvas without intercepting map clicks. */
import { map, setLegend } from './map.js';
import { ALGORITHMS, REPAIR_SEARCH_STYLE, RETAINED_SEARCH_COLOR } from '../algorithms/index.js';
import { paintSearch } from './search-paint.js';

const colors = { astar: ALGORITHMS.astar.color, lpa: ALGORITHMS.lpa.color, dijkstra: ALGORITHMS.dijkstra.color,
  forward: ALGORITHMS.bidir.color, backward: ALGORITHMS.bidir.backward, repair: REPAIR_SEARCH_STYLE.color,
  retained: RETAINED_SEARCH_COLOR };
const redrawEvents = 'moveend zoomend resize basemapchange';
const ExploreLayer = L.Layer.extend({
  initialize() { this.entries = []; this.painted = this.retainedPainted = 0; },
  onAdd(m) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'search-traces';
    this.canvas.style.pointerEvents = 'none';
    m.getPanes().overlayPane.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    m.on(redrawEvents, this.scheduleReset, this);
    this.reset();
  },
  onRemove(m) {
    cancelAnimationFrame(this.resetFrame);
    cancelAnimationFrame(this.paintFrame);
    this.resetFrame = 0;
    this.paintFrame = 0;
    this.canvas.remove();
    m.off(redrawEvents, this.scheduleReset, this);
  },
  scheduleReset() {
    if (this.resetFrame) return;
    this.resetFrame = requestAnimationFrame(() => {
      this.resetFrame = 0;
      try { this.reset(); }
      catch (error) { this.fire('error', { error }); }
    });
  },
  reset() {
    const m = this._map, size = m.getSize();
    this.photo = m.getContainer().matches('.photo-basemap, .network-basemap');
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
  draw([kind, from, to, frontier]) {
    const ctx = this.ctx, a = this._map.latLngToContainerPoint(from);
    const color = colors[kind];
    const b = to ? this._map.latLngToContainerPoint(to) : a;
    const { x: width, y: height } = this.size;
    if (Math.max(a.x, b.x) < -3 || Math.min(a.x, b.x) > width + 3 ||
        Math.max(a.y, b.y) < -3 || Math.min(a.y, b.y) > height + 3) return;
    paintSearch(ctx, a, to ? b : undefined, { color, kind: frontier ? 'frontier' : kind, photo: this.photo, zoom: this._map.getZoom() });
  },
  add(kind, from, to, frontier = false) {
    const entry = [kind, from, to, frontier];
    // Keep redraws bounded on long searches. Expansion counts come from the full search.
    if (this.entries.length === 40000) {
      this.entries.splice(0, 10000);
      this.painted = Math.max(0, this.painted - 10000);
    }
    this.entries.push(entry);
    this.schedulePaint();
    setLegend(frontier ? 'frontier' : kind, true);
  },
  setRetained(graph, vertices) {
    this.retained = { graph, vertices };
    setLegend('retained', vertices.length > 0);
    this.redraw();
  },
  schedulePaint() {
    if (this.paintFrame || (this.painted === this.entries.length &&
      this.retainedPainted === (this.retained?.vertices.length ?? 0))) return;
    this.paintFrame = requestAnimationFrame(() => {
      this.paintFrame = 0;
      const stop = performance.now() + 4;
      const end = Math.min(this.entries.length, this.painted + 512);
      try {
        if (this.retained) {
          const { graph, vertices } = this.retained;
          const limit = Math.min(vertices.length, this.retainedPainted + 512);
          while (this.retainedPainted < limit) {
            const i = vertices[this.retainedPainted++];
            this.draw(['retained', [graph.lat[i], graph.lng[i]]]);
            if (this.retainedPainted % 32 === 0 && performance.now() >= stop) break;
          }
          if (this.retainedPainted < vertices.length) { this.schedulePaint(); return; }
        }
        while (this.painted < end) {
          this.draw(this.entries[this.painted++]);
          if (this.painted % 32 === 0 && performance.now() >= stop) break;
        }
        this.schedulePaint();
      } catch (error) {
        this.entries = [];
        this.retained = undefined;
        this.retainedPainted = 0;
        this.painted = 0;
        this.fire('error', { error });
      }
    });
  },
  redraw() {
    this.ctx.clearRect(0, 0, this.size.x, this.size.y);
    this.painted = this.retainedPainted = 0;
    this.schedulePaint();
  },
  clear() {
    this.entries = [];
    this.retained = undefined;
    cancelAnimationFrame(this.paintFrame);
    this.paintFrame = 0;
    this.redraw();
    Object.keys(colors).forEach(kind => setLegend(kind, false));
    setLegend('frontier', false);
  }
});

export const exploreLayer = new ExploreLayer().addTo(map);
