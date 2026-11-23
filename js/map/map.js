/* The Leaflet map and its tile layer. `L` is Leaflet's global (loaded in index.html). */
import { MAP_CENTER, MAP_ZOOM, CARTO_API_KEY } from '../config.js';

export const map = L.map('map', { zoomControl: false }).setView(MAP_CENTER, MAP_ZOOM);
L.control.zoom({ position: 'topright' }).addTo(map);   // the control panel covers the top-left corner

if (CARTO_API_KEY) {
  L.tileLayer('https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=' + CARTO_API_KEY, {
    maxZoom: 19, attribution: '&copy; OpenStreetMap contributors &copy; CARTO' }).addTo(map);
} else {
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19, attribution: 'Tiles &copy; Esri' }).addTo(map);
}

/* padding that keeps a fitted route clear of the floating control panel on wide screens */
export const fitPad = () => innerWidth > 760
  ? { paddingTopLeft: [document.getElementById('panel').offsetWidth + 56, 60], paddingBottomRight: [60, 60] }
  : { padding: [40, 40] };
