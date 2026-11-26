/* Raster backgrounds are independent of the route and graph layers. */
import { CARTO_API_KEY, OFFLINE_PRESENTATION } from '../config.js';
import { $ } from '../utils/dom.js';
import { offlineBasemap } from './offline-basemap.js';

const osmCredit = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const stadiaCredit = '© CNES, Distribution Airbus DS, © Airbus DS, © PlanetObserver (Contains Copernicus Data) · © <a href="https://stadiamaps.com/attribution/">Stadia Maps</a>';
const modeNames = { streets: 'Streets', satellite: 'Satellite', hybrid: 'Hybrid', offline: 'Offline map', network: 'Network view' };

export function initBasemaps(map, { select = $('mapStyle'), source = $('mapSource'), initial } = {}) {
  const container = map.getContainer();
  const localImagery = ['localhost', '127.0.0.1'].includes(location.hostname);
  for (const option of select?.options ?? []) {
    if (['satellite', 'hybrid'].includes(option.value)) option.disabled = !localImagery;
  }
  if (select && !localImagery) select.title = 'Satellite and Hybrid are available on localhost for development.';
  map.attributionControl.addAttribution(osmCredit);

  let active = null, pending = null, localBounds, notice = '', renderedPhoto = false, renderedNetwork = false, fallback = true;
  let desired = initial ?? (OFFLINE_PRESENTATION ? 'offline' : 'streets'), disconnected = !navigator.onLine;
  let disposed = false;
  const offline = offlineBasemap(map, render);

  function render() {
    if (disposed) return;
    const mode = pending?.mode || active?.mode || desired;
    const hasTiles = active && !active.unavailable;
    const network = desired === 'network';
    const showOffline = !network && (desired === 'offline' || disconnected || (!hasTiles && (!pending || pending.failed.size > 0))
      || Boolean(active?.failed.size));
    offline.show(showOffline);
    const local = offline.status;
    const localRoads = localBounds?.intersects(map.getBounds());
    const background = hasTiles ? active.label + (active.failed.size ? ' · some tiles unavailable' : '')
      : local.available ? local.label || 'Loading offline map…'
      : local.loading ? 'Loading offline map…'
      : localRoads ? 'Detailed map unavailable · local roads where available' : 'Map tiles unavailable here';
    const status = network ? 'Modeled road network'
      : pending && !local.available ? `Loading ${modeNames[mode].toLowerCase()}…`
      : notice ? `${notice} · ${background}` : background;
    if (select) select.value = desired === 'offline' || disconnected ? desired : mode;
    if (source && source.textContent !== status) source.textContent = status;
    const photo = !!hasTiles && active.mode !== 'streets';
    container.classList.toggle('has-basemap', !!hasTiles || !!local.available);
    const needed = !network && !local.available && (!hasTiles || !!active?.failed.size);
    container.classList.toggle('needs-road-fallback', needed);
    if (fallback !== needed) {
      fallback = needed;
      map.fire('roadfallbackchange', { needed });
    }
    if (renderedPhoto !== photo || renderedNetwork !== network) {
      renderedPhoto = photo;
      renderedNetwork = network;
      container.classList.toggle('photo-basemap', photo);
      container.classList.toggle('network-basemap', network);
      map.fire('basemapchange');
    }
  }

  function discard(entry) {
    if (!entry) return;
    clearTimeout(entry.timer);
    entry.layer.off('loading tileload tileerror tileunload load');
    entry.layer.remove();
  }

  function unavailable(entry) {
    if (pending === entry) pending = null;
    else if (active === entry) active = null;
    else return;
    discard(entry);
    if (!pending) {
      if (entry.mode !== 'streets') notice = `${modeNames[entry.mode]} unavailable`;
      else if (active) notice = 'Streets unavailable';
      if (entry.mode !== 'streets' && active?.mode !== 'streets') {
        discard(active);
        active = null;
        request('streets', { keepNotice: true });
        return;
      }
      if (entry.carto) {
        request('streets', { useOSM: true, keepNotice: true });
        return;
      }
    }
    render();
  }

  function activate(entry) {
    if (pending !== entry) return;
    clearTimeout(entry.timer);
    discard(active);
    active = entry;
    pending = null;
    render();
  }

  function request(mode, { useOSM = false, keepNotice = false } = {}) {
    if (!modeNames[mode] || (['satellite', 'hybrid'].includes(mode) && !localImagery)) return;
    if (!keepNotice) notice = '';
    discard(pending);
    pending = null;
    if (mode === 'offline' || mode === 'network' || disconnected) {
      discard(active); active = null;
      if (['satellite', 'hybrid'].includes(mode)) notice = `${modeNames[mode]} requires internet`;
      render();
      return;
    }
    if (active?.mode === mode) { render(); return; }
    active?.layer.setZIndex(1);

    const base = { maxZoom: 19, maxNativeZoom: 19, zIndex: 2, referrerPolicy: 'strict-origin-when-cross-origin' };
    const carto = mode === 'streets' && CARTO_API_KEY && !useOSM;
    const retina = L.Browser.retina;
    const definitions = {
      streets: carto ? ['CARTO Positron', 'https://basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}{r}.png?key=' + encodeURIComponent(CARTO_API_KEY),
        { attribution: '© <a href="https://carto.com/attribution/">CARTO</a>' }] :
        ['OpenStreetMap', 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', { className: 'osm-tiles' }],
      satellite: ['Stadia imagery', 'https://tiles.stadiamaps.com/data/imagery/{z}/{x}/{y}.jpg',
        { tileSize: retina ? 256 : 512, zoomOffset: retina ? 0 : -1, maxNativeZoom: retina ? 18 : 19, attribution: stadiaCredit }],
      hybrid: ['Stadia Alidade Satellite', 'https://tiles.stadiamaps.com/tiles/alidade_satellite/{z}/{x}/{y}{r}.jpg',
        { attribution: stadiaCredit + ' · © <a href="https://openmaptiles.org/">OpenMapTiles</a>' }]
    };
    const [label, url, options] = definitions[mode];
    const entry = { mode, label, carto, loaded: false, failed: new Set(), layer: L.tileLayer(url, { ...base, ...options }) };
    pending = entry;
    entry.layer.on('loading', () => { entry.loaded = false; });
    entry.layer.on('tileload', ({ tile }) => { entry.loaded = true; entry.failed.delete(tile); });
    entry.layer.on('tileunload', ({ tile }) => { if (entry.failed.delete(tile) && active === entry) render(); });
    entry.layer.on('tileerror', ({ tile }) => {
      entry.failed.add(tile);
      if (active === entry || pending === entry) render();
    });
    const settle = () => {
      if (entry !== pending && entry !== active) return;
      if (entry.loaded) entry.unavailable = false;
      else if (entry.mode === 'streets' && !entry.carto && (!active || active === entry)) {
        // Keep the Streets layer attached so it can recover when the viewport changes.
        entry.unavailable = true;
      } else { unavailable(entry); return; }
      if (active === entry) render();
      else activate(entry);
    };
    entry.layer.on('load', settle);
    entry.timer = setTimeout(settle, 8000);
    entry.layer.addTo(map);
    render();
  }

  const setMode = mode => { desired = mode; request(mode); };
  if (select) select.onchange = () => setMode(select.value);
  map.on('moveend', () => queueMicrotask(render));
  const lost = () => { disconnected = true; request(desired); };
  const restored = () => { disconnected = false; request(desired); };
  window.addEventListener('offline', lost);
  window.addEventListener('online', restored);
  map.once('unload', () => {
    disposed = true;
    discard(pending); discard(active); offline.show(false);
    window.removeEventListener('offline', lost);
    window.removeEventListener('online', restored);
  });
  request(desired);
  return { setMode, setLocalBounds(bounds) { localBounds = bounds; render(); } };
}
