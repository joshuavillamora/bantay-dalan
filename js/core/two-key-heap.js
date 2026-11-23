/* Min-heap with two-part keys [a, b] (used by LPA*). Each entry carries a stamp so stale entries can be skipped. */
export class TwoKeyHeap {
  constructor() { this.a = []; this.b = []; this.v = []; this.s = []; }
  get size() { return this.v.length; }
  lt(i, j) { return this.a[i] < this.a[j] || (this.a[i] === this.a[j] && this.b[i] < this.b[j]); }
  swap(i, j) { for (const x of [this.a, this.b, this.v, this.s]) { const t = x[i]; x[i] = x[j]; x[j] = t; } }
  push(v, a, b, s) {
    this.a.push(a); this.b.push(b); this.v.push(v); this.s.push(s);
    let i = this.v.length - 1;
    while (i > 0) { const p = (i-1) >> 1; if (!this.lt(i, p)) break; this.swap(i, p); i = p; }
  }
  pop() {
    const last = this.v.length - 1; this.swap(0, last);
    const r = this.v.pop(); this.a.pop(); this.b.pop(); this.s.pop();
    const m = this.v.length; let i = 0;
    for (;;) {
      let c = 2*i + 1; if (c >= m) break;
      if (c+1 < m && this.lt(c+1, c)) c++;
      if (!this.lt(c, i)) break;
      this.swap(i, c); i = c;
    }
    return r;
  }
}
