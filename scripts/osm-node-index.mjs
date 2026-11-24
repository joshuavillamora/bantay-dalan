const SLAB_SIZE = 65536;

// The PBF lists nodes by ID. Packed arrays let both extractors look up way
// references without keeping a JavaScript object for every source node.
export function createSourceNodeIndex(scale) {
  const slabs = [];
  let size = 0;
  let lastId = 0;

  function add(id, lat, lon) {
    if (id <= lastId) throw Error('Expected OSM nodes sorted by ID');
    lastId = id;
    const offset = size % SLAB_SIZE;
    if (offset === 0) {
      slabs.push({ ids: new Float64Array(SLAB_SIZE), lat: new Int32Array(SLAB_SIZE), lon: new Int32Array(SLAB_SIZE) });
    }
    const slab = slabs.at(-1);
    slab.ids[offset] = id;
    slab.lat[offset] = Math.round(lat * scale);
    slab.lon[offset] = Math.round(lon * scale);
    size++;
  }

  function find(id) {
    let low = 0, high = size - 1;
    while (low <= high) {
      const mid = low + ((high - low) >>> 1);
      const slab = slabs[Math.floor(mid / SLAB_SIZE)];
      const offset = mid % SLAB_SIZE;
      const storedId = slab.ids[offset];
      if (storedId === id) return { id, lat: slab.lat[offset], lon: slab.lon[offset] };
      if (storedId < id) low = mid + 1;
      else high = mid - 1;
    }
  }

  function clear() {
    slabs.length = 0;
    size = 0;
    lastId = 0;
  }

  return { add, find, clear };
}
