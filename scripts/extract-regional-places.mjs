/* Build local locality and regional indexes from a type-sorted OSM PBF. */
import { createReadStream, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { gzipSync } from 'node:zlib';
import { routingRegions } from '../js/graph/region-manifest.js';
import { placeWords } from '../js/features/geocoding.js';
import { createSourceNodeIndex } from './osm-node-index.mjs';
import { boundaryContains, boundsContain as contains, prepareBoundary } from './administrative-geometry.mjs';
import { administrativeGroups } from '../data/regions/administrative.js';

const [file, parserPrefix, output, country = 'philippines', boundaries, ...ids] = process.argv.slice(2);
if (!output || !['philippines', 'singapore'].includes(country)) throw Error('Pass a source PBF, parser prefix, output directory and country');
const require = createRequire(resolve(parserPrefix, 'package.json'));
const parser = require('osm-pbf-parser');
const singapore = country === 'singapore';
const names = new Map(administrativeGroups.flatMap(([, entries]) => entries));
const scopes = new Set(ids);
const targetAreas = boundaries ? JSON.parse(readFileSync(boundaries)).features.flatMap(({ properties, geometry }) => {
  const id = properties.scope ?? 'ph-' + properties.adm1_psgc;
  if (!scopes.has(id)) return [];
  return [{ id, name: names.get(id), ...prepareBoundary(geometry), entries: new Map() }];
}) : null;
if (boundaries && (singapore || !scopes.size || targetAreas.length !== scopes.size ||
    targetAreas.some(region => !region.name))) throw Error('Pass Philippine boundary data and declared regional IDs');
// Iloilo's index follows municipal polygons and is produced with the Iloilo graph.
const regions = targetAreas || routingRegions.filter(region => !region.coverageUrl && region.id !== 'iloilo-city-province' &&
  region.id.startsWith('singapore') === singapore)
  .map(region => ({ ...region, entries: new Map() }));
const major = new Map();
const hash = createHash('sha256');
const track = new Transform({ transform(bytes, _, callback) { hash.update(bytes); callback(null, bytes); } });
let snapshot;
const header = new Transform({ objectMode: true, transform(blob, _, callback) {
  if (blob.type === 'OSMHeader') {
    const stamp = require('osm-pbf-parser/lib/parsers').osm.HeaderBlock.decode(blob.data).osmosis_replication_timestamp;
    if (stamp) snapshot = new Date(stamp * 1000).toISOString();
  }
  callback(null, blob);
} });

const localities = {
  city: ['City', 10], town: ['Town', 9], municipality: ['Municipality', 9], province: ['Province', 9],
  region: ['Region', 9], state: ['Province or state', 9], island: ['Island', 9], village: ['Village or barangay', 7],
  suburb: ['Neighborhood', 7], quarter: ['Neighborhood', 6], neighbourhood: ['Neighborhood', 6],
  hamlet: ['Hamlet', 5]
};
const amenities = {
  hospital: ['Hospital', 8], clinic: ['Clinic', 6], university: ['University', 8], college: ['College', 7],
  school: ['School', 7], kindergarten: ['School', 6], townhall: ['Government', 8], courthouse: ['Government', 6],
  police: ['Government', 6], marketplace: ['Market', 7], bus_station: ['Terminal', 8], ferry_terminal: ['Terminal', 8],
  library: ['Library', 6], place_of_worship: ['Place of worship', 6], theatre: ['Cultural venue', 6],
  pharmacy: ['Business', 4], bank: ['Business', 4], restaurant: ['Food and drink', 3], cafe: ['Food and drink', 3],
  fast_food: ['Food and drink', 3], fuel: ['Fuel station', 3]
};
const streets = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary',
  'unclassified', 'residential', 'living_street', 'pedestrian']);
function category(tags) {
  if (Object.hasOwn(localities, tags.place)) return localities[tags.place];
  if (tags.boundary === 'administrative' && ['4', '6', '8', '10'].includes(tags.admin_level)) {
    return { 4: ['Region', 9], 6: ['Province', 9], 8: ['Municipality', 8], 10: ['Barangay', 7] }[tags.admin_level];
  }
  if (tags.aeroway === 'aerodrome' || tags.aeroway === 'terminal') return ['Airport', 8];
  if (tags.railway === 'station' || tags.public_transport === 'station') return ['Terminal', 8];
  if (['museum','gallery','attraction'].includes(tags.tourism) || ['monument','memorial','ruins'].includes(tags.historic)) return ['Landmark', 7];
  if (['park','garden','nature_reserve'].includes(tags.leisure) || tags.place === 'square') return ['Park or public space', 6];
  if (tags.office === 'government' || tags.building === 'government') return ['Government', 7];
  if (['mall', 'department_store', 'supermarket'].includes(tags.shop)) return ['Shopping centre', 7];
  if (Object.hasOwn(amenities, tags.amenity)) return amenities[tags.amenity];
  if (Object.hasOwn(amenities, tags.healthcare)) return amenities[tags.healthcare];
  if (streets.has(tags.highway)) return ['Street', ['motorway','trunk','primary','secondary','tertiary'].includes(tags.highway) ? 7 : 4];
  if (tags.shop && !['no','vacant'].includes(tags.shop) || tags.office) return ['Business', 3];
}

const coordinateScale = 1e6;
const sourceNodes = createSourceNodeIndex(coordinateScale);

// Use a mapped point nearest the mean so a winding way's label stays on the feature.
function representative(points) {
  if (!points.length) return;
  let lat = 0, lon = 0;
  for (const point of points) { lat += point.lat; lon += point.lon; }
  lat /= points.length; lon /= points.length;
  const dist = point => (point.lat - lat) ** 2 + (point.lon - lon) ** 2;
  return points.reduce((best, p) => dist(p) < dist(best) ? p : best);
}

const nationalKinds = new Set(['City','Town','Municipality','Province','Province or state','Region','Island','Airport']);
function record(row, name, placement, [kind, priority]) {
  if (!placement) return;
  const { lat, lon } = placement;
  const normalized = placeWords(name);
  if (!normalized) return;
  const aliases = [...new Set(['official_name', 'alt_name', 'loc_name', 'short_name', 'name:en']
    .flatMap(key => (row.tags[key] || '').split(';')).map(value => value.trim())
    .filter(value => value && placeWords(value) !== normalized))].slice(0, 5);
  if (kind === 'City' && !/\bcity\b/i.test(name)) aliases.push(name + ' City');
  const item = { id: row.type + '/' + row.id, name, lat, lon, kind, aliases, priority };
  const size = kind === 'Street' ? 20000 : nationalKinds.has(kind) ? 7000 : 1800;
  const key = normalized + '/' + Math.round(lat / size) + '/' + Math.round(lon / size);
  function add(list) {
    if ((list.get(key)?.priority || 0) < priority) list.set(key, item);
  }
  const y = lat / coordinateScale, x = lon / coordinateScale;
  for (const region of regions) {
    if (contains(region.bounds, y, x) && (!region.polygons || boundaryContains(region.polygons, y, x))) add(region.entries);
  }
  if (!singapore && !targetAreas && nationalKinds.has(kind)) add(major);
}

let seenWay = false;
await pipeline(createReadStream(file), track, new parser.BlobParser(), new parser.BlobDecompressor(),
  header, new parser.PrimitivesParser(), async batches => {
    for await (const batch of batches) for (const row of batch) {
      const { tags } = row;
      if (row.type === 'node') {
        if (seenWay) throw Error('Expected a type-sorted OSM PBF');
        if (regions.some(region => contains(region.bounds, row.lat, row.lon))) sourceNodes.add(row.id, row.lat, row.lon);
      } else if (row.type === 'way') seenWay = true;
      const name = (tags.name || tags['name:en'])?.trim(), kind = name && category(tags);
      if (!kind || name.length > 150) continue;
      if (row.type === 'node') {
        record(row, name, { lat: Math.round(row.lat * coordinateScale), lon: Math.round(row.lon * coordinateScale) }, kind);
      } else if (row.type === 'way') record(row, name, representative(row.refs.map(sourceNodes.find).filter(Boolean)), kind);
      else if (row.type === 'relation') {
        const marker = row.members.find(member => member.type === 'node' && ['label','admin_centre'].includes(member.role));
        if (marker) record(row, name, sourceNodes.find(marker.id), kind);
      }
    }
  });

const pbfSha256 = hash.digest('hex');
sourceNodes.clear();
const expectedSource = (targetAreas ? routingRegions : regions).find(region =>
  region.source && region.id.startsWith('singapore') === singapore)?.source;
if (pbfSha256 !== expectedSource) throw Error('Source PBF does not match the routing snapshot');
if (!singapore && !targetAreas) regions.push({ id: 'philippines-localities', name: 'Philippines', entries: major });
mkdirSync(output, { recursive: true });
for (const { id, name, entries } of regions) {
  const kinds = [];
  const sorted = [...entries.values()].sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name, 'en') || a.id.localeCompare(b.id));
  const rows = sorted.slice(0, 18000).map(place => {
    if (!kinds.includes(place.kind)) kinds.push(place.kind);
    return [place.id, place.name, place.lat, place.lon, kinds.indexOf(place.kind), ...place.aliases];
  });
  if (!rows.length) throw Error(id + ' produced no places');
  const bytes = gzipSync(JSON.stringify({ version: 1, city: name, snapshot, pbfSha256, kinds, entries: rows }), { level: 9 });
  writeFileSync(join(output, id + '.json.gz'), bytes);
  console.log(JSON.stringify({ id, records: rows.length, totalCandidates: sorted.length, bytes: bytes.length,
    kinds, sha256: createHash('sha256').update(bytes).digest('hex') }));
}
