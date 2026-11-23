export const $ = id => document.getElementById(id);
export const setMessage = t => { $('msg').textContent = t || ''; };
