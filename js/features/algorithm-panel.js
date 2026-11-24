import { state } from '../state.js';
import { $ } from '../utils/dom.js';
import { ALGORITHMS } from '../algorithms/index.js';
import { emit } from '../events.js';

export const selectedAlgorithm = () => $('algo').value;

export function initAlgorithmPanel() {
  const select = $('algo');
  for (const [label, baseline] of [['Evaluated algorithms', false], ['Reference algorithm', true]]) {
    const group = document.createElement('optgroup');
    group.label = label;
    for (const [id, algorithm] of Object.entries(ALGORITHMS)) {
      if (Boolean(algorithm.baseline) !== baseline) continue;
      group.append(new Option(baseline ? 'Standard Dijkstra (baseline)' : algorithm.name, id));
    }
    select.append(group);
  }
  const showInfo = () => {
    const algorithm = ALGORITHMS[select.value];
    $('info').textContent = algorithm.baseline ? 'Reference search for verifying optimized costs.' : algorithm.info;
  };
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
