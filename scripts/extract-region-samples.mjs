/* Offline only. Produces geographic clips without joining roads across clipped gaps. */
import { createHash } from 'node:crypto';
import { createReadStream, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { gzipSync } from 'node:zlib';
import { SPEED } from '../js/config.js';
import { blockedNode, directions } from './osm-driving.mjs';
import { createSourceNodeIndex } from './osm-node-index.mjs';
import { boundaryContains, boundsContain, prepareBoundary } from './administrative-geometry.mjs';

const [file, parserPrefix, output, ...args] = process.argv.slice(2);
const administrative = args[0] === '--administrative';
const identity = administrative || args[0] === '--regional';
const boundarySource = administrative ? readFileSync(args[1]) : undefined;
const boundarySha256 = boundarySource && createHash('sha256').update(boundarySource).digest('hex');
const areas = boundarySource && JSON.parse(boundarySource).features;
const selected = new Set(args.slice(2));
const scopeOf = properties => properties.scope ?? 'ph-' + properties.adm1_psgc;
const boundaryRegions = areas?.filter(({ properties }) => !selected.size || selected.has(scopeOf(properties)))
  .map(({ properties, geometry }) => {
    const scope = scopeOf(properties);
    if (!/^[a-z0-9-]+$/.test(scope)) throw Error('Invalid administrative dataset ID');
    const { bounds, polygons } = prepareBoundary(geometry);
    return { scope, bounds, polygons };
  });
if (administrative && (!boundaryRegions.length || selected.size && boundaryRegions.length !== selected.size)) {
  throw Error('Requested boundary is missing');
}
const boxes = administrative ? boundaryRegions.map(({ scope, bounds }) => scope + '=' + bounds.join(',')) : identity
  ? Object.entries(JSON.parse(readFileSync(args[1], 'utf8')))
    .filter(([id]) => args.length === 2 || args.slice(2).includes(id))
    .map(([id, entry]) => id + '=' + entry.clip.join(','))
  : args;
if (!boxes.length) throw Error('Pass a source PBF, parser prefix, output, and --administrative BOUNDARIES_JSON [DATASET_ID...] or --regional FIXTURES_JSON [DATASET_ID...] or name=west,south,east,north');
const classes = Object.keys(SPEED);
const regions = boxes.map(box => {
  const [name, extent] = box.split('=');
  const bounds = extent?.split(',').map(Number);
  if (!/^[a-z0-9-]+$/.test(name) || bounds?.length !== 4 || !bounds.every(Number.isFinite)) throw Error('Invalid sample bounds: ' + box);
  const [w,s,e,n] = bounds;
  if (w < -180 || e > 180 || s < -90 || n > 90 || w >= e || s >= n) throw Error('Invalid sample bounds: ' + box);
  return { name, bounds, vertexBySource: new Map(), names: [], nameIDs: new Map(), coordinates: [], ways: [], nodeIds: [], wayIds: [] };
});
for (const region of regions) region.polygons = boundaryRegions?.find(area => area.scope === region.name)?.polygons;

const require = createRequire(resolve(parserPrefix, 'package.json'));
const parser = require('osm-pbf-parser');
const parserCodecs = require('osm-pbf-parser/lib/parsers');
const hash = createHash('sha256');
const tap = new Transform({ transform(bytes, _, send) { hash.update(bytes); send(null, bytes); } });
let replicationTimestamp;
const header = new Transform({ objectMode: true, transform(blob, _, send) {
  if (blob.type === 'OSMHeader') {
    const info = parserCodecs.osm.HeaderBlock.decode(blob.data);
    if (info.osmosis_replication_timestamp) replicationTimestamp = new Date(info.osmosis_replication_timestamp * 1000).toISOString();
  }
  send(null, blob);
} });

const coordinateScale = 1e7;
const sourceNodes = createSourceNodeIndex(coordinateScale);
function insideRegion(region, { lat, lon }) {
  if (!boundsContain(region.fixedBounds, lat, lon)) return false;
  if (!region.polygons) return true;
  const y = lat / coordinateScale, x = lon / coordinateScale;
  return boundaryContains(region.polygons, y, x);
}
for (const region of regions) region.fixedBounds = region.bounds.map(value => Math.round(value * coordinateScale));

function insert(region, { id, lat, lon }) {
  if (!region.vertexBySource.has(id)) {
    region.vertexBySource.set(id, region.coordinates.length / 2);
    region.coordinates.push(lat, lon);
    if (identity) region.nodeIds.push(id);
  }
  return region.vertexBySource.get(id);
}

function addWay(region, { id, tags }, points, roadClass, flags) {
  let run = [], name = tags.name || tags.ref || '';
  // Administrative land polygons can omit water under an OSM bridge.
  // Keep its real way between two anchors inside this same region.
  const bridge = region.polygons && tags.bridge && tags.bridge !== 'no' &&
    points[0] && points.at(-1) && insideRegion(region, points[0]) && insideRegion(region, points.at(-1));
  function flush() {
    if (run.length >= 2) {
      if (!region.nameIDs.has(name)) region.nameIDs.set(name, region.names.push(name) - 1);
      region.ways.push([roadClass, flags, region.nameIDs.get(name), run.map(point => insert(region, point))]);
      if (identity) region.wayIds.push(id);
    }
    run = [];
  }
  for (const point of points) {
    if (!point || !bridge && !insideRegion(region, point)) flush();
    else if (run.at(-1)?.id !== point.id) run.push(point);
  }
  flush();
}

let seenWay = false;
await pipeline(createReadStream(file), tap, new parser.BlobParser(), new parser.BlobDecompressor(), header,
  new parser.PrimitivesParser(), async blocks => {
    for await (const rows of blocks) for (const row of rows) {
      if (row.type === 'node') {
        if (seenWay) throw Error('Expected a type-sorted OSM PBF');
        const { lat, lon, id, tags } = row;
        if (regions.some(region => boundsContain(region.bounds, lat, lon)) && !blockedNode(tags)) sourceNodes.add(id, lat, lon);
      } else if (row.type === 'way') {
        seenWay = true;
        const roadClass = classes.indexOf(row.tags.highway);
        if (roadClass < 0 || row.tags.area === 'yes') continue;
        const flags = directions(row.tags);
        if (!flags) continue;
        // Resolve each way once, then clip it against every requested region.
        const points = row.refs.map(sourceNodes.find);
        if (points.some(Boolean)) for (const region of regions) addWay(region, row, points, roadClass, flags);
      }
    }
  });
const pbfSha256 = hash.digest('hex');
sourceNodes.clear();
for (const { name, bounds, vertexBySource, names, coordinates, ways, nodeIds, wayIds } of regions) {
  vertexBySource.clear();
  if (!ways.length) throw Error('No roads for ' + name);
  const data = { format: 'bantay-roads-v1', scope: name, bounds, pbfSha256, replicationTimestamp,
    attribution: '© OpenStreetMap contributors, ODbL 1.0', classes, names, coordinates, ways };
  if (identity) Object.assign(data, { nodeIds, wayIds });
  if (boundarySha256) data.boundarySha256 = boundarySha256;
  const bytes = gzipSync(JSON.stringify(data), { level: 9 });
  writeFileSync(join(output, name + '.json.gz'), bytes);
  console.log(JSON.stringify({ name, vertices: coordinates.length / 2, wayRuns: ways.length, bytes: bytes.length, pbfSha256, replicationTimestamp }));
}
