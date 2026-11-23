/* Geometry helpers. */
const R = 6371000, rad = Math.PI / 180;
/* distance in metres between (lat a, lng b) and (lat c, lng d) */
export const hav = (a, b, c, d) => R * Math.hypot((d - b) * rad * Math.cos((a + c) * rad / 2), (c - a) * rad);
const ccw = (a, b, c) => (c[0]-a[0]) * (b[1]-a[1]) > (b[0]-a[0]) * (c[1]-a[1]);
/* do segments p-q and r-s cross? (points are [lat, lng]) */
export const crosses = (p, q, r, s) => ccw(p,r,s) !== ccw(q,r,s) && ccw(p,q,r) !== ccw(p,q,s);
