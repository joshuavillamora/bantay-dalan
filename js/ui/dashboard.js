import { state } from '../state.js';
import { $ } from '../utils/dom.js';
import { fmtD, fmtT } from '../utils/format.js';

export function refreshControls() {
  $('go').disabled = !state.graphReady;
  $('visualize').disabled = !state.graphReady;
  $('pause').disabled = !state.run?.visual;
  $('skip').disabled = !state.run?.visual;
  $('step').disabled = !state.run?.visual || !state.paused;
  $('pause').textContent = state.paused ? 'Resume' : 'Pause';
}
export const showPlayback = visible => { $('playback').hidden = !visible; };
export const setStatus = text => { $('lt').textContent = text; };
export function setCounts(expanded, queued = 0) {
  $('sN').textContent = expanded.toLocaleString();
  $('sQ').textContent = queued.toLocaleString();
}
export const costName = mode => mode === 'fast' ? 'Estimated fastest' : 'Shortest distance';

export function renderRoute(route, note) {
  $('tripName').textContent = `${state.names.s} → ${state.names.e}`;
  $('sD').textContent = route?.path ? fmtD(route.dist) : '—';
  $('sT').textContent = route?.path ? fmtT(route.time) : '—';
  $('routeDetail').textContent = route
    ? `${route.path ? 'Route available' : 'No route available'} · ${costName(route.mode)} · ${route.name}`
    : note || 'Travel estimates use fixed road speeds.';
}

const scenarioLabel = closures => closures.length ? `closures ${closures.map(c => '#' + c.id).join(', ')}` : 'no closures';
export const samePath = (left, right) => !!left && !!right && left.length === right.length && left.every((node, i) => node === right[i]);

export function renderImpact(current, original, closures, pending = false) {
  const details = $('impactDetails');
  details.hidden = !original;
  if (!original) {
    $('routeImpact').textContent = current
      ? 'Add or reopen a closure to compare against this route.'
      : 'Find a route first to measure the effect of a closure.';
    return;
  }
  let summary = pending === 'failed' ? 'Could not recalculate the route. Try finding it again.' : 'Recalculating for the current closures…';
  if (!pending) {
    if (!current?.path) summary = original.path ? 'No route is available with the current closures.' : 'The trip remains unreachable.';
    else if (!original.path) summary = 'A route is now available.';
    else if (samePath(original.path, current.path)) summary = 'The optimal route is unchanged.';
    else {
      const delta = current.dist - original.dist;
      const percent = original.dist && Math.abs(delta) >= 1 ? ` (${Math.abs(delta / original.dist * 100).toFixed(1)}%)` : '';
      const change = Math.abs(delta) < 1 ? 'Distance is unchanged.' : `${fmtD(Math.abs(delta))} ${delta > 0 ? 'longer' : 'shorter'}${percent}.`;
      const seconds = current.time - original.time;
      const timing = original.mode === 'fast' && Math.abs(seconds) >= .5
        ? ` Estimated trip is ${(Math.abs(seconds) / 60).toFixed(1)} min ${seconds > 0 ? 'slower' : 'faster'}.` : '';
      summary = `The route changed. ${change}${timing}`;
    }
  }
  const cells = route => route?.path
    ? `<td>${fmtD(route.dist, 2)}</td><td>${(route.time / 60).toFixed(2)} min</td>`
    : `<td colspan="2">${route ? 'Unreachable' : pending === true ? 'Updating…' : 'Unavailable'}</td>`;
  $('routeImpact').textContent = summary;
  details.innerHTML = `<table>
    <thead><tr><th scope="col">Scenario</th><th scope="col">Distance</th><th scope="col">Est. travel</th></tr></thead>
    <tbody><tr><th scope="row">Original<small>${scenarioLabel(original.closures)}</small></th>${cells(original)}</tr>
    <tr><th scope="row">Current<small>${scenarioLabel(closures)}</small></th>${cells(current)}</tr></tbody>
  </table><p class="hint">${costName(original.mode)} · same endpoints and fixed road speeds</p>`;
}
