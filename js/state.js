/* Shared route, settings and playback state. Leaflet layers stay in map modules. */
export const state = {
  start: null, end: null,
  names: { s: '', e: '' },
  mode: 'fast',
  run: null, paused: false, raf: null, runId: 0,
  graphReady: false, route: null, original: null
};
