# CHOKEPOINT engineering audit and regional release

November 25, 2026 · CC 204 · Road Network Analysis & Resilience

The work stayed in the existing vanilla HTML, CSS, ES-module JavaScript, Leaflet, and Python range-server project on `ui/bantay-dalan-redesign`. Iloilo City is the new default. Eight administrative road graphs joined the City and Central Singapore networks. Twenty-three previously prepared geographic extracts remain available under their actual extent names. The Panay and Guimaras presentation graph, road geometry, event counts, and validation fixture are preserved.

## WVSU Main Campus routing failure

Reported endpoints were West Visayas State University and Plaza Libertad, with approximate offsets of 65 m and 53 m. The original coordinate was unavailable. I reproduced the same unavailable trip with the current Photon result for OSM relation 15534373 at `10.713611, 122.5624994`. On both Panay and Guimaras and Iloilo City and Province the old snap landed 98.31 m from the pin on a two-vertex service-road fragment. Plaza Libertad snapped 52.97 m away to J. M. Basa Street in the main component. All four algorithms returned unreachable in both directions and objectives with no closures. The exact measured university offset varied from the original report.

| Evidence | Panay and Guimaras | Iloilo City and Province |
| --- | ---: | ---: |
| Old campus vertex | 388597 | 193551 |
| Fragment size | 2 | 2 |
| Plaza Libertad vertex | 431709 | 209586 |
| Plaza's weak component | 455,135 | 235,032 |
| Public Luna Street vertex | 342491 | 172957 |

The OSM snapshot identifies the fragment as way `823636812` with nodes `7689833530` and `7689833529`. The second node meets Jose Aguilar Avenue (`1149556131`), tagged `access=destination` and deliberately omitted from this ordinary private-car through-routing model. The WVSU result now attaches to the existing public Luna Street vertex `10688195805` at `10.7142023, 122.5635554`, **132.79 m** from the campus representative point. The campus map pin stays in place and the UI identifies the public-road attachment. Generic map clicks, arbitrary POIs and the restricted campus fragment keep their existing snapping rules. This adds no graph edge or permission to drive through the campus.

Across the dedicated City, City and Province, and Panay graphs, the four algorithms passed forward and reverse WVSU trips, both objectives, nearby landmark trips, a controlled closure sealing the public vertex's outgoing edges, and reopening. In the verified City fastest fixture WVSU → Plaza Libertad is **2,815.31 m / 223.841 s**. Starting on the disconnected fragment remains unreachable. [WVSU Main Campus address](https://wvsu.edu.ph/general-guidelines-on-wvsu-undergraduate-admissions/) · [OSM campus](https://www.openstreetmap.org/relation/15534373) · [OSM public road vertex](https://www.openstreetmap.org/node/10688195805)

## Regional validation

The 2026-Q3 PSGC roster defines 18 administrative regions. The checked boundary input includes Siquijor in NIR, Bohol and Cebu in Region VII, and Jolo in Region IX after Sulu's transfer. Iloilo City uses its separate DPWH municipal polygon. The release uses matching approximate WGS84 road clipping, derived from the published medium-resolution polygons. Geographic position inside an outline is not proof of a routable road. [Official PSA roster](https://psa.gov.ph/classification/psgc) · [NIR re-establishment](https://www.psa.gov.ph/system/files/scd/Press-Release-June2024PSGC.pdf) · [Sulu transfer](https://psa.gov.ph/content/province-sulu-officially-transferred-region-ix-zamboanga-peninsula) · [Boundary attribution](regions/coverage/README.md)

**Operational** means the graph, coverage and offline place assets are installed and the regional verifier passed both objectives and all four searches, closure and reopening, genuine LPA* repair, and sampled Analyze checks. The browser exercised switching, framing, routing and Analyze for all 32 additional installed datasets plus the Panay presentation. **Deferred** means the full extract was generated and structurally audited, but did not meet the existing 575,000-vertex, 8 MiB gzip and 155 MiB Node-heap candidate budgets. Its full-region routing suite was gated. Existing extracts stay selectable by their geographic names.

| Target network | Status | Vertices / directed edges | Gzip / Node graph heap | Routing validation or available legacy coverage |
| --- | --- | ---: | ---: | --- |
| Iloilo City | Operational | 27,204 / 55,055 | 0.38 / 7.3 MiB | 9 verified route cases, both objectives |
| NCR — National Capital Region | Operational | 278,279 / 523,311 | 4.26 / 69.7 MiB | 9 verified route cases, both objectives |
| CAR — Cordillera Administrative Region | Deferred | 629,125 / 1,260,019 | 7.23 / 159.8 MiB | Southern Cordillera and La Union |
| Region I — Ilocos Region | Deferred | 952,109 / 1,929,423 | 11.38 / 244.6 MiB | Ilocos coastal corridor |
| Region II — Cagayan Valley | Deferred | 800,495 / 1,633,250 | 9.60 / 203.3 MiB | Northern Cagayan Valley |
| Region III — Central Luzon | Deferred | 1,210,179 / 2,489,527 | 15.93 / 313.3 MiB | Pampanga and Nueva Ecija corridor |
| Region IV-A — CALABARZON | Deferred | 1,121,338 / 2,300,728 | 15.05 / 291.6 MiB | Laguna and Quezon and north CALABARZON clips |
| MIMAROPA Region | Operational | 414,793 / 849,562 | 5.12 / 108.2 MiB | 13 verified route cases, both objectives |
| Region V — Bicol Region | Operational | 451,013 / 926,423 | 5.70 / 117.4 MiB | 9 verified route cases, both objectives |
| Region VI — Western Visayas | Operational | 492,121 / 1,002,564 | 6.25 / 126.4 MiB | 11 verified route cases, both objectives |
| NIR — Negros Island Region | Operational | 496,123 / 1,019,684 | 6.24 / 128.1 MiB | 13 verified route cases, both objectives |
| Region VII — Central Visayas | Deferred | 608,063 / 1,225,118 | 7.69 / 157.3 MiB | Cebu and Mactan, Bohol and Siquijor legacy clip |
| Region VIII — Eastern Visayas | Operational | 359,666 / 740,853 | 4.66 / 92.9 MiB | 11 verified route cases, both objectives |
| Region IX — Zamboanga Peninsula | Deferred | 626,763 / 1,264,013 | 7.35 / 160.5 MiB | Northern and southern Zamboanga Peninsula clips |
| Region X — Northern Mindanao | Deferred | 857,465 / 1,739,874 | 10.29 / 215.8 MiB | Misamis Oriental and Agusan corridor |
| Region XI — Davao Region | Deferred | 976,319 / 1,981,388 | 11.94 / 250.9 MiB | Davao Gulf and adjoining roads |
| Region XII — SOCCSKSARGEN | Deferred | 816,414 / 1,670,468 | 9.85 / 207.9 MiB | Sarangani and South Cotabato corridor |
| Region XIII — Caraga | Operational | 482,757 / 980,815 | 5.77 / 123.2 MiB | 9 verified route cases, both objectives |
| BARMM — Bangsamoro Autonomous Region in Muslim Mindanao | Operational | 313,432 / 633,552 | 3.73 / 79.9 MiB | 9 verified route cases, both objectives |
| Central Singapore | Central city extract | 28,752 / 39,571 | 0.47 / 6.1 MiB | 9 verified route cases, both objectives |

The Eastern Visayas prototype initially lost San Juanico Bridge where the land polygon cuts the water. The extractor now keeps the original OSM bridge way if both endpoints are in the same target polygon collection and retains the ordinary direction and access rules. Way `311105374` kept its original node sequence. The Tacloban–Catbalogan fastest fixture now agrees across the four algorithms at **104,779.63 m / 6,477.140 s**, matching the legacy geography. Verified natural disconnections remain, including Panay–Guimaras, Mindoro–Palawan and Negros–Siquijor. Within-island cases passed on Palawan and Siquijor.

## Routing and interaction

- Network changes are explicit. Selection or a switch offer loads one candidate while the old graph stays usable. On success, graph-specific routes, closures, exploration, comparison, analysis and LPA* state clear. The geographic pins persist. Coverage bounds fit immediately, and **Return to region** follows the selected dataset. Road coverage and map tiles load independently. In ordinary exploration, neither moves the camera again.
- Regional search uses local indexes and accessible landmark suggestions with modeled snap validation. Photon still supplies worldwide place coordinates when available. Search and map coverage do not imply a route across networks. Error copy distinguishes outside coverage, missing nearby roads, proven reverse-only reachability, closure-induced loss (checked against the open graph), and an otherwise unclassified unreachable trip.
- Standard Dijkstra remains the independent baseline. Bidirectional Dijkstra expands valid incoming edges with original costs and stops at the frontier lower bound. A* uses the existing distance chord lower bound and a maximum modeled speed for time. LPA* keeps its existing lexicographic keys and explicit incremental repair state. All results use the same objective, endpoint vertices, directed graph and active closure set.
- The independent synthetic test gives **40 m** as the shortest path and **3.9 s** as the fastest on different directed paths. Tests also exercise zero-length trips, one-way and unreachable states, closure cycles, overlap, ordinary directionality, provenance, rejection of corrupt data, and unchanged historical Panay results.
- Analyze still uses tested candidate links and the same 1,800-second penalty per disconnected sampled trip. Coverage and sampling stay attached to the active graph.

## Interface and branding

The single external application stylesheet replaces the duplicated inline styles. The approved light-background wordmark, frameless symbol and favicon match their archive members byte for byte. The approved 3D rail icons, yellow A and red B marker artwork, and square closure cursor are retained. The unused dark variant remains in the existing local artwork. There are no new frontend dependencies.

The warm-white header measured 87.8 px at 1440 × 900. Desktop workspaces share a 388 px width and the navigation rail is 92 px. The rail now forms a compact group. Activating the selected item again collapses or reopens the panel, updates its accessibility state and resizes the map. The native comparison selector separates the three evaluated searches from Standard Dijkstra. The baseline row and actual relative event counts remain visible, and LPA* fresh and repair results stay separate.

## Measurements and verification

- **Node:** 32 automated tests passed. All 33 installed graphs passed the separate directed structure audit, including stored source IDs where available, reverse edges, canonical distances, and weak and strong components. All ten deferred graphs passed that structural audit separately.
- **Panay presentation:** 38 audit records matched the earlier output with timing fields excluded. The open route remains **5,356.37 m / 396.833 s** with event counts **4,939 / 5,548 / 5,548 / 8,730**. The exact closure gives **5,749.64 m / 571.840 s**. Incremental LPA* processed **6,180** events versus **11,524** fresh. Reopening restored the route, and General Luna Avenue again ranked first, affecting **15 of 36** sampled trips.
- **Browser:** Chrome passed online Streets, Satellite and Hybrid, cold offline detailed maps and all 33 installed network scenarios, plus corruption, cancellation, offline provider failure, keyboard dialog/chooser access, touch emulation, closure interaction, and Network view. Worldwide discovery UI tests use deterministic Photon responses. A live Photon lookup supplied the WVSU failure reproduction. Mac WKWebView verified the new header, panel interaction, local assets and offline Panay smoke. Browser layout widths ranged from 320 to 1440 px, including a 1024 × 576 classroom viewport. Safari desktop, Firefox, Edge and physical mobile devices were outside the tested configurations.
- **Apple M4 offline startup:** the new default graph plus first detailed map tile reached ready in **243 ms cold**, **153 ms after reload**, and **149 ms after server restart**. The separately selected Panay presentation took **309 ms** on the cold browser audit. These runs loaded different graph sizes.
- **Browser region profiles:** the nine new graphs took **42–209 ms** to switch on desktop, with **62–153 MiB** Chrome JavaScript heap after collection in this run. The five region samples at 390 × 844 and 4× CPU throttling switched in **65–712 ms**. The offline Network view painted 21,347 city segments in **9.3 ms** of paint time and **19.5 ms** elapsed. Heap excludes native map/canvas/process memory. Timings are local samples rather than performance guarantees.
- **Current limits:** simplified official source outlines can disagree with on-the-ground boundaries. The road model uses fixed class speeds and excludes ferry routes, live traffic, posted turn-restriction relations, conditional/reversible access and certain restricted roads. Geocoding can find places outside the prepared graphs. Current graph sizes defer ten full regions. A later change needs a measured partition or a more memory-efficient representation with boundary-road and search validation.

Actual logs, screenshots, exact modified files and source inputs are in the sibling `CHOKEPOINT-Master-Audit-2026-11-25` folder. The source ZIP and older presentation backups remain available. Current updates are local and uncommitted.

## Reproduction and launch

From the current checkout:

```sh
python3 scripts/serve.py --port 8000
node --test tests/*.test.mjs
node scripts/audit-routing.mjs
CHOKEPOINT_OFFLINE=1 REGION_PROFILE=all node tests/routing-browser.mjs
node tests/routing-browser.mjs
```

Open [the default City workbench](http://127.0.0.1:8000/), [City offline](http://127.0.0.1:8000/?offline=1), or [the exact Panay presentation](http://127.0.0.1:8000/?offline=1&network=panay-guimaras). Use the same free port in the runner and the URLs.

The archived source PBF has SHA-256 `ef435abfbd425312409ff9df6bbd3c359425a99eb9310c10969da1b44e61578d`. The prepared combined input `study-boundaries.json` has SHA-256 `94cb20bd816c5e63e80f23bcc351f32cef4f2ea121689677368907a4aca70c31`. It contains the medium-resolution 18-region feature set plus the DPWH City of Iloilo polygon (municipal code `063022000`). [Boundary source revision](https://github.com/faeldon/philippines-json-maps/tree/680e32e62baeccbcd8845d3b1387bc67c1baf78a) · [Road source and PBF parser setup](README.md)

With the preserved inputs, Node.js 24 and `osm-pbf-parser@2.3.0` installed into a separate parser folder:

```sh
mkdir -p "$run/graphs" "$run/proofs"
node --max-old-space-size=4096 scripts/extract-region-samples.mjs "$pbf" "$parser_dir" "$run/graphs" --administrative "$boundaries"
for graph in "$run"/graphs/*.json.gz; do
  id=$(basename "$graph" .json.gz)
  node --expose-gc scripts/verify-region.mjs "$graph" scripts/administrative-fixtures.json > "$run/proofs/$id.json"
done
set -- iloilo-city ph-1300000000 ph-1700000000 ph-500000000 ph-600000000 ph-1800000000 ph-800000000 ph-1600000000 ph-1900000000
node scripts/extract-regional-places.mjs "$pbf" "$parser_dir" "$run/places" philippines "$boundaries" "$@"
node scripts/build-administrative-catalog.mjs "$run/graphs" "$run/places" "$run/proofs" "$boundaries" "$run/staged" "$@"
```

The last command stages checksummed graphs, coverage and proven offline place data and emits a manifest plus a place-catalog fragment. Preserve the pre-existing place catalog entries when incorporating the fragment. It rejects a deferred proof or unrelated data snapshot.
