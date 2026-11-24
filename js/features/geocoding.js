/* Geocoders supply coordinates only. The route graph validates and routes them. */
import { MAP_CENTER, PHOTON_URL } from '../config.js';
import { snapRoutePoint } from '../graph/road-graph.js';
import { hav } from '../utils/geo.js';
import { runInSlices } from '../utils/work-slices.js';

export function geocoderFor(hostname) {
  const [lat, lon] = MAP_CENTER;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return {
      name: 'Stadia Maps', credit: 'https://stadiamaps.com/attribution/',
      url(query) {
        return 'https://api.stadiamaps.com/geocoding/v1/autocomplete?' + new URLSearchParams({
          text: query, size: 12, sources: 'openstreetmap',
          'focus.point.lat': lat, 'focus.point.lon': lon
        });
      },
    };
  }
  return {
    name: 'Photon', credit: 'https://photon.komoot.io/',
    url(query) {
      return PHOTON_URL + '?' + new URLSearchParams({
        q: query, limit: 12, lat, lon
      });
    },
  };
}

const clean = value => typeof value === 'string' ? value.trim() : '';
export const placeWords = value => value.normalize('NFD').replace(/\p{M}/gu, '')
  .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

const abbreviations = { gen: 'general', ave: 'avenue', av: 'avenue', blvd: 'boulevard', rd: 'road', st: 'street' };
const nameTerms = value => placeWords(value).replace(/\bmunicipal hall\b/g, 'town hall').split(' ')
  .filter(word => word && !['of', 'the', 'and'].includes(word))
  .map(word => Object.hasOwn(abbreviations, word) ? abbreviations[word] : word);

const osmTypes = { N: 'node', W: 'way', R: 'relation' };

export function geocodedMatches(features, graph) {
  const items = [];
  for (const feature of features) {
    if (feature?.geometry?.type !== 'Point' || !Array.isArray(feature.geometry.coordinates)) continue;
    const [lon, lat] = feature.geometry.coordinates;
    if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lon) > 180 || Math.abs(lat) > 90) continue;
    const p = feature.properties || {};
    const street = clean(p.street);
    const number = typeof p.housenumber === 'number' ? String(p.housenumber) : clean(p.housenumber);
    const address = street && [number, street].filter(Boolean).join(' ');
    const name = clean(p.name) || address;
    if (!name) continue;
    const country = clean(p.country);
    const area = [p.district, p.locality, p.localadmin, p.city, p.county, p.region, p.state, country].map(clean).filter(Boolean);
    const detail = [...new Set([address, ...area].filter(value => value && placeWords(value) !== placeWords(name)))];
    if (country && country !== 'Philippines' && detail.indexOf(country) > 2) detail.splice(2, 0, country);
    const id = osmTypes[p.osm_type] && p.osm_id ? `${osmTypes[p.osm_type]}/${p.osm_id}` : clean(p.id) || clean(p.gid);
    const wikiTitle = clean(p.addendum?.osm?.wikipedia).replace(/^[a-z-]+:/i, '').replaceAll('_', ' ');
    const ll = [lat, lon];
    const snap = graph && snapRoutePoint(graph, ll);
    items.push({
      id, name, ll, address, number,
      aliases: [wikiTitle].filter(Boolean),
      area: area.join(' '),
      district: clean(p.district || p.city || p.county),
      street: p.layer === 'street' || p.type === 'street',
      nearRoad: snap ? snap.i >= 0 : undefined, roadIssue: snap?.reason,
      detail: detail.slice(0, 3).join(', ')
    });
  }
  return items;
}

const prepared = new WeakMap();
function searchTerms(place) {
  if (!prepared.has(place)) {
    const names = [place.name, ...(place.aliases || [])];
    if (place.number && place.address) names.push(place.address);
    prepared.set(place, { names: names.map(nameTerms), area: nameTerms(place.area || '') });
  }
  return prepared.get(place);
}

export async function cityPlaceIndex(data) {
  if (data.version !== 1 || !Array.isArray(data.entries) || !Array.isArray(data.kinds)) throw Error('Invalid city place index');
  function* build() {
    const prefixes = new Map(), cityTerms = nameTerms(data.city);
    for (const [i, [id, name, lat, lng, kind, ...aliases]] of data.entries.entries()) {
      const category = data.kinds[kind], area = data.city;
      const place = { id, name, ll: [lat / 1e6, lng / 1e6], aliases, area, district: area,
        street: category === 'Street', local: true, detail: `${category} · ${area}` };
      const keys = new Set(searchTerms(place).names.flat().flatMap(word => [word.slice(0, 1), word.slice(0, 2)]));
      for (const key of keys) {
        if (!prefixes.has(key)) prefixes.set(key, []);
        prefixes.get(key).push(place);
      }
      if (i % 128 === 127) yield;
    }
    return query => {
      const terms = nameTerms(query);
      const bucket = term => prefixes.get(term.slice(0, 2)) || [];
      const anchors = terms.filter(term => !cityTerms.some(part => part.startsWith(term)));
      if (anchors.length) return anchors.map(bucket).reduce((smallest, list) => list.length < smallest.length ? list : smallest);
      return [...new Set(terms.flatMap(bucket))];
    };
  }
  return (await runInSlices(build(), { stride: 1 })).value;
}

function nameScore(place, terms, typed) {
  const { area, names } = searchTerms(place);
  let score = 0;
  for (const words of names) {
    const full = words.join(' ');
    if (full === typed) return 4;
    const matches = (list, term, index) => list.some(word => word === term ||
      (index === terms.length - 1 && (term.length >= 2 || terms.length > 1) && word.startsWith(term)));
    if (full.startsWith(typed) && terms.every((term, i) => matches(words, term, i))) score = Math.max(score, 3);
    else if (terms.every((term, i) => matches(words, term, i))) score = Math.max(score, 2);
    else if (terms.some((term, i) => matches(words, term, i)) &&
             terms.every((term, i) => matches(words, term, i) || matches(area, term, i))) score = Math.max(score, 1);
  }
  return score;
}

export function mergeMatches(query, saved, remote = []) {
  const terms = nameTerms(query);
  if (!terms.length) return [];
  const typed = terms.join(' ');
  const online = new Set(remote);
  const ranked = [...saved, ...remote].map(place => ({ place, score: nameScore(place, terms, typed) }))
    .filter(result => result.score > 0)
    .sort((a, b) => b.score - a.score || Number(a.place.nearRoad === false) - Number(b.place.nearRoad === false));
  const items = [];
  for (const { place, score } of ranked) {
    if (ranked[0].score === 4 && score < 3) break;
    if (items.length >= 6 && (!online.has(place) || items.some(item => online.has(item)))) continue;
    const duplicate = items.some(item => {
      if (place.id && place.id === item.id) return true;
      const [left, right] = [item, place].map(p => [p.name, ...(p.aliases || [])].map(placeWords));
      if (!left.some(name => right.includes(name)) || (item.number || '') !== (place.number || '')) return false;
      if (item.number && item.address && place.address && placeWords(item.address) !== placeWords(place.address)) return false;
      const sameStreet = item.street && place.street && (item.local || place.local || item.district && item.district === place.district);
      return hav(...item.ll, ...place.ll) < (sameStreet ? 1000 : 180);
    });
    if (duplicate) continue;
    if (items.length >= 6) { items[5] = place; break; }
    items.push(place);
  }
  return items;
}
