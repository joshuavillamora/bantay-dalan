/* Yield between batches so the browser can handle input and paint. */
export const nextTask = () => globalThis.scheduler?.yield?.() || new Promise(resolve => setTimeout(resolve, 0));

export function finishWork(iterator) {
  let result;
  while (!(result = iterator.next()).done);
  return result.value;
}

export async function runInSlices(iterator, { stride = 64, keepGoing = () => true, budget = 8, capture } = {}) {
  let result, count = 0, ms = 0, start = performance.now();
  let deadline = start + budget;
  const batch = capture ? [] : null;
  while (!(result = iterator.next()).done) {
    batch?.push(result.value);
    if (++count % stride) continue;
    const now = performance.now();
    if (!capture && now < deadline) continue;
    // Recording and time spent yielding to the browser are outside the compute measurement.
    ms += now - start;
    if (batch) { capture(batch); batch.length = 0; }
    if (performance.now() >= deadline) {
      await nextTask();
      if (!keepGoing()) return;
      deadline = performance.now() + budget;
    }
    start = performance.now();
  }
  ms += performance.now() - start;
  if (batch?.length) capture(batch);
  return { value: result.value, count, ms };
}
