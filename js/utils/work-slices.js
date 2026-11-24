/* Yield between batches so the browser can handle input and paint. */
export const nextTask = () => globalThis.scheduler?.yield?.() || new Promise(resolve => setTimeout(resolve, 0));

export function finishWork(iterator) {
  let result;
  while (!(result = iterator.next()).done);
  return result.value;
}

export async function runInSlices(iterator, { stride = 64, keepGoing = () => true, budget = 8 } = {}) {
  let result, count = 0, ms = 0, start = performance.now();
  while (!(result = iterator.next()).done) {
    if (++count % stride || performance.now() - start < budget) continue;
    ms += performance.now() - start;
    await nextTask();
    if (!keepGoing()) return;
    start = performance.now();
  }
  return { value: result.value, count, ms: ms + performance.now() - start };
}
