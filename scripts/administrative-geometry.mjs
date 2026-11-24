/* Compile latitude bands once so nearby OSM points only test relevant ring edges. */
export function prepareBoundary(geometry) {
  if (!['Polygon', 'MultiPolygon'].includes(geometry?.type)) throw Error('Expected an administrative polygon');
  const shapes = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  const polygons = shapes.map(([shell, ...holes]) => [prepareRing(shell), holes.map(prepareRing)]);
  const bounds = polygons.reduce(([w, s, e, n], [outer]) => [
    Math.min(w, outer.bounds[0]), Math.min(s, outer.bounds[1]),
    Math.max(e, outer.bounds[2]), Math.max(n, outer.bounds[3])
  ], [Infinity, Infinity, -Infinity, -Infinity]);
  return { bounds, polygons };
}

export function boundaryContains(polygons, lat, lon) {
  return polygons.some(([outer, holes]) => insideRing(outer, lat, lon) && !holes.some(hole => insideRing(hole, lat, lon)));
}

function prepareRing(ring) {
  const bounds = [Infinity, Infinity, -Infinity, -Infinity];
  const bands = new Map();
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x, y] = ring[i], [x0, y0] = ring[j];
    bounds[0] = Math.min(bounds[0], x); bounds[1] = Math.min(bounds[1], y);
    bounds[2] = Math.max(bounds[2], x); bounds[3] = Math.max(bounds[3], y);
    if (y === y0) continue;
    const edge = [x, y, x0, y0];
    const first = Math.floor(Math.min(y, y0) * 50), last = Math.floor(Math.max(y, y0) * 50);
    for (let band = first; band <= last; band++) {
      if (!bands.has(band)) bands.set(band, []);
      bands.get(band).push(edge);
    }
  }
  return { bounds, bands };
}

export const boundsContain = ([w, s, e, n], lat, lon) => lon >= w && lon <= e && lat >= s && lat <= n;
function insideRing(ring, lat, lon) {
  if (!boundsContain(ring.bounds, lat, lon)) return false;
  let inside = false;
  for (const [x, y, x0, y0] of ring.bands.get(Math.floor(lat * 50)) || []) {
    if ((y > lat) !== (y0 > lat) && lon < (x0 - x) * (lat - y) / (y0 - y) + x) inside = !inside;
  }
  return inside;
}
