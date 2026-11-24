/* Start python3 scripts/serve.py, then run node tests/routing-browser.mjs. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { PLACES } from '../js/config.js';

const temp = await mkdtemp(join(tmpdir(), 'chokepoint-browser-'));
const offline = process.env.CHOKEPOINT_OFFLINE === '1';
const appUrl = new URL(process.env.BROWSER_BASE_URL || 'http://127.0.0.1:8000/');
if (offline) appUrl.searchParams.set('offline', '1');
appUrl.searchParams.set('network', 'panay-guimaras');
const demo = JSON.parse(await readFile(new URL('../scripts/presentation-fixture.json', import.meta.url), 'utf8'));
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
  const external = [], intercepted = [], cancelledRequests = new Set();
  // Chrome can remove an aborted Leaflet range request before assigning a Network ID.
  const interceptionErrors = () => intercepted.filter(({ error, networkId, url }) =>
    error !== 'Invalid InterceptionId.' || !(cancelledRequests.has(networkId) ||
      (!networkId && new URL(url).pathname.endsWith('.pmtiles'))));
  let denyExternal = offline, missingMaps = false, startupFault;
  let seq = 0;
  ws.onmessage = ({ data }) => {
    const reply = JSON.parse(data);
    if (reply.method === 'Network.loadingFailed' && reply.params.canceled) cancelledRequests.add(reply.params.requestId);
    if (reply.method === 'Fetch.requestPaused') {
      const { requestId, networkId, request: { url } } = reply.params;
      const report = error => intercepted.push({ error: error.message, networkId, url });
      const resource = new URL(url);
      if (startupFault && resource.pathname === '/js/utils/format.js') {
        const missing = startupFault === 'missing';
        cdp('Fetch.fulfillRequest', {
          requestId, responseCode: missing ? 404 : 200,
          responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }],
          body: Buffer.from(missing ? 'Module unavailable' : 'export const fmtD = value => value;').toString('base64')
        }).catch(report);
        return;
      }
      const isExternal = resource.origin !== appUrl.origin;
      if (isExternal && denyExternal) external.push(url);
      const denied = isExternal && denyExternal || missingMaps && resource.pathname.endsWith('.pmtiles');
      cdp(denied ? 'Fetch.failRequest' : 'Fetch.continueRequest', denied ? { requestId, errorReason: 'InternetDisconnected' } : { requestId })
        .catch(report);
    }
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
  const reviewClosure = () => waitFor(() => page(() => !$('closeReview').hidden && $('closeQuestion').textContent), 'closure review');
  const mouse = (type, [x, y], buttons = 0) => cdp('Input.dispatchMouseEvent', { type, x, y, buttons, button: 'left', clickCount: 1 });
  const key = async key => {
    const windowsVirtualKeyCode = { Enter: 13, Escape: 27, ArrowDown: 40, ArrowUp: 38 }[key];
    await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code: key, windowsVirtualKeyCode });
    if (key === 'Enter') await cdp('Input.dispatchKeyEvent', { type: 'char', key, code: key, text: '\r', windowsVirtualKeyCode });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode });
  };
  const stroke = async points => {
    await mouse('mouseMoved', points[0]);
    await mouse('mousePressed', points[0], 1);
    for (const point of points.slice(1)) await mouse('mouseMoved', point, 1);
    await mouse('mouseReleased', points.at(-1));
  };
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
  await cdp('Network.enable');
  await cdp('Network.setCacheDisabled', { cacheDisabled: true });
  if (offline) {
    await cdp('Network.setBypassServiceWorker', { bypass: true });
    await cdp('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
  }
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  const defaultUrl = new URL(appUrl);
  defaultUrl.searchParams.delete('network');
  await cdp('Page.navigate', { url: defaultUrl.href });
  await waitFor(() => page(() => document.getElementById('lt')?.textContent === 'Ready to route' &&
    document.getElementById('routingRegion').value === 'iloilo-city'), 'Iloilo City default startup');
  await cdp('Page.navigate', { url: appUrl.href });
  await waitFor(() => page(() => document.getElementById('lt')?.textContent === 'Ready to route'), 'graph ready');
  await page(async () => {
    window.openWorkspace = mode => {
      const button = Array.from(document.querySelectorAll('[data-mode]')).find(button => button.dataset.mode === mode);
      if (button.getAttribute('aria-expanded') !== 'true') button.click();
    };
    const modules = await Promise.all([
      import('/js/utils/dom.js'), import('/js/state.js'), import('/js/graph/road-graph.js'), import('/js/algorithms/index.js'),
      import('/js/features/route-points.js'), import('/js/features/closures.js'), import('/js/map/map.js'), import('/js/map/explore-layer.js'),
      import('/js/config.js')
    ]);
    Object.assign(window, ...modules);
    window.closurePixels = points => {
      const rect = map.getContainer().getBoundingClientRect();
      return points.map(ll => {
        const point = map.latLngToContainerPoint(ll);
        return [rect.left + point.x, rect.top + point.y];
      });
    };
    window.closureLayers = () => {
      const layers = [];
      map.eachLayer(layer => { if (layer.options.color === '#d7263d') layers.push(layer); });
      return layers;
    };
    window.routeLayer = () => {
      let line;
      map.eachLayer(layer => { if (layer.options.color === '#1e4ba8') line = layer; });
      return line;
    };
  });
  const offlineMapReady = () => waitFor(() => page(() =>
    $('mapSource').textContent.startsWith('Offline ') && Boolean(map.getPane('offlineTiles').querySelector('canvas.leaflet-tile-loaded'))),
  'visible offline vector map');
  await cdp('DOM.enable');
  await cdp('CSS.enable');
  const assertGeistGlyphs = async selectors => {
    const { root } = await cdp('DOM.getDocument');
    for (const selector of selectors) {
      const { nodeId } = await cdp('DOM.querySelector', { nodeId: root.nodeId, selector });
      assert.ok(nodeId, selector);
      const fonts = await waitFor(async () => {
        const { fonts } = await cdp('CSS.getPlatformFontsForNode', { nodeId });
        return fonts.length ? fonts : false;
      }, selector + ' rendered glyphs', 5000);
      assert.ok(fonts.length && fonts.every(font => /^Geist/.test(font.postScriptName)
        && font.isCustomFont && font.glyphCount > 0),
        `${selector}: ${JSON.stringify(fonts)}`);
    }
  };
  const typography = await page(async () => {
    const weights = [400, 500, 600, 700];
    const faces = await Promise.all(weights.map(weight => document.fonts.load(`${weight} 14px "Geist Sans"`, 'CHOKEPOINT')));
    return {
      loaded: faces.map(group => group.some(face => face.status === 'loaded' && face.family.includes('Geist Sans'))),
      files: performance.getEntriesByType('resource').filter(entry => entry.name.endsWith('.woff2') && entry.encodedBodySize > 0)
        .map(entry => new URL(entry.name)).map(url => [url.origin, url.pathname.split('/').at(-1)]),
      forms: ['#from', '#to', '#regionPicker', '#mapStyle', '#go'].map(selector =>
        getComputedStyle(document.querySelector(selector)).fontFamily.split(',')[0].replaceAll('"', ''))
    };
  });
  assert.deepEqual(typography.loaded, [true, true, true, true]);
  for (const [origin] of typography.files) assert.equal(origin, appUrl.origin);
  assert.deepEqual(typography.files.map(([, file]) => file).sort(),
    ['Geist-Variable.woff2']);
  assert.deepEqual(typography.forms, Array(5).fill('Geist Sans'));
  await assertGeistGlyphs(['.brand p', '.mode-rail button', '#go', '#lt', '.leaflet-control-zoom-in']);
  assert.equal(await page(async () => {
    const heading = $('route-title');
    const fonts = await document.fonts.load('25px Anton', heading.textContent);
    return getComputedStyle(heading).fontFamily.split(',')[0].replaceAll('"', '') === 'Anton' &&
      fonts.some(face => face.family === 'Anton' && face.status === 'loaded');
  }), true);
  console.log('Geist Sans: one local variable font at four weights rendered in app and map controls');
  if (offline) {
    await offlineMapReady();
    const startup = await page(async () => {
      const resources = performance.getEntriesByType('resource').filter(entry => entry.name.includes('.pmtiles'));
      return { ms: performance.now(), load: (await loadGraph()).loadTimings,
        localMapBytes: resources.reduce((sum, entry) => sum + entry.encodedBodySize, 0),
        rangeRequests: resources.length };
    });
    await cdp('HeapProfiler.collectGarbage');
    const { usedSize } = await cdp('Runtime.getHeapUsage');
    assert.ok(startup.localMapBytes > 0 && startup.localMapBytes < 5 * 1024 * 1024);
    assert.deepEqual(external, []);
    console.log('OFFLINE STARTUP ' + JSON.stringify({ ...startup, heapMiB: usedSize / 1048576 }));
  }

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

  const captureView = async (name, mode) => {
    if (!process.env.UI_SCREENSHOTS) return;
    if (mode) await page(mode => openWorkspace(mode), mode);
    await sleep(340);
    const { data } = await cdp('Page.captureScreenshot', { format: 'png' });
    await writeFile(join(process.env.UI_SCREENSHOTS, name + '.png'), Buffer.from(data, 'base64'));
    if (mode) await page(() => openWorkspace('compare'));
  };
  const allCostsAgree = () => page(() => $('comparisonStatus').classList.contains('comparison-success') &&
    $('res').querySelectorAll('tbody tr').length === 4);
  await click('help');
  await assertGeistGlyphs(['#wTitle', '.quick-start dt', '#wGo']);
  await captureView('help');
  assert.deepEqual(await page(() => ({
    title: document.title, header: document.querySelector('h1 img').alt,
    meta: document.querySelector('meta[name="application-name"]').content,
    help: $('welcome').open && $('wTitle').textContent,
    algorithms: [...$('algo').options].map(option => option.value)
  })), {
    title: 'CHOKEPOINT · Road Network Analysis & Resilience', header: 'CHOKEPOINT',
    meta: 'CHOKEPOINT', help: 'CHOKEPOINT', algorithms: ['bidir', 'astar', 'lpa', 'dijkstra']
  });
  assert.deepEqual(await page(() => [...document.querySelectorAll('.panel-heading h2')].map(node => node.textContent)),
    ['ROUTE PLANNER', 'ROAD CLOSURES', 'CRITICAL ROADS', 'COMPARE ALGORITHMS']);
  assert.deepEqual(await page(() => [...$('mapStyle').options].map(option => option.textContent)),
    ['Streets', 'Offline map', 'Satellite', 'Hybrid', 'Network view']);
  assert.deepEqual(await page(() => [...$('routingRegion').querySelectorAll('optgroup')].map(group => group.label)),
    ['Dedicated study areas', 'Luzon', 'Visayas', 'Mindanao', 'International study area', 'Existing geographic extracts and presentation']);
  const regionOptions = await page(async () => {
    const { routingRegions } = await import('/js/graph/region-manifest.js');
    const available = [...$('routingRegion').options].map(option => option.value);
    return { ids: available.slice().sort(), unique: new Set(available).size, expected: routingRegions.map(region => region.id).sort() };
  });
  assert.deepEqual(regionOptions.ids, regionOptions.expected);
  assert.equal(regionOptions.unique, regionOptions.expected.length);
  await page(() => { $('welcome').close(); $('regionPicker').focus(); });
  await key('Enter');
  await waitFor(() => page(() => $('regionDialog').open && document.activeElement === $('regionSearch')), 'network picker focus');
  await page(() => {
    $('regionSearch').value = 'iloilo province';
    $('regionSearch').dispatchEvent(new Event('input'));
  });
  assert.deepEqual(await page(() => [...$('regionChoices').querySelectorAll('[role=option]')].map(row => row.textContent)),
    ['Iloilo Province', 'Iloilo City and Province']);
  await captureView('network-picker');
  await page(() => {
    $('regionSearch').value = 'no such network';
    $('regionSearch').dispatchEvent(new Event('input'));
  });
  assert.equal(await page(() => !$('regionEmpty').hidden && !$('regionSearch').hasAttribute('aria-activedescendant')), true);
  await key('Escape');
  await waitFor(() => page(() => !$('regionDialog').open && document.activeElement === $('regionPicker')), 'network picker focus restored');
  await page(() => $('regionPicker').click());
  await key('ArrowDown');
  await key('ArrowUp');
  await key('Escape');
  const artwork = await page(async () => {
    const images = [...document.querySelectorAll('.mode-rail img, .endpoint-marker')];
    await Promise.all(images.map(img => img.decode()));
    return images.map(img => [new URL(img.src).pathname.split('/').at(-1), img.naturalWidth, img.naturalHeight]);
  });
  assert.deepEqual(artwork, [
    ...['route', 'disrupt', 'analyze', 'compare'].map(name => [name + '.png', 168, 168]),
    ['point-a.png', 114, 150], ['point-b.png', 114, 150]
  ]);
  assert.deepEqual(await page(async () => {
    const artwork = [...document.querySelectorAll('.logo, .brand-wordmark')];
    await Promise.all(artwork.map(img => img.decode()));
    return [artwork[0].naturalWidth, ...artwork.map(img => new URL(img.currentSrc).pathname.split('/').at(-1))];
  }), [1254, 'chokepoint-app-icon.png', 'chokepoint-wordmark-header.svg']);
  assert.equal(await page(() => !!document.getElementById('panelToggle')), false);
  await page(() => {
    openWorkspace('compare');
    $('spd').value = 100;
  });
  await selectAlgorithm('astar');
  await click('visualize');
  await result();
  const original = await verifyRoute();
  assert.equal(original.dist.toFixed(2), '5356.37');
  assert.equal(original.time.toFixed(3), '396.833');
  const mapStyle = value => page(value => {
    $('mapStyle').value = value;
    $('mapStyle').dispatchEvent(new Event('change'));
  }, value);
  const graphPaint = label => waitFor(() => page(() => {
    const canvas = document.querySelector('.network-graph[data-ready]');
    return canvas ? { ...canvas.dataset } : false;
  }), label);
  const viewBeforeNetwork = await page(() => ({
    camera: [map.getCenter().lat, map.getCenter().lng, map.getZoom()],
    style: $('mapStyle').value, time: state.route.time, events: $('sN').textContent,
    mode: document.querySelector('[data-mode][aria-current]').dataset.mode
  }));
  const requestsBeforeNetwork = external.length;
  await mapStyle('network');
  const networkCity = await graphPaint('network graph at route zoom');
  assert.ok(+networkCity.roads > 25);
  assert.equal(await page(() => map.getPane('tilePane').childElementCount + map.getPane('offlineTiles').childElementCount), 0);
  assert.deepEqual(await page(() => ({
    camera: [map.getCenter().lat, map.getCenter().lng, map.getZoom()],
    time: state.route.time, events: $('sN').textContent,
    mode: document.querySelector('[data-mode][aria-current]').dataset.mode
  })), { camera: viewBeforeNetwork.camera, time: viewBeforeNetwork.time, events: viewBeforeNetwork.events, mode: viewBeforeNetwork.mode });
  await page(() => {
    const selectLayer = (layer, checked) => {
      const input = document.querySelector(`[data-layer=${layer}]`);
      input.checked = checked;
      input.dispatchEvent(new Event('change'));
    };
    window.selectNetworkLayer = selectLayer;
    map.setView([10.705, 122.558], 17, { animate: false });
    $('networkLayers').open = true;
    selectLayer('vertices', true);
    selectLayer('directions', true);
    selectLayer('search', false);
  });
  const networkDetail = await waitFor(async () => {
    const paint = await graphPaint('network graph at street zoom');
    return +paint.vertices && +paint.directions ? paint : false;
  }, 'network vertices and direction arrows');
  assert.equal(await page(() => getComputedStyle(document.querySelector('.search-traces')).visibility), 'hidden');
  await page(() => selectNetworkLayer('search', true));
  await captureView('network-view');
  await page(() => {
    map.setZoom(10, { animate: false });
    delete document.querySelector('.network-graph').dataset.ready;
  });
  const networkOverview = await graphPaint('regional network overview');
  assert.ok(+networkOverview.roads > 25);
  assert.equal(networkOverview.vertices, '0');
  assert.equal(networkOverview.directions, '0');
  assert.equal(external.length, requestsBeforeNetwork);
  console.log('NETWORK VIEW ' + JSON.stringify({ networkCity, networkDetail, networkOverview }));
  await page(([lat, lng, zoom]) => { map.setView([lat, lng], zoom, { animate: false }); }, viewBeforeNetwork.camera);
  await mapStyle(offline ? 'offline' : 'streets');
  assert.equal(await page(() => $('networkLayers').hidden && !document.querySelector('.network-graph')), true);
  if (offline) await offlineMapReady();
  else if (process.env.UI_SCREENSHOTS) {
    for (const [style, label] of [['streets', 'OpenStreetMap'], ['satellite', 'Stadia imagery'], ['hybrid', 'Stadia Alidade Satellite']]) {
      await mapStyle(style);
      await waitFor(() => page(label => $('mapSource').textContent.startsWith(label) &&
        [...map.getPane('tilePane').querySelectorAll('img.leaflet-tile-loaded')].some(img => img.complete && img.naturalWidth), label), style + ' provider tiles', 15000);
      await captureView('map-' + style);
      console.log('LIVE BASEMAP ' + style + ' · ' + label);
    }
    await mapStyle('streets');
  }
  await captureView('route', 'route');
  if (process.env.UI_SCREENSHOTS) {
    await page(() => {
      openWorkspace('route');
      document.querySelector('.network-coverage').open = true;
      $('routingRegion').focus();
    });
    await captureView('regional-selector');
    await page(() => {
      document.querySelector('.network-coverage').open = false;
      $('mapStyle').focus();
    });
    await captureView('map-style-selector');
    await page(() => openWorkspace('compare'));
  }
  const expansionCount = await page(() => $('sN').textContent);
  assert.match(await compare(), /All optimized costs agree/);
  assert.equal(await page(() => $('comparisonContext').textContent), 'Estimated fastest · 0 closures');
  assert.deepEqual(await page(() => [...$('res').querySelectorAll('tbody th abbr')].map(node => node.textContent)),
    ['Bidirectional Dijkstra', 'A*', 'LPA*', 'Standard Dijkstra']);
  assert.deepEqual(await page(() => [$('sD').textContent, $('sT').textContent, $('sharedDistance').textContent, $('sharedTime').textContent]),
    ['5.36 km', '6.61 min', '5.36 km', '6.61 min']);
  await assertGeistGlyphs(['#sharedDistance', '#res tbody .num']);
  assert.deepEqual(await page(() => [...$('res').querySelectorAll('tbody tr')].map(row => row.children[1].textContent)),
    ['4,939', '5,548', '5,548', '8,730']);
  assert.ok(await allCostsAgree());
  await page(() => {
    openWorkspace('route');
    openWorkspace('compare');
  });
  assert.equal(await status(), 'Route found');
  console.log('Original A* case reproduced successfully', { ...original, processed: expansionCount });

  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await page(() => {
    $('spd').value = 0;
    $('visualize').click();
    $('pause').click();
    $('step').click();
  });
  assert.equal(await status(), 'Search paused');
  await mapStyle('network');
  await graphPaint('Network view with paused playback');
  assert.equal(await status(), 'Search paused');
  assert.equal(await page(() => $('sN').textContent), '1');
  await mapStyle(offline ? 'offline' : 'streets');
  if (offline) await offlineMapReady();
  await captureView('paused');
  assert.equal(await page(() => $('sN').textContent), '1');
  await compare();
  await click('pause');
  assert.match(await status(), /Visualizing A\* search/);
  await click('skip');
  await result();
  await verifyRoute();
  await cdp('Emulation.setEmulatedMedia', { features: [] });
  const demoStarted = performance.now();
  for (const algorithm of ['bidir', 'lpa']) {
    await selectAlgorithm(algorithm);
    await page(() => { $('spd').value = 100; $('visualize').click(); });
    await result();
    await verifyRoute();
  }
  assert.deepEqual(await page(() => [state.names.s, state.names.e, state.mode]), [demo.start, demo.end, demo.mode]);
  assert.equal(await page(() => $('sN').textContent), '5,548');
  await page(({ center, zoom }) => {
    openWorkspace('disrupt');
    map.setView(center, zoom, { animate: false });
    $('closeDraw').click();
    $('closeLine').click();
    $('closureLogo').click();
  }, demo);
  if (offline) {
    await waitFor(() => page(() => [...map.getPane('offlineTiles').querySelectorAll('canvas.leaflet-tile-loaded')].some(tile => {
      const rgb = tile.getContext('2d').getImageData(0, 0, tile.width, tile.height).data;
      const colors = new Set();
      for (let i = 0; i < rgb.length; i += 172) if (rgb[i + 3]) colors.add(rgb[i] * 65536 + rgb[i + 1] * 256 + rgb[i + 2]);
      return colors.size > 20;
    })), 'street furniture, labels and fills in the offline map');
    if (process.env.OFFLINE_SCREENSHOT) {
      await sleep(250);
      const { data } = await cdp('Page.captureScreenshot', { format: 'png' });
      await writeFile(process.env.OFFLINE_SCREENSHOT, Buffer.from(data, 'base64'));
    }
  }
  await stroke(await page(line => closurePixels(line), demo.line));
  assert.equal(await reviewClosure(), 'Close 1 road segment?');
  await captureView('closure-preview');
  const appliedAt = performance.now();
  await click('closeApply');
  await result('Route updated');
  const detour = await verifyRoute();
  assert.equal(detour.dist.toFixed(2), '5749.64');
  const detourRoads = await page(() => {
    const graph = getRoutingGraph(), path = state.route.path;
    return [...new Set(path.slice(1).map((v, i) => graph.ways[graph.adj[path[i]].find(edge => edge[0] === v)[3]]))];
  });
  assert.ok(detourRoads.includes('Donato Pison Avenue') && detourRoads.includes('Pison Avenue'));
  const repair = await page(() => $('repairResult').textContent);
  assert.match(repair, /^6,180 search events .*Reused search state/);
  assert.ok(Math.abs(detour.time - 571.8404680848702) < 1e-6);
  assert.deepEqual(await page(async () => {
    const n = (await loadGraph()).lat.length;
    return [...getClosures()[0].keys].map(key => [Math.floor(key / n), key % n]);
  }), [demo.edge]);
  await captureView('disrupt');
  const repairWallMs = Math.round(performance.now() - appliedAt);
  await mapStyle('network');
  await page(() => selectNetworkLayer('closures', false));
  assert.equal(await page(() => getComputedStyle(map.getPane('closures')).visibility === 'hidden' && getClosures().length === 1), true);
  await page(() => selectNetworkLayer('closures', true));
  assert.equal(await page(() => getComputedStyle(map.getPane('closures')).visibility), 'visible');
  await mapStyle(offline ? 'offline' : 'streets');
  if (offline) await offlineMapReady();
  await page(() => openWorkspace('compare'));
  assert.match(await compare(), /All optimized costs agree/);
  assert.equal(await page(() => $('comparisonContext').textContent), 'Estimated fastest · 1 closure');
  const freshLpa = await page(() => [...document.querySelectorAll('#res tbody tr')]
    .find(row => row.firstElementChild.textContent.includes('LPA*')).children[1].textContent);
  assert.equal(freshLpa, '11,524');
  assert.match(await page(() => $('repairComparison').textContent), /11,524 events.*46.4% fewer events.*Both costs match Dijkstra/);
  await captureView('compare');
  await page(() => { $('repairComparison').scrollIntoView({ block: 'nearest' }); });
  await captureView('compare-repair');
  await page(() => openWorkspace('disrupt'));
  await click('closeUndo');
  await result('Route updated');
  assert.ok(Math.abs((await verifyRoute()).time - original.time) < 1e-6);
  await page(() => openWorkspace('analyze'));
  const analyzeStarted = performance.now();
  await click('chokeBtn');
  await waitFor(() => page(() => !$('chokeBtn').disabled && $('chokeList').children.length), 'presentation critical-road analysis');
  const analysisWallMs = Math.round(performance.now() - analyzeStarted);
  assert.match(await page(() => $('chokeList').firstElementChild.textContent), /General Luna Avenue[\s\S]*Affected trips · 15\/36/);
  assert.equal(await page(() => $('sampledTrips').textContent), '36');
  await captureView('analyze');
  await mapStyle('network');
  await page(() => selectNetworkLayer('critical', false));
  assert.equal(await page(() => getComputedStyle(map.getPane('criticalRoads')).visibility === 'hidden' && $('chokeList').children.length > 0), true);
  await page(() => selectNetworkLayer('critical', true));
  assert.equal(await page(() => getComputedStyle(map.getPane('criticalRoads')).visibility), 'visible');
  await mapStyle(offline ? 'offline' : 'streets');
  if (offline) await offlineMapReady();
  console.log('Presentation rehearsal', { wallMs: Math.round(performance.now() - demoStarted), repairWallMs, analysisWallMs, freshLpa, repair, detour });

  await page(() => {
    $('mShort').click();
    setPoint('e', [11.708529, 122.366856], 'Kalibo Municipal Hall');
  });
  await selectAlgorithm('astar');
  await click('go');
  await result();
  console.log('Long shortest route', await verifyRoute());
  assert.match(await compare(), /All optimized costs agree/);
  assert.equal(await page(() => $('comparisonContext').textContent), 'Shortest distance · 0 closures');
  const backgrounds = [];
  for (const style of offline ? ['streets', 'offline'] : ['satellite', 'hybrid', 'streets', 'offline', 'streets']) {
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
  // Drag the logo to the map, then draw across the actual open airport route.
  await page(async () => {
    const graph = await loadGraph(), { path } = state.route;
    const i = path.length >> 1, u = path[i - 1], v = path[i];
    const lat = (graph.lat[u] + graph.lat[v]) / 2, lng = (graph.lng[u] + graph.lng[v]) / 2;
    const dx = graph.lng[v] - graph.lng[u], dy = graph.lat[v] - graph.lat[u];
    const scale = .00013 / Math.hypot(dx, dy);
    window.closureFixture = [[lat + dx * scale, lng - dy * scale], [lat - dx * scale, lng + dy * scale]];
    openWorkspace('disrupt');
    map.setView([lat, lng], 18, { animate: false });
    $('closeDraw').click();
  });
  const logoPoint = () => page(() => {
    const { left, top, width, height } = $('closureLogo').getBoundingClientRect();
    return [left + width / 2, top + height / 2];
  });
  const headerLogo = await logoPoint(), linePoints = () => page(() => closurePixels(closureFixture));
  const [drop] = await linePoints();
  await mouse('mousePressed', headerLogo, 1);
  await mouse('mouseMoved', drop, 1);
  assert.equal(await page(() => !$('closureCursor').hidden), true);
  await mouse('mouseReleased', drop);
  assert.equal(await page(() => $('map').classList.contains('freehand') && !map.dragging.enabled()), true);
  await stroke(await linePoints());
  assert.match(await reviewClosure(), /^Close [\d,]+ road segment/);
  assert.equal(await page(() => getClosures().length === 0 && $('closureCursor').hidden && map.dragging.enabled()), true);
  assert.deepEqual(await logoPoint(), headerLogo);
  await click('closeApply');
  await result('Route updated');
  assert.equal(await page(() => getClosures().length), 1);
  assert.notEqual((await verifyRoute()).time, open.time);
  assert.match(await page(() => $('repairResult').textContent), /Reused search state/);
  assert.match(await compare(), /All optimized costs agree/);
  assert.equal(await page(() => $('comparisonContext').textContent), 'Estimated fastest · 1 closure');
  for (const [style, zoom] of offline ? [['offline', 18], ['offline', 14]] : [['satellite', 18], ['hybrid', 14], ['streets', 18]]) {
    await page((style, zoom) => {
      map.setView(closureFixture[0], zoom, { animate: false });
      $('mapStyle').value = style;
      $('mapStyle').dispatchEvent(new Event('change'));
    }, style, zoom);
    await waitFor(() => page(() => {
      if ($('mapSource').textContent.startsWith('Loading')) return false;
      const canvas = map.getPane('closures').querySelector('canvas');
      const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] === 215 && data[i + 1] === 38 && data[i + 2] === 61 && data[i + 3] > 200) return true;
      }
      return false;
    }), 'solid closure stroke on ' + style);
  }

  // Repeat the same selection with two clicks. Undo leaves the shared roads closed.
  await page(() => {
    $('closeDraw').click();
    $('closePoints').click();
    for (const ll of closureFixture) {
      map.setView(ll, 18, { animate: false });
      $('map').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    }
  });
  await reviewClosure();
  const beforeOverlap = await page(() => closureLayers().reduce((sum, layer) => sum + layer.getLatLngs().length, 0));
  await click('closeApply');
  await result('Route updated');
  const overlap = await page(() => {
    const [a, b] = getClosures();
    const visible = closureLayers().reduce((sum, layer) => sum + layer.getLatLngs().length, 0);
    return { visible, unique: new Set([...a.segments.keys(), ...b.segments.keys()]).size,
      shared: [...a.segments.keys()].some(key => b.segments.has(key)) };
  });
  assert.equal(overlap.shared, true);
  assert.equal(overlap.visible, overlap.unique);
  await click('closeUndo');
  await result('Route updated');
  assert.equal(await page(() => closureLayers().reduce((sum, layer) => sum + layer.getLatLngs().length, 0)), beforeOverlap);
  assert.notEqual((await verifyRoute()).time, open.time);

  for (const algorithm of ['astar', 'bidir', 'lpa']) {
    await selectAlgorithm(algorithm);
    await click('go');
    await result();
    await verifyRoute();
  }
  await page(async () => {
    const graph = await loadGraph(), start = state.route.path[0];
    const lat = graph.lat[start], lng = graph.lng[start], d = .00010;
    window.areaFixture = [[lat - d, lng - d], [lat - d, lng + d], [lat + d, lng + d], [lat + d, lng - d], [lat - d, lng - d]];
    map.setView([lat, lng], 18, { animate: false });
    $('closeDraw').click();
    $('closeArea').click();
    $('closeStart').click();
  });
  await stroke(await page(() => closurePixels(areaFixture)));
  await reviewClosure();
  assert.equal(await page(() => getClosures().length), 1);
  await click('closeApply');
  await result('No route available');
  assert.equal(await page(async () => {
    const graph = await loadGraph(), { s } = snapRouteEndpoints(graph, state.start, state.end);
    return graph.adj[s].length > 0 && getRoutingGraph().adj[s].length === 0;
  }), true);
  assert.equal(await page(() => state.route.path), null);
  assert.equal(await page(() => $('msg').textContent), 'No route is available under the current road closures.');
  await captureView('unreachable');
  assert.match(await compare(), /No route is available under the current road closures/);
  assert.equal(await page(() => $('comparisonContext').textContent), 'Estimated fastest · 2 closures');
  await page(() => $('closureList').querySelector('li:last-child button').click());
  await result('Route updated');
  await verifyRoute();
  await click('closeClear');
  await click('closeClearCancel');
  assert.equal(await page(() => getClosures().length), 1);
  await click('closeClear');
  await click('closeClearApply');
  await result('Route updated');
  assert.equal((await verifyRoute()).time, open.time);

  for (const cancel of ['review', 'escape', 'panel', 'outside']) {
    await page(() => {
      openWorkspace('disrupt');
      map.setView(closureFixture[0], 18, { animate: false });
      $('closeDraw').click();
      $('closeLine').click();
      $('closureLogo').click();
    });
    const points = await linePoints();
    if (cancel === 'review') {
      await stroke(points);
      await reviewClosure();
      await click('closeCancel');
    } else {
      await mouse('mousePressed', points[0], 1);
      await mouse('mouseMoved', points[1], 1);
      if (cancel === 'escape') await key('Escape');
      if (cancel === 'panel') await page(() => openWorkspace('route'));
      await mouse('mouseReleased', cancel === 'outside' ? [3, 3] : points[1]);
    }
    assert.equal(await page(() => {
      let temporary = false;
      map.eachLayer(layer => {
        if (layer.options.pane === 'closurePreview' && layer instanceof L.Path && !(layer instanceof L.Renderer)) temporary = true;
      });
      return getClosures().length === 0 && $('closureCursor').hidden && $('closeReview').hidden &&
        !$('map').classList.contains('drawing') && map.dragging.enabled() && !temporary;
    }), true, 'drawing cleanup after ' + cancel);
  }
  await page(() => {
    map.setView([9.8, 122.6], 15, { animate: false });
    $('closeDraw').click();
    $('closeStart').click();
  });
  await stroke(await page(() => closurePixels([[9.7995, 122.6], [9.8005, 122.6]])));
  await waitFor(() => page(() => $('closeHint').textContent.startsWith('No modeled roads were selected')), 'empty closure selection');
  assert.equal(await page(() => $('closeReview').hidden && getClosures().length === 0), true);
  await click('closeDraw');
  console.log('Logo drag, line and area closures, overlap, preview, LPA* repair, clear, reopen, and cancellation passed');

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
  assert.match(await page(() => $('msg').textContent), /No route was found|No valid route exists in this direction/);
  await page(() => {
    setPoint('s', PLACES[DEFAULT_START], DEFAULT_START);
    setPoint('e', [10.665884, 122.590546], 'Jordan Public Market');
  });
  await click('go');
  await result('No route available');
  assert.match(await compare(), /No route was found|No valid route exists in this direction/);
  await page(() => setPoint('e', [14.654027, 121.049856], 'Quezon Memorial Circle'));
  await click('go');
  await result('No route available');
  assert.match(await page(() => $('msg').textContent), /covers both endpoints/);
  await page(() => setPoint('e', [51.5072, -0.1276], 'London'));
  await click('go');
  assert.equal(await status(), 'Endpoint unavailable');
  assert.match(await page(() => $('msg').textContent), /outside CHOKEPOINT's current routing coverage/);
  console.log('One-way rules, disconnected Guimaras trip, unsupported endpoint, and their statuses passed');

  await page(() => {
    setPoint('e', PLACES[DEFAULT_END], DEFAULT_END);
    openWorkspace('compare');
  });
  // Resolve the shared Panay/Iloilo extent before testing cancellation of work already running.
  await click('go');
  await result();
  await page(() => {
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
  assert.ok(await allCostsAgree());
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
  assert.ok(await allCostsAgree());
  assert.ok(loggedErrors.some(error => error.includes('Route calculation failed') && error.includes('Test failure while advancing the search')));
  console.log('Stale results, cancellation, reset, animation recovery, and independent route/search rendering failures passed');

  const type = (query, field = 'to') => page((query, field) => {
    $(field).focus();
    $(field).value = query;
    $(field).dispatchEvent(new Event('input', { bubbles: true }));
  }, query, field);
  const option = (name, field = 'to') => waitFor(() => page((name, field) =>
    [...$(field + 'List').querySelectorAll('strong')].some(item => item.textContent === name), name, field), name + ' result');
  const singaporeModeled = await page(() => [...$('routingRegion').options].some(option => option.value === 'singapore-central-pilot'));
  if (offline) {
    await page(() => openWorkspace('route'));
    await type('Manila');
    await option('Manila');
    await waitFor(() => page(() => $('toSearchStatus').textContent === 'Showing offline results.'), 'national locality index');
    await click('toOpt0');
    await offlineMapReady();
    await page(() => { map.setView([14.654, 121.049], 15, { animate: false }); });
    await type('Quezon Memorial Circle');
    await option('Quezon Memorial Circle');
    assert.match(await page(() => $('toList').textContent), /Local index/);
    await type('No matching place offline regression');
    await waitFor(() => page(() => $('toSearchStatus').textContent.startsWith('No matching local place')), 'offline no-result state');
    const panStart = performance.now();
    await page(() => {
      map.panBy([250, 110], { animate: false });
      map.setZoom(16, { animate: false });
    });
    await waitFor(() => page(() => {
      const tiles = map.getPane('offlineTiles').querySelectorAll('.leaflet-tile-loaded');
      return map.getZoom() === 16 && tiles.length > 2 && $('mapSource').textContent.includes('Philippine');
    }), 'offline vector pan and zoom');
    console.log('OFFLINE MAP AND SEARCH ' + JSON.stringify({ panZoomMs: Math.round(performance.now() - panStart) }));
    await page(() => { map.setView([0, 179], 3, { animate: false }); map.panBy([100, 0], { animate: false }); });
    await offlineMapReady();
    assert.match(await page(() => $('mapSource').textContent), /world overview/);
    assert.ok(await page(() => map.getCenter().lng < -150));
  } else {
  // Deterministic provider responses exercise the browser independently of public API latency.
  await page(() => {
    const fetchReal = window.fetch, realTimer = window.setTimeout;
    const city = (name, country, coordinates) => ({ geometry: { type: 'Point', coordinates },
      properties: { name, country, osm_key: 'place', osm_value: 'city' } });
    const results = {
      'Manila': [city('Manila', 'Philippines', [120.9803621, 14.5904492])],
      '北京': [city('Beijing', 'China', [116.3912972, 39.9057136])],
      'Shanghai': [city('Shanghai', 'China', [121.4691024, 31.2323437])],
      'London': [city('London', 'United Kingdom', [-0.1277653, 51.5074456]), city('London', 'Canada', [-81.2496068, 42.9836747])],
      'Tokyo': [city('Tokyo', 'Japan', [139.7638947, 35.6768601])]
    };
    window.discoveryRequests = [];
    window.setTimeout = (fn, ms, ...args) => realTimer(fn, ms === 6000 ? 80 : ms, ...args);
    window.fetch = (resource, options) => {
      const url = new URL(resource, location.href);
      if (url.hostname !== 'photon.komoot.io') return fetchReal(resource, options);
      const query = url.searchParams.get('q');
      discoveryRequests.push(query);
      if (query === 'Timeout test') return new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason)));
      if (query === 'Tokyo') return new Promise(resolve => realTimer(() => resolve(Response.json({ features: results[query] })), 1700));
      return Promise.resolve(Response.json({ features: results[query] || [] }));
    };
    openWorkspace('route');
  });
  for (const [query, name, ll] of [
    ['Manila', 'Manila', [14.5904492, 120.9803621]],
    ['北京', 'Beijing', [39.9057136, 116.3912972]],
    ['Shanghai', 'Shanghai', [31.2323437, 121.4691024]]
  ]) {
    await type(query);
    await option(name);
    if (query === '北京') {
      await page(() => {
        for (const key of ['ArrowDown', 'Enter']) $('to').dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      });
    } else await click('toOpt0');
    const view = await page(ll => {
      let pin;
      map.eachLayer(layer => {
        if (layer.options.icon?.options.iconUrl?.endsWith('/point-b.png')) pin = layer.getLatLng();
      });
      return { pixelOffset: map.latLngToContainerPoint(ll).distanceTo(map.getSize().divideBy(2)), pin: [pin.lat, pin.lng], zoom: map.getZoom() };
    }, query === 'Manila' ? await page(() => state.end) : ll);
    assert.ok(view.pixelOffset <= 1.5, `${name} centered at zoom ${view.zoom} with a ${view.pixelOffset}px offset`);
    assert.equal(view.zoom, 11);
    assert.ok(view.pin.every((coordinate, index) => Math.abs(coordinate - ll[index]) < (query === 'Manila' ? .03 : 1e-8)));
    const modeled = await page(async ll => (await import('/js/features/routing-region.js')).regionsForPoint(ll).length > 0, ll);
    assert.match(await page(() => $('toAccess').textContent), modeled ? /Switch to/ : /outside CHOKEPOINT's current routing coverage/);
    await click('go');
    assert.equal(await status(), modeled ? 'No route available' : 'Endpoint unavailable');
    assert.equal(await page(() => !state.route && !routeLayer()), true);
    if (query === '北京') await waitFor(() => page(() => $('mapSource').textContent.includes('OpenStreetMap') &&
      [...document.querySelectorAll('.leaflet-tile-loaded')].some(tile => tile.naturalWidth > 0)), 'Beijing Streets tiles');
  }
  await page(() => {
    map.setView([0, 179], 3, { animate: false });
    map.panBy([100, 0], { animate: false });
  });
  assert.ok(await page(() => map.getCenter().lng < -150), 'panning across the world seam wraps the viewport');
  await cdp('Network.enable');
  await cdp('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp('Fetch.enable', { patterns: [{ urlPattern: '*://tile.openstreetmap.org/*', requestStage: 'Request' }] });
  denyExternal = true;
  await page(() => { map.setView([48.8566, 2.3522], 12, { animate: false }); });
  await waitFor(() => page(() => $('mapSource').textContent === 'Map tiles unavailable here'), 'honest overseas tile fallback');
  denyExternal = false;
  await cdp('Fetch.disable');
  await cdp('Network.setCacheDisabled', { cacheDisabled: false });
  await click('studyArea');
  await waitFor(() => page(() => $('mapSource').textContent.includes('OpenStreetMap')), 'tiles recovered after returning to Iloilo');
  await page(() => {
    map.setView([1.29, 103.85], 12, { animate: false });
    $('pickEnd').click();
    map.fire('click', { latlng: L.latLng(1.29, 103.85) });
  });
  const picked = await page(() => ({ point: state.end, name: state.names.e }));
  assert.equal(picked.name, 'Pinned point');
  assert.ok(picked.point.every((coordinate, index) => Math.abs(coordinate - [1.29, 103.85][index]) < 1e-8));
  assert.match(await page(() => $('toAccess').textContent), singaporeModeled ? /Switch to Central Singapore/ : /outside CHOKEPOINT's current routing coverage/);
  await type('Tokyo');
  await waitFor(() => page(() => discoveryRequests.includes('Tokyo')), 'in-flight Tokyo request');
  await type('Lon');
  await type('Lond');
  await type('London');
  await option('London');
  await sleep(1750);
  assert.deepEqual(await page(() => [...$('toList').querySelectorAll('strong')].slice(0, 2).map(node => node.textContent)), ['London', 'London']);
  assert.match(await page(() => $('toOpt0').textContent), /United Kingdom/);
  assert.match(await page(() => $('toOpt1').textContent), /Canada/);
  assert.ok(!(await page(() => discoveryRequests.includes('Lon') || discoveryRequests.includes('Lond'))));
  await type('No results test');
  await waitFor(() => page(() => $('toSearchStatus').textContent.startsWith('No matching')), 'zero results');
  await type('Timeout test');
  await waitFor(() => page(() => $('toSearchStatus').textContent.startsWith('Online place search is temporarily unavailable')), 'provider timeout');
  }
  await type('Plaza Libertad', 'from');
  await option('Plaza Libertad', 'from');
  await click('fromOpt0');
  await type('SM City Iloilo');
  await option('SM City Iloilo');
  await click('toOpt0');
  await click('studyArea');
  await click('go');
  await result();
  await verifyRoute();
  console.log(offline ? 'Cold offline Panay and Philippine basemaps, worldwide overview, and local place search passed'
    : 'Worldwide discovery, tile and pin alignment, duplicate names, stale results, timeout and offline Iloilo fallback passed');

  await page(() => openWorkspace('analyze'));
  await click('chokeBtn');
  await waitFor(() => page(() => !$('chokeBtn').disabled && $('chokeList').children.length), 'critical-road analysis');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  const touch = async (type, point) => cdp('Input.dispatchTouchEvent', { type, touchPoints: point ? [{ x: point[0], y: point[1] }] : [] });
  await page(() => {
    openWorkspace('route');
    const input = $('to');
    input.focus();
    input.value = 'Jaro Cathedral';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await waitFor(() => page(() => $('toList').querySelector('strong')?.textContent === 'Jaro Cathedral'), 'Jaro Cathedral search result');
  const tap = await page(() => {
    const option = $('toOpt0');
    option.scrollIntoView({ block: 'nearest' });
    const box = option.getBoundingClientRect();
    return [Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2)];
  });
  await touch('touchStart', tap);
  await touch('touchEnd');
  await waitFor(() => page(() => state.names.e === 'Jaro Cathedral'), 'touch selects Jaro Cathedral');
  assert.equal(await page(() => {
    const header = document.querySelector('.app-header');
    return header.scrollWidth === header.clientWidth && $('map').clientHeight > 0;
  }), true);
  await click('go');
  await result();
  await verifyRoute();
  await page(() => {
    openWorkspace('disrupt');
    map.setView(areaFixture[0], 18, { animate: false });
    $('closeDraw').click();
    $('closeArea').click();
    $('closeStart').click();
  });
  const mobile = await page(() => closurePixels(areaFixture));
  await touch('touchStart', mobile[0]);
  for (const point of mobile.slice(1)) await touch('touchMove', point);
  await touch('touchEnd');
  await reviewClosure();
  await click('closeCancel');
  assert.equal(await page(() => $('closureCursor').hidden && getClosures().length === 0 && map.dragging.enabled()), true);
  await click('closeDraw');
  await click('closeStart');
  await touch('touchStart', mobile[0]);
  await touch('touchMove', mobile[1]);
  await touch('touchCancel');
  assert.equal(await page(() => $('closureCursor').hidden && $('closeReview').hidden && getClosures().length === 0 && map.dragging.enabled()), true);

  const fixtures = {
    ...JSON.parse(await readFile(new URL('../scripts/administrative-fixtures.json', import.meta.url))),
    ...JSON.parse(await readFile(new URL('../scripts/philippine-region-fixtures.json', import.meta.url))),
    ...JSON.parse(await readFile(new URL('../scripts/iloilo-region-fixture.json', import.meta.url))),
    ...JSON.parse(await readFile(new URL('../scripts/regional-benchmark-fixtures.json', import.meta.url)))
  };
  const chooseRegion = id => page(id => {
    $('routingRegion').value = id;
    $('routingRegion').dispatchEvent(new Event('change'));
  }, id);
  const regionReady = id => waitFor(() => page(id => $('routingRegion').value === id && $('regionProgress').hidden, id), id + ' graph');
  const workspace = name => page(name => openWorkspace(name), name);
  const endpoints = (start, end) => page((start, end) => {
    setPoint('s', start, 'Sample origin');
    setPoint('e', end, 'Sample destination');
  }, start, end);
  const bohol = fixtures['bohol-siquijor'];
  await workspace('route');
  await page(() => {
    const fetchReal = fetch;
    window.regionRequests = [];
    window.fetch = (resource, options) => {
      const path = new URL(resource, location.href).pathname;
      if (/\/data\/regions\/.*\.gz$/.test(path)) regionRequests.push(path);
      if (window.failRegion === path) return Promise.resolve(new Response('', { status: 503 }));
      if (window.corruptRegion === path) return fetchReal(resource, options).then(async response => {
        const bytes = new Uint8Array(await response.arrayBuffer());
        bytes[0] ^= 1;
        return new Response(bytes);
      });
      if (window.delayRegion === path) return new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
      });
      return fetchReal(resource, options);
    };
    addLinkClosure(new Set([3409 * 492603 + 3410]), 'Panay isolation probe');
  });
  await endpoints(bohol.start, bohol.long);
  await page(ll => { map.setView(ll, 14, { animate: false }); }, bohol.start);
  assert.deepEqual(await page(() => regionRequests), []);
  assert.equal(await page(() => getClosures().length), 1);
  await click('go');
  await waitFor(() => page(() => !$('tripRegionOffer').hidden), 'explicit alternative network offer');
  assert.equal(await page(() => $('routingRegion').value), 'panay-guimaras');
  assert.deepEqual(await page(() => regionRequests), []);
  await chooseRegion('bohol-siquijor');
  await regionReady('bohol-siquijor');
  await click('go');
  await result();
  const boholRoute = await verifyRoute();
  assert.equal(await page(() => getClosures().length === 0 && closureLayers().length === 0 && $('repairBox').hidden), true);
  await workspace('compare');
  await compare();
  assert.ok(await allCostsAgree());
  await endpoints(bohol.start, bohol.short);
  await selectAlgorithm('lpa');
  await click('go');
  await result();
  const boholOpenCost = (await verifyRoute()).time;
  const repairStarted = performance.now();
  await page(async () => {
    const g = await loadGraph(), path = state.route.path, i = Math.floor(path.length / 2);
    const u = path[i - 1], v = path[i], n = g.lat.length;
    addLinkClosure(new Set([u * n + v, v * n + u]), 'Bohol repair probe');
  });
  await waitFor(() => page(() => !state.run && !$('repairBox').hidden), 'Bohol incremental closure repair');
  const boholRepairMs = Math.round(performance.now() - repairStarted);
  assert.match(await page(() => $('repairResult').textContent), /Reused search state/);
  if (await page(() => !!state.route.path)) await verifyRoute();
  else assert.match(await page(() => $('msg').textContent), /current road closures/);
  await workspace('disrupt');
  await click('closeUndo');
  await result('Route updated');
  assert.ok(Math.abs((await verifyRoute()).time - boholOpenCost) < 1e-6);
  await workspace('analyze');
  assert.match(await page(() => $('analysisScope').textContent), /Bohol and Siquijor/);
  await click('chokeBtn');
  await waitFor(() => page(() => !$('chokeBtn').disabled && $('chokeHint').textContent.includes('6 routed trips')), 'Bohol CHOKEPOINT');

  await workspace('route');
  await endpoints(bohol.start, bohol.disconnected);
  await click('go');
  await result('No route available');
  assert.match(await page(() => $('msg').textContent), /No route was found|No valid route exists in this direction/);
  await endpoints(PLACES[demo.start], bohol.long);
  await click('go');
  await result('No route available');
  assert.match(await page(() => $('msg').textContent), /covers both endpoints/);
  assert.equal(await page(() => !state.route?.path && !routeLayer()), true);

  await page(() => { window.delayRegion = '/data/regions/leyte-samar.json.gz'; });
  await chooseRegion('leyte-samar');
  await waitFor(() => page(() => !$('regionCancel').hidden), 'cancelable region loading');
  await click('regionCancel');
  await regionReady('bohol-siquijor');
  await page(() => { window.delayRegion = undefined; window.failRegion = '/data/regions/leyte-samar.json.gz'; });
  await chooseRegion('leyte-samar');
  await waitFor(() => page(() => $('msg').textContent.includes('previous network is still available')), 'recoverable region failure');
  await regionReady('bohol-siquijor');
  await page(() => { window.failRegion = undefined; });
  if (offline) {
    await page(() => { window.corruptRegion = '/data/regions/leyte-samar.json.gz'; });
    await chooseRegion('leyte-samar');
    await waitFor(() => page(() => $('msg').textContent.includes('previous network is still available')), 'checksum failure recovery');
    await regionReady('bohol-siquijor');
    await page(() => { window.corruptRegion = undefined; });
  }
  const leyte = fixtures['leyte-samar'];
  await endpoints(leyte.start, leyte.long);
  await selectAlgorithm('astar');
  await chooseRegion('leyte-samar');
  await regionReady('leyte-samar');
  await click('go');
  await result();
  const leyteRoute = await verifyRoute();
  assert.equal(await page(() => !$('res').querySelector('tbody') && $('chokeList').children.length === 0), true);
  await chooseRegion('panay-guimaras');
  await regionReady('panay-guimaras');
  assert.equal(await page(() => !getClosures().length && !state.route && !$('regionProgress').textContent), true);
  await endpoints(PLACES[demo.start], PLACES[demo.end]);
  await click('go');
  await result();
  assert.ok(Math.abs((await verifyRoute()).time - 396.83309194278934) < 1e-6);
  if (singaporeModeled) {
    const singapore = fixtures['singapore-central-pilot'];
    await workspace('route');
    await endpoints(singapore.start, singapore.short);
    await chooseRegion('singapore-central-pilot');
    await regionReady('singapore-central-pilot');
    await click('go');
    await result();
    const pilotRoute = await verifyRoute();
    await workspace('compare');
    await compare();
    assert.ok(await allCostsAgree());
    console.log('Central Singapore explicit loading and comparison passed', { distanceMetres: pilotRoute.dist, modeledSeconds: pilotRoute.time });
  }
  console.log('Regional browser workflows passed', { boholKm: boholRoute.dist / 1000, leyteSamarKm: leyteRoute.dist / 1000, boholRepairMs });

  const iloilo = fixtures['iloilo-city-province'];
  await workspace('route');
  await endpoints(iloilo.start, iloilo.long);
  await page(() => $('regionPicker').focus());
  await key('Enter');
  await waitFor(() => page(() => $('regionDialog').open && document.activeElement === $('regionSearch')), 'opening the picker from the keyboard');
  await page(() => {
    $('regionSearch').value = 'iloilo city province';
    $('regionSearch').dispatchEvent(new Event('input'));
  });
  await key('Enter');
  await regionReady('iloilo-city-province');
  assert.equal(await page(() => !$('regionDialog').open && $('regionPicker').textContent === 'Iloilo City and Province'), true);
  await click('go');
  await result();
  const iloiloRoute = await verifyRoute();
  assert.equal(Math.round(iloiloRoute.dist), 21901);
  await workspace('compare');
  await compare();
  assert.ok(await allCostsAgree());
  console.log('Keyboard-selected Iloilo City and Province verified', { distanceMetres: iloiloRoute.dist, modeledSeconds: iloiloRoute.time });

  for (const id of ['iloilo-province', 'panay-island']) {
    const study = fixtures[id];
    await workspace('route');
    await endpoints(study.start, study.long);
    await chooseRegion(id);
    await regionReady(id);
    assert.equal(await page(async id => {
      const graph = await loadGraph(), [w, s, e, n] = graph.region.bounds;
      return graph.region.id === id && map.getBounds().contains([s, w]) && map.getBounds().contains([n, e]);
    }, id), true);
    await click('go');
    await result();
    const trip = await verifyRoute();
    await workspace('compare');
    await compare();
    assert.ok(await allCostsAgree());
    console.log(study.name + ' browser route', { metres: trip.dist, seconds: trip.time });
  }

  await workspace('route');
  await chooseRegion('iloilo-city');
  await regionReady('iloilo-city');
  await type('West Visayas State University', 'from');
  await option('West Visayas State University', 'from');
  await click('fromOpt0');
  await page(() => setPoint('e', PLACES['Plaza Libertad'], 'Plaza Libertad'));
  assert.match(await page(() => $('fromAccess').textContent), /Luna Street public-road access · 133 m/);
  await click('go');
  await result();
  const campusTrip = await verifyRoute();
  assert.ok(Math.abs(campusTrip.time - 223.8409912002169) < 1e-6);
  await captureView('iloilo-campus');
  await workspace('compare');
  await compare();
  assert.ok(await allCostsAgree());
  await workspace('route');
  const eastern = fixtures['ph-800000000'];
  await endpoints(eastern.start, eastern.long);
  await chooseRegion('ph-800000000');
  await regionReady('ph-800000000');
  assert.equal(await page(() => $('studyArea').getAttribute('aria-label')), 'Return to Region VIII — Eastern Visayas');
  const regionInView = () => page(async () => {
    const { bounds: [w, s, e, n] } = (await loadGraph()).region;
    return map.getBounds().contains([s, w]) && map.getBounds().contains([n, e]);
  });
  assert.equal(await regionInView(), true);
  await page(() => { map.setView([10.7, 122.56], 15, { animate: false }); });
  await click('studyArea');
  assert.equal(await regionInView(), true);
  await click('go');
  await result();
  const acrossBridge = await verifyRoute();
  assert.ok(Math.abs(acrossBridge.dist - 104779.62731170177) < 1e-6);
  console.log('City campus and confirmed Eastern Visayas bridge regression', { campusTrip, acrossBridge });

  if (process.env.REGION_PROFILE) {
    await workspace('route');
    await chooseRegion('panay-guimaras');
    await regionReady('panay-guimaras');
    const mobile = process.env.REGION_PROFILE_MOBILE === '1';
    await cdp('Emulation.setDeviceMetricsOverride', { width: mobile ? 390 : 1440, height: mobile ? 844 : 900,
      deviceScaleFactor: mobile ? 2 : 1, mobile });
    await cdp('Emulation.setCPUThrottlingRate', { rate: mobile ? 4 : 1 });
    if (!offline) await cdp('Network.emulateNetworkConditions', { offline: false, latency: 70, downloadThroughput: 1250000, uploadThroughput: 750000 });
    const ids = process.env.REGION_PROFILE === 'all'
      ? await page(() => [...$('routingRegion').options].filter(option => option.value !== 'panay-guimaras').map(option => option.value))
      : process.env.REGION_PROFILE.split(',');
    for (const id of ids) {
      const fixture = fixtures[id];
      await workspace('route');
      await endpoints(fixture.start, fixture.long);
      await page(ll => { map.setView(ll, 13, { animate: false }); }, fixture.start);
      let start = performance.now();
      await chooseRegion(id);
      await regionReady(id);
      const switchMs = Math.round(performance.now() - start);
      assert.equal(await regionInView(), true, id + ' fitted graph coverage');
      if (offline) {
        await page(ll => { map.setView(ll, 13, { animate: false }); }, fixture.start);
        await offlineMapReady();
      }
      await cdp('HeapProfiler.collectGarbage');
      const { usedSize, backingStorageSize } = await cdp('Runtime.getHeapUsage');
      const load = await page(async () => (await loadGraph()).loadTimings);
      start = performance.now();
      await click('go');
      await result();
      const routeMs = Math.round(performance.now() - start);
      const route = await verifyRoute();
      if (id.startsWith('ph-') || ['iloilo-city', 'iloilo-province', 'panay-island', 'singapore-central-pilot'].includes(id)) {
        await page(() => { $('from').blur(); $('from').focus(); });
        await waitFor(() => page(() => !$('fromList').hidden && $('fromList').children.length > 0), id + ' active-region landmarks');
        if (id !== 'iloilo-city') assert.match(await page(() => $('fromList').textContent), /Local index/);
        await page(() => $('from').blur());
      }
      await workspace('analyze');
      start = performance.now();
      await click('chokeBtn');
      await waitFor(() => page(() => !$('chokeBtn').disabled && $('chokeHint').textContent.includes('6 routed trips')), id + ' CHOKEPOINT');
      const analyzeMs = Math.round(performance.now() - start);
      console.log('REGION PROFILE ' + JSON.stringify({ id, mobile, switchMs, load,
        map: await page(() => $('mapSource').textContent), heapMiB: usedSize / 1048576, backingMiB: backingStorageSize / 1048576,
        routeMs, analyzeMs, km: route.dist / 1000 }));
    }
  }
  if (offline) {
    await workspace('route');
    await chooseRegion('panay-guimaras');
    await regionReady('panay-guimaras');
    await endpoints(PLACES[demo.start], PLACES[demo.end]);
    await click('go');
    await result();
    await workspace('compare');
    await compare();
    for (const [width, height] of [[1440, 900], [1024, 576], [1024, 480], [768, 720], [390, 844], [320, 568]]) {
      await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 700 });
      await cdp('Emulation.setTouchEmulationEnabled', { enabled: width < 700, maxTouchPoints: 1 });
      const layouts = [];
      for (const mode of ['route', 'disrupt', 'analyze', 'compare']) {
        await workspace(mode);
        await page(() => { document.querySelector('.mode-panel:not([hidden]) .panel-body').scrollTop = 0; });
        await waitFor(() => page(() => !$('workspace').getAnimations().length &&
          map.getSize().x === $('map').clientWidth && map.getSize().y === $('map').clientHeight),
          'Leaflet viewport matches the settled layout');
        layouts.push(await page(() => {
          const rect = selector => {
            const box = document.querySelector(selector).getBoundingClientRect();
            return [box.x, box.y, box.width, box.height];
          };
          return {
            header: rect('.app-header'), rail: rect('.mode-rail'), panel: rect('#panel'),
            heading: rect('.mode-panel:not([hidden]) .panel-heading'),
            headingText: rect('.mode-panel:not([hidden]) h2').filter((_, index) => index !== 2),
            map: rect('#map'), camera: [map.getCenter().lat, map.getCenter().lng, map.getZoom()],
            controls: $('routePanel').hidden ? undefined
              : Object.fromEntries(['from', 'to', 'regionPicker', 'go', 'pickStart', 'swap', 'mapStyle', 'studyArea', 'wheelMode']
                .map(id => [id, rect('#' + id)]))
          };
        }));
        assert.ok(await page(() => {
          const panel = document.querySelector('.mode-panel:not([hidden])');
          const body = panel.querySelector('.panel-body');
          body.scrollTop = body.scrollHeight;
          const heading = panel.querySelector('h2').getBoundingClientRect();
          const action = panel.querySelector('.primary');
          action.scrollIntoView({ block: 'nearest' });
          return document.documentElement.scrollWidth <= innerWidth + 1 &&
            heading.top >= 0 && action.getBoundingClientRect().bottom <= innerHeight + 1 &&
            map.getSize().x > 0 && map.getSize().y > 0;
        }), `${mode} remains usable at ${width} × ${height}`);
        if (width === 390) {
          await page(() => { document.querySelector('.mode-panel:not([hidden]) .panel-body').scrollTop = 0; });
          await captureView('mobile-' + mode);
        }
      }
      for (const layout of layouts.slice(1)) {
        for (const part of ['header', 'rail', 'panel', 'heading', 'headingText', 'map', 'camera']) {
          assert.deepEqual(layout[part], layouts[0][part], `${part} stays stable when switching workspaces at ${width} × ${height}`);
        }
      }
      if (width >= 1024) {
        assert.equal(layouts[0].header[3], 100);
        assert.equal(layouts[0].rail[2], 94);
        assert.equal(layouts[0].panel[2], 368);
        assert.equal(layouts[0].heading[3], 56);
        for (const id of ['from', 'to', 'regionPicker', 'pickStart', 'swap', 'mapStyle', 'studyArea', 'wheelMode']) {
          assert.equal(layouts[0].controls[id][3], 44, id + ' uses the shared control height');
        }
        assert.equal(layouts[0].controls.go[3], 46);
        await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: width - 4, y: 4 });
        await waitFor(() => page(height => {
          const rail = document.querySelector('.mode-rail').getBoundingClientRect();
          const buttons = [...document.querySelectorAll('.mode-rail button')].map(button => button.getBoundingClientRect());
          const gap = buttons[1].top - buttons[0].bottom;
          return Math.abs((buttons[0].top + buttons.at(-1).bottom) - (rail.top + rail.bottom)) <= 1 &&
            (height > 550 ? gap >= 24 && gap <= 36 : gap === 12);
        }, height), 'centered rail with enough space between modes');
      }
      console.log('WORKSPACE DIMENSIONS ' + JSON.stringify({ width, height, ...layouts[0] }));
      await page(() => $('help').focus());
      await key('Enter');
      await waitFor(() => page(() => $('welcome').open && $('welcome').contains(document.activeElement)), 'keyboard opens and focuses Help');
      await key('Escape');
      await waitFor(() => page(() => !$('welcome').open && document.activeElement === $('help')), 'Escape restores Help focus');
      const oldArea = await page(() => map.getSize().x * map.getSize().y);
      await page(() => { document.querySelector('[data-mode][aria-current]').click(); });
      await waitFor(() => page(area => map.getSize().x * map.getSize().y > area, oldArea), 'expanded presentation map');
      assert.equal(await page(() => document.querySelector('[data-mode][aria-current]').getAttribute('aria-expanded')), 'false');
      await page(() => { document.querySelector('[data-mode][aria-current]').click(); });
      assert.equal(await page(() => document.querySelector('[data-mode][aria-current]').getAttribute('aria-expanded')), 'true');
      await waitFor(() => page(area => !$('workspace').getAnimations().length &&
        map.getSize().x * map.getSize().y === area, oldArea), 'restored workspace map size');
    }
    await page(async () => {
      const { renderResults } = await import('/js/ui/results-table.js');
      const rows = ['bidir', 'astar', 'lpa', 'dijkstra'].map((key, index) => ({
        key, name: ALGORITHMS[key].name, baseline: key === 'dijkstra', matches: key !== 'dijkstra',
        path: [0, 1], dist: 5000 + (index === 1 ? 50 : 0), time: 400, count: 10 + index, ms: 1
      }));
      renderResults(rows);
      if (!$('sharedTotals').hidden || $('res').querySelector('tbody tr').children.length !== 4) {
        throw Error('Distinct route distances must remain visible');
      }
      rows[1].path = null; rows[1].matches = false; rows[1].verdict = 'Unreachable · differs';
      renderResults(rows);
      if (!$('res').textContent.includes(rows[1].verdict)) throw Error('Reachability disagreement must remain visible');
      for (const row of rows) { row.path = [0, 1]; row.dist = 5000; row.matches = !row.baseline; row.count = 10; }
      renderResults(rows);
      for (const result of $('comparisonEffort').querySelectorAll('strong')) {
        if (result.textContent !== 'Bidirectional Dijkstra, A*, LPA*, Standard Dijkstra') throw Error('All tied observations must remain visible');
      }
    });
    console.log('Responsive geometry, keyboard Help, presentation view, and independent route totals passed');
    assert.ok(loggedErrors.some(line => line.includes('checksum mismatch')));
    missingMaps = true;
    await cdp('Page.navigate', { url: appUrl.href });
    await waitFor(() => page(() =>
      document.getElementById('lt')?.textContent === 'Ready to route' &&
      document.getElementById('mapSource')?.textContent.includes('local roads where available') &&
      document.querySelector('.leaflet-localRoads-pane canvas')), 'missing archives, emergency local roads');
    await click('go');
    await waitFor(() => page(() => document.getElementById('lt')?.textContent === 'Route found'), 'routing with emergency map');
    assert.deepEqual(interceptionErrors(), []);
    console.log('Offline fallback passed with missing map archives and corrupted regional data', { deniedExternalRequests: external.length });
    missingMaps = false;
    for (const fault of ['missing', 'stale']) {
      startupFault = fault;
      await cdp('Page.navigate', { url: appUrl.href });
      await waitFor(() => page(() => document.getElementById('lt')?.textContent === 'Application startup failed'),
        fault + ' module reports a startup failure');
      assert.equal(await page(() => {
        const retry = document.getElementById('graphRetry');
        return !retry.hidden && retry.textContent === 'Reload application' && document.getElementById('go').disabled;
      }), true);
      assert.ok(loggedErrors.some(line => line.includes('Application startup failed')));
      startupFault = undefined;
      await click('graphRetry');
      await waitFor(() => page(() => document.getElementById('lt')?.textContent === 'Ready to route'), 'reload recovers startup');
      await click('go');
      await waitFor(() => page(() => document.getElementById('lt')?.textContent === 'Route found'), 'routing after startup recovery');
    }
    assert.deepEqual(interceptionErrors(), []);
    console.log('Missing and stale modules show an actionable startup error and recover through Reload Application');
    await cdp('Fetch.disable');
    await cdp('Page.navigate', { url: new URL('../index.html', import.meta.url).href });
    await waitFor(() => page(() => location.protocol === 'file:' &&
      document.getElementById('lt')?.textContent === 'Start the local server' &&
      document.getElementById('msg')?.textContent.includes('python3 scripts/serve.py')), 'direct-file startup instructions');
    console.log('Opening index.html directly gives local server instructions');
  } else {
    await cdp('Network.enable');
    await cdp('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
    await workspace('route');
    await chooseRegion('panay-guimaras');
    await regionReady('panay-guimaras');
    await endpoints(PLACES[demo.start], PLACES[demo.end]);
    await page(() => {
      $('mapStyle').value = 'streets';
      $('mapStyle').dispatchEvent(new Event('change'));
    });
    await click('go');
    await result();
    await page(async ([u, v]) => {
      const n = (await loadGraph()).lat.length;
      addLinkClosure(new Set([u * n + v]), 'Connectivity test closure');
    }, demo.edge);
    await result('Route updated');
    const before = await page(() => {
      const mapState = () => [
        map.getCenter().lat, map.getCenter().lng, map.getZoom(), state.start, state.end,
        state.route.time, getClosures().map(closure => closure.id), closureLayers().length
      ];
      window.mapState = mapState;
      return mapState();
    });
    denyExternal = true;
    await page(() => { window.dispatchEvent(new Event('offline')); });
    await offlineMapReady();
    assert.deepEqual(await page(() => mapState()), before);
    denyExternal = false;
    await page(() => { window.dispatchEvent(new Event('online')); });
    await waitFor(() => page(() => $('mapSource').textContent.includes('OpenStreetMap') &&
      !$('map').classList.contains('needs-road-fallback')), 'online map restored');
    assert.deepEqual(await page(() => mapState()), before);
    assert.deepEqual(interceptionErrors(), []);
    console.log('Connectivity loss and recovery preserved camera, endpoints, route and closure overlay');
  }
  assert.deepEqual(uncaught, []);
  console.log('Critical-road analysis, emulated touch drawing, and zero uncaught app exceptions passed');
} finally {
  ws?.close();
  if (browser.pid && browser.exitCode === null && browser.signalCode === null) {
    browser.kill('SIGTERM');
    await once(browser, 'exit');
  }
  await rm(temp, { recursive: true, force: true, maxRetries: 3 });
}
