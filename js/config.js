/* Constants and settings. Nothing here depends on any other module. */
export const PLACES = {
  "Plaza Libertad":[10.69264,122.57367],
  "Fort San Pedro / Ferry Terminal":[10.6935,122.5718],
  "Robinsons Place Iloilo":[10.6958,122.5655],
  "Molo Church":[10.6967,122.5444],
  "Jaro Cathedral":[10.72350,122.55622],
  "Iloilo Esplanade":[10.7075,122.5530],
  "SM City Iloilo":[10.71417,122.55106],
  "University of San Agustin":[10.699222,122.561824],
  "Smallville Complex":[10.7155,122.5465],
  "Iloilo Convention Center":[10.7105,122.5440],
  // Terminal parking area off Airport Access Road (OSM way 245283704).
  "Iloilo Airport (Cabatuan)":[10.8308758,122.4981721]
};
export const DEFAULT_START = "Plaza Libertad";
export const DEFAULT_END = "SM City Iloilo";

export const MAP_CENTER = [10.7050, 122.5600];
export const MAP_ZOOM = 13;
export const CARTO_API_KEY = "";                 // optional public CARTO basemap key
export const ROADS_URL = 'data/panay-roads.json.gz';
export const PHOTON_URL = 'https://photon.komoot.io/api/';
export const ROUTE_SNAP_LIMIT_METRES = 1500;
export const ROUTE_ROAD_PROXIMITY_METRES = 250;

export const SPEED = {motorway:80,trunk:60,primary:50,secondary:40,tertiary:35,unclassified:30,residential:25,living_street:15,
  motorway_link:40,trunk_link:35,primary_link:30,secondary_link:30,tertiary_link:30,service:15,track:15};   // km/h
export const DEFAULT_ROAD_SPEED = 25;
export const MAX_SPEED_MS = Math.max(DEFAULT_ROAD_SPEED, ...Object.values(SPEED)) / 3.6;

/* Chokepoint finder: trips between these places represent how the community moves around.
   (The airport is left out: it is in Cabatuan, outside the city, and would make the highway to it look critical.) */
export const CHOKEPOINTS = {
  places: [DEFAULT_START,"Fort San Pedro / Ferry Terminal","Robinsons Place Iloilo","Molo Church","Jaro Cathedral",
           "Iloilo Esplanade","SM City Iloilo","Smallville Complex","Iloilo Convention Center"],
  candidates: 40,              // most-used road links that get a full closure test
  topK: 8,                     // how many to show
  disconnectPenaltySec: 1800   // a trip that becomes impossible counts as 30 extra minutes
};
