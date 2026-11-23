/* Algorithm dropdown, its description, and the Fastest / Shortest switch. */
import { state } from '../state.js';
import { $ } from '../utils/dom.js';
import { ALGORITHMS } from '../algorithms/index.js';
import { emit } from '../events.js';

export const selectedAlgorithm = () => $('algo').value;

export function initAlgorithmPanel() {
  const sel = $('algo');
  sel.innerHTML = Object.entries(ALGORITHMS).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join('');
  const showInfo = () => { $('info').textContent = ALGORITHMS[sel.value].info; };
  sel.onchange = () => { emit('settings:changed'); showInfo(); };
  showInfo();

  const setMode = mode => {
    state.mode = mode;
    $('mFast').classList.toggle('on', mode === 'fast'); $('mShort').classList.toggle('on', mode === 'short');
    emit('settings:changed');
  };
  $('mFast').onclick = () => setMode('fast');
  $('mShort').onclick = () => setMode('short');
}
