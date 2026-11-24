import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import test from 'node:test';
import { createRegionManager } from '../js/graph/regions.js';
import { routingRegions } from '../js/graph/region-manifest.js';
import { decodeRoadGraph, fetchRoadGraph } from '../js/graph/road-graph.js';

const coordinates = [100000000, 1200000000, 100010000, 1200010000];
const source = { format: 'bantay-roads-v1', scope: 'test', pbfSha256: 'test-source', replicationTimestamp: 'test-version',
  coordinates, classes: ['residential'], names: ['Test road'], ways: [[0, 3, 0, [0, 1]]] };
const anchor = [10, 120], destination = [10.001, 120.001];
const west = { id: 'west', url: 'west', bounds: [120, 10, 120.001, 10.001] };
const east = { id: 'east', url: 'east', bounds: [121, 10, 121.001, 10.001] };
const eastPoint = [10, 121], eastEnd = [10.001, 121.001];

test('routing region loads only on selection, preserves the active graph on failure, and rejects a trip requiring separate graphs', async () => {
  const requests = [];
  const built = decodeRoadGraph(source);
  const registry = createRegionManager([west, east], { load: async url => {
    requests.push(url);
    if (url === 'east') throw new Error('Server unavailable');
    return built;
  } });
  assert.deepEqual(registry.forPoint(anchor), [west]);
  assert.deepEqual(requests, []);
  await registry.select(west);
  assert.equal(registry.currentTrip(anchor, destination), built);
  assert.deepEqual(registry.suggestTrip(anchor, eastPoint), { reason: 'differentRegions' });
  assert.deepEqual(registry.suggestTrip(eastPoint, eastEnd), { reason: 'outsideActive', alternative: east });
  assert.deepEqual(requests, ['west'], 'offering a network does not request it');
  await assert.rejects(registry.select(east), /Server unavailable/);
  assert.equal(registry.active.graph, built);
  assert.deepEqual(requests, ['west', 'east']);
});

test('a per-trip response from a cancelled load cannot activate a stale graph', async () => {
  let finish, started;
  const loading = new Promise(resolve => { started = resolve; });
  const activations = [];
  const built = decodeRoadGraph(source);
  const registry = createRegionManager([west, east], {
    load: async url => {
      if (url === 'west') return built;
      started();
      return new Promise(resolve => { finish = resolve; });
    },
    activate: candidate => activations.push(candidate.region.id)
  });
  await registry.select(west);
  const stale = registry.select(east);
  await loading;
  const wanted = registry.select(west);
  finish(built);
  assert.deepEqual(await stale, { cancelled: true });
  assert.equal((await wanted).graph, built);
  assert.deepEqual(activations, ['west']);
});

test('overlapping extents require actual snaps and can only switch with an explicit selection', async () => {
  const overlap = { ...west, id: 'overlap', url: 'overlap' };
  const unusable = decodeRoadGraph({ ...source, coordinates: [100000000, 1210000000, 100010000, 1210010000] });
  const connected = decodeRoadGraph(source);
  const requests = [];
  const registry = createRegionManager([west, overlap], { load: async url => {
    requests.push(url);
    return url === 'west' ? unusable : connected;
  } });
  await registry.select(west);
  assert.equal(registry.currentTrip(anchor, destination), undefined);
  assert.deepEqual(registry.suggestTrip(anchor, destination), { reason: 'noRoad', alternative: overlap });
  assert.equal(registry.active.region, west);
  assert.equal((await registry.select(overlap)).graph, connected);
  assert.equal(registry.active.region, overlap);
  assert.equal(registry.currentTrip(anchor, destination), connected);
  assert.equal(registry.currentTrip(destination, anchor), connected);
  assert.deepEqual(requests, ['west', 'overlap']);
});

test('verified assets match the declared checksums, identity and sample points', () => {
  for (const region of routingRegions) {
    const bytes = readFileSync(new URL('../' + region.url, import.meta.url));
    assert.equal(bytes.length, region.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), region.sha256);
    const data = JSON.parse(gunzipSync(bytes));
    assert.equal(data.coordinates.length / 2, region.vertices);
    if (!region.scope) continue;
    assert.equal(data.scope, region.scope);
    assert.equal(data.pbfSha256, region.source);
    assert.equal(data.replicationTimestamp, region.version);
    assert.equal(data.nodeIds.length, region.vertices);
    assert.equal(data.wayIds.length, data.ways.length);
    if (region.coverageUrl) {
      const shape = readFileSync(new URL('../' + region.coverageUrl, import.meta.url));
      assert.equal(region.coverageSha256, createHash('sha256').update(shape).digest('hex'));
      assert.equal(region.boundarySha256, data.boundarySha256);
      const feature = JSON.parse(gunzipSync(shape));
      assert.equal(feature.properties.scope ?? 'ph-' + feature.properties.adm1_psgc, region.id);
    }
    assert.ok(region.demand.every(i => Number.isInteger(i) && i >= 0 && i < region.vertices));
  }
});

test('the overlapping Negros extracts retain the same source IDs and fixed-point coordinates', () => {
  function read(id) {
    const region = routingRegions.find(region => region.id === id);
    return JSON.parse(gunzipSync(readFileSync(new URL('../' + region.url, import.meta.url))));
  }
  const north = read('negros-north'), south = read('negros-south');
  const northern = new Map(north.nodeIds.map((id, i) => [id, i * 2]));
  let shared = 0;
  for (let i = 0; i < south.nodeIds.length; i++) {
    const offset = northern.get(south.nodeIds[i]);
    if (offset === undefined) continue;
    assert.equal(south.coordinates[i * 2], north.coordinates[offset]);
    assert.equal(south.coordinates[i * 2 + 1], north.coordinates[offset + 1]);
    shared++;
  }
  assert.ok(shared > 1000);
  const northernWays = new Set(north.wayIds);
  assert.ok(south.wayIds.some(id => northernWays.has(id)));
});

test('road loader validates the payload and refuses partial, mismatched or aborted responses', async t => {
  const bytes = gzipSync(JSON.stringify(source));
  t.mock.method(globalThis, 'fetch', async () => new Response(bytes));
  const dataset = { ...west, scope: source.scope, source: source.pbfSha256, version: 'test-version',
    vertices: 2, edges: 2, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  assert.equal((await fetchRoadGraph('test.gz', { dataset })).edgeCount, 2);
  await assert.rejects(fetchRoadGraph('test.gz', { dataset: { ...dataset, bytes: bytes.length + 1 } }), /Incomplete/);
  await assert.rejects(fetchRoadGraph('test.gz', { dataset: { ...dataset, sha256: 'changed' } }), /checksum/);
  await assert.rejects(fetchRoadGraph('test.gz', { dataset: { ...dataset, edges: 3 } }), /edge count/);
  await assert.rejects(fetchRoadGraph('test.gz', { dataset, signal: AbortSignal.abort() }), { name: 'AbortError' });
});
