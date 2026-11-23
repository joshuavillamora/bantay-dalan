/* The live dashboard and the enabled/disabled state of the run buttons. */
import { state } from '../state.js';
import { $ } from '../utils/dom.js';
import { fmtD, fmtT } from '../utils/format.js';

export function refreshControls() {
  $('go').disabled = state.loading; $('pause').disabled = !state.run; $('skip').disabled = !state.run;
  $('step').disabled = !state.run || !state.paused;
  $('pause').textContent = state.paused ? 'Resume' : 'Pause';
}
export const setStatus = t => { $('lt').textContent = t; };
export function setCounts(explored, queued) {
  $('sN').textContent = explored.toLocaleString();
  if (queued !== undefined) $('sQ').textContent = queued.toLocaleString();
}
export function setRouteStats(dist, time) { $('sD').textContent = fmtD(dist); $('sT').textContent = fmtT(time); }
export function resetStats() {
  $('sN').textContent = '0'; $('sQ').textContent = '0'; $('sD').textContent = '–'; $('sT').textContent = '–'; setStatus('Ready');
}
