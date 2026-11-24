import { $ } from '../utils/dom.js';

export function initWelcome() {
  const help = $('welcome');
  $('help').onclick = () => help.showModal();
}
