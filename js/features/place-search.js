/* Search-as-you-type for the From / To boxes.
   Preset places match instantly; other places come from Photon (photon.komoot.io), a free OpenStreetMap search service. */
import { state } from '../state.js';
import { map } from '../map/map.js';
import { $ } from '../utils/dom.js';
import { esc } from '../utils/format.js';
import { PLACES, SEARCH_BOX } from '../config.js';
import { setPoint } from './route-points.js';

const localMatches = q => Object.entries(PLACES).filter(([n]) => !q || n.toLowerCase().includes(q))
  .map(([n, ll]) => ({ name: n, ll, detail: 'Popular place', preset: true }));

async function remoteMatches(q, signal) {
  const r = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=7&lat=10.71&lon=122.56&bbox=${SEARCH_BOX}`, { signal });
  if (!r.ok) throw new Error(r.status);
  const d = await r.json();
  return d.features.filter(f => f.properties.name || f.properties.street).map(f => {
    const p = f.properties, c = f.geometry.coordinates;
    const name = p.name || [p.housenumber, p.street].filter(Boolean).join(' ');
    const detail = [p.name && p.street, p.locality || p.district, p.city || p.county].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', ');
    return { name, ll: [c[1], c[0]], detail: detail || 'Iloilo' };
  });
}

function attach(input, which) {
  const list = $(input.id + 'List'); let items = [], active = -1, timer = null, ctrl = null, seq = 0;
  const open = v => {
    list.hidden = !v; input.setAttribute('aria-expanded', v);
    if (v && active >= 0) input.setAttribute('aria-activedescendant', input.id + 'Opt' + active);
    else input.removeAttribute('aria-activedescendant');
  };
  const dismiss = () => {
    seq++; clearTimeout(timer); ctrl?.abort(); active = -1; open(false);
    input.value = state.names[which];
  };
  const render = (loading, unavailable = false) => {
    if (!items.length && !loading) {
      list.innerHTML = `<li class="empty" role="presentation">${unavailable ? 'Online search is unavailable. Try a saved place or pick on the map.' : 'No matching places in Iloilo.'}</li>`;
      open(!!input.value.trim()); return;
    }
    list.innerHTML = items.map((p, i) => `<li role="option" id="${input.id}Opt${i}" class="opt${i === active ? ' active' : ''}" aria-selected="${i === active}" data-i="${i}">
      <span class="ico ${p.preset ? 'star' : 'pin'}" aria-hidden="true"></span><span><b>${esc(p.name)}</b><small>${esc(p.detail)}</small></span></li>`).join('')
      + (loading ? '<li class="empty" role="presentation">Searching…</li>' : '');
    open(true);
  };
  const update = () => {
    const q = input.value.trim().toLowerCase(), my = ++seq;
    items = localMatches(q); active = items.length ? 0 : -1;
    clearTimeout(timer); ctrl?.abort();
    if (q.length < 3) { render(false); return; }
    render(true);
    timer = setTimeout(async () => {
      let unavailable = false;
      try {
        ctrl = new AbortController();
        const found = await remoteMatches(q, ctrl.signal);
        if (my !== seq) return;
        const seen = new Set(items.map(p => p.name.toLowerCase()));
        items = items.concat(found.filter(p => !seen.has(p.name.toLowerCase()))).slice(0, 8);
      } catch (e) { if (e.name === 'AbortError' || my !== seq) return; unavailable = true; }
      if (active < 0 && items.length) active = 0;
      render(false, unavailable);
    }, 300);
  };
  const choose = i => {
    const p = items[i]; if (!p) return;
    setPoint(which, p.ll, p.name); dismiss();
    if (!map.getBounds().contains(p.ll)) map.panTo(p.ll, { animate: false });
  };
  const move = d => {
    if (!items.length) return;
    active = active < 0 ? (d > 0 ? 0 : items.length - 1) : (active + d + items.length) % items.length;
    render(false);
    const el = $(input.id + 'Opt' + active);
    if (el) { input.setAttribute('aria-activedescendant', el.id); el.scrollIntoView({ block: 'nearest' }); }
  };
  input.addEventListener('focus', () => { input.select(); items = localMatches(''); active = -1; render(false); });
  input.addEventListener('input', update);
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); list.hidden ? update() : move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter') { if (!list.hidden && active >= 0) { e.preventDefault(); choose(active); } }
    else if (e.key === 'Escape' && !list.hidden) { e.stopPropagation(); dismiss(); }
  });
  input.addEventListener('blur', dismiss);
  list.addEventListener('mousedown', e => { const li = e.target.closest('[data-i]'); if (li) { e.preventDefault(); choose(+li.dataset.i); input.blur(); } });
}

export function initPlaceSearch() { attach($('from'), 's'); attach($('to'), 'e'); }
