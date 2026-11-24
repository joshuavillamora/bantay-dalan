/* Usage: node scripts/extract-places.mjs PHILIPPINES_PBF DPWH_GEOJSON PARSER_PREFIX OUTPUT */
import { createReadStream, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { hav } from '../js/utils/geo.js';
import { placeWords } from '../js/features/geocoding.js';

const [pbf, boundaries, prefix, output] = process.argv.slice(2);
if (!output) throw Error('Pass a Geofabrik PBF, DPWH polygons, parser prefix and output');
const require = createRequire(resolve(prefix, 'package.json'));
const parse = require('osm-pbf-parser');
const codecs = require('osm-pbf-parser/lib/parsers');
const city = JSON.parse(readFileSync(boundaries)).features.find(f => f.properties.MUNICIPAL === 'Iloilo City').geometry;
const polygons = city.type === 'Polygon' ? [city.coordinates] : city.coordinates;
const points = polygons.flat(2);
const west = Math.min(...points.map(p => p[0])), east = Math.max(...points.map(p => p[0]));
const south = Math.min(...points.map(p => p[1])), north = Math.max(...points.map(p => p[1]));
function inside(lat, lon, ring) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x, y] = ring[i], [a, b] = ring[j];
    if ((y > lat) !== (b > lat) && lon < x + (a - x) * (lat - y) / (b - y)) hit = !hit;
  }
  return hit;
}
const inCity = (lat, lon) => polygons.some(([outer, ...holes]) =>
  inside(lat, lon, outer) && !holes.some(hole => inside(lat, lon, hole)));

const amenity = {
  school:'School', college:'College', university:'University', kindergarten:'School', hospital:'Hospital',
  clinic:'Clinic', doctors:'Clinic', dentist:'Clinic', pharmacy:'Pharmacy', townhall:'Government',
  courthouse:'Government', police:'Government', fire_station:'Government', marketplace:'Market',
  bus_station:'Terminal', ferry_terminal:'Terminal', library:'Library', theatre:'Cultural venue',
  community_centre:'Community centre', place_of_worship:'Place of worship', restaurant:'Food and drink',
  cafe:'Food and drink', fast_food:'Food and drink', bank:'Business', post_office:'Post office',
  fuel:'Fuel station', public_building:'Government'
};
const road = new Set(['trunk','primary','secondary','tertiary','unclassified','residential','living_street',
  'trunk_link','primary_link','secondary_link','tertiary_link','pedestrian','service']);
function category(t) {
  if (t.place && ['suburb','quarter','neighbourhood','village','hamlet'].includes(t.place)) return 'Neighborhood';
  if (t.boundary === 'administrative' && t.admin_level === '10') return 'Barangay';
  if (['museum','gallery','artwork','attraction'].includes(t.tourism) || ['monument','memorial','ruins'].includes(t.historic)) return 'Landmark';
  if (['park','garden','nature_reserve','playground','pitch','sports_centre'].includes(t.leisure) || t.place === 'square') return 'Park or public space';
  if (t.office === 'government' || t.building === 'government') return 'Government';
  if (t.amenity && Object.hasOwn(amenity, t.amenity)) return amenity[t.amenity];
  if (['hospital','clinic','doctors'].includes(t.healthcare)) return t.healthcare === 'hospital' ? 'Hospital' : 'Clinic';
  if (t.highway === 'bus_stop' || t.public_transport === 'station' || t.railway === 'station') return 'Terminal';
  if (t.shop === 'mall' || t.shop === 'department_store') return 'Shopping centre';
  if (t.shop && !['no','vacant'].includes(t.shop) || t.office || t.craft || t.tourism === 'hotel') return 'Business';
  if (road.has(t.highway)) return 'Street';
}

const nodes = new Map(), ways = new Map(), places = [];
const hash = createHash('sha256');
let stamp;
const observe = new Transform({ transform(data, _, send) { hash.update(data); send(null, data); } });
const header = new Transform({ objectMode:true, transform(blob, _, send) {
  if (blob.type === 'OSMHeader') {
    stamp = new Date(codecs.osm.HeaderBlock.decode(blob.data).osmosis_replication_timestamp * 1000).toISOString();
  }
  send(null, blob);
} });
const label = tags => tags.name?.trim() || tags['name:en']?.trim();

function add(row, coords, kind) {
  const name = label(row.tags);
  if (!name || !kind || !coords.length) return;
  const names = ['official_name','alt_name','loc_name','short_name','name:en'].flatMap(k => (row.tags[k] || '').split(';'));
  if (row.tags.wikipedia?.includes(':')) names.push(row.tags.wikipedia.split(':').slice(1).join(':').replaceAll('_',' '));
  const aliases = [...new Set(names.map(n => n.trim()).filter(n => n && placeWords(n) !== placeWords(name)))];
  const mid = [0, 0];
  for (const [lat, lon] of coords) { mid[0] += lat / coords.length; mid[1] += lon / coords.length; }
  let ll = mid;
  if (kind === 'Street' || !inCity(...mid)) {
    ll = coords.reduce((best, p) => hav(...p, ...mid) < hav(...best, ...mid) ? p : best);
  }
  places.push({ id: row.type + '/' + row.id, name, aliases, ll, kind,
    weight: (row.type === 'relation' ? 3 : row.type === 'way' ? 2 : 1) + Math.min(.9, coords.length / 1000) });
}

await pipeline(createReadStream(pbf), observe, new parse.BlobParser(), new parse.BlobDecompressor(), header,
  new parse.PrimitivesParser(), async blocks => {
    for await (const rows of blocks) for (const row of rows) {
      if (row.type === 'node') {
        if (row.lat >= south && row.lat <= north && row.lon >= west && row.lon <= east && inCity(row.lat, row.lon)) {
          const ll = [row.lat, row.lon];
          nodes.set(row.id, ll);
          if (label(row.tags)) add(row, [ll], category(row.tags));
        }
      } else if (row.type === 'way') {
        const coords = row.refs.map(id => nodes.get(id)).filter(Boolean);
        if (!coords.length) continue;
        ways.set(row.id, coords);
        if (label(row.tags)) add(row, coords, category(row.tags));
      } else if (row.type === 'relation' && label(row.tags)) {
        const kind = category(row.tags);
        if (!kind) continue;
        const marker = row.members.find(m => m.type === 'node' && ['label','admin_centre'].includes(m.role) && nodes.has(m.id));
        const coords = marker ? [nodes.get(marker.id)] : row.members.flatMap(m =>
          m.type === 'way' && m.role !== 'inner' ? ways.get(m.id) || [] : []);
        // A relation that only clips the city at its boundary is not itself a city place.
        if (row.members.length && (marker || (coords.length && row.members.some(m => m.type === 'way' && ways.has(m.id))))) {
          if (kind !== 'Barangay' || marker || row.members.filter(m => m.type === 'way').every(m => ways.has(m.id))) add(row, coords, kind);
        }
      }
    }
  });

const groups = new Map(), kinds = [], entries = [];
for (const place of places.sort((a, b) => b.weight - a.weight)) {
  const key = placeWords(place.name);
  if (!key) continue;
  const list = groups.get(key) || [];
  const duplicate = list.find(other => hav(...other.ll, ...place.ll) < (place.kind === 'Street' ? 600 : 170));
  if (duplicate) {
    duplicate.aliases = [...new Set([...duplicate.aliases, ...place.aliases])];
    continue;
  }
  list.push(place);
  groups.set(key, list);
}
for (const place of [...groups.values()].flat().sort((a, b) => a.id.localeCompare(b.id, 'en'))) {
  if (!kinds.includes(place.kind)) kinds.push(place.kind);
  entries.push([place.id, place.name, ...place.ll.map(n => Math.round(n * 1e6)), kinds.indexOf(place.kind),
    ...new Set(place.aliases)]);
}
if (!stamp || entries.length < 200) throw Error('Incomplete city index');
writeFileSync(output, JSON.stringify({ version: 1, city: 'Iloilo City', snapshot: stamp,
  source: 'Geofabrik Philippines / OpenStreetMap contributors (ODbL 1.0)', pbfSha256: hash.digest('hex'),
  kinds, entries }) + '\n');
console.log(entries.length + ' mapped places across ' + kinds.length + ' categories');
