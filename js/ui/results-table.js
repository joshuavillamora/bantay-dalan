/* The comparison table: one row per finished run on the same start and destination. */
import { state } from '../state.js';
import { $ } from '../utils/dom.js';
import { fmtD, fmtT } from '../utils/format.js';

export function addResult(row) { state.results.push(row); renderResults(); }
export function clearResults() { state.results = []; renderResults(); }

export function renderResults() {
  const rows = state.results;
  $('resBox').hidden = !rows.length;
  const metric = r => r.mode === 'fast' ? r.time : r.dist;
  const best = {}; rows.forEach(r => { best[r.mode] = Math.min(best[r.mode] ?? Infinity, metric(r)); });
  $('res').innerHTML = rows.map(r => `<tr><td>${r.name}<br><small>${r.mode === 'fast' ? 'fastest' : 'shortest'}</small></td><td>${r.n.toLocaleString()}</td><td>${fmtD(r.dist)}</td><td>${fmtT(r.time)}${metric(r) <= best[r.mode] * 1.0001 ? ' ✓' : ''}</td></tr>`).join('');
}
