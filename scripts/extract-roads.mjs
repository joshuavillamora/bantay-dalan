/* Build both offline candidates from one Geofabrik PBF. See data/README.md. */
import { createReadStream, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { gzipSync, gunzipSync } from 'node:zlib';
import { blockedNode, directions } from './osm-driving.mjs';

const [pbf, boundaryFile, work, output, mode, placeSource] = process.argv.slice(2);
if (!output) throw Error('Usage: node scripts/extract-roads.mjs PHILIPPINES_PBF MUNICIPALITIES_GEOJSON PARSER_PREFIX OUTPUT_DIR');
const iloilo = mode === '--iloilo';
const require = createRequire(resolve(work, 'package.json'));
const parser = require('osm-pbf-parser');
const parserCodecs = require('osm-pbf-parser/lib/parsers');
const source = 'https://download.geofabrik.de/asia/philippines.html';
const provinces = iloilo ? ['Iloilo'] : ['Iloilo', 'Guimaras', 'Antique', 'Capiz', 'Aklan'];
const classes = ['motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link',
  'tertiary', 'tertiary_link', 'unclassified', 'residential', 'living_street', 'service', 'track'];
const { features } = JSON.parse(readFileSync(boundaryFile));
if (iloilo) {
  const units = features.filter(({ properties }) => properties.PROVINCE === 'Iloilo' || properties.MUN_CODE === '063022000');
  if (new Set(units.map(unit => unit.properties.MUN_CODE)).size !== 44 ||
      !units.some(unit => unit.properties.MUN_CODE === '063022000')) throw Error('Expected Iloilo City and 43 provincial LGUs');
}
const polygons = features.flatMap(({ geometry, properties }) => {
  const province = provinces.indexOf(iloilo && properties.MUN_CODE === '063022000' ? 'Iloilo' : properties.PROVINCE);
  if (province < 0 || !geometry) return [];
  const parts = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return parts.map(([ring, ...holes]) => {
    const x = ring.map(p => p[0]), y = ring.map(p => p[1]);
    return { ring, holes, province, w: Math.min(...x), s: Math.min(...y), e: Math.max(...x), n: Math.max(...y) };
  });
});
if (!provinces.every((_, i) => polygons.some(p => p.province === i))) throw Error('Municipal polygons are incomplete');
const box = [Math.min(...polygons.map(p => p.w)) - .03, Math.min(...polygons.map(p => p.s)) - .03,
  Math.max(...polygons.map(p => p.e)) + .03, Math.max(...polygons.map(p => p.n)) + .03];
const cells = new Map();
const cellKey = (x, y) => x * 1000 + y;
for (const p of polygons) {
  for (let x = Math.floor(p.w * 10); x <= Math.floor(p.e * 10); x++) {
    for (let y = Math.floor(p.s * 10); y <= Math.floor(p.n * 10); y++) {
      const key = cellKey(x, y);
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(p);
    }
  }
}

function inside(x, y, ring) {
  let result = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < xi + (xj - xi) * (y - yi) / (yj - yi)) result = !result;
  }
  return result;
}

function scopeMask(point) {
  if (point.mask !== undefined) return point.mask;
  const [x, y] = [point.lon, point.lat];
  let mask = 0;
  for (const p of cells.get(cellKey(Math.floor(x * 10), Math.floor(y * 10))) || []) {
    if (x >= p.w && x <= p.e && y >= p.s && y <= p.n && inside(x, y, p.ring) &&
        !p.holes.some(ring => inside(x, y, ring))) mask |= 1 << p.province;
  }
  return point.mask = mask;
}

function candidate(scope, mask, filename) {
  return { scope, mask, filename, coords: [], ways: [], names: [], nodes: new Map(), nameIDs: new Map(),
    wayIDs: new Set(), restrictions: 0, barriers: new Set(), missing: 0, classWays: Object.create(null) };
}
const candidates = iloilo ? [candidate('iloilo-city-province', 1, 'iloilo-city-province.json.gz')] : [
  candidate('Iloilo and Guimaras', 3, 'iloilo-candidate.json'),
  candidate('Panay and Guimaras', 31, 'panay-candidate.json')
];
const nodes = new Map();
let phase = 'node', stamp, accessedWays = 0, checkedWays = 0;
function readNode(row) {
  if (phase !== 'node') throw Error('Expected type-sorted Geofabrik PBF');
  if (row.lon < box[0] || row.lat < box[1] || row.lon > box[2] || row.lat > box[3]) return;
  if (!Number.isSafeInteger(row.id) || !Number.isFinite(row.lat) || !Number.isFinite(row.lon)) throw Error('Invalid PBF node');
  nodes.set(row.id, { lat: row.lat, lon: row.lon, blocked: blockedNode(row.tags) });
}
function wayCoordinate(c, id) {
  let index = c.nodes.get(id);
  if (index !== undefined) return index;
  const p = nodes.get(id);
  index = c.nodes.size;
  c.nodes.set(id, index);
  c.coords.push(Math.round(p.lat * 1e7), Math.round(p.lon * 1e7));
  return index;
}
function readWay(row) {
  phase = 'way';
  const tags = row.tags;
  const roadClass = classes.indexOf(tags.highway);
  if (roadClass < 0 || tags.area === 'yes') return;
  const mask = row.refs.reduce((mask, id) => {
    const p = nodes.get(id);
    return p ? mask | scopeMask(p) : mask;
  }, 0);
  if (!mask) return;
  checkedWays++;
  const flags = directions(tags);
  if (!flags) { accessedWays++; return; }
  for (const c of candidates) {
    if (!(c.mask & mask)) continue;
    let run = [];
    let name = tags.name || tags.ref || '';
    if (!c.nameIDs.has(name)) {
      c.nameIDs.set(name, c.names.length);
      c.names.push(name);
    }
    const finish = () => {
      if (run.length >= 2) {
        c.ways.push([roadClass, flags, c.nameIDs.get(name), run.map(id => wayCoordinate(c, id))]);
        if (iloilo) (c.wayRunIds ??= []).push(row.id);
        c.wayIDs.add(row.id);
        c.classWays[tags.highway] = (c.classWays[tags.highway] || 0) + 1;
      }
      run = [];
    };
    for (const id of row.refs) {
      const p = nodes.get(id);
      if (!p || p.blocked) {
        if (!p) c.missing++;
        else c.barriers.add(id);
        finish();
      } else if (iloilo && !(scopeMask(p) & c.mask)) {
        // Keep original way runs inside the municipal union. Never bridge removed nodes.
        finish();
      } else if (run.at(-1) !== id) run.push(id);
    }
    finish();
  }
}

const hash = createHash('sha256');
const tap = new Transform({ transform(bytes, _, send) { hash.update(bytes); send(null, bytes); } });
const header = new Transform({ objectMode: true, transform(blob, _, send) {
  if (blob.type === 'OSMHeader') {
    const fields = parserCodecs.osm.HeaderBlock.decode(blob.data);
    stamp = new Date(fields.osmosis_replication_timestamp * 1000).toISOString();
  }
  send(null, blob);
} });
await pipeline(createReadStream(pbf), tap, new parser.BlobParser(), new parser.BlobDecompressor(), header,
  new parser.PrimitivesParser(), async blocks => {
    for await (const rows of blocks) for (const row of rows) {
      if (row.type === 'node') readNode(row);
      else if (row.type === 'way') readWay(row);
      else if (row.tags.type?.startsWith('restriction')) {
        for (const c of candidates) if (row.members.some(m => m.type === 'way' && c.wayIDs.has(m.id))) c.restrictions++;
      }
    }
  });
if (!stamp || !candidates.every(c => c.ways.length > 10000)) throw Error('Incomplete extract');
const pbfSha256 = hash.digest('hex');
const boundarySha256 = createHash('sha256').update(readFileSync(boundaryFile)).digest('hex');
for (const c of candidates) {
  const data = {
    format: 'bantay-roads-v1', scope: c.scope, source, pbfSha256, boundarySha256,
    osm3s: { timestamp_osm_base: stamp, copyright: '© OpenStreetMap contributors, ODbL 1.0' },
    extraction: { wayRunsByClass: c.classWays, accessAndDirectionExcludedPanay: accessedWays,
      highwayWaysConsideredPanay: checkedWays, blockedBarrierNodes: c.barriers.size,
      missingNodeReferences: c.missing, unmodeledRestrictionRelationsTouchingIncludedWays: c.restrictions },
    classes, names: c.names, coordinates: c.coords, ways: c.ways
  };
  if (iloilo) {
    Object.assign(data, { replicationTimestamp: stamp, nodeIds: [...c.nodes.keys()], wayIds: c.wayRunIds });
    writeFileSync(join(output, c.filename), gzipSync(JSON.stringify(data), { level: 9 }));
  } else writeFileSync(join(output, c.filename), JSON.stringify(data) + '\n');
  console.log(c.scope, c.nodes.size, c.ways.length, JSON.stringify(data.extraction));
}
if (iloilo && placeSource) {
  const index = JSON.parse(gunzipSync(readFileSync(placeSource)));
  if (index.pbfSha256 !== pbfSha256) throw Error('Place index must come from the same OSM snapshot');
  const { coords } = candidates[0];
  const bounds = [Infinity, Infinity, -Infinity, -Infinity];
  for (let i = 0; i < coords.length; i += 2) {
    const lat = coords[i] / 1e7, lon = coords[i + 1] / 1e7;
    bounds[0] = Math.min(bounds[0], lon);
    bounds[1] = Math.min(bounds[1], lat);
    bounds[2] = Math.max(bounds[2], lon);
    bounds[3] = Math.max(bounds[3], lat);
  }
  const [west, south, east, north] = bounds;
  const entries = index.entries.filter(([, , y, x]) => {
    const lat = y / 1e6, lon = x / 1e6;
    return lat >= south && lat <= north && lon >= west && lon <= east && scopeMask({ lat, lon });
  });
  if (!entries.length) throw Error('No places inside the Iloilo graph extent');
  writeFileSync(join(output, 'iloilo-city-province-places.json.gz'), gzipSync(JSON.stringify({
    ...index, city: 'Iloilo City and Province', boundarySha256, entries
  }), { level: 9 }));
  console.log('Iloilo place entries:', entries.length);
}
