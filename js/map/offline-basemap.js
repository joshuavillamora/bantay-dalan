/* Local Protomaps archives are opened lazily and read in byte ranges. */
const globe = { id: 'world', zoom: 5, label: 'Offline world overview' };
const archives = [
  { id: 'panay', box: [121.34, 10.35, 123.39, 12.18], zoom: 15, label: 'Offline Panay and Guimaras streets' },
  { id: 'singapore', box: [103.79, 1.23, 103.92, 1.38], zoom: 15, label: 'Offline Singapore streets' },
  { id: 'luzon', box: [117.40, 12.00, 125.15, 21.45], zoom: 14, label: 'Offline Philippine streets' },
  { id: 'visayas', box: [116.75, 9.00, 126.20, 12.40], zoom: 14, label: 'Offline Philippine streets' },
  { id: 'mindanao', box: [116.75, 4.45, 127.15, 9.65], zoom: 14, label: 'Offline Philippine streets' }
];
const localAsset = path => new URL('../../assets/' + path, import.meta.url).href;
let loadingRenderer;

function renderer() {
  return loadingRenderer ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = localAsset('vendor/protomaps/dist/protomaps-leaflet.js');
    script.onload = () => globalThis.protomapsL ? resolve(globalThis.protomapsL) : reject(Error('Offline renderer unavailable'));
    script.onerror = () => reject(Error('Offline renderer unavailable'));
    document.head.append(script);
  });
}

async function checkArchive(url, signal) {
  const response = await fetch(url, { signal, headers: { Range: 'bytes=0-126' } });
  if (response.status !== 206 || !/^bytes 0-126\/\d+$/.test(response.headers.get('Content-Range') || '')) {
    await response.body?.cancel();
    throw Error('Map archive requires HTTP byte ranges');
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length !== 127 || new TextDecoder().decode(bytes.slice(0, 7)) !== 'PMTiles' || bytes[7] !== 3) {
    throw Error('Invalid map archive');
  }
}

export function offlineBasemap(map, onUpdate) {
  map.createPane('offlineTiles').style.zIndex = '195';
  const available = new Set(), retry = new Map();
  let visible = false, layer, request, previous = '', status = {};

  function show(next) {
    status = next;
    onUpdate();
  }

  function removeLayer() {
    if (layer) {
      layer.remove();
      layer.off();
      layer = undefined;
    }
  }

  function candidates() {
    const { lat, lng } = map.getCenter().wrap(), zoom = map.getZoom();
    if (zoom <= 6) return [globe];
    const matches = archives.filter(({ box: [w, s, e, n], zoom: native }) =>
      lat >= s && lat <= n && lng >= w && lng <= e && (native < 15 || zoom >= 11));
    if (zoom <= 10) matches.push(globe);
    return matches;
  }

  async function update() {
    if (!visible) return;
    const areas = candidates().filter(area => (retry.get(area.id) ?? 0) <= Date.now());
    const key = areas.map(area => area.id).join(',');
    if (key === previous) return;
    previous = key;
    request?.abort();
    const { signal } = request = new AbortController();
    if (!areas.length) {
      removeLayer();
      show({ unavailable: true });
      return;
    }
    show({ loading: true, available: status.available });
    for (const area of areas) {
      const url = localAsset(`maps/${area.id}.pmtiles`);
      try {
        if (!available.has(area.id)) {
          await checkArchive(url, signal);
          available.add(area.id);
        }
        const maps = await renderer();
        if (signal.aborted) return;
        const replacement = maps.leafletLayer({
          url, flavor: 'light', lang: 'en', pane: 'offlineTiles', maxZoom: 19,
          maxDataZoom: area.zoom, keepBuffer: 1, devicePixelRatio: Math.min(window.devicePixelRatio, 2),
          attribution: 'Protomaps · Natural Earth'
        });
        removeLayer();
        layer = replacement;
        replacement.once('tileload', () => {
          show({ available: true, label: area.label });
          map.fire('offlinebasemapready', { archive: area.id });
        });
        replacement.addTo(map);
        return;
      } catch {
        if (signal.aborted) return;
        retry.set(area.id, Date.now() + 15000);
        available.delete(area.id);
      }
    }
    removeLayer();
    show({ unavailable: true });
  }

  // Leaflet may still be dispatching a GridLayer moveend callback.
  map.on('moveend', () => queueMicrotask(update));
  return {
    get status() { return status; },
    show(enabled) {
      if (enabled === visible) return;
      visible = enabled;
      if (enabled) { previous = null; update(); }
      else {
        request?.abort();
        removeLayer();
        status = {};
      }
    }
  };
}
