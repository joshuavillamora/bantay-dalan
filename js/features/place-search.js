/* Autocomplete only commits coordinates once the user picks a suggestion. */
import { state } from '../state.js';
import { map } from '../map/map.js';
import { on } from '../events.js';
import { $ } from '../utils/dom.js';
import { esc } from '../utils/format.js';
import { PLACES } from '../config.js';
import { setPoint } from './route-points.js';
import { cityPlaceIndex, geocoderFor, geocodedMatches, mergeMatches, placeWords } from './geocoding.js';
import { connectionMessage } from './route-status.js';

const suggested = [
  { name: 'Plaza Libertad', id: 'way/49424474', detail: 'City Proper, Iloilo City', aliases: ['Plaza Alfonso XII'] },
  { name: 'SM City Iloilo', id: 'way/169812356', detail: 'Mandurriao, Iloilo City' },
  { name: 'Jaro Cathedral', id: 'way/222460850', detail: 'Jaro, Iloilo City',
    aliases: ['Jaro Metropolitan Cathedral', 'Cathedral of Santa Isabel de Hungría', 'Cathedral of Saint Elizabeth of Hungary'] },
  { name: 'University of San Agustin', id: 'relation/10668922', detail: 'General Luna Avenue, Iloilo City',
    aliases: ['USA', 'San Ag', 'University of Saint Augustine'] }
].map(place => ({ ...place, ll: PLACES[place.name], area: place.detail }));
const savedPlaces = Object.entries(PLACES).map(([name, ll]) =>
  suggested.find(place => place.name === name) || { name, ll, detail: 'Saved place' });
const noResults = 'No matching place found. Try another name or select a point on the map.';
const unavailable = 'Online place search is unavailable. Try a local or saved place, or select a location on the map.';
const retryDelay = 30000;

function attach(input, which, session) {
  const popup = $(input.id + 'Suggest'), heading = $(input.id + 'SuggestedHeading');
  const list = $(input.id + 'List'), status = $(input.id + 'SearchStatus');
  let items = [], active = -1, timer, request, revision = 0, editing = false, previousRows = '';

  function markActive(scroll = false) {
    for (const [index, row] of Array.from(list.children).entries()) {
      row.classList.toggle('active', index === active);
      row.setAttribute('aria-selected', String(index === active));
    }
    const row = list.children[active];
    if (row) {
      input.setAttribute('aria-activedescendant', row.id);
      if (scroll) row.scrollIntoView({ block: 'nearest' });
    } else input.removeAttribute('aria-activedescendant');
  }

  function render(message = '', showHeading = false) {
    const rows = items.map((place, index) => {
      const note = [place.detail, place.roadIssue && connectionMessage(place.roadIssue)].filter(Boolean).join(' · ');
      return `<li class="opt" role="option" id="${input.id}Opt${index}" data-index="${index}">
        <strong>${esc(place.name)}</strong>${note ? `<small>${esc(note)}</small>` : ''}
      </li>`;
    }).join('');
    if (rows !== previousRows) { list.innerHTML = rows; previousRows = rows; }
    heading.hidden = !showHeading;
    list.hidden = !items.length;
    popup.hidden = !items.length && !message;
    input.setAttribute('aria-expanded', String(!!items.length));
    status.textContent = message;
    markActive();
  }

  function cancel() {
    revision++;
    clearTimeout(timer);
    request?.abort();
    request = null;
  }

  function dismiss() {
    cancel();
    editing = false; items = []; active = -1;
    render();
    input.value = state.names[which];
  }

  function showSuggested() {
    items = suggested; active = -1;
    render('', true);
  }

  function update() {
    cancel();
    editing = true;
    const query = input.value.trim().replace(/\s+/g, ' ');
    const key = placeWords(query);
    if (!query) { showSuggested(); return; }
    const nearby = session.local?.(query) || [];
    const localPlaces = [...savedPlaces, ...nearby];
    items = mergeMatches(query, localPlaces);
    const hasLocalMatch = items.length > 0;
    active = -1;

    if (key.length < 3) { render('Type at least 3 characters to search online.'); return; }
    const apply = features => {
      const selected = items[active];
      const matches = geocodedMatches(features, session.graph);
      items = mergeMatches(query, localPlaces, matches);
      active = selected ? items.indexOf(selected) : -1;
      render(items.length ? '' : noResults);
    };
    const cacheKey = query.toLowerCase();
    const cached = session.cache.get(cacheKey);
    if (cached && cached.until > Date.now()) { apply(cached.features); return; }
    if (Date.now() < session.retryAfter) { render(unavailable); return; }

    render(hasLocalMatch ? '' : 'Searching for places…');
    const id = revision;
    timer = setTimeout(async () => {
      const controller = new AbortController();
      request = controller;
      const timeout = setTimeout(() => controller.abort(), 6000);
      session.nextRequest = Date.now() + 1000;
      try {
        const response = await fetch(session.provider.url(query), {
          signal: controller.signal, credentials: 'omit'
        });
        if (id !== revision) return;
        if (!response.ok) throw new Error('Geocoder request failed');
        const data = await response.json();
        if (id !== revision) return;
        if (!Array.isArray(data.features) || data.geocoding?.errors?.length) throw new Error('Invalid geocoder response');
        session.cache.delete(cacheKey);
        if (session.cache.size >= 32) session.cache.delete(session.cache.keys().next().value);
        session.cache.set(cacheKey, { features: data.features, until: Date.now() + 300000 });
        apply(data.features);
      } catch {
        if (id === revision) {
          session.retryAfter = Date.now() + retryDelay;
          render(unavailable);
        }
      } finally {
        clearTimeout(timeout);
        if (request === controller) request = null;
      }
    }, Math.max(hasLocalMatch ? 850 : 450, session.nextRequest - Date.now()));
  }

  function choose(index) {
    const place = items[index];
    if (!place) return;
    setPoint(which, place.ll, place.name);
    dismiss();
    if (!map.getBounds().contains(place.ll)) map.panTo(place.ll, { animate: false });
  }

  input.addEventListener('focus', () => {
    // Touch browsers can re-dispatch focus before tapping a suggestion.
    if (editing) return;
    input.select();
    showSuggested();
  });
  input.addEventListener('input', event => { if (!event.isComposing) update(); });
  input.addEventListener('compositionstart', () => {
    cancel();
    editing = true; items = []; active = -1;
    render();
  });
  input.addEventListener('compositionend', update);
  input.addEventListener('keydown', event => {
    if (event.isComposing) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (popup.hidden && !editing) showSuggested();
      if (!items.length) return;
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      active = active < 0 ? (direction > 0 ? 0 : items.length - 1) : (active + direction + items.length) % items.length;
      markActive(true);
    } else if (event.key === 'Enter' && !popup.hidden && active >= 0) {
      event.preventDefault();
      choose(active);
    } else if (event.key === 'Escape' && !popup.hidden) {
      event.stopPropagation();
      dismiss();
    }
  });
  input.addEventListener('blur', dismiss);
  list.addEventListener('mousedown', event => {
    if (event.target.closest('[data-index]')) event.preventDefault();
  });
  list.addEventListener('click', event => {
    const row = event.target.closest('[data-index]');
    if (row) { choose(Number(row.dataset.index)); input.blur(); }
  });

  return { dismiss, refresh: () => { if (editing && document.activeElement === input) update(); } };
}

export function initPlaceSearch() {
  const provider = geocoderFor(location.hostname);
  $('searchProvider').textContent = provider.name;
  $('searchProvider').href = provider.credit;
  const session = { provider, graph: null, cache: new Map(), nextRequest: 0, retryAfter: 0 };
  const fields = [attach($('from'), 's', session), attach($('to'), 'e', session)];
  async function loadCityPlaces() {
    try {
      const response = await fetch('data/iloilo-places.json');
      if (!response.ok) return;
      session.local = await cityPlaceIndex(await response.json());
      for (const field of fields) field.refresh();
    } catch { /* Saved places and online search remain available. */ }
  }
  loadCityPlaces();
  on('graph:ready', graph => {
    session.graph = graph;
    for (const field of fields) field.refresh();
  });
  on('workspace:changed', mode => {
    if (mode !== 'route') for (const field of fields) field.dismiss();
  });
}
