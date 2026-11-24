/* Geocoders supply coordinates only. The route graph validates and routes them. */
import { MAP_CENTER, PHOTON_URL } from '../config.js';
import { snapRoutePoint } from '../graph/road-graph.js';
import { hav } from '../utils/geo.js';
import { runInSlices } from '../utils/work-slices.js';

export const placeGeocoder = {
  name: 'Photon', credit: 'https://photon.komoot.io/',
  url(query, [lat, lon] = MAP_CENTER) {
    return PHOTON_URL + '?' + new URLSearchParams({
      q: query, limit: 12, lat, lon, zoom: 9, location_bias_scale: 0.65
    });
  }
};

const clean = value => typeof value === 'string' ? value.trim() : '';
export const placeWords = value => value.normalize('NFKD').replace(/(\p{Script=Latin})\p{M}+/gu, '$1')
  .normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}\p{M}]+/gu, ' ').trim();
const eastAsian = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
export const canSearchOnline = words => [...words.replaceAll(' ', '')].length >= (eastAsian.test(words) ? 2 : 3);

const abbreviations = { gen: 'general', ave: 'avenue', av: 'avenue', blvd: 'boulevard', rd: 'road', st: 'street' };
const nameTerms = value => placeWords(value).replace(/\bmunicipal hall\b/g, 'town hall').split(' ')
  .filter(word => word && !['of', 'the', 'and'].includes(word))
  .map(word => Object.hasOwn(abbreviations, word) ? abbreviations[word] : word);

const osmTypes = { N: 'node', W: 'way', R: 'relation' };
const placeZoom = { country: 5, state: 8, region: 8, province: 8, county: 10, city: 11, town: 12,
  village: 13, district: 13, locality: 13, suburb: 13, neighbourhood: 14, street: 15 };
const localZoom = { Region: 8, Province: 9, 'Province or state': 9, Island: 10, City: 11,
  Town: 12, Municipality: 12, 'Village or barangay': 13, Barangay: 13, Neighborhood: 14 };

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
    const context = [clean(p.city || p.localadmin), clean(p.state || p.region), clean(p.district || p.county || p.locality)]
      .filter(value => value && value !== country && placeWords(value) !== placeWords(name));
    const contextLabels = [...new Set(context)].slice(0, country ? 2 : 3);
    if (country) contextLabels.push(country);
    const id = osmTypes[p.osm_type] && p.osm_id ? `${osmTypes[p.osm_type]}/${p.osm_id}` : clean(p.id) || clean(p.gid);
    const wikiTitle = clean(p.addendum?.osm?.wikipedia).replace(/^[a-z-]+:/i, '').replaceAll('_', ' ');
    const kind = p.osm_key === 'place' ? clean(p.osm_value) || clean(p.type) : clean(p.type);
    const typeLabel = clean(p.osm_value).replaceAll('_', ' ');
    const cityAlias = kind === 'city' && !/\bcity\b/i.test(name) ? name + ' City' : '';
    const ll = [lat, lon];
    const snap = graph && snapRoutePoint(graph, ll);
    items.push({
      id, name, ll, address, number,
      aliases: [wikiTitle, cityAlias].filter(Boolean),
      area: area.join(' '),
      district: clean(p.district || p.city || p.county),
      street: p.type === 'street' || p.layer === 'street',
      zoom: Object.hasOwn(placeZoom, kind) ? placeZoom[kind] : 16,
      nearRoad: snap ? snap.i >= 0 : undefined, roadIssue: snap?.reason,
      detail: [...new Set([typeLabel, address !== name && address, contextLabels.join(', ')].filter(Boolean))].join(' · ')
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
        street: category === 'Street', local: true, zoom: localZoom[category], detail: `${category} · ${area}` };
      const keys = new Set(searchTerms(place).names.flat().flatMap(word => [word.slice(0, 1), word.slice(0, 2)]));
      for (const key of keys) {
        if (!prefixes.has(key)) prefixes.set(key, []);
        prefixes.get(key).push(place);
      }
      if (i % 128 === 127) yield;
    }
    const find = query => {
      const terms = nameTerms(query);
      const bucket = term => prefixes.get(term.slice(0, 2)) || [];
      const anchors = terms.filter(term => !cityTerms.some(part => part.startsWith(term)));
      if (anchors.length) return anchors.map(bucket).reduce((smallest, list) => list.length < smallest.length ? list : smallest);
      return [...new Set(terms.flatMap(bucket))];
    };
    // Keep a small candidate set for empty-field suggestions, independent of query indexing.
    const landmarkKinds = new Set(['Landmark', 'Park or public space', 'Government', 'Shopping centre', 'University', 'Terminal']);
    find.landmarks = data.entries.filter(row => landmarkKinds.has(data.kinds[row[4]])).slice(0, 150)
      .map(([id, name, lat, lng, kind]) => ({ id, name, ll: [lat / 1e6, lng / 1e6],
        local: true, detail: `${data.kinds[kind]} · ${data.city}` }));
    return find;
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
  const online = new Map(remote.map((place, index) => [place, index]));
  const nativeQuery = eastAsian.test(typed) && !/\p{Script=Latin}/u.test(typed);
  const ranked = [...saved, ...remote].map(place => {
    let score = nameScore(place, terms, typed);
    // Photon can match a native name while returning a translated display label.
    if (!score && nativeQuery && online.get(place) < 2 && !eastAsian.test(place.name)) {
      score = place.zoom <= 11 ? 3.5 : 2;
    }
    return { place, score };
  })
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
