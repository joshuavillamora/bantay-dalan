/* Geometry helpers. */
const R = 6371000, rad = Math.PI / 180;
/* Equirectangular road-segment approximation in metres, using the segment's mean latitude. */
export const hav = (a, b, c, d) => R * Math.hypot((d - b) * rad * Math.cos((a + c) * rad / 2), (c - a) * rad);

/* Euclidean chord through the sphere. It obeys the triangle inequality and
   is no greater than the equirectangular distance between the same points. */
export function chordDistance(a, b, c, d) {
  const latTerm = Math.sin((c - a) * rad / 2);
  const lngTerm = Math.sqrt(Math.cos(a * rad) * Math.cos(c * rad)) * Math.sin((d - b) * rad / 2);
  return 2 * R * Math.hypot(latTerm, lngTerm);
}

const side = (a, b, c) => (c[0]-a[0]) * (b[1]-a[1]) - (b[0]-a[0]) * (c[1]-a[1]);
/* A proper crossing. Endpoint touches and collinear overlaps do not close a road. */
export const crosses = (p, q, r, s) => side(p,q,r) * side(p,q,s) < 0 && side(r,s,p) * side(r,s,q) < 0;
