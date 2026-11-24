import { emit } from '../events.js';
import { $ } from '../utils/dom.js';

export function initWorkspace() {
  const nav = [...document.querySelectorAll('[data-mode]')];
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let mode = 'route', expanded = true;
  const select = (next, open) => {
    mode = next;
    expanded = open;
    $('panel').hidden = !open;
    $('workspace').classList.toggle('panel-hidden', !open);
    for (const button of nav) {
      const active = button.dataset.mode === mode;
      if (active) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
      button.setAttribute('aria-expanded', String(active && open));
      $(button.getAttribute('aria-controls')).hidden = !active || !open;
    }
    emit('workspace:changed', open ? mode : null);
  };
  nav.forEach(button => {
    button.onclick = () => select(button.dataset.mode, button.dataset.mode !== mode || !expanded);
    // The artwork ignores pointer events, so offsets stay relative to the
    // button and the highlight does not need to read layout on each move.
    button.addEventListener('pointermove', event => {
      if (event.pointerType !== 'mouse' || reduceMotion.matches) return;
      button.style.setProperty('--light-x', event.offsetX + 'px');
      button.style.setProperty('--light-y', event.offsetY + 'px');
    });
  });
  select(mode, expanded);
}
