import { state } from '../state.js';
import { $ } from '../utils/dom.js';
import { ALGORITHMS } from '../algorithms/index.js';
import { emit } from '../events.js';

export const selectedAlgorithm = () => $('algo').value;

export function initAlgorithmPanel() {
  const select = $('algo');
  select.innerHTML = Object.entries(ALGORITHMS).filter(([, algo]) => !algo.baseline)
    .map(([id, algo]) => `<option value="${id}">${algo.name}</option>`).join('');
  const showInfo = () => { $('info').textContent = ALGORITHMS[select.value].info; };
  select.onchange = () => { showInfo(); emit('settings:changed', 'algorithm'); };
  showInfo();

  const setMode = mode => {
    if (state.mode === mode) return;
    state.mode = mode;
    $('mFast').setAttribute('aria-pressed', mode === 'fast');
    $('mShort').setAttribute('aria-pressed', mode === 'short');
    emit('settings:changed', 'cost');
  };
  $('mFast').onclick = () => setMode('fast');
  $('mShort').onclick = () => setMode('short');
}
