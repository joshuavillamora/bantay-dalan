/* Start python3 -m http.server 8000, then run node tests/routing-browser.mjs. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const temp = await mkdtemp(join(tmpdir(), 'chokepoint-browser-'));
const chrome = process.env.CHROME_BIN || (process.platform === 'darwin'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : 'google-chrome');
const browser = spawn(chrome, [
  '--headless', '--no-first-run', '--disable-background-networking', '--remote-debugging-port=0',
  `--user-data-dir=${temp}`, 'about:blank'
]);
let ws, stderr = '', launchError;
browser.on('error', error => { launchError = error; });
browser.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });

async function waitFor(probe, label, timeout = 30000) {
  for (const end = Date.now() + timeout; Date.now() < end;) {
    if (launchError) throw launchError;
    const value = await probe();
    if (value) return value;
    await sleep(35);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

try {
  const [, port] = await waitFor(() => stderr.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/), 'Chrome');
  const [tab] = await fetch(`http://127.0.0.1:${port}/json/list`).then(response => response.json());
  ws = new WebSocket(tab.webSocketDebuggerUrl);
  await once(ws, 'open');
  const pending = new Map(), uncaught = [], loggedErrors = [], loggedWarnings = [];
  let seq = 0;
  ws.onmessage = ({ data }) => {
    const reply = JSON.parse(data);
    if (reply.method === 'Runtime.exceptionThrown') uncaught.push(reply.params.exceptionDetails);
    if (reply.method === 'Runtime.consoleAPICalled' && reply.params.type === 'error') {
      loggedErrors.push(reply.params.args.map(arg => arg.value ?? arg.description).join(' '));
    }
    if (reply.method === 'Runtime.consoleAPICalled' && reply.params.type === 'warning') {
      loggedWarnings.push(reply.params.args.map(arg => arg.value ?? arg.description).join(' '));
    }
    const call = pending.get(reply.id);
    if (!call) return;
    pending.delete(reply.id);
    if (reply.error) call.reject(new Error(reply.error.message));
    else call.resolve(reply.result);
  };
  function cdp(method, params = {}) {
    return new Promise((resolve, reject) => {
      pending.set(++seq, { resolve, reject });
      ws.send(JSON.stringify({ id: seq, method, params }));
    });
  }
  async function page(fn, ...args) {
    const reply = await cdp('Runtime.evaluate', {
      expression: `(${fn})(...${JSON.stringify(args)})`, awaitPromise: true, returnByValue: true
    });
    if (reply.exceptionDetails) throw new Error(reply.exceptionDetails.exception?.description ?? reply.exceptionDetails.text);
    return reply.result.value;
  }
  const click = id => page(id => document.getElementById(id).click(), id);
  const selectAlgorithm = value => page(value => {
    $('algo').value = value;
    $('algo').dispatchEvent(new Event('change'));
  }, value);
  const status = () => page(() => $('lt').textContent);
  const result = (headline = 'Route found') => waitFor(() => page(headline => !state.run && $('lt').textContent === headline, headline), headline);
  const compare = async () => {
    const footer = await status();
    await click('compareBtn');
    const summary = await waitFor(() => page(() => $('comparisonStatus').textContent.startsWith('Comparison completed.')
      && !$('compareBtn').disabled && $('comparisonStatus').textContent), 'comparison');
    assert.equal(await status(), footer);
    assert.equal(await page(() => $('res').querySelectorAll('tbody tr').length), 4);
    return summary;
  };

  await cdp('Runtime.enable');
  await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: process.env.BROWSER_BASE_URL || 'http://127.0.0.1:8000/' });
  await waitFor(() => page(() => document.getElementById('lt')?.textContent === 'Ready to route'), 'graph ready');
  await page(async () => {
    const modules = await Promise.all([
      import('/js/utils/dom.js'), import('/js/state.js'), import('/js/graph/road-graph.js'), import('/js/algorithms/index.js'),
      import('/js/features/route-points.js'), import('/js/features/closures.js'), import('/js/map/map.js'), import('/js/map/explore-layer.js'),
      import('/js/config.js')
    ]);
    Object.assign(window, ...modules);
    window.routeLayer = () => {
      let line;
      map.eachLayer(layer => { if (layer.options.color === '#1e4ba8') line = layer; });
      return line;
    };
  });

  const verifyRoute = async () => {
    const actual = await page(async () => {
      const base = await loadGraph(), graph = getRoutingGraph();
      const { s, t } = snapRouteEndpoints(base, state.start, state.end);
      const reference = ALGORITHMS.dijkstra.run(graph, s, t, state.mode);
      let item;
      do { item = reference.next(); } while (!item.done);
      const { path, mode, dist, time, name } = state.route;
      const metric = mode === 'fast' ? 'time' : 'dist';
      return {
        name, mode, dist, time, error: Math.abs(routeMetrics(graph, item.value)[metric] - state.route[metric]),
        totals: routeMetrics(graph, path), connectsEndpoints: path[0] === s && path.at(-1) === t
      };
    });
    assert.equal(actual.connectsEndpoints, true);
    assert.equal(actual.dist, actual.totals.dist);
    assert.equal(actual.time, actual.totals.time);
    assert.ok(actual.error <= 1e-6, `unrounded ${actual.mode} cost differs by ${actual.error}`);
    await waitFor(() => page(() => routeLayer()?.getLatLngs().length === state.route.path.length
      && routeLayer().getElement()?.getAttribute('d')?.startsWith('M')), 'complete Leaflet route');
    return actual;
  };

  await click('help');
  assert.deepEqual(await page(() => ({
    title: document.title, header: document.querySelector('h1').textContent,
    meta: document.querySelector('meta[name="application-name"]').content,
    help: $('welcome').open && $('wTitle').textContent,
    algorithms: [...$('algo').options].map(option => option.value)
  })), {
    title: 'CHOKEPOINT · Road Network Analysis & Resilience', header: 'CHOKEPOINT',
    meta: 'CHOKEPOINT', help: 'CHOKEPOINT', algorithms: ['bidir', 'astar', 'lpa']
  });
  await page(() => {
    $('welcome').close();
    document.querySelector('[data-mode=compare]').click();
    $('spd').value = 100;
  });
  await selectAlgorithm('astar');
  await click('visualize');
  await result();
  const original = await verifyRoute();
  const expansionCount = await page(() => $('sN').textContent);
  assert.match(await compare(), /0 active closures.*Optimal cost checked against Dijkstra/);
  assert.equal(await page(() => $('res').querySelectorAll('.verified').length), 3);
  await page(() => {
    document.querySelector('[data-mode=route]').click();
    document.querySelector('[data-mode=compare]').click();
  });
  assert.equal(await status(), 'Route found');
  console.log('Original A* case reproduced successfully', { ...original, processed: expansionCount });

  await page(() => {
    $('spd').value = 0;
    $('visualize').click();
    $('pause').click();
    $('step').click();
  });
  assert.equal(await status(), 'Search paused');
  assert.equal(await page(() => $('sN').textContent), '1');
  await compare();
  await click('pause');
  assert.match(await status(), /A\* is searching/);
  await click('skip');
  await result();
  await verifyRoute();
  for (const algorithm of ['bidir', 'lpa']) {
    await selectAlgorithm(algorithm);
    await page(() => { $('spd').value = 100; $('visualize').click(); });
    await result();
    await verifyRoute();
  }

  await page(() => {
    $('mShort').click();
    setPoint('e', [11.708529, 122.366856], 'Kalibo Municipal Hall');
  });
  await selectAlgorithm('astar');
  await click('go');
  await result();
  console.log('Long shortest route', await verifyRoute());
  assert.match(await compare(), /Shortest distance.*Optimal cost checked against Dijkstra/);
  const backgrounds = [];
  for (const style of ['satellite', 'hybrid', 'streets']) {
    await page(style => {
      $('mapStyle').value = style;
      $('mapStyle').dispatchEvent(new Event('change'));
    }, style);
    backgrounds.push(await waitFor(() => page(() => {
      const source = $('mapSource').textContent;
      return !source.startsWith('Loading') && source;
    }), style + ' tiles or fallback'));
    await verifyRoute();
    assert.equal(await status(), 'Route found');
  }
  console.log('Pause, Step, Resume, Skip, workspace changes, primary algorithms, baseline, and basemap switches passed', backgrounds);

  await page(() => {
    $('mFast').click();
    setPoint('e', PLACES['Iloilo Airport (Cabatuan)'], 'Iloilo Airport (Cabatuan)');
  });
  await selectAlgorithm('lpa');
  await click('go');
  await result();
  const open = await verifyRoute();
  // Draw across an interior edge of the actual open route using the map's closure click handler.
  await page(async () => {
    const graph = await loadGraph(), { path } = state.route;
    const i = path.length >> 1, u = path[i - 1], v = path[i];
    const lat = (graph.lat[u] + graph.lat[v]) / 2, lng = (graph.lng[u] + graph.lng[v]) / 2;
    const dx = graph.lng[v] - graph.lng[u], dy = graph.lat[v] - graph.lat[u];
    const scale = .00013 / Math.hypot(dx, dy);
    document.querySelector('[data-mode=disrupt]').click();
    $('closeDraw').click();
    map.fire('click', { latlng: L.latLng(lat + dx * scale, lng - dy * scale) });
    map.fire('click', { latlng: L.latLng(lat - dx * scale, lng + dy * scale) });
  });
  await result('Route updated');
  assert.equal(await page(() => getClosures().length), 1);
  assert.notEqual((await verifyRoute()).time, open.time);
  assert.match(await page(() => $('repairResult').textContent), /Reused search state/);
  assert.match(await compare(), /1 active closure.*Optimal cost checked against Dijkstra/);
  for (const algorithm of ['astar', 'bidir', 'lpa']) {
    await selectAlgorithm(algorithm);
    await click('go');
    await result();
    await verifyRoute();
  }
  await page(async () => {
    const graph = await loadGraph(), start = state.route.path[0];
    addLinkClosure(new Set(graph.adj[start].map(([end]) => start * graph.lat.length + end)), 'Test all departures');
  });
  await result('No route available');
  assert.equal(await page(() => state.route.path), null);
  assert.equal(await page(() => $('msg').textContent), 'No route is available under the current road closures.');
  assert.match(await compare(), /2 active closures.*No route is available under the current road closures/);
  await click('closeUndo');
  await result('Route updated');
  await verifyRoute();
  await click('closeClear');
  await result('Route updated');
  assert.equal((await verifyRoute()).time, open.time);
  console.log('Drawn road closure, multiple closures, LPA* incremental repairs and reopening passed');

  await selectAlgorithm('astar');
  await page(() => {
    setPoint('s', [10.7491925, 122.5310925], 'Costa Tropical Street entrance');
    setPoint('e', [10.7492695, 122.5311181], 'Costa Tropical Street end');
  });
  await click('go');
  await result();
  await verifyRoute();
  await click('swap');
  await click('go');
  await result('No route available');
  assert.match(await page(() => $('msg').textContent), /not connected/);
  await page(() => {
    setPoint('s', PLACES[DEFAULT_START], DEFAULT_START);
    setPoint('e', [10.665884, 122.590546], 'Jordan Public Market');
  });
  await click('go');
  await result('No route available');
  assert.match(await compare(), /not connected/);
  await page(() => setPoint('e', [14.654027, 121.049856], 'Quezon Memorial Circle'));
  await click('go');
  assert.equal(await status(), 'Endpoint unavailable');
  assert.match(await page(() => $('msg').textContent), /outside CHOKEPOINT's current road-network coverage/);
  console.log('One-way rules, disconnected Guimaras trip, unsupported endpoint, and their statuses passed');

  await page(() => {
    setPoint('e', PLACES[DEFAULT_END], DEFAULT_END);
    document.querySelector('[data-mode=compare]').click();
    $('spd').value = 0;
    $('visualize').click();
    $('compareBtn').click();
    $('mShort').click();
  });
  assert.equal(await status(), 'Outdated route calculation discarded');
  await sleep(150);
  assert.equal(await page(() => !state.run && !state.route && !routeLayer() && $('resBox').hidden), true);
  assert.match(await page(() => $('comparisonStatus').textContent), /Outdated comparison discarded/);
  await page(() => { $('mFast').click(); $('visualize').click(); });
  await selectAlgorithm('bidir');
  assert.equal(await status(), 'Search cancelled');
  await selectAlgorithm('astar');
  await click('go');
  await result();
  await page(() => {
    $('visualize').click();
    $('reset').click();
  });
  assert.equal(await status(), 'Search reset');
  assert.equal(await page(() => !state.route && !routeLayer()), true);

  await compare();
  await page(() => {
    let draws = 0;
    const setLatLngs = L.Polyline.prototype.setLatLngs;
    L.Polyline.prototype.setLatLngs = function (coordinates) {
      if (this.options.color === '#1e4ba8' && ++draws === 2) {
        L.Polyline.prototype.setLatLngs = setLatLngs;
        throw new Error('Test failure in deferred route drawing');
      }
      return setLatLngs.call(this, coordinates);
    };
    $('spd').value = 100;
    $('visualize').click();
  });
  await result();
  await verifyRoute();
  assert.ok(loggedWarnings.some(warning => warning.includes('Drew the full route instead') && warning.includes('Test failure in deferred route drawing')));

  await page(() => {
    const fitBounds = map.fitBounds;
    map.fitBounds = function () {
      map.fitBounds = fitBounds;
      throw new Error('Test failure while fitting the route');
    };
    $('go').click();
  });
  await result();
  await verifyRoute();
  assert.ok(loggedWarnings.some(warning => warning.includes('Could not fit the map to the route') && warning.includes('Test failure while fitting the route')));

  await page(() => {
    const polyline = L.polyline;
    L.polyline = (points, options) => {
      if (options.color === '#1e4ba8') throw new Error('Test failure creating the route layer');
      return polyline(points, options);
    };
    window.restorePolyline = () => { L.polyline = polyline; };
    $('go').click();
  });
  await result('Route found · Visualization failed');
  await page(() => restorePolyline());
  assert.deepEqual(await page(() => [state.route.dist, state.route.time]), [original.dist, original.time]);
  assert.equal(await page(() => $('res').querySelectorAll('.verified').length), 3);
  assert.equal(await page(() => !routeLayer()), true);
  assert.ok(loggedErrors.some(error => error.includes('Route visualization failed') && error.includes('Test failure creating the route layer')));

  await page(() => {
    const draw = exploreLayer.draw;
    exploreLayer.draw = function () {
      exploreLayer.draw = draw;
      throw new Error('Test failure in deferred search drawing');
    };
    $('visualize').click();
  });
  await result();
  await verifyRoute();
  assert.match(await page(() => $('msg').textContent), /Search visualization failed/);
  assert.ok(loggedErrors.some(error => error.includes('Search visualization failed') && error.includes('Test failure in deferred search drawing')));
  await page(() => {
    const run = ALGORITHMS.astar.run;
    ALGORITHMS.astar.run = function* () {
      ALGORITHMS.astar.run = run;
      throw new Error('Test failure while advancing the search');
    };
    $('go').click();
  });
  await result('Route calculation failed');
  assert.equal(await page(() => !state.route && !routeLayer()), true);
  assert.equal(await page(() => $('res').querySelectorAll('.verified').length), 3);
  assert.ok(loggedErrors.some(error => error.includes('Route calculation failed') && error.includes('Test failure while advancing the search')));
  console.log('Stale results, cancellation, reset, animation recovery, and independent route/search rendering failures passed');

  await page(() => document.querySelector('[data-mode=analyze]').click());
  await click('chokeBtn');
  await waitFor(() => page(() => !$('chokeBtn').disabled && $('chokeList').children.length), 'critical-road analysis');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await page(() => {
    document.querySelector('[data-mode=route]').click();
    const input = $('to');
    input.focus();
    input.value = 'Jaro Cathedral';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await waitFor(() => page(() => $('toList').querySelector('strong')?.textContent === 'Jaro Cathedral'), 'Jaro Cathedral search result');
  await page(() => {
    for (const key of ['ArrowDown', 'Enter']) $('to').dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
  assert.equal(await page(() => state.names.e), 'Jaro Cathedral');
  assert.equal(await page(() => {
    const header = document.querySelector('.app-header');
    return header.scrollWidth === header.clientWidth && $('map').clientHeight > 0;
  }), true);
  await click('go');
  await result();
  await verifyRoute();
  assert.deepEqual(uncaught, []);
  console.log('Critical-road analysis, mobile-sized layout, and zero uncaught app exceptions passed');
} finally {
  ws?.close();
  if (browser.pid && browser.exitCode === null && browser.signalCode === null) {
    browser.kill('SIGTERM');
    await once(browser, 'exit');
  }
  await rm(temp, { recursive: true, force: true, maxRetries: 3 });
}
