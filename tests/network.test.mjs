import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { ALGORITHMS } from '../js/algorithms/index.js';
import { lpaFresh, lpaInfo, lpaReady, lpaRepair, lpaReset } from '../js/algorithms/lpa-star.js';
import { findChokepoints } from '../js/analysis/chokepoints.js';
import { CHOKEPOINTS, DEFAULT_START, DEFAULT_END, MAP_CENTER, PLACES, ROADS_URL } from '../js/config.js';
import { canSearchOnline, cityPlaceIndex, placeGeocoder, geocodedMatches, mergeMatches, placeWords } from '../js/features/geocoding.js';
import { connectionMessage, noRouteMessage } from '../js/features/route-status.js';
import { blockedEdges, removeClosedRoads } from '../js/graph/closure-filter.js';
import { roadGeometry, selectRoads } from '../js/graph/closure-selection.js';
import { buildGraph, decodeRoadGraph, loadGraph, nearestNode, nearestRoadVertex, reverseAdjacency, routeMetrics, snapRouteEndpoints, snapRoutePoint } from '../js/graph/road-graph.js';
import { heuristic } from '../js/algorithms/common.js';
import { hav } from '../js/utils/geo.js';
import { blockedNode, directions } from '../scripts/osm-driving.mjs';

const data = readFileSync(new URL('../' + ROADS_URL, import.meta.url));
const graph = decodeRoadGraph(JSON.parse(gunzipSync(data)));
const endpoints = snapRouteEndpoints(graph, PLACES[DEFAULT_START], PLACES[DEFAULT_END]);

function finish(search) {
  let result = search.next();
  while (!result.done) result = search.next();
  return result.value;
}

function assertOptimal(g, s, t, mode, path, baseline) {
  assert.equal(!!path, !!baseline);
  if (!path) return;
  assert.equal(path[0], s);
  assert.equal(path.at(-1), t);
  for (let i = 1; i < path.length; i++) {
    assert.ok(g.adj[path[i - 1]].some(edge => edge[0] === path[i]), 'path uses only open directed edges');
  }
  const metric = mode === 'short' ? 'dist' : 'time';
  assert.ok(Math.abs(routeMetrics(g, path)[metric] - routeMetrics(g, baseline)[metric]) < 1e-6);
}

function verifySearches(g, s, t, mode) {
  const baseline = finish(ALGORITHMS.dijkstra.run(g, s, t, mode));
  for (const [key, algo] of Object.entries(ALGORITHMS)) {
    if (algo.baseline) continue;
    const path = finish((key === 'lpa' ? lpaFresh : algo.run)(g, s, t, mode));
    assertOptimal(g, s, t, mode, path, baseline);
  }
  return baseline;
}

test('the graph loader retries after a failed road-data request and caches a successful load', async t => {
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    requests++;
    return requests === 1 ? new Response('', { status: 503 }) : new Response(data);
  });
  await assert.rejects(loadGraph(), /503/);
  const loaded = await loadGraph();
  assert.equal(loaded.lat.length, graph.lat.length);
  assert.equal(await loadGraph(), loaded);
  assert.equal(requests, 2);
});

test('each endpoint must snap independently to a nearby base-graph node', () => {
  assert.ok(endpoints.s >= 0 && endpoints.t >= 0);
  assert.deepEqual(snapRouteEndpoints(graph, PLACES[DEFAULT_START], [0, 0]), { s: endpoints.s, t: -1 });
  assert.deepEqual(snapRouteEndpoints(graph, [0, 0], PLACES[DEFAULT_END]), { s: -1, t: endpoints.t });
});

test('OSM car access and direction rules fail closed for unsupported restrictions', () => {
  assert.equal(directions({ highway: 'residential', oneway: '-1' }), 2);
  assert.equal(directions({ highway: 'residential', junction: 'roundabout' }), 1);
  assert.equal(directions({ highway: 'residential', junction: 'roundabout', oneway: 'no' }), 3);
  assert.equal(directions({ highway: 'residential', access: 'private', motorcar: 'yes' }), 3);
  assert.equal(directions({ highway: 'residential', 'motor_vehicle:backward': 'no' }), 1);
  assert.equal(directions({ highway: 'residential', access: 'destination' }), 0);
  assert.equal(directions({ highway: 'residential', 'motorcar:conditional': 'yes @ (Mo-Fr)' }), 0);
  assert.equal(directions({ highway: 'residential', oneway: 'reversible' }), 0);
  assert.equal(directions({ highway: 'service', service: 'driveway' }), 0);
  assert.equal(directions({ highway: 'track', motor_vehicle: 'permissive' }), 3);
  assert.equal(blockedNode({ barrier: 'gate' }), true);
  assert.equal(blockedNode({ barrier: 'gate', motorcar: 'yes' }), false);
});

test('compact graphs preserve grade-separated crossing topology and unique directed edges', () => {
  const small = decodeRoadGraph({
    format: 'bantay-roads-v1', classes: ['residential'], names: ['Eastbound', 'North-south'],
    coordinates: [100000000, 1220000000, 100000000, 1220200000, 99900000, 1220100000, 100100000, 1220100000],
    ways: [[0, 1, 0, [0, 1]], [0, 1, 0, [0, 1]], [0, 3, 1, [2, 3]]]
  });
  assert.deepEqual(small.adj.map(list => list.map(edge => edge[0])), [[1], [], [3], [2]]);
  assert.equal(verifySearches(small, 0, 2, 'short'), null);
  assert.equal(verifySearches(small, 1, 0, 'short'), null);
});

test('route totals use the canonical directed edge and reject invalid or closed path steps', () => {
  const geometry = [{ lat: 10, lon: 122 }, { lat: 10, lon: 122.001 }];
  const small = buildGraph(['residential', 'primary'].map(highway => ({
    type: 'way', nodes: [1, 2], geometry, tags: { highway, oneway: 'yes' }
  })));
  assert.equal(small.adj[0].length, 1);
  assert.equal(small.adj[0][0][2], 50);
  const path = verifySearches(small, 0, 1, 'fast');
  const metres = hav(10, 122, 10, 122.001);
  assert.deepEqual(routeMetrics(small, path), { dist: metres, time: metres / (50 / 3.6) });
  assert.throws(() => routeMetrics(small, [1, 0]), /unavailable directed edge/);
  assert.throws(() => routeMetrics(small, path, new Set([1])), /unavailable directed edge/);
});

test('a drawn line closes both directions only when it crosses the road interior', () => {
  const small = { lat: [0, 0], lng: [0, 1], adj: [[[1, 10, 25]], [[0, 10, 25]]] };
  const ordered = close => [...blockedEdges(small, [close])].sort();
  const spanning = { a: [-1, .5], b: [1, .5] };
  assert.deepEqual(ordered(spanning), [1, 2]);
  assert.deepEqual(ordered({ a: spanning.b, b: spanning.a }), [1, 2]);
  assert.deepEqual(ordered({ a: [0, .5], b: [1, .5] }), []);
  assert.deepEqual(ordered({ a: [0, .2], b: [0, .8] }), []);
});

test('freehand line finds transverse hits including a sampled crossing, with a narrow tip tolerance', () => {
  const small = {
    lat: [0, 0, .000016, .000016, -.001, .001],
    lng: [-.001, .001, -.001, .001, .002, .002],
    adj: [[[1]], [[0]], [[3]], [], [[5]], []]
  };
  const select = (points, options) => finish(selectRoads(small, points, options)).keys;
  const stroke = [[-.0002, 0], [0, 0], [.00001, 0], [.00003, 0], [.00002, 0]];
  assert.deepEqual(select(stroke), new Set([1, 6, 15]));
  const almost = [[-.0002, 0], [-.000003, 0]];
  assert.equal(select(almost).size, 0);
  assert.deepEqual(select(almost, { pixel: [.000001, .000001] }), new Set([1, 6]));
  assert.equal(select([[.000004, -.0007], [.000004, .0007]], { pixel: [.000001, .000001] }).size, 0);
  assert.equal(select([[-.0002, -.001], [.0002, -.001]]).size, 0, 'road-endpoint touches leave the junction alone');
  assert.equal(roadGeometry(small, select(stroke)).size, 2);
});

test('area includes interior, boundary, and long through-edges while preserving directed overlap', () => {
  const small = {
    lat: [0, 0, .001, .001, -.004, .004, .002, .002, .003, .004],
    lng: [-.030, .030, -.001, .001, 0, 0, -.002, .002, .003, .004],
    adj: [[[1]], [[0]], [[3]], [], [[5]], [], [[7]], [], [[9]], []]
  };
  const polygon = [[-.002, -.002], [-.002, .002], [.002, .002], [.002, -.002]];
  const { keys, segments } = finish(selectRoads(small, polygon, { area: true }));
  assert.deepEqual(keys, new Set([1, 10, 23, 45, 67]));
  assert.deepEqual(finish(selectRoads(small, [...polygon].reverse(), { area: true })).keys, keys);
  const subdivided = polygon.flatMap(([a, b], i) => {
    const [c, d] = polygon[(i + 1) % polygon.length];
    return Array.from({ length: 16 }, (_, j) => [a + (c - a) * j / 16, b + (d - b) * j / 16]);
  });
  assert.deepEqual(finish(selectRoads(small, subdivided, { area: true })).keys, keys);
  assert.deepEqual(new Set(segments.keys()), new Set(roadGeometry(small, keys).keys()));
  assert.equal(roadGeometry(small, keys).size, 4);
  assert.ok(removeClosedRoads(small, [{ keys }]).adj[8].length);
  const overlap = { keys: new Set([1]) };
  assert.equal(removeClosedRoads(small, [overlap, { keys }]).adj[0].length, 0);
  const reopened = removeClosedRoads(small, [overlap]);
  assert.equal(reopened.adj[0].length, 0);
  assert.equal(reopened.adj[1].length, 1);
  assert.equal(small.adj[0].length, 1, 'selection never mutates base edges');
});

test('a tight area selects a long existing primary-road segment with both endpoints outside', () => {
  const [u, v] = [8329, 8330];
  const center = [(graph.lat[u] + graph.lat[v]) / 2, (graph.lng[u] + graph.lng[v]) / 2];
  const [lat, lng] = center, d = .00005;
  const ring = [[lat - d, lng - d], [lat - d, lng + d], [lat + d, lng + d], [lat + d, lng - d]];
  assert.ok(Math.abs(graph.lat[u] - lat) > d && Math.abs(graph.lat[v] - lat) > d);
  const { keys: selected, segments } = finish(selectRoads(graph, ring, { area: true }));
  assert.ok(selected.has(u * graph.lat.length + v));
  assert.ok(selected.has(v * graph.lat.length + u));
  assert.equal(segments.size, 1);
});

test('area selection reaches the road dataset boundary and leaves an empty offshore selection empty', () => {
  const east = graph.lng.reduce((right, lng, i) => lng > graph.lng[right] ? i : right, 0);
  const lat = graph.lat[east], lng = graph.lng[east], d = .00008;
  const ring = [[lat - d, lng - d], [lat - d, lng + d], [lat + d, lng + d], [lat + d, lng - d]];
  const { segments } = finish(selectRoads(graph, ring, { area: true }));
  assert.ok([...segments.values()].some(segment => segment.some(([a, b]) => a === lat && b === lng)));
  const ocean = ring.map(([a, b]) => [a, b + .01]);
  assert.equal(finish(selectRoads(graph, ocean, { area: true })).keys.size, 0);
});

test('the chord heuristic is consistent on an edge where the old approximation was not', () => {
  const [u, v] = [74447, 74448], { s: goal } = endpoints;
  const metres = graph.adj[u].find(edge => edge[0] === v)[1];
  const old = i => hav(graph.lat[i], graph.lng[i], graph.lat[goal], graph.lng[goal]);
  assert.ok(old(u) > metres + old(v) + 1e-7);
  const h = heuristic(graph, goal, 'short');
  assert.ok(h(u) <= metres + h(v) + 1e-7);
});

test('Photon uses an Iloilo bias without limiting worldwide results by country or extent', () => {
  const url = new URL(placeGeocoder.url('上海'));
  assert.equal(url.hostname, 'photon.komoot.io');
  assert.equal(url.searchParams.get('q'), '上海');
  assert.equal(url.searchParams.get('lat'), String(MAP_CENTER[0]));
  assert.equal(url.searchParams.get('lon'), String(MAP_CENTER[1]));
  assert.ok(!url.searchParams.has('bbox') && !url.searchParams.has('countrycode'));
  assert.equal(canSearchOnline(placeWords('上海')), true);
  assert.equal(canSearchOnline(placeWords('东')), false);
  assert.equal(canSearchOnline(placeWords('  A B')), false);
  assert.equal(placeWords('서울 ガ Máximo'), '서울 ガ maximo');
});

test('geocoder results include places abroad and still rank relevant places near modeled roads', () => {
  const feature = (coordinates, properties) => ({ geometry: { type: 'Point', coordinates }, properties });
  const university = feature([122.561824, 10.699222], { name: 'University of San Agustin', gid: 'osm:1' });
  const matches = geocodedMatches([
    feature([121.049856, 14.654027], { name: 'Quezon Memorial Circle' }),
    feature([139.767, 35.681], { name: 'Tokyo Station', country: 'Japan' }),
    feature([122.649, 100], { name: 'Invalid latitude' }),
    feature([122.561824, 10.699222], { street: 'General Luna Avenue', housenumber: 12, city: 'Iloilo City' }),
    university, university,
    feature([122.546, 10.696], { name: 'University of San Agustin', gid: 'osm:2', district: 'Molo' }),
    { geometry: null, properties: { name: 'Missing coordinates' } }
  ], graph);
  const address = matches.find(place => place.name === '12 General Luna Avenue');
  assert.equal(address.detail, 'Iloilo City');
  assert.equal(address.nearRoad, true);
  assert.equal(mergeMatches('Quezon Memorial Circle', [], matches)[0].nearRoad, false);
  assert.equal(mergeMatches('Tokyo Station Japan', [], matches)[0].nearRoad, false);
  assert.ok(!matches.some(place => place.name === 'Invalid latitude'));
  const universities = mergeMatches('University of San Ag', [], matches);
  assert.equal(universities.length, 2);
  assert.equal(universities.every(place => place.name === university.properties.name), true);
  assert.deepEqual(mergeMatches('General Luna Ave', [], matches).map(place => place.name), ['12 General Luna Avenue']);
  assert.deepEqual(mergeMatches('National Museum Iloilo', [], matches), []);
  const far = { ...universities[0], id: 'far', ll: [14.6, 121], nearRoad: false };
  assert.equal(mergeMatches('University of San Agustin', [], [far, universities[0]])[0].nearRoad, true);
});

test('translated results for native queries, city aliases, and identical names retain geographic context', () => {
  const feature = (name, kind, country, coordinates, extra = {}) => ({
    geometry: { type: 'Point', coordinates },
    properties: { name, osm_key: 'place', osm_value: kind, country, ...extra }
  });
  const items = geocodedMatches([
    feature('Shanghai', 'state', 'China', [121.4700152, 31.2312707]),
    feature('Shanghai', 'station', 'China', [121.451, 31.252]),
    feature('上海联想创新科技园', 'venue', 'China', [121.481, 31.23]),
    feature('New York City Ballet', 'theatre', 'United States', [-73.984, 40.772]),
    feature('New York', 'city', 'United States', [-74.001, 40.714], { state: 'New York' }),
    feature('London', 'city', 'United Kingdom', [-0.128, 51.507]),
    feature('London', 'city', 'Canada', [-81.25, 42.98])
  ], graph);
  const shanghai = mergeMatches('上海', [], items)[0];
  assert.equal(shanghai.name, 'Shanghai');
  assert.equal(shanghai.zoom, 8);
  assert.match(shanghai.detail, /state.*China/);
  assert.deepEqual(shanghai.ll, [31.2312707, 121.4700152]);
  assert.equal(shanghai.roadIssue, 'outside');
  assert.equal(mergeMatches('New York City', [], items)[0].name, 'New York');
  assert.deepEqual(mergeMatches('London', [], items).map(place => place.detail), ['city · United Kingdom', 'city · Canada']);
  assert.equal(mergeMatches('London Canada', [], items)[0].detail, 'city · Canada');
});

test('snapping rejects offshore and unsupported pins but still accepts long road segments and one-way sinks', () => {
  for (const point of [[10.6787, 122.581], [10.6865, 122.5768]]) {
    assert.ok(nearestNode(graph, point).d < 1500);
    assert.equal(snapRoutePoint(graph, point).i, -1);
  }
  assert.equal(snapRoutePoint(graph, [10.6787, 122.581]).reason, 'noRoad');
  assert.equal(snapRoutePoint(graph, [14.654027, 121.049856]).reason, 'outside'); // Quezon Memorial Circle
  assert.notEqual(connectionMessage('noRoad'), connectionMessage('outside'));
  const onLongRoad = [(10.7859094 + 10.7991748) / 2, (122.5591695 + 122.5532248) / 2];
  assert.ok(nearestNode(graph, onLongRoad).d > 250);
  assert.ok(snapRoutePoint(graph, onLongRoad).i >= 0);

  const reverse = reverseAdjacency(graph);
  const sink = graph.adj.findIndex((edges, i) => !edges.length && reverse.offsets[i] !== reverse.offsets[i + 1]);
  const from = reverse.vertices[reverse.offsets[sink]];
  assert.equal(snapRoutePoint(graph, [graph.lat[sink], graph.lng[sink]]).i, sink);
  assert.deepEqual(verifySearches(graph, from, sink, 'short'), [from, sink]);
  assert.equal(verifySearches(graph, sink, from, 'short'), null);
});

test('local roads support real cross-municipality trips while Guimaras stays disconnected from Iloilo City', () => {
  const destinations = [
    [10.77502, 122.54219], // Pavia Municipal Hall
    [10.78507, 122.59012], // Leganes Municipal Hall
    [10.69206, 122.47779], // Oton Municipal Hall
    [10.82756, 122.53124], // Santa Barbara Municipal Hall
    [10.8654487, 122.4628554], // Modeled road vertex within Cabatuan
    PLACES['Iloilo Airport (Cabatuan)'],
    [11.064464, 122.617462], // Dueñas Municipal Hall
    [10.865922, 122.295949], // Bucari Elementary School
    [11.5735531, 123.133556], // Carles town center
    [10.6418762, 122.2353991], // Miag-ao Church
    [11.708529, 122.366856], // Kalibo Municipal Hall
    [11.583384, 122.752567], // Roxas City Hall
    [10.746732, 121.941477], // San Jose de Buenavista Municipal Hall
    [10.70871, 122.46101], // Buray Barangay Hall, previously unsupported
  ];
  for (const destination of destinations) {
    const { s, t } = snapRouteEndpoints(graph, PLACES[DEFAULT_START], destination);
    assert.ok(s >= 0 && t >= 0);
    assert.ok(verifySearches(graph, s, t, 'short'));
    assert.ok(verifySearches(graph, t, s, 'short'));
  }
  const { s, t } = snapRouteEndpoints(graph, PLACES[DEFAULT_START], [10.665884, 122.590546]); // Jordan Public Market
  assert.ok(t >= 0);
  assert.equal(verifySearches(graph, s, t, 'short'), null);
  assert.equal(verifySearches(graph, t, s, 'short'), null);
  const other = snapRoutePoint(graph, [10.66134, 122.59126]).i; // Jordan Municipal Hall
  assert.ok(other >= 0 && verifySearches(graph, t, other, 'short'));
  const pototan = snapRouteEndpoints(graph, [11.064464, 122.617462], [10.9429313, 122.6377797]);
  assert.ok(pototan.s >= 0 && pototan.t >= 0 && verifySearches(graph, pototan.s, pototan.t, 'short'));

  const closures = [{ keys: new Set(graph.adj[s].map(([v]) => s * graph.lat.length + v)) }];
  const closed = removeClosedRoads(graph, closures);
  assert.equal(verifySearches(closed, s, t, 'short'), null);
  assert.equal(noRouteMessage(graph, s, t, 'short', true), 'No route was found between these locations in the selected road network.');
  assert.equal(verifySearches(closed, s, endpoints.t, 'short'), null);
  assert.equal(noRouteMessage(graph, s, endpoints.t, 'short', true), 'No route is available under the current road closures.');
});

test('saved place aliases and provider names match without surfacing unrelated shortcuts', () => {
  const places = [
    { name: 'Jaro Cathedral', aliases: ['Cathedral of Santa Isabel de Hungría'], area: 'Jaro, Iloilo City', ll: PLACES['Jaro Cathedral'] },
    { name: 'SM City Iloilo', ll: PLACES['SM City Iloilo'] },
  ];
  const museum = { name: 'National Museum of the Philippines - Iloilo', area: 'City Proper, Iloilo City', ll: [10.70326, 122.56876] };
  const other = { name: 'City Mall', address: 'National Museum Iloilo', area: 'Iloilo City', ll: [10.711, 122.544] };
  assert.deepEqual(mergeMatches('Cathedral of Santa Isabel de Hungria', places), [places[0]]);
  assert.deepEqual(mergeMatches('jaro c', places), [places[0]]);
  assert.deepEqual(mergeMatches('National Museum Iloilo', places, [other, museum]), [museum]);
  assert.deepEqual(mergeMatches('National Museum of the Philippines – Iloilo', places, [other, museum]), [museum]);
  assert.deepEqual(mergeMatches('zzz', places), []);
  const hall = { name: 'Pototan Town Hall', ll: [10.9429313, 122.6377797] };
  assert.deepEqual(mergeMatches('Pototan Municipal Hall', places, [hall]), [hall]);
});

test('the local city index supports partial names and still leaves room for matching online places', async () => {
  const data = JSON.parse(readFileSync(new URL('../data/iloilo-places.json', import.meta.url)));
  const local = await cityPlaceIndex(data);
  for (const [query, name] of [
    ['NATIONAL museum western visay', 'National Museum of the Philippines - Iloilo'],
    ['general luna av', 'General Luna Avenue']
  ]) {
    const matches = mergeMatches(query, local(query));
    assert.ok(matches.some(place => place.name === name));
    assert.ok(matches.length <= 6);
  }
  const candidates = Array.from({ length: 6 }, (_, i) => ({ name: `Iloilo School ${i}`, ll: [10.7 + .003 * i, 122.56] }));
  const remote = { name: 'Iloilo School Abroad', ll: [11, 122] };
  const matches = mergeMatches('Iloilo School', candidates, [remote]);
  assert.deepEqual(matches, [...candidates.slice(0, 5), remote]);
});

test('indexed CHOKEPOINT demand lookup preserves the exact nearest outgoing vertex', () => {
  const plaza = PLACES[DEFAULT_START], s = nearestNode(graph, plaza).i;
  const closed = removeClosedRoads(graph, [{ keys: new Set(graph.adj[s].map(([v]) => s * graph.lat.length + v)) }]);
  for (const g of [graph, closed]) {
    for (const name of CHOKEPOINTS.places) {
      assert.deepEqual(nearestRoadVertex(g, PLACES[name], graph), nearestNode(g, PLACES[name]));
    }
  }
});

test('the four suggested places snap and connect to the local graph in both directions', () => {
  for (const name of [DEFAULT_START, DEFAULT_END, 'Jaro Cathedral', 'University of San Agustin']) {
    const { s, t } = snapRouteEndpoints(graph, PLACES[DEFAULT_START], PLACES[name]);
    assert.ok(s >= 0 && t >= 0);
    assert.ok(finish(ALGORITHMS.astar.run(graph, s, t, 'short')), name);
    assert.ok(finish(ALGORITHMS.astar.run(graph, t, s, 'short')), name);
  }
});

test('the three primary searches match Dijkstra in both modes and directions', () => {
  assert.deepEqual(Object.keys(ALGORITHMS), ['bidir', 'astar', 'lpa', 'dijkstra']);
  for (const mode of ['short', 'fast']) {
    const { s, t } = endpoints;
    assert.ok(verifySearches(graph, s, t, mode));
    assert.ok(verifySearches(graph, t, s, mode));
    assert.deepEqual(verifySearches(graph, s, s, mode), [s]);
  }
});

test('four algorithms match independently calculated optima on a directed weighted graph', () => {
  const tiny = {
    lat: [0, 0, .0001, .0001, .0002], lng: [0, .0001, 0, .0001, .0002],
    adj: [[[1, 20, 20, 0], [2, 30, 60, 0], [3, 80, 70, 0]],
      [[3, 20, 20, 0]], [[3, 35, 60, 0]], [], []]
  };
  for (const [mode, want, expected] of [['short', [0, 1, 3], 40], ['fast', [0, 2, 3], 3.9]]) {
    const found = verifySearches(tiny, 0, 3, mode);
    assert.deepEqual(found, want);
    assert.ok(Math.abs(routeMetrics(tiny, found)[mode === 'short' ? 'dist' : 'time'] - expected) < 1e-10);
    assert.equal(verifySearches(tiny, 3, 0, mode), null);
    assert.equal(verifySearches(tiny, 0, 4, mode), null);
    assert.deepEqual(verifySearches(tiny, 0, 0, mode), [0]);
    assert.match(noRouteMessage(tiny, 3, 0, mode, false), /in this direction/);
  }
});

test('WVSU public-road access routes on three real graphs without bypassing closures', () => {
  const campus = PLACES['West Visayas State University'];
  for (const [asset, expected, plazaVertex] of [
    [null, 342491, 431709],
    ['iloilo-city-province', 172957, 209586],
    ['iloilo-city', undefined, undefined]
  ]) {
    const regionGraph = asset
      ? decodeRoadGraph(JSON.parse(gunzipSync(readFileSync(new URL(`../data/regions/${asset}.json.gz`, import.meta.url)))))
      : graph;
    const access = snapRoutePoint(regionGraph, campus);
    assert.equal(access.access, 'Luna Street public-road access');
    assert.equal(Math.round(access.d), 133);
    assert.deepEqual([regionGraph.lat[access.i], regionGraph.lng[access.i]], [10.7142023, 122.5635554]);
    const { s, t } = snapRouteEndpoints(regionGraph, campus, PLACES[DEFAULT_START]);
    if (expected !== undefined) assert.deepEqual([s, t], [expected, plazaVertex]);
    const fragment = snapRoutePoint(regionGraph, [10.7133171, 122.563348]).i;
    assert.notEqual(fragment, s);
    for (const mode of ['fast', 'short']) {
      assert.equal(verifySearches(regionGraph, fragment, t, mode), null);
      assert.ok(verifySearches(regionGraph, t, s, mode));
      const open = verifySearches(regionGraph, s, t, mode);
      assert.ok(open);
      assert.ok(verifySearches(regionGraph, t, snapRoutePoint(regionGraph, PLACES[DEFAULT_END]).i, mode));
      assert.ok(verifySearches(regionGraph, s, snapRoutePoint(regionGraph, PLACES['Molo Church']).i, mode));
      assertOptimal(regionGraph, s, t, mode, finish(ALGORITHMS.lpa.run(regionGraph, s, t, mode, [])), open);
      const closures = [{ keys: new Set(regionGraph.adj[s].map(([v]) => s * regionGraph.lat.length + v)) }];
      assert.equal(verifySearches(removeClosedRoads(regionGraph, closures), s, t, mode), null);
      assert.equal(finish(lpaRepair(closures)), null);
      assertOptimal(regionGraph, s, t, mode, finish(lpaRepair([])), open);
      lpaReset();
    }
  }
});

test('a sampled closure line blocks real edges, and LPA* repairs through multiple closures and reopenings', () => {
  const { s, t } = endpoints, mode = 'fast', n = graph.lat.length;
  const original = finish(ALGORITHMS.lpa.run(graph, s, t, mode, []));
  assert.ok(lpaReady());
  const originalState = lpaInfo();
  finish(lpaFresh(graph, t, s, 'short'));
  assert.deepEqual(lpaInfo(), originalState, 'fresh comparison must preserve the interactive LPA* search');

  const index = Math.floor(original.length / 2);
  const u = original[index - 1], v = original[index];
  const lat = (graph.lat[u] + graph.lat[v]) / 2, lng = (graph.lng[u] + graph.lng[v]) / 2;
  const dLat = (graph.lat[v] - graph.lat[u]) * 1.1, dLng = (graph.lng[v] - graph.lng[u]) * 1.1;
  const keys = blockedEdges(graph, [{ a: [lat - dLng, lng + dLat], b: [lat + dLng, lng - dLat] }]);
  assert.ok(keys.has(u * n + v));
  assert.equal(blockedEdges(graph, [{ a: [0, 0], b: [.01, .01] }]).size, 0);

  const line = { keys };
  const isolateStart = { keys: new Set(graph.adj[s].map(edge => s * n + edge[0])) };
  const outside = graph.adj.findIndex((edges, i) => edges.length && !original.includes(i));
  const offRoute = { keys: new Set([outside * n + graph.adj[outside][0][0]]) };
  for (const closures of [[offRoute], [line], [line, isolateStart], [isolateStart], []]) {
    const filtered = removeClosedRoads(graph, closures);
    const repaired = finish(lpaRepair(closures));
    const baseline = verifySearches(filtered, s, t, mode);
    assertOptimal(filtered, s, t, mode, repaired, baseline);
    if (closures.includes(isolateStart)) assert.equal(repaired, null);
    if (closures.includes(line)) assert.ok(!filtered.adj[u].some(edge => edge[0] === v));
    if (!closures.length || closures[0] === offRoute) assert.deepEqual(baseline, original);
  }
  lpaReset();
  assert.equal(lpaReady(), false);
});

test('CHOKEPOINT ranks valid links by the configured impact formula and can be cancelled safely', async () => {
  const demand = CHOKEPOINTS.places.map(name => ({ name, i: nearestNode(graph, PLACES[name]).i }));
  const { candidates, topK, disconnectPenaltySec: penalty } = CHOKEPOINTS;
  const before = graph.adj.slice();
  const progress = [];
  const { chokepoints, examined, trips } = await findChokepoints(graph, demand, {
    candidates, topK, penalty,
    onProgress: (stage, done, total) => progress.push([stage, done, total])
  });
  assert.ok(examined <= candidates && examined >= chokepoints.length);
  assert.equal(trips, 36);
  assert.equal(chokepoints.length, topK);
  assert.ok(progress.every(([, done, total]) => done <= total));
  chokepoints.forEach((result, i) => {
    const { nodes, avgExtra, rerouted, cut, score } = result;
    if (i) assert.ok(chokepoints[i - 1].score >= score);
    assert.ok(Math.abs(score - (avgExtra * rerouted + penalty * cut)) < 1e-6);
    for (let k = 1; k < nodes.length; k++) {
      const a = nodes[k - 1], b = nodes[k];
      assert.ok(graph.adj[a].some(e => e[0] === b) || graph.adj[b].some(e => e[0] === a));
    }
  });

  const controller = new AbortController();
  await assert.rejects(findChokepoints(graph, demand, {
    signal: controller.signal,
    onProgress: stage => { if (stage === 'Testing closures') controller.abort(); }
  }), { name: 'AbortError' });
  graph.adj.forEach((edges, i) => assert.equal(edges, before[i]));
});
