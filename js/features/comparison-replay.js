import { ALGORITHMS, REPAIR_SEARCH_STYLE, RETAINED_SEARCH_COLOR, searchSwatch } from '../algorithms/index.js';
import { $ } from '../utils/dom.js';
import { showComparisonView } from '../map/comparison-view.js';
import { playbackCount } from './search-trace.js';

export function initComparisonReplay() {
  const launch = $('compareReplay'), controls = $('comparisonPlayback'), layouts = $('compareLayout');
  const focus = $('compareFocus'), timeline = $('compareTimeline'), play = $('comparePlay');
  const opacity = $('compareOpacity'), routes = $('compareRoutes');
  const showAll = $('compareShowAll'), hideAll = $('compareHideAll');
  const wide = matchMedia('(min-width: 1160px) and (min-height: 650px)');
  const localize = new Intl.NumberFormat();
  let data, view, frame = 0, cursor = 0, longest = 0, playing = false, previous = 0, backlogged = false;
  const visible = new Set();
  const tracks = {};
  for (const [key, algorithm] of Object.entries({ ...ALGORITHMS, repair: REPAIR_SEARCH_STYLE })) {
    if (key !== 'repair') focus.add(new Option(algorithm.name, key));
    const label = document.createElement('label'), check = document.createElement('input');
    const dot = document.createElement('i'), name = document.createElement('span'), count = document.createElement('output');
    check.type = 'checkbox'; check.checked = key !== 'repair';
    label.dataset.track = key;
    label.hidden = key === 'repair';
    name.id = 'compareTrack-' + key;
    check.setAttribute('aria-labelledby', name.id);
    count.setAttribute('aria-live', 'off');
    count.title = $('uniqueNodesHelp').textContent;
    dot.className = 'algorithm-swatch'; dot.style.background = searchSwatch(algorithm);
    name.textContent = key === 'lpa' ? 'LPA* · fresh' : algorithm.name + (algorithm.baseline ? ' (baseline)' : '');
    label.append(check, dot, name, count);
    $('comparisonTracks').append(label);
    tracks[key] = { label, check, count };
    check.onchange = () => {
      if (check.checked) visible.add(key); else visible.delete(key);
      seek();
    };
  }
  $('forwardSwatch').style.background = ALGORITHMS.bidir.color;
  $('backwardSwatch').style.background = ALGORITHMS.bidir.backward;
  $('retainedSwatch').style.background = RETAINED_SEARCH_COLOR;

  const available = () => !data ? [] : layouts.value === 'overlay' && data.repair ? [...data.rows, data.repair] : data.rows;
  const attachRepair = repair => { data.repair = repair && { ...repair, key: 'repair', name: REPAIR_SEARCH_STYLE.name }; };
  function setTimelineLimit() {
    const next = Math.max(0, ...available().map(row => row.trace.count));
    const fraction = $('compareSync').value === 'progress' && longest;
    cursor = fraction ? cursor / longest * next : Math.min(cursor, next);
    longest = next;
    timeline.max = longest;
    play.disabled = !longest;
  }
  function appearance() {
    $('compareOpacityValue').textContent = `${opacity.value}%`;
    view?.setAppearance(+opacity.value / 100, routes.checked);
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(animate);
  }
  function playback(active) {
    playing = active; previous = 0;
    play.textContent = active ? 'Pause' : 'Play';
    $('compareReplayStatus').textContent = active ? 'Playing recorded events' : 'Playback paused';
  }
  function seek() {
    if (!view) return;
    const tick = Math.floor(cursor), sync = $('compareSync').value, mode = layouts.value;
    timeline.value = tick;
    timeline.setAttribute('aria-valuetext', sync === 'progress'
      ? `${Math.round(100 * tick / (longest || 1))}%` : `Event ${localize.format(tick)} of ${localize.format(longest)}`);
    const rows = available(), selected = [];
    const hasRepair = rows.some(row => row.key === 'repair');
    tracks.repair.label.hidden = !hasRepair;
    $('compareRepairKey').hidden = !hasRepair;
    for (const row of rows) {
      const end = playbackCount(tick, row.trace.count, longest, sync);
      const shown = mode === 'focus' ? row.key === focus.value : visible.has(row.key);
      const { count, check } = tracks[row.key];
      check.disabled = mode === 'focus';
      const format = n => localize.format(n);
      const value = `${format(end)} / ${format(row.trace.count)} events`;
      const directions = row.key === 'bidir' ? row.trace.directions(end) : null;
      const directionText = directions ? ` · forward ${format(directions.forward)} · backward ${format(directions.backward)}` : '';
      const text = `${value}${directionText} · ${format(row.trace.uniqueNodes(end))} / ${format(row.uniqueNodes)} unique nodes`;
      if (count.textContent !== text) count.textContent = text;
      if (mode !== 'focus' || shown) selected.push({ row, end, visible: shown });
    }
    view.set(selected);
    showAll.disabled = mode === 'focus' || rows.every(row => visible.has(row.key));
    hideAll.disabled = mode === 'focus' || rows.every(row => !visible.has(row.key));
    $('compareStep').disabled = playing || tick >= longest;
  }
  function animate(now) {
    if (playing) {
      // A capped time delta avoids skipping through the replay after tab suspension.
      if (previous && !backlogged) {
        cursor = Math.min(longest, cursor + Math.min(now - previous, 80) / 1000 * +$('compareSpeed').value);
        seek();
      }
      previous = now;
    }
    const pending = view?.paint();
    backlogged = !!pending;
    const finished = !pending && Math.floor(cursor) === longest;
    if (finished && playing) { playback(false); seek(); }
    const status = pending ? 'Drawing selected events…'
      : finished ? 'Playback complete' : playing ? 'Playing recorded events' : 'Playback paused';
    if ($('compareReplayStatus').textContent !== status) $('compareReplayStatus').textContent = status;
    frame = 0;
    if (pending || playing) schedule();
  }
  function hide() {
    playback(false);
    cancelAnimationFrame(frame); frame = 0;
    backlogged = false;
    view?.destroy(); view = undefined;
    controls.hidden = true;
    launch.textContent = 'Replay compared searches';
    launch.setAttribute('aria-expanded', 'false');
  }
  function layout() {
    if (!data || controls.hidden) return;
    $('compareReplayStatus').textContent = 'Preparing maps…';
    view?.destroy();
    setTimelineLimit();
    focus.hidden = layouts.value !== 'focus';
    view = showComparisonView(data, layouts.value, schedule);
    appearance();
    seek();
  }
  function chooseAvailableLayout() {
    layouts.querySelector('[value="split"]').disabled = !wide.matches;
    if (!wide.matches && layouts.value === 'split') layouts.value = 'overlay';
  }
  wide.addEventListener('change', () => {
    const previousLayout = layouts.value;
    chooseAvailableLayout();
    if (previousLayout !== layouts.value) layout();
  });
  launch.onclick = () => {
    if (view) { hide(); return; }
    if (!data) return;
    if (layouts.value === 'split' && !wide.matches) layouts.value = 'overlay';
    chooseAvailableLayout();
    launch.setAttribute('aria-expanded', 'true');
    launch.textContent = 'Close search replay';
    controls.hidden = false;
    layout();
  };
  $('compareExit').onclick = () => { hide(); launch.focus(); };
  const setVisibility = enabled => {
    for (const { key } of available()) {
      tracks[key].check.checked = enabled;
      if (enabled) visible.add(key); else visible.delete(key);
    }
    seek();
  };
  showAll.onclick = () => setVisibility(true);
  hideAll.onclick = () => setVisibility(false);
  opacity.oninput = routes.onchange = appearance;
  layouts.onchange = layout;
  focus.onchange = seek;
  $('compareSync').onchange = () => { playback(false); seek(); };
  timeline.oninput = () => { playback(false); cursor = +timeline.value; seek(); };
  play.onclick = () => {
    if (!longest) return;
    if (!playing && cursor >= longest) { cursor = 0; seek(); }
    playback(!playing);
    seek();
  };
  $('compareRestart').onclick = () => { playback(false); cursor = 0; seek(); };
  $('compareStep').onclick = () => { cursor = Math.min(longest, Math.floor(cursor) + 1); seek(); };

  return {
    hide,
    set(next, repair) {
      hide();
      data = next;
      if (data) attachRepair(repair);
      launch.hidden = !next;
      cursor = 0;
      setTimelineLimit();
      visible.clear();
      for (const [key, { check }] of Object.entries(tracks)) {
        if (key !== 'repair') visible.add(key);
        check.checked = key !== 'repair';
      }
    },
    setRepair(repair) {
      if (!data) return;
      attachRepair(repair);
      setTimelineLimit();
      seek();
    }
  };
}
