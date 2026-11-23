export const fmtT = s => s >= 3600 ? `${Math.floor(s/3600)} h ${Math.round(s%3600/60)} min` : `${Math.max(1, Math.round(s/60))} min`;
export const fmtD = m => m >= 1000 ? (m/1000).toFixed(1) + ' km' : Math.round(m) + ' m';
export const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
