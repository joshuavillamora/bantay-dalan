/* Welcome card: shown on first visit, reopened with the ? button. */
import { $ } from '../utils/dom.js';

export function initWelcome() {
  const welcome = $('welcome');
  const show = v => { welcome.hidden = !v; if (v) $('wGo').focus(); };
  $('wGo').onclick = () => { show(false); try { localStorage.setItem('bd-welcomed', '1'); } catch (e) {} };
  $('help').onclick = () => show(welcome.hidden);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !welcome.hidden) $('wGo').click(); });
  let seen = false; try { seen = localStorage.getItem('bd-welcomed') === '1'; } catch (e) {}
  show(!seen);
}
