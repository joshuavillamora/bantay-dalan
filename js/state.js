/* Shared UI/run state. Only plain data lives here (no Leaflet objects). */
export const state = {
  start: null, end: null,            // [lat, lng]
  names: { s: '', e: '' },           // text shown in the From / To boxes
  clickState: 0,                     // which pin the next map click sets
  mode: 'fast',                      // 'fast' (travel time) or 'short' (distance)
  loading: false, paused: false,
  run: null,                         // active search: { g, it, count, acc, algo, mode, my, replan }
  raf: null, runId: 0,               // animation frame handle and run counter (cancels stale runs)
  results: []                        // comparison table rows
};
