/* Constants and settings. Nothing here depends on any other module. */
export const PLACES = {
  "Plaza Libertad (City Proper)":[10.6963,122.5693],
  "Fort San Pedro / Ferry Terminal":[10.6935,122.5718],
  "Robinsons Place Iloilo":[10.6958,122.5655],
  "Molo Church":[10.6967,122.5444],
  "Jaro Cathedral":[10.7253,122.5662],
  "Iloilo Esplanade":[10.7075,122.5530],
  "SM City Iloilo":[10.7137,122.5518],
  "Smallville Complex":[10.7155,122.5465],
  "Iloilo Convention Center":[10.7105,122.5440],
  "Iloilo Airport (Cabatuan)":[10.8330,122.4930]
};
export const DEFAULT_START = "Plaza Libertad (City Proper)";
export const DEFAULT_END = "SM City Iloilo";

export const MAP_CENTER = [10.7050, 122.5600];
export const MAP_ZOOM = 13;
export const CARTO_API_KEY = "";                 // leave "" to use the free Esri tiles
export const ROADS_URL = 'data/iloilo-roads.json';
export const SEARCH_BOX = '122.38,10.62,122.66,10.88';   // west,south,east,north for place search

export const SPEED = {motorway:80,trunk:60,primary:50,secondary:40,tertiary:35,unclassified:30,residential:25,living_street:15,
  motorway_link:40,trunk_link:35,primary_link:30,secondary_link:30,tertiary_link:30};   // km/h
export const DEFAULT_ROAD_SPEED = 25;
export const MAX_SPEED_MS = 80 / 3.6;            // fastest road, used by A*-style heuristics

/* Chokepoint finder: trips between these places represent how the community moves around.
   (The airport is left out: it is in Cabatuan, outside the city, and would make the highway to it look critical.) */
export const CHOKEPOINTS = {
  places: ["Plaza Libertad (City Proper)","Fort San Pedro / Ferry Terminal","Robinsons Place Iloilo","Molo Church","Jaro Cathedral",
           "Iloilo Esplanade","SM City Iloilo","Smallville Complex","Iloilo Convention Center"],
  candidates: 40,              // most-used road links that get a full closure test
  topK: 8,                     // how many to show
  disconnectPenaltySec: 1800   // a trip that becomes impossible counts as 30 extra minutes
};
