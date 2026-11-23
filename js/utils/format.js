export const fmtT = s => {
  const minutes = Math.round(s / 60);
  if (minutes >= 60) return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
  if (s > 0 && minutes === 0) return '<1 min';
  return `${minutes} min`;
};
export const fmtD = (m, decimals = 1) => m >= 1000 ? (m / 1000).toFixed(decimals) + ' km' : Math.round(m) + ' m';
export const fmtClosureCount = count => `${count} active ${count === 1 ? 'closure' : 'closures'}`;
export const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
