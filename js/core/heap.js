/* Binary min-heap with one numeric key. */
export class Heap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(v, k) {
    let i = this.k.length; this.k.push(k); this.v.push(v);
    while (i > 0) { const p = (i-1) >> 1; if (this.k[p] <= k) break; this.k[i] = this.k[p]; this.v[i] = this.v[p]; i = p; }
    this.k[i] = k; this.v[i] = v;
  }
  pop() {
    const top = this.v[0], lk = this.k.pop(), lv = this.v.pop(), n = this.k.length;
    if (n) {
      let i = 0;
      for (;;) {
        let c = 2*i + 1; if (c >= n) break;
        if (c+1 < n && this.k[c+1] < this.k[c]) c++;
        if (this.k[c] >= lk) break;
        this.k[i] = this.k[c]; this.v[i] = this.v[c]; i = c;
      }
      this.k[i] = lk; this.v[i] = lv;
    }
    return top;
  }
}
