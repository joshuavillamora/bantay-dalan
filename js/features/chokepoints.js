/* "Find critical roads" button and the ranked list. Clicking an item zooms to it; "Close" adds it as a road closure. */
import { map } from '../map/map.js';
import { showChokepoints, focusChokepoint, clearChokepoints } from '../map/chokepoint-view.js';
import { $, setMessage } from '../utils/dom.js';
import { esc } from '../utils/format.js';
import { PLACES, CHOKEPOINTS } from '../config.js';
import { loadGraph, nearestNode } from '../graph/road-graph.js';
import { removeClosedRoads } from '../graph/closure-filter.js';
import { findChokepoints } from '../analysis/chokepoints.js';
import { getClosures, addLinkClosure } from './closures.js';

let results = [], busy = false;
const mins = s => (s / 60).toFixed(1);

function render() {
  $('chokeClear').hidden = !results.length;
  $('chokeList').innerHTML = results.map((c, i) => {
    const bits = [`${c.used} of ${c.total} trips use it`];
    if (c.rerouted) bits.push(`+${mins(c.avgExtra)} min detour`);
    if (c.cut) bits.push(`<b class="cut">${c.cut} cut off</b>`);
    return `<li data-i="${i}"><span class="rank">${i + 1}</span><div class="choke-text"><b>${esc(c.name)}</b><small>${bits.join(' · ')}</small></div><button type="button" class="link-btn" data-close="${i}">Close</button></li>`;
  }).join('');
}

async function analyze() {
  if (busy) return; busy = true; $('chokeBtn').disabled = true; setMessage('');
  $('chokeHint').textContent = 'Loading road network…';
  try {
    const base = await loadGraph(), g = removeClosedRoads(base, getClosures());
    const demand = CHOKEPOINTS.places.map(name => ({ name, i: nearestNode(g, PLACES[name]).i })).filter(d => d.i >= 0);
    const { chokepoints, trips } = await findChokepoints(g, demand, {
      candidates: CHOKEPOINTS.candidates, topK: CHOKEPOINTS.topK, penalty: CHOKEPOINTS.disconnectPenaltySec,
      onProgress: (what, done, total) => { $('chokeHint').textContent = `${what}… ${done}/${total}`; }
    });
    results = chokepoints; render(); showChokepoints(results);
    $('chokeHint').textContent = results.length
      ? `Ranked by extra travel time across ${trips} trips between ${demand.length} popular places${getClosures().length ? ' (with your current closures)' : ''}.`
      : 'No single road closure changes these trips.';
  } catch (e) {
    $('chokeHint').textContent = 'Could not analyse the network (' + e.message + ').';
  } finally { busy = false; $('chokeBtn').disabled = false; }
}

export function initChokepoints() {
  $('chokeBtn').onclick = analyze;
  $('chokeClear').onclick = () => { results = []; render(); clearChokepoints(); $('chokeHint').textContent = 'Finds the roads whose closure would hurt trips between popular places the most.'; };
  $('chokeList').onclick = e => {
    const close = e.target.closest('[data-close]');
    if (close) {
      const c = results[+close.dataset.close];
      addLinkClosure(c.coords, c.keys);
      setMessage(`Closed ${c.name}. Run an algorithm to see the detour, or find critical roads again to see the next weakest link.`);
      return;
    }
    const li = e.target.closest('[data-i]'); if (li) focusChokepoint(+li.dataset.i);
  };
}
