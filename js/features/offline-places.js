import { routingRegions } from '../graph/region-manifest.js';
import { pointInRegion } from '../graph/regions.js';
import { cityPlaceIndex, placeWords } from './geocoding.js';

export function regionalPlaceIndexes(onLoaded) {
  const cache = new Map(), pending = new Map(), retry = new Map();
  const national = 'philippines-localities';

  function load(id) {
    if (!id || pending.has(id) || (retry.get(id) ?? 0) > Date.now()) return;
    if (cache.has(id)) {
      const index = cache.get(id);
      cache.delete(id);
      cache.set(id, index);
      return;
    }
    const job = (async () => {
      try {
        const url = new URL('../../data/places/' + id + '.json.gz', import.meta.url);
        const response = await fetch(url);
        if (!response.ok) throw Error('Local index unavailable');
        const data = await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).json();
        cache.set(id, await cityPlaceIndex(data));
        const regionalIds = [...cache.keys()].filter(key => key !== national);
        if (regionalIds.length > 2) cache.delete(regionalIds[0]);
      } catch {
        retry.set(id, Date.now() + 30000);
      } finally {
        pending.delete(id);
        onLoaded();
      }
    })();
    pending.set(id, job);
  }

  const byArea = [...routingRegions].sort((a, b) => {
    const size = ({ bounds: [west, south, east, north] }) => (east - west) * (north - south);
    return size(a) - size(b);
  });

  return (query, point, active) => {
    const typed = placeWords(query);
    const named = typed.length >= 4 && byArea.find(region => placeWords(region.name).split(' ').includes(typed));
    const region = named || (active && pointInRegion(active, point) ? active : byArea.find(item => pointInRegion(item, point)));
    const id = region?.id;
    if (typed.length >= 2) { load(national); load(id); }
    return {
      items: [...(cache.get(id)?.(query) || []), ...(cache.get(national)?.(query) || [])],
      loading: pending.has(id) || pending.has(national)
    };
  };
}
