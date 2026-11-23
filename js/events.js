/* Feature events cover graph readiness, route/settings changes, closures and the active workspace. */
const handlers = {};
export const on = (name, fn) => (handlers[name] || (handlers[name] = [])).push(fn);
export const emit = (name, data) => (handlers[name] || []).forEach(fn => fn(data));
