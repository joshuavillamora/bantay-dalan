/* Raster backgrounds are independent of the route and graph layers. */
import { CARTO_API_KEY } from '../config.js';
import { $ } from '../utils/dom.js';

const osmCredit = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const stadiaCredit = '© CNES, Distribution Airbus DS, © Airbus DS, © PlanetObserver (Contains Copernicus Data) · © <a href="https://stadiamaps.com/attribution/">Stadia Maps</a>';
const modeNames = { streets: 'Streets', satellite: 'Satellite', hybrid: 'Hybrid' };

export function initBasemaps(map) {
  const container = map.getContainer(), select = $('mapStyle'), source = $('mapSource');
  const localImagery = ['localhost', '127.0.0.1'].includes(location.hostname);
  for (const option of select.options) {
    if (option.value !== 'streets') option.disabled = !localImagery;
  }
  if (!localImagery) select.title = 'Satellite and Hybrid are available on localhost for development.';
  map.attributionControl.addAttribution(osmCredit);

  let active = null, pending = null, localRoads = false, notice = '', renderedPhoto = false, fallback = true;

  function render() {
    const mode = pending?.mode || active?.mode || 'streets';
    const background = active?.label || (localRoads ? 'Local road network' : 'Map tiles unavailable');
    const status = pending ? `Loading ${modeNames[mode].toLowerCase()}…`
      : notice ? `${notice} · ${background}` : background;
    select.value = mode;
    if (source.textContent !== status) source.textContent = status;
    const photo = !!active && active.mode !== 'streets';
    container.classList.toggle('has-basemap', !!active);
    const needed = !active || !!active.failed.size;
    container.classList.toggle('needs-road-fallback', needed);
    if (fallback !== needed) {
      fallback = needed;
      map.fire('roadfallbackchange', { needed });
    }
    if (renderedPhoto !== photo) {
      renderedPhoto = photo;
      container.classList.toggle('photo-basemap', photo);
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
    if (!modeNames[mode] || (mode !== 'streets' && !localImagery)) return;
    if (!keepNotice) notice = '';
    discard(pending);
    pending = null;
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
      if (active === entry) render();
    });
    const settle = () => entry.loaded ? (active === entry ? render() : activate(entry)) : unavailable(entry);
    entry.layer.on('load', settle);
    entry.timer = setTimeout(settle, 8000);
    entry.layer.addTo(map);
    render();
  }

  select.onchange = () => request(select.value);
  request('streets');
  return () => { localRoads = true; render(); };
}
