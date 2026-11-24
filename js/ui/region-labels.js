import { administrativeGroups } from '../../data/regions/administrative.js';

// Keep existing geographic clips available with explicit scope labels.
const legacy = [
  ['Luzon', [
    ['metro-manila', 'Metro Manila window'],
    ['ncr-south', 'Southern Manila and Northern CALABARZON'],
    ['calabarzon-east', 'Laguna and Quezon corridor'],
    ['nueva-ecija', 'Pampanga and Nueva Ecija corridor'],
    ['cordillera', 'Southern Cordillera and La Union'],
    ['ilocos-coast', 'Ilocos coastal corridor'],
    ['north-cagayan', 'Northern Cagayan Valley'],
    ['bicol', 'Bicol Peninsula'],
    ['mindoro', 'Mindoro'],
    ['palawan', 'Palawan and nearby islands']
  ]],
  ['Visayas', [
    ['panay-guimaras', 'Panay and Guimaras'],
    ['negros-north', 'Northern Negros'],
    ['negros-south', 'Southern Negros'],
    ['cebu', 'Cebu and Mactan'],
    ['bohol-siquijor', 'Bohol and Siquijor'],
    ['leyte-samar', 'Leyte, Biliran and Samar']
  ]],
  ['Mindanao', [
    ['zamboanga-north', 'Northern Zamboanga Peninsula'],
    ['zamboanga-south', 'Southern Zamboanga Peninsula'],
    ['northern-coast', 'Misamis Oriental and Agusan corridor'],
    ['davao-gulf', 'Davao Gulf and adjoining roads'],
    ['sarangani', 'Sarangani and South Cotabato corridor'],
    ['maguindanao', 'Cotabato and Maguindanao corridor']
  ]],
];

export const regionGroups = [
  ...administrativeGroups,
  ['Existing geographic extracts and presentation', legacy.flatMap(([, entries]) => entries)]
];

const labels = new Map(regionGroups.flatMap(([, entries]) => entries));
export const regionLabel = region => labels.get(region.id) ?? region.name;
