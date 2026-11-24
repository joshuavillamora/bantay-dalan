/* Derive the two standalone study areas from the archived boundary inputs. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { boundaryContains, prepareBoundary } from './administrative-geometry.mjs';

const [municipalities, regions, output] = process.argv.slice(2);
assert.ok(output, 'Pass municipal GeoJSON, regional GeoJSON, and an output path');
const read = path => JSON.parse(readFileSync(path));
const province = read(municipalities).features.filter(({ properties }) =>
  /^063\d{3}000$/.test(properties.MUN_CODE) && properties.MUN_CODE !== '063022000');
assert.equal(new Set(province.map(unit => unit.properties.MUN_CODE)).size, 43);
const westernVisayas = read(regions).features.find(({ properties }) => +properties.adm1_psgc === 600000000);
assert.equal(westernVisayas.geometry.type, 'MultiPolygon');

// The contiguous main island contains all four provincial capitals. This
// excludes Guimaras and offshore islands without a rectangular crop.
const capitals = [[10.69264, 122.57367], [10.745, 121.941], [11.708, 122.364], [11.586, 122.752]];
const island = westernVisayas.geometry.coordinates.filter(coordinates => {
  const { polygons } = prepareBoundary({ type: 'Polygon', coordinates });
  return capitals.every(([lat, lng]) => boundaryContains(polygons, lat, lng));
});
assert.equal(island.length, 1, 'Expected one contiguous Panay land polygon');

const feature = (scope, name, geometry) => ({ type: 'Feature', properties: { scope, name }, geometry });
const features = [
  feature('iloilo-province', 'Iloilo Province', { type: 'MultiPolygon', coordinates:
    province.flatMap(({ geometry }) => geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates) }),
  feature('panay-island', 'Panay Island', { type: 'Polygon', coordinates: island[0] })
];
writeFileSync(output, JSON.stringify({ type: 'FeatureCollection', features }) + '\n');
