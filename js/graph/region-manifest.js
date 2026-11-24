import { ROADS_URL } from '../config.js';
import { additionalRegions } from '../../data/regions/manifest.js';
import { administrativeRegions } from '../../data/regions/administrative-manifest.js';

export const presentationRegion = {
  id: 'panay-guimaras', name: 'Panay and Guimaras', url: ROADS_URL,
  version: '2026-11-22', bounds: [121.346447, 10.4067564, 123.3584859, 12.1312694],
  vertices: 492603, edges: 1003602, bytes: 5166082,
  sha256: '67b5a94e45ce0b115335073c6f359c03874793fd67e73b5e5115c68f2f055a04'
};

export const defaultRegion = administrativeRegions.find(region => region.id === 'iloilo-city') ?? presentationRegion;
export const routingRegions = [...administrativeRegions, presentationRegion, ...additionalRegions];
const requested = new URLSearchParams(globalThis.location?.search).get('network');
export const initialRegion = routingRegions.find(region => region.id === requested) ?? defaultRegion;
