/* Paint the indexed, visible part of the active routing graph in small batches. */
import { roadSegmentKeysIn } from '../graph/road-spatial.js';
import { $ } from '../utils/dom.js';

const vertexZoom = 16;
const directionZoom = 17;

function arrow(path, a, b, fraction, length) {
  const dx = (b.x - a.x) / length, dy = (b.y - a.y) / length;
  const x = a.x + (b.x - a.x) * fraction, y = a.y + (b.y - a.y) * fraction;
  path.moveTo(x - dx * 6 + dy * 3, y - dy * 6 - dx * 3);
  path.lineTo(x, y);
  path.lineTo(x - dx * 6 - dy * 3, y - dy * 6 + dx * 3);
}

export function initNetworkView(map, { controls = $('networkLayers'), layers = controls, fallback = false } = {}) {
  const pane = map.createPane('networkGraph');
  pane.style.zIndex = '196';
  const container = map.getContainer();
  const inputs = [...(layers?.querySelectorAll('input') ?? [])];
  const enabled = { edges: true, search: true, closures: true, critical: true };
  for (const input of inputs) enabled[input.dataset.layer] = input.checked;
  const canvas = document.createElement('canvas');
  canvas.className = 'network-graph leaflet-zoom-hide';
  canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d');
  let graph, frame;
  const isActive = () => container.classList.contains('network-basemap') ||
    (fallback && container.classList.contains('needs-road-fallback'));

  function paint() {
    frame = 0;
    if (!graph || !isActive()) return;
    const zoom = map.getZoom(), size = map.getSize(), ratio = Math.min(devicePixelRatio || 1, 2);
    const bounds = map.getBounds().pad(.015), origin = map.getPixelBounds().min;
    const current = graph;
    const segments = roadSegmentKeysIn(current, [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()]);
    const positions = new Map();
    const vertices = enabled.vertices && zoom >= vertexZoom;
    const directions = enabled.directions && zoom >= directionZoom;
    const showEdges = enabled.edges;
    let count = 0, pointCount = 0, directionCount = 0, paintMs = 0;
    const started = performance.now();
    delete canvas.dataset.ready;
    L.DomUtil.setPosition(canvas, map.containerPointToLayerPoint([0, 0]));
    canvas.style.width = size.x + 'px';
    canvas.style.height = size.y + 'px';
    canvas.width = Math.round(size.x * ratio);
    canvas.height = Math.round(size.y * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    function project(node, dots) {
      if (!positions.has(node)) {
        const position = map.project([current.lat[node], current.lng[node]], zoom).subtract(origin);
        positions.set(node, position);
        if (vertices) {
          dots.moveTo(position.x + 1.8, position.y);
          dots.arc(position.x, position.y, 1.8, 0, Math.PI * 2);
          pointCount++;
        }
      }
      return positions.get(node);
    }
    function batch() {
      frame = 0;
      const begin = performance.now();
      const roads = new Path2D(), dots = new Path2D(), arrows = new Path2D();
      let done = !showEdges && !vertices && !directions;
      for (let i = 0; !done; i++) {
        if (i % 32 === 31 && performance.now() - begin > 5) break;
        const next = segments.next();
        done = next.done;
        if (done) break;
        const n = current.lat.length, u = Math.floor(next.value / n), v = next.value % n;
        // At a regional overview, show major roads. Street zoom shows every indexed edge.
        if (zoom < 12 && current.adj[u].find(edge => edge[0] === v)[2] < 55) continue;
        const a = project(u, dots), b = project(v, dots);
        if (showEdges) {
          roads.moveTo(a.x, a.y);
          roads.lineTo(b.x, b.y);
          count++;
        }
        if (directions) {
          const length = a.distanceTo(b);
          if (length >= 15) {
            const hasReverse = current.adj[v].some(edge => edge[0] === u);
            arrow(arrows, a, b, hasReverse ? .72 : .55, length);
            if (hasReverse) arrow(arrows, b, a, .72, length);
            directionCount += hasReverse ? 2 : 1;
          }
        }
      }
      ctx.lineWidth = zoom >= 15 ? 1.2 : .85;
      ctx.strokeStyle = '#74808c';
      ctx.stroke(roads);
      ctx.fillStyle = '#afbbc6';
      ctx.fill(dots);
      ctx.lineWidth = 1.35;
      ctx.strokeStyle = '#b7c9d8';
      ctx.stroke(arrows);
      paintMs += performance.now() - begin;
      if (done) Object.assign(canvas.dataset, {
        ready: 'true', roads: count, vertices: pointCount, directions: directionCount,
        paintMs: paintMs.toFixed(1), elapsedMs: (performance.now() - started).toFixed(1)
      });
      else frame = requestAnimationFrame(batch);
    }
    batch();
  }

  function schedule() {
    cancelAnimationFrame(frame);
    if (isActive()) frame = requestAnimationFrame(paint);
  }
  function stop() { cancelAnimationFrame(frame); }
  function update() {
    const active = isActive(), zoom = map.getZoom();
    if (controls) {
      controls.hidden = !active;
      $('networkZoom').textContent = zoom < 12 ? 'Zoom in for local roads, vertices and directions.'
      : zoom < vertexZoom ? 'Zoom in for vertices and directions.'
      : zoom < directionZoom ? 'Zoom in for directions.' : 'Arrows show permitted travel on visible segments.';
      for (const key of ['search', 'closures', 'critical']) {
        container.classList.toggle('hide-network-' + key, active && !enabled[key]);
      }
    }
    if (active) {
      if (!canvas.isConnected) pane.append(canvas);
      schedule();
    } else {
      stop();
      if (controls) controls.open = false;
      canvas.remove();
      canvas.width = canvas.height = 0;
    }
  }
  const changed = ({ currentTarget }) => {
    enabled[currentTarget.dataset.layer] = currentTarget.checked;
    update();
  };
  for (const input of inputs) input.addEventListener('change', changed);
  map.on('movestart zoomstart', stop);
  map.on('moveend resize basemapchange', update);
  if (fallback) map.on('roadfallbackchange', update);
  map.once('unload', () => {
    stop();
    for (const input of inputs) input.removeEventListener('change', changed);
  });
  update();
  return next => {
    graph = next;
    if (isActive()) {
      delete canvas.dataset.ready;
      canvas.width = 0;
    }
    schedule();
  };
}
