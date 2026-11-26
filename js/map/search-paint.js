/* Shared trace styles. A thin dark casing keeps the exact palette readable over tiles. */
export function paintSearch(ctx, a, b, { color, kind, zoom, photo, lane = 0 }) {
  ctx.beginPath();
  if (!b) {
    const frontier = kind === 'frontier', retained = kind === 'retained';
    ctx.arc(a.x, a.y, frontier ? 2.5 : retained ? 1.6 : 2, 0, 2 * Math.PI);
    ctx.setLineDash([]);
    ctx.globalAlpha = retained ? .5 : 1;
    ctx.strokeStyle = '#20252e';
    ctx.lineWidth = frontier ? 1.1 : .75;
    ctx.stroke();
    ctx.globalAlpha = retained ? .52 : frontier ? .78 : .94;
    if (frontier) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.stroke();
    } else {
      ctx.fillStyle = color;
      ctx.fill();
    }
  } else {
    // Canonical screen direction keeps the same lane when an edge is traversed in reverse.
    const sign = a.x < b.x || (a.x === b.x && a.y < b.y) ? 1 : -1;
    const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
    if (length < .1) return;
    const x = -dy / length * lane * sign, y = dx / length * lane * sign;
    ctx.moveTo(a.x + x, a.y + y);
    ctx.lineTo(b.x + x, b.y + y);
    ctx.setLineDash(kind === 'backward' ? [4, 3] : kind === 'repair' ? [2, 3] : []);
    const width = zoom < 13 ? 1.15 : 1.65;
    ctx.strokeStyle = '#20252e';
    ctx.lineWidth = width + (photo ? 1.5 : .85);
    ctx.globalAlpha = photo ? .7 : .52;
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.globalAlpha = .96;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
