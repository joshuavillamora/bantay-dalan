import { $ } from '../utils/dom.js';

export function initRegionPicker(select) {
  const dialog = $('regionDialog');
  if (typeof dialog.showModal !== 'function') return () => {};

  const trigger = $('regionPicker'), search = $('regionSearch'), choices = $('regionChoices');
  let active = null;

  function focusOption(option) {
    active?.classList.remove('is-active');
    active = option;
    if (option) {
      option.classList.add('is-active');
      search.setAttribute('aria-activedescendant', option.id);
      option.scrollIntoView({ block: 'nearest' });
    } else search.removeAttribute('aria-activedescendant');
  }

  function render() {
    const words = search.value.toLowerCase().trim().split(/\s+/);
    choices.replaceChildren();
    for (const group of select.children) {
      const options = group.tagName === 'OPTGROUP' ? [...group.children] : [group];
      const list = document.createElement('div');
      const label = group.label || 'Other networks';
      list.setAttribute('role', 'group');
      list.setAttribute('aria-label', label);
      for (const option of options) {
        const text = `${label} ${option.textContent}`.toLowerCase();
        if (!words.every(word => text.includes(word))) continue;
        const row = document.createElement('button');
        row.type = 'button';
        row.id = 'network-option-' + option.value;
        row.dataset.value = option.value;
        row.className = 'region-option';
        row.tabIndex = -1;
        row.setAttribute('role', 'option');
        row.setAttribute('aria-selected', String(option.selected));
        row.textContent = option.textContent;
        list.append(row);
      }
      if (!list.childElementCount) continue;
      const heading = document.createElement('p');
      heading.className = 'region-group-label';
      heading.setAttribute('aria-hidden', 'true');
      heading.textContent = label;
      list.prepend(heading);
      choices.append(list);
    }
    $('regionEmpty').hidden = !!choices.childElementCount;
    choices.scrollTop = 0;
    focusOption(choices.querySelector('[aria-selected="true"]') || choices.querySelector('[role="option"]'));
  }

  function choose(option) {
    if (!option) return;
    const value = option.dataset.value;
    dialog.close();
    if (value === select.value) return;
    select.value = value;
    select.dispatchEvent(new Event('change'));
  }

  trigger.onclick = () => {
    search.value = '';
    dialog.showModal();
    trigger.setAttribute('aria-expanded', 'true');
    render();
    search.focus();
  };
  dialog.addEventListener('close', () => {
    trigger.setAttribute('aria-expanded', 'false');
    trigger.focus();
  });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right ||
        event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
  choices.onclick = event => choose(event.target.closest('[role="option"]'));
  search.oninput = render;
  search.onkeydown = event => {
    if (event.isComposing) return;
    const options = [...choices.querySelectorAll('[role="option"]')];
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      const index = options.indexOf(active);
      focusOption(options[Math.max(0, Math.min(options.length - 1, index + step))]);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      choose(active);
    }
  };

  select.hidden = true;
  $('regionLabel').htmlFor = trigger.id;
  trigger.hidden = false;
  trigger.setAttribute('aria-labelledby', 'regionLabel regionPicker');
  const sync = () => {
    trigger.textContent = select.selectedOptions[0]?.textContent ?? 'Choose a road network';
    trigger.disabled = select.disabled;
  };
  sync();
  return sync;
}
