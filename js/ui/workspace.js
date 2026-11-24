import { emit } from '../events.js';
import { $ } from '../utils/dom.js';

export function initWorkspace() {
  const nav = [...document.querySelectorAll('[data-mode]')];
  let mode = 'route';
  const setPanel = visible => {
    $('panel').hidden = !visible;
    $('workspace').classList.toggle('panel-hidden', !visible);
    $('panelToggle').setAttribute('aria-expanded', visible);
    $('panelToggle').textContent = visible ? 'Hide panel' : 'Show panel';
    if (!visible) emit('workspace:changed', null);
  };
  const select = next => {
    mode = next;
    for (const button of nav) {
      const active = button.dataset.mode === mode;
      if (active) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
      $(button.getAttribute('aria-controls')).hidden = !active;
    }
    setPanel(true);
    emit('workspace:changed', mode);
  };
  nav.forEach(button => { button.onclick = () => select(button.dataset.mode); });
  $('panelToggle').onclick = () => {
    if ($('panel').hidden) select(mode);
    else setPanel(false);
  };
}
