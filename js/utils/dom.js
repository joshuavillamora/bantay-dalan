export const $ = id => document.getElementById(id);
export const setMessage = (text = '') => {
  $('msg').textContent = text;
  $('msg').hidden = !text;
};
