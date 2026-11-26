import { ALGORITHMS, RETAINED_SEARCH_COLOR, searchColor } from '../algorithms/index.js';
import { $ } from '../utils/dom.js';
import { initBasemaps } from './basemaps.js';
import { initNetworkView } from './network-view.js';
import { map } from './map.js';
import { paintSearch } from './search-paint.js';

const stage = () => $('comparisonMaps');
const lanes = { bidir: -3, astar: -1, lpa: 1, dijkstra: 3, repair: 5 };

function traceSurface(view, graph, schedule, maxCanvases, pixelBudget) {
  const overlay = view.getPane('overlayPane');
  function canvasLayer(key) {
    const canvas = document.createElement('canvas');
    canvas.className = 'comparison-trace leaflet-zoom-hide';
    canvas.dataset.searchTrack = key;
    canvas.setAttribute('aria-hidden', 'true');
    return { canvas, ink: canvas.getContext('2d') };
  }
  const frontier = canvasLayer('frontier');
  overlay.append(frontier.canvas);
  const pane = view.getPane('comparisonRoutes') ?? view.createPane('comparisonRoutes');
  pane.style.zIndex = '410';
  const paths = L.layerGroup().addTo(view);
  let tracks = [], routeState = '', cursor = 0, size, zoom, photo, ratio, opacity = 1, showRoutes = true;

  const clear = layer => layer.ink.clearRect(0, 0, size.x, size.y);
  function place(layer) {
    const { canvas, ink } = layer;
    L.DomUtil.setPosition(canvas, view.containerPointToLayerPoint([0, 0]));
    canvas.style.width = size.x + 'px'; canvas.style.height = size.y + 'px';
    canvas.style.opacity = opacity;
    const width = Math.round(size.x * ratio), height = Math.round(size.y * ratio);
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    ink.setTransform(ratio, 0, 0, ratio, 0, 0);
    clear(layer);
    layer.painted = layer.retainedPainted = 0;
  }
  function resize() {
    size = view.getSize();
    zoom = view.getZoom();
    photo = view.getContainer().matches('.photo-basemap, .network-basemap');
    // Limit the combined backing store even on high-DPI, large displays.
    ratio = Math.min(devicePixelRatio || 1, 2, Math.sqrt(pixelBudget / Math.max(1, maxCanvases * size.x * size.y)));
    place(frontier);
    tracks.forEach(place);
    schedule();
  }
  view.on('moveend resize basemapchange', resize);
  resize();

  const pixel = id => view.latLngToContainerPoint([graph.lat[id], graph.lng[id]]);
  const offscreen = (a, b = a) => Math.max(a.x, b.x) < -6 || Math.min(a.x, b.x) > size.x + 6 ||
    Math.max(a.y, b.y) < -6 || Math.min(a.y, b.y) > size.y + 6;
  function updateRoutes() {
    const complete = showRoutes ? tracks.filter(({ row, end }) => end === row.trace.count && row.path?.length) : [];
    const reference = showRoutes && tracks.find(({ row, visible }) => visible && row.previous?.length > 1);
    const key = [...complete.map(({ row }) => row.key), reference ? 'reference' : ''].join();
    if (key === routeState) return;
    routeState = key;
    paths.clearLayers();
    const style = { pane: 'comparisonRoutes', interactive: false, smoothFactor: 0 };
    if (reference) paths.addLayer(L.polyline(reference.row.previous, { ...style, className: 'comparison-reference',
      color: '#535d6d', weight: 3, dashArray: '7 6' }));
    // In overlay, identical routes get one solid stroke. The table still reports each result.
    const drawn = [];
    for (const { row } of complete) {
      if (drawn.some(path => path.length === row.path.length && path.every((id, i) => id === row.path[i]))) continue;
      drawn.push(row.path);
      const points = row.path.map(id => [graph.lat[id], graph.lng[id]]);
      paths.addLayer(L.polyline(points, { ...style, color: '#fff', weight: 6 }));
      paths.addLayer(L.polyline(points, { ...style, color: '#253449', weight: 3.5 }));
    }
  }
  const pending = ({ visible, row, painted, retainedPainted, end }) => visible &&
    (painted < end || retainedPainted < (row.retained?.length ?? 0));

  return {
    set(next) {
      const old = new Map(tracks.map(track => [track.row, track]));
      tracks = next.map(settings => {
        const track = old.get(settings.row) ?? canvasLayer(settings.row.key);
        old.delete(settings.row);
        if (!track.canvas.isConnected) { overlay.insertBefore(track.canvas, frontier.canvas); place(track); }
        if (settings.end < track.painted) { clear(track); track.painted = track.retainedPainted = 0; }
        track.canvas.hidden = !settings.visible;
        return Object.assign(track, settings);
      });
      for (const track of old.values()) track.canvas.remove();
      updateRoutes();
      schedule();
    },
    appearance(alpha, routes) {
      opacity = alpha;
      showRoutes = routes;
      for (const { canvas } of [...tracks, frontier]) canvas.style.opacity = alpha;
      updateRoutes();
    },
    paint(deadline) {
      const drawing = tracks.filter(pending);
      const { length } = drawing;
      for (let steps = 0; length && steps < 768; steps++) {
        if (steps % 16 === 0 && (performance.now() >= deadline || !drawing.some(pending))) break;
        const track = drawing[cursor++ % length];
        const { row, ink, end, offset } = track, { key, trace, retained } = row;
        if (retained && track.retainedPainted < retained.length) {
          const a = pixel(retained[track.retainedPainted++]);
          if (!offscreen(a)) paintSearch(ink, a, undefined, { color: RETAINED_SEARCH_COLOR, kind: 'retained', zoom, photo });
          continue;
        }
        if (track.painted >= end) continue;
        const n = track.painted++, u = trace.vertex(n), p = trace.parent(n);
        const a = pixel(u), b = p < 0 ? undefined : pixel(p);
        if (offscreen(a, b)) continue;
        const direction = key === 'bidir' ? trace.direction(n) : undefined;
        const lane = offset + (direction === 'backward' ? .6 : direction === 'forward' ? -.6 : 0);
        paintSearch(ink, a, b, { color: searchColor(key, direction), kind: key === 'repair' ? 'repair' : direction, zoom, photo, lane });
      }
      clear(frontier);
      tracks.forEach(({ row, painted, visible }) => {
        if (!visible || !painted || painted === row.trace.count) return;
        const n = painted - 1, color = searchColor(row.key, row.key === 'bidir' && row.trace.direction(n));
        row.trace.discoveries(n, node => {
          const a = pixel(node);
          if (!offscreen(a)) paintSearch(frontier.ink, a, undefined, { color, kind: 'frontier', zoom, photo });
        });
      });
      return tracks.some(pending);
    },
    destroy() {
      view.off('moveend resize basemapchange', resize);
      tracks.forEach(({ canvas }) => canvas.remove());
      frontier.canvas.remove(); paths.remove();
    }
  };
}

export function showComparisonView({ graph, rows, start, end, closures }, mode, schedule) {
  const split = mode === 'split', main = map.getContainer();
  let views = [], surfaces = [], locked = false, observer, cleanup;
  main.classList.add('comparison-active');
  if (split) {
    stage().hidden = false;
    main.inert = true;
    main.setAttribute('aria-hidden', 'true');
    main.classList.add('comparison-split');
    const seen = new Set(), closed = [];
    for (const closure of closures) for (const [key, line] of closure.segments) {
      if (!seen.has(key)) { closed.push(line); seen.add(key); }
    }
    views = rows.map(row => {
      const tile = document.createElement('section'), name = document.createElement('h3'), element = document.createElement('div');
      tile.className = 'comparison-tile';
      tile.dataset.algorithm = row.key;
      name.textContent = row.name + (row.baseline ? ' · baseline' : '');
      name.style.borderColor = ALGORITHMS[row.key].color;
      element.className = 'comparison-leaflet';
      element.setAttribute('aria-label', row.name + ' map');
      tile.append(element, name); stage().append(tile);
      const view = L.map(element, { attributionControl: false, minZoom: 2, maxZoom: 19, trackResize: false,
        zoomControl: false, zoomAnimation: false, fadeAnimation: false }).setView(map.getCenter(), map.getZoom());
      L.control.zoom({ position: 'topright' }).addTo(view);
      L.control.attribution({ prefix: false }).addTo(view);
      const base = initBasemaps(view, { select: null, source: null, initial: $('mapStyle').value });
      initNetworkView(view, { controls: null, layers: $('networkLayers'), fallback: true })(graph);
      const [w, s, e, n] = graph.region.bounds;
      base.setLocalBounds(L.latLngBounds([s, w], [n, e]));
      for (const [i, point] of [start, end].entries()) {
        const label = i ? 'Destination B' : 'Start A';
        const icon = L.icon({ iconUrl: `assets/icons/display/point-${i ? 'b' : 'a'}.png`, iconSize: [26, 34], iconAnchor: [13, 33] });
        L.marker(point, { icon, alt: label, title: label, interactive: false, keyboard: false }).addTo(view);
      }
      view.createPane('comparisonClosures').style.zIndex = '420';
      L.polyline(closed, { pane: 'comparisonClosures', color: '#d7263d', weight: 3, dashArray: '7 2',
        interactive: false, className: 'comparison-closures' }).addTo(view);
      return { view, base, tile };
    });
    const pinBounds = L.latLngBounds([start, end]);
    if (!views[0].view.getBounds().pad(-.06).contains(pinBounds)) {
      views[0].view.fitBounds(pinBounds, { padding: [28, 30], maxZoom: 16, animate: false });
    }
    const maps = [map, ...views.map(({ view }) => view)];
    const sync = leader => {
      if (locked) return;
      locked = true;
      const center = leader.getCenter(), zoom = leader.getZoom();
      for (const view of maps) if (view !== leader && (view.getZoom() !== zoom || !view.getCenter().equals(center))) {
        view.setView(center, zoom, { animate: false });
      }
      locked = false;
    };
    const listenMain = () => sync(map);
    const styles = () => views.forEach(({ base }) => base.setMode($('mapStyle').value));
    const scroll = () => views.forEach(({ view }) => view.scrollWheelZoom[$('wheelMode').getAttribute('aria-pressed') === 'true' ? 'enable' : 'disable']());
    for (const { view } of views) view.on('moveend', () => sync(view));
    map.on('moveend', listenMain);
    $('mapStyle').addEventListener('change', styles);
    $('wheelMode').addEventListener('click', scroll);
    sync(views[0].view);
    scroll();
    observer = new ResizeObserver(() => {
      locked = true;
      views.forEach(({ view }) => view.invalidateSize({ pan: false, animate: false }));
      locked = false;
      sync(map);
    });
    observer.observe(stage());
    surfaces = views.map(({ view }) => traceSurface(view, graph, schedule, 2, 2_000_000));
    cleanup = () => {
      map.off('moveend', listenMain);
      $('mapStyle').removeEventListener('change', styles);
      $('wheelMode').removeEventListener('click', scroll);
    };
  } else surfaces = [traceSurface(map, graph, schedule, mode === 'overlay' ? 6 : 2, 8_000_000)];

  return {
    set(tracks) {
      if (split) rows.forEach((row, i) => {
        const track = tracks.find(item => item.row === row);
        views[i].tile.classList.toggle('trace-disabled', !track?.visible);
        surfaces[i].set(track ? [{ ...track, offset: 0 }] : []);
      });
      else surfaces[0].set(tracks.map(track => ({ ...track,
        offset: mode === 'overlay' ? lanes[track.row.key] : 0 })));
    },
    setAppearance(opacity, routes) {
      surfaces.forEach(surface => surface.appearance(opacity, routes));
    },
    paint() {
      return surfaces.map(surface => surface.paint(performance.now() + 5 / surfaces.length)).some(Boolean);
    },
    destroy() {
      observer?.disconnect();
      surfaces.forEach(surface => surface.destroy());
      cleanup?.();
      views.forEach(({ view }) => view.remove());
      stage().replaceChildren();
      stage().hidden = true;
      main.classList.remove('comparison-active', 'comparison-split');
      main.inert = false;
      main.removeAttribute('aria-hidden');
    }
  };
}
