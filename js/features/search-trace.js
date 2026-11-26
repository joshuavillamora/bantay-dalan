const chunkSize = 4096;

function countBefore(indices, end) {
  let left = 0, right = indices.length;
  while (left < right) {
    const mid = (left + right) >> 1;
    if (indices[mid] < end) left = mid + 1; else right = mid;
  }
  return left;
}

// Keep graph indices rather than event objects and duplicated map coordinates.
export function createSearchTrace() {
  const events = [], discovered = [], backward = [];
  let count = 0, foundCount = 0, firstProcessed;
  const write = (chunks, index, value, width = 1, field = 0) => {
    const chunk = chunks[index >> 12] ??= new Int32Array(chunkSize * width);
    chunk[(index & (chunkSize - 1)) * width + field] = value;
  };
  const read = (chunks, index, width = 1, field = 0) =>
    chunks[index >> 12][(index & (chunkSize - 1)) * width + field];
  const endOf = index => index < 0 ? 0 : read(events, index, 3, 2);
  const vertex = i => { const u = read(events, i, 3); return u < 0 ? ~u : u; };
  return {
    get count() { return count; },
    record(batch) {
      if (batch.length) firstProcessed = undefined;
      for (const { u, p, direction, found } of batch) {
        if (direction === 'backward') backward.push(count);
        for (const v of found) write(discovered, foundCount++, v);
        write(events, count, direction === 'backward' ? ~u : u, 3);
        write(events, count, p, 3, 1);
        write(events, count++, foundCount, 3, 2);
      }
    },
    vertex,
    parent(i) { return read(events, i, 3, 1); },
    direction(i) { return read(events, i, 3) < 0 ? 'backward' : 'forward'; },
    discoveries(i, visit) {
      for (let j = endOf(i - 1), end = endOf(i); j < end; j++) visit(read(discovered, j));
    },
    directions(limit = count) {
      const n = countBefore(backward, limit);
      return { forward: limit - n, backward: n };
    },
    uniqueNodes(limit = count) {
      if (!firstProcessed) {
        const seen = new Set();
        firstProcessed = [];
        for (let i = 0; i < count; i++) {
          const u = vertex(i);
          if (seen.has(u)) continue;
          seen.add(u);
          firstProcessed.push(i);
        }
      }
      // Cache first occurrences for scrubbing in either direction.
      return limit === count ? firstProcessed.length : countBefore(firstProcessed, limit);
    }
  };
}

export const playbackCount = (tick, count, longest, sync) =>
  sync === 'progress' && longest ? Math.floor(tick * count / longest) : Math.min(tick, count);

// A repair can only be compared with a fresh run of the same disrupted trip.
export const sameSearchContext = (a, b) => !!a && !!b &&
  ['graph', 's', 't', 'mode', 'closures'].every(key => a[key] === b[key]);
