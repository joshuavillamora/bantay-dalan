/* Tiny publish/subscribe bus so features can react to each other without importing each other.
   Events: 'route:changed' (start or destination moved), 'settings:changed' (algorithm or mode),
           'closures:changed' (a road closure was added or removed). */
const handlers = {};
export const on = (name, fn) => (handlers[name] || (handlers[name] = [])).push(fn);
export const emit = (name, data) => (handlers[name] || []).forEach(fn => fn(data));
