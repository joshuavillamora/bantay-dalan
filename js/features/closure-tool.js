/* One drawing tool for the header logo, freehand strokes, and the two-point fallback. */
import { $ } from '../utils/dom.js';
import { on } from '../events.js';
import { map, setMapHint } from '../map/map.js';
import { closureArea, closureDraft, closurePreview, setClosedRoadInteraction } from '../map/closure-view.js';
import { selectRoads } from '../graph/closure-selection.js';
import { runInSlices } from '../utils/work-slices.js';

const container = map.getContainer(), logo = $('closureLogo');
let graph, phase, area = false, pointer, draft, highlight, first, review, locks;
let cursor, draftFrame, revision = 0, draggedLogo = false;

export const isDrawing = () => !!phase;
const focus = id => $(id).focus();
const label = () => area ? 'Area' : 'Line';
const coordinates = ({ lat, lng }) => [lat, lng];
const latLng = event => coordinates(map.mouseEventToLatLng(event));
const primary = event => event.isPrimary && event.button === 0;
const activeSurface = (x, y) => {
  const target = document.elementFromPoint(x, y);
  return !!target && container.contains(target) && !target.closest('.leaflet-control, .leaflet-popup');
};

function showCursor(x, y) {
  cursor.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  cursor.hidden = false;
}

function lockMap(lock) {
  if (lock && !locks) {
    locks = [map.dragging, map.touchZoom].filter(handler => handler?.enabled());
    locks.forEach(handler => handler.disable());
  } else if (!lock && locks) {
    locks.forEach(handler => handler.enable());
    locks = null;
  }
}

function setPhase(next, hint = '') {
  phase = next;
  const freehand = phase === 'armed' || phase === 'stroke';
  $('closureSetup').hidden = phase !== 'setup';
  $('closeDraw').hidden = phase === 'review';
  $('closeReview').hidden = phase !== 'review';
  $('closeDraw').textContent = phase ? 'Cancel drawing' : 'Draw closure';
  $('closeDraw').setAttribute('aria-pressed', !!phase);
  logo.disabled = phase !== 'setup';
  logo.classList.toggle('picked-up', freehand);
  container.classList.toggle('drawing', freehand || phase === 'points');
  container.classList.toggle('freehand', freehand);
  container.classList.toggle('drawing-stroke', phase === 'stroke');
  lockMap(freehand);
  setClosedRoadInteraction(!phase);
  setMapHint(hint);
}

function chooseShape(next) {
  area = next;
  $('closeArea').setAttribute('aria-pressed', area);
  $('closeLine').setAttribute('aria-pressed', !area);
}

function ready() {
  setPhase('setup', `${label()} closure. Pick up the logo or select Use drawing tool.`);
}

function dropPointer() {
  const current = pointer;
  pointer = null;
  if (current?.target.hasPointerCapture(current.id)) current.target.releasePointerCapture(current.id);
  cursor.hidden = true;
}

function clearDraft() {
  cancelAnimationFrame(draftFrame);
  draftFrame = null;
  draft?.remove(); highlight?.remove();
  draft = highlight = null;
  first = null;
}

export function cancelClosureTool(restoreFocus = false) {
  if (!phase) return;
  revision++;
  dropPointer();
  clearDraft();
  review = null;
  setPhase(null);
  if (restoreFocus) focus('closeDraw');
}

function arm(twoPoint = false) {
  if (phase !== 'setup') return;
  if (twoPoint) chooseShape(false);
  const freehandHint = area ? 'Draw a loop and finish near where you started.' : 'Draw across the roads you want to close.';
  setPhase(twoPoint ? 'points' : 'armed', twoPoint
    ? 'Click the first point or press Enter to use the map center.'
    : `${freehandHint} Escape cancels.`);
  container.focus({ preventScroll: true });
}

function mapResolution(point) {
  const origin = map.latLngToContainerPoint(point);
  const a = map.containerPointToLatLng(origin);
  const b = map.containerPointToLatLng(origin.add([1, -1]));
  return [Math.abs(b.lat - a.lat), Math.abs(b.lng - a.lng)];
}

function footprint(points, pixel) {
  let minLat = Infinity, minLng = Infinity, maxLat = -Infinity, maxLng = -Infinity;
  for (const [lat, lng] of points) {
    minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
    minLng = Math.min(minLng, lng); maxLng = Math.max(maxLng, lng);
  }
  return [(maxLat - minLat) / pixel[0], (maxLng - minLng) / pixel[1]];
}

async function complete(points, pixel, notice) {
  dropPointer();
  clearDraft();
  const [height, width] = footprint(points, pixel);
  const [lat, lng] = points[0], [endLat, endLng] = points.at(-1);
  const gap = Math.hypot((endLat - lat) / pixel[0], (endLng - lng) / pixel[1]);
  function retry(message) {
    clearDraft();
    notice(message);
    ready();
    focus('closeStart');
  }
  if (area && gap > 24) return retry('Finish the loop near where you started.');
  if (area ? points.length < 3 || Math.min(height, width) < 4 : Math.max(height, width) < 4) {
    return retry(area ? 'Draw a larger loop around the roads you want to close.' : 'Draw a longer line across the road.');
  }
  setPhase('selecting', 'Finding modeled roads…');
  draft = area ? closureArea(points) : closureDraft().setLatLngs(points);
  const current = ++revision, keepGoing = () => current === revision;
  let result;
  try {
    result = await runInSlices(selectRoads(graph, points, { area, pixel }), { keepGoing });
  } catch (error) {
    console.error('Could not select modeled roads', error);
    if (keepGoing()) retry('Could not select roads. Try drawing again.');
    return;
  }
  if (!keepGoing() || !result) return;
  const { keys, segments } = result.value;
  if (!keys.size) return retry('No modeled roads were selected. Try drawing across a road.');
  highlight = closurePreview([...segments.values()]);
  review = { keys, segments, name: `${label()} closure` };
  $('closeQuestion').textContent = `Close ${segments.size.toLocaleString()} road ${segments.size === 1 ? 'segment' : 'segments'}?`;
  setPhase('review', 'Review the highlighted roads, then apply or cancel.');
  focus('closeApply');
}

function capture(event, kind, target, details) {
  pointer = { id: event.pointerId, kind, target, ...details };
  target.setPointerCapture(pointer.id);
}

export function initClosureTool({ apply, notice }) {
  cursor = logo.querySelector('img').cloneNode();
  cursor.id = 'closureCursor';
  cursor.className = '';
  cursor.hidden = true;
  cursor.setAttribute('aria-hidden', 'true');
  document.body.append(cursor);

  on('graph:ready', g => { graph = g; $('closeDraw').disabled = false; });
  on('workspace:changed', mode => { if (mode !== 'disrupt') cancelClosureTool(); });
  $('closeDraw').onclick = () => {
    if (phase) return cancelClosureTool(true);
    notice('');
    ready();
    focus(area ? 'closeArea' : 'closeLine');
  };
  $('closeLine').onclick = () => { chooseShape(false); ready(); };
  $('closeArea').onclick = () => { chooseShape(true); ready(); };
  $('closeStart').onclick = () => arm();
  $('closePoints').onclick = () => arm(true);
  $('closeCancel').onclick = () => cancelClosureTool(true);
  $('closeApply').onclick = () => {
    if (phase !== 'review') return;
    const selection = review;
    cancelClosureTool(true);
    apply(selection);
  };
  logo.onclick = event => { if (!draggedLogo || event.detail === 0) arm(); };
  logo.addEventListener('pointerdown', event => {
    if (phase !== 'setup' || !primary(event)) return;
    draggedLogo = false;
    capture(event, 'logo', logo, { x: event.clientX, y: event.clientY });
  });
  container.addEventListener('pointerdown', event => {
    if (phase !== 'armed' || !primary(event) || !activeSurface(event.clientX, event.clientY)) return;
    event.preventDefault();
    const point = latLng(event);
    capture(event, 'stroke', container, { points: [point], pixel: mapResolution(point) });
    draft = closureDraft().setLatLngs([point]);
    setPhase('stroke', area ? 'Release near the start to close the loop.' : 'Release to review the roads.');
    showCursor(event.clientX, event.clientY);
  }, true);

  function addPoint(event) {
    const point = latLng(event), previous = pointer.points.at(-1);
    if (point[0] !== previous[0] || point[1] !== previous[1]) pointer.points.push(point);
  }
  window.addEventListener('pointermove', event => {
    if (!pointer) {
      if (phase === 'armed' && activeSurface(event.clientX, event.clientY)) showCursor(event.clientX, event.clientY);
      else cursor.hidden = true;
      return;
    }
    if (pointer.id !== event.pointerId) return;
    if (pointer.kind === 'logo') {
      draggedLogo ||= Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) >= 5;
      if (!draggedLogo) return;
    } else {
      if (!activeSurface(event.clientX, event.clientY)) return cancelClosureTool(true);
      addPoint(event);
      if (!draftFrame) draftFrame = requestAnimationFrame(() => {
        draftFrame = null;
        draft.setLatLngs(pointer.points);
      });
    }
    showCursor(event.clientX, event.clientY);
  });
  window.addEventListener('pointerup', event => {
    if (pointer?.id !== event.pointerId) return;
    const overMap = activeSurface(event.clientX, event.clientY);
    if (pointer.kind === 'logo') {
      dropPointer();
      if (draggedLogo && overMap) arm();
      return;
    }
    if (!overMap) return cancelClosureTool(true);
    addPoint(event);
    complete(pointer.points, pointer.pixel, notice);
  });
  const interrupted = event => { if (pointer?.id === event.pointerId) cancelClosureTool(); };
  window.addEventListener('pointercancel', interrupted);
  window.addEventListener('lostpointercapture', interrupted);
  window.addEventListener('blur', () => cancelClosureTool());
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancelClosureTool(); });
  map.on('movestart zoomstart resize', () => { if (phase === 'stroke') cancelClosureTool(true); });

  function pick(point) {
    if (phase !== 'points') return;
    if (first) complete([first, point], mapResolution(first), notice);
    else {
      first = point;
      draft = closureDraft().setLatLngs([point]);
      setMapHint('Choose the second point. Use arrow keys to move the map and Enter to use its center.');
    }
  }
  map.on('click', event => pick(coordinates(event.latlng)));
  map.on('mousemove', event => { if (phase === 'points' && first) draft.setLatLngs([first, event.latlng]); });
  container.addEventListener('keydown', event => {
    if (event.target === container && event.key === 'Enter' && phase === 'points') {
      event.preventDefault();
      pick(coordinates(map.getCenter()));
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && phase) {
      event.preventDefault();
      cancelClosureTool(true);
    }
  });
}
