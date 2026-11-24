import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { gunzipSync } from 'node:zlib';
import { routingRegions } from '../js/graph/region-manifest.js';

const read = path => readFileSync(new URL('../' + path, import.meta.url));

test('offline place catalog covers every bundled graph and the Philippine locality index', () => {
  const catalog = JSON.parse(read('data/places/manifest.json'));
  const source = routingRegions.find(region => region.source && !region.id.startsWith('singapore')).source;
  const national = 'philippines-localities';
  assert.equal(catalog.version, 1);
  assert.deepEqual(new Set(catalog.indexes.map(item => item.id)), new Set([...routingRegions.map(region => region.id), national]));
  for (const { id, bytes, records, sha256 } of catalog.indexes) {
    const payload = read(`data/places/${id}.json.gz`);
    const index = JSON.parse(gunzipSync(payload));
    const region = routingRegions.find(item => item.id === id);
    assert.equal(payload.length, bytes);
    assert.equal(createHash('sha256').update(payload).digest('hex'), sha256);
    assert.equal(index.version, 1);
    assert.equal(index.pbfSha256, region?.source ?? source);
    assert.equal(index.entries.length, records);
    assert.ok(index.entries.every(([id, name, lat, lng, kind]) => id && name && Number.isInteger(lat) &&
      Number.isInteger(lng) && index.kinds[kind]));
    if (region) {
      const [west, south, east, north] = region.bounds;
      assert.ok(index.entries.every(([, , lat, lng]) =>
        lat / 1e6 >= south && lat / 1e6 <= north && lng / 1e6 >= west && lng / 1e6 <= east), region.name);
    }
  }
});
