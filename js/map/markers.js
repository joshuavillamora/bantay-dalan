/* The letters and shapes match the route form. */
import { map, setLegend, tooltipText } from './map.js';

const pins = { s: null, e: null };
let canDrag = true;

function streetPopup(ll, title) {
  const coordinates = ll.map(value => value.toFixed(6)).join(',');
  const popup = document.createElement('div');
  popup.className = 'endpoint-popup';
  const name = document.createElement('strong');
  name.textContent = title;
  popup.append(name);
  for (const [label, path, params] of [
    ['View street in Google Maps', '@', { map_action: 'pano', viewpoint: coordinates }],
    ['Open location map', 'search/', { query: coordinates }],
  ]) {
    const row = document.createElement('p'), link = document.createElement('a');
    link.href = 'https://www.google.com/maps/' + path + '?' + new URLSearchParams({ api: '1', ...params });
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = label;
    row.append(link); popup.append(row);
  }
  const help = document.createElement('p');
  help.textContent = 'Street View coverage varies. If no panorama opens, use the location map.';
  popup.append(help);
  return popup;
}

export function setMarkerDragging(enabled) {
  canDrag = enabled;
  for (const pin of Object.values(pins)) {
    if (enabled) pin?.dragging.enable();
    else pin?.dragging.disable();
  }
}

export function setPointMarker(which, ll, name, onMove) {
  const isStart = which === 's';
  const title = `${isStart ? 'Start A' : 'Destination B'}: ${name}`;
  if (!pins[which]) {
    const icon = L.icon({
      iconUrl: `assets/icons/display/point-${isStart ? 'a' : 'b'}.png`, className: 'endpoint-marker',
      // The visible tips sit near x=250, y=496 in the original 512px canvases.
      iconSize: [38, 50], iconAnchor: [isStart ? 18.4 : 18.5, 49.2], tooltipAnchor: [16, -29], popupAnchor: [0, -45]
    });
    pins[which] = L.marker(ll, { icon, alt: isStart ? 'Start A' : 'Destination B', draggable: canDrag, autoPan: true }).addTo(map)
      .bindTooltip(tooltipText(title))
      .bindPopup(streetPopup(ll, title), { maxWidth: 230, autoPanPaddingTopLeft: [10, 72] })
      .on('dragend', e => onMove(which, e.target.getLatLng()));
    setLegend(isStart ? 'start' : 'destination', true);
  } else {
    pins[which].setLatLng(ll).setTooltipContent(tooltipText(title)).setPopupContent(streetPopup(ll, title));
  }
  const element = pins[which].getElement();
  element.title = title;
  element.alt = title;
  element.setAttribute('aria-label', title);
}
