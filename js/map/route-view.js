/* The active search position, current route, and its pre-closure reference. */
import { map, reducedMotion, setLegend, tooltipText } from './map.js';

let head, pathLine, pathCase, previous, pathRaf;

function styleRoutes() {
  const zoom = map.getZoom();
  const photo = map.getContainer().classList.contains('photo-basemap');
  const width = zoom < 12 ? 4 : zoom >= 17 ? 6 : 5;
  pathLine?.setStyle({ weight: width });
  pathCase?.setStyle({ weight: width + (photo ? 5 : 4) });
  previous?.setStyle({ weight: width, opacity: photo ? .84 : .7 });
}
map.on('zoomend basemapchange', styleRoutes);

export function showHead(g, i) {
  hideHead();
  head = L.marker([g.lat[i], g.lng[i]], {
    icon: L.divIcon({ className: '', html: '<div class="head"></div>', iconSize: [14, 14], iconAnchor: [7, 7] }),
    interactive: false, keyboard: false
  }).addTo(map);
}
export const moveHead = (g, i) => head?.setLatLng([g.lat[i], g.lng[i]]);
export function hideHead() { head?.remove(); head = null; }

export const cancelRouteAnimation = () => cancelAnimationFrame(pathRaf);
export function clearRoute() {
  cancelRouteAnimation();
  hideHead();
  pathLine?.remove(); pathCase?.remove();
  pathLine = pathCase = null;
  setLegend('route', false);
}

export function showPreviousRoute(points) {
  previous?.remove();
  previous = points?.length > 1 ? L.polyline(points, {
    pane: 'previousRoute', className: 'analysis-outline', color: '#626b75', weight: 5, dashArray: '8 7', interactive: false
  }).addTo(map) : null;
  styleRoutes();
  setLegend('previous', !!previous);
}

function drawRoute(points) {
  pathCase = L.polyline(points, { color: '#fff', weight: 9, opacity: .94, interactive: false });
  pathCase.addTo(map);
  pathLine = L.polyline(points, { color: '#1e4ba8', weight: 5, bubblingMouseEvents: false })
    .bindTooltip(tooltipText('Current route'), { sticky: true });
  pathLine.addTo(map);
  styleRoutes();
  setLegend('route', points.length > 1);
}

export function animateRoute(points, { stillCurrent, animate, onError }) {
  const perFrame = Math.max(4, Math.ceil(points.length / 20));
  if (!animate || reducedMotion() || points.length <= perFrame) {
    drawRoute(points);
    return;
  }

  function recover(error) {
    try {
      clearRoute();
      drawRoute(points);
    } catch (fallbackError) {
      onError(new AggregateError([error, fallbackError], 'Could not draw the route'));
      return;
    }
    console.warn('Route animation failed. Drew the full route instead.', error);
  }

  let shown = perFrame;
  const draw = () => {
    if (!stillCurrent()) return;
    try {
      shown += perFrame;
      const segment = points.slice(0, shown);
      pathCase.setLatLngs(segment);
      pathLine.setLatLngs(segment);
      if (shown < points.length) pathRaf = requestAnimationFrame(draw);
    } catch (error) {
      recover(error);
    }
  };
  try {
    drawRoute(points.slice(0, shown));
    pathRaf = requestAnimationFrame(draw);
  } catch (error) {
    recover(error);
  }
}
