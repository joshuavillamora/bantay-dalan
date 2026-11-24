import { $ } from '../utils/dom.js';
import { esc, fmtClosureCount, fmtD } from '../utils/format.js';

export const fmtMs = ms => ms < .01 ? '<0.01 ms' : `${ms.toFixed(2)} ms`;

export function renderResults(rows = []) {
  $('resBox').hidden = !rows.length;
  $('res').innerHTML = rows.length ? `<table>
    <thead><tr><th scope="col">Algorithm</th><th scope="col" title="Search events, including repeat processing">Processed</th><th scope="col">Compute time</th><th scope="col">Route totals</th></tr></thead>
    <tbody>${rows.map(row => `<tr>
      <th scope="row">${row.name}<small class="${row.matches ? 'verified' : ''}">${row.verdict}</small></th>
      <td class="num">${row.count.toLocaleString()}</td><td class="num">${esc(fmtMs(row.ms))}</td>
      <td class="num">${row.path ? fmtD(row.dist) : '—'}${row.path ? `<small>${(row.time / 60).toFixed(1)} min est.</small>` : ''}</td>
    </tr>`).join('')}</tbody>
  </table>` : '';
}

export function renderRepair(run) {
  $('repairBox').hidden = !run;
  $('repairResult').textContent = run
    ? `${run.count.toLocaleString()} search events · ${fmtMs(run.ms)} compute · ${run.path ? 'Route available' : 'Unreachable'} · ${fmtClosureCount(run.closures.length)}. Reused search state for the same trip.`
    : '';
}
