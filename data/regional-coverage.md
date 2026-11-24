# CHOKEPOINT regional routing coverage

The November 24 regional rollout started with Panay and Guimaras and supplied **22 additional Philippine road networks** on demand. The 23 Philippine graphs represent selected roads across all 18 administrative regions. Coverage varies within each region and stops at the published dataset boundaries. Central Singapore is a separately labeled international pilot. Place search remains worldwide where Photon has indexed results. [Philippine Statistics Authority regional checklist](https://psa.gov.ph/classification/psgc/regions)

The later [Iloilo City and Province extract](final-redesign.md#road-networks) adds a verified dedicated study graph inside the same source coverage. It uses a municipal filter and a separate verification fixture. The tables below retain the original regional benchmark results.

See the [November 25 engineering audit](master-audit.md#regional-validation) for the new default and the verified administrative graphs.

## Philippine coverage by administrative region

All entries below have extracted and tested road data integrated into the application. Each dataset key links the administrative description to its exact extent, vertex and directed-edge counts, gzip size, and measured memory in the following table. Route and closure verification applies to sampled trips, and the maps may contain additional connected roads and separated components inside each extent.

| Administrative region | Integrated datasets | Examples of geographic scope | Limits |
| --- | --- | --- | --- |
| National Capital Region | `metro-manila`, `ncr-south` | Manila and surrounding Metro Manila roads, with a separate southern corridor | No proof of complete NCR coverage or an optimum over both assets |
| Cordillera Administrative Region | `cordillera` | Baguio and southern Benguet roads toward La Union | Northern Cordillera remains outside the verified corridor |
| Region I — Ilocos Region | `ilocos-coast`, `cordillera` | Vigan–Laoag coastal corridor and La Union roads toward Benguet | Inland and southern extents are partial |
| Region II — Cagayan Valley | `north-cagayan` | Tuguegarao–Aparri and nearby roads | Southern valley, eastern coast and outer islands remain unverified |
| Region III — Central Luzon | `nueva-ecija` | Pampanga–Nueva Ecija corridor including the Angeles–Cabanatuan test | Western provinces and most other corridors lack verified inclusion |
| Region IV-A — CALABARZON | `ncr-south`, `calabarzon-east` | Northern CALABARZON and a Laguna–Lucena route | Most outlying areas and connections between clips remain unverified |
| MIMAROPA | `mindoro`, `palawan` | Mindoro road network and Puerto Princesa–El Nido | Separate islands, including islands within a clip, can be disconnected. Romblon and Marinduque remain unverified |
| Region V — Bicol Region | `bicol` | Mainland peninsula including Naga–Legazpi | Island and peripheral coverage varies |
| Region VI — Western Visayas | `panay-guimaras` | Panay, Guimaras and sampled parts of outlying islands | Panay–Guimaras lacks a modeled road connection |
| Region VII — Central Visayas | `cebu`, `bohol-siquijor` | Cebu–Bogo, Mactan roads, Tagbilaran–eastern Bohol | Cebu–Bohol ferry connections are outside the road model |
| Region VIII — Eastern Visayas | `leyte-samar` | Leyte, Biliran, and Samar roads including Tacloban–Catbalogan | Island and edge coverage varies |
| Negros Island Region | `negros-north`, `negros-south`, `bohol-siquijor` | Bacolod–northeastern Negros, Dumaguete–southern Negros, and a local Siquijor route | Trips spanning the two Negros clips require a common loaded extent. Siquijor has separate island roads |
| Region IX — Zamboanga Peninsula | `zamboanga-north`, `zamboanga-south` | Dipolog and Zamboanga City corridors with rural roads | A whole-peninsula trip can exceed either clip. Outlying island routes are unverified |
| Region X — Northern Mindanao | `northern-coast` | Cagayan de Oro and eastern coastal roads toward Caraga | Interior and western portions are partial or outside the tested extent |
| Region XI — Davao Region | `davao-gulf` | Davao City–Tagum corridor and surrounding Gulf roads | Outlying provinces, islands and other connections remain unverified |
| Region XII — SOCCSKSARGEN | `sarangani` | General Santos–Koronadal corridor | Western and inland coverage remains partial |
| Region XIII — Caraga | `northern-coast` | Agusan del Norte and Butuan via the west coastal corridor | Southern and eastern areas and offshore islands remain unverified |
| Bangsamoro Autonomous Region in Muslim Mindanao | `maguindanao` | Cotabato City–Maguindanao corridor | Lanao del Sur and island networks remain unverified |

## Exact graph extents and desktop measurements

Bounds are **west / south / east / north** in decimal degrees and describe the extrema of actual modeled road vertices. The new Philippine files total **100,147,598 bytes** on disk. At startup the browser requests the **5,166,082-byte** Panay asset and a small catalog. Each subsequent switch loads one compressed graph as needed. All listed Philippine assets passed directed route and closure checks. The manifest records byte counts, SHA-256, source snapshots, and exact analysis vertex IDs. [Runtime manifest](regions/manifest.js)

| Dataset key | Modeled bounds | Vertices | Directed edges | Gzip MiB | Ready JS heap MiB | Switch s | Build / index ms | Long route UI ms | Analyze ms |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| panay-guimaras | 121.346447 / 10.4067564 / 123.3584859 / 12.1312694 | 492,603 | 1,003,602 | 4.93 | 89.4 | — | 82 / 40 | 162 | 550 |
| negros-north | 122.600003 / 10.0500096 / 123.559999 / 10.9999905 | 331,546 | 686,004 | 4.23 | 63.4 | 4.08 | 41 / 28 | 114 | 18 |
| negros-south | 122.3803056 / 9.0500222 / 123.3599984 / 10.3099991 | 244,111 | 496,491 | 2.99 | 47.0 | 2.94 | 35 / 15 | 82 | 20 |
| cebu | 123.250004 / 9.4150005 / 124.144999 / 11.299979 | 560,473 | 1,129,818 | 7.12 | 100.7 | 6.65 | 72 / 32 | 145 | 29 |
| bohol-siquijor | 123.4600036 / 9.0967085 / 124.6639949 / 10.173995 | 269,289 | 545,913 | 3.31 | 52.7 | 0.10 | 34 / 17 | 71 | 24 |
| leyte-samar | 124.2400001 / 9.8900097 / 125.9499327 / 12.6929531 | 433,998 | 892,040 | 5.58 | 82.3 | 0.16 | 55 / 28 | 73 | 102 |
| mindoro | 120.3019881 / 12.0690045 / 121.556523 / 13.5628569 | 136,793 | 282,803 | 1.73 | 29.5 | 1.79 | 23 / 7 | 74 | 13 |
| palawan | 117.1804333 / 8.1818308 / 120.3346003 / 12.2829045 | 204,721 | 418,241 | 2.49 | 41.1 | 2.42 | 33 / 11 | 73 | 12 |
| metro-manila | 120.9100063 / 14.3700035 / 121.1899991 / 14.8199999 | 439,230 | 855,364 | 6.60 | 81.3 | 6.27 | 73 / 35 | 161 | 612 |
| ncr-south | 120.8300034 / 14.0200011 / 121.4429972 / 14.5399998 | 521,816 | 1,059,018 | 7.44 | 96.7 | 6.90 | 92 / 38 | 115 | 69 |
| calabarzon-east | 121.1500004 / 13.8400176 / 121.7199599 / 14.3799915 | 239,423 | 495,759 | 3.20 | 47.4 | 3.25 | 37 / 19 | 111 | 43 |
| nueva-ecija | 120.5700004 / 14.8700003 / 121.1299906 / 15.6299995 | 532,961 | 1,097,811 | 7.12 | 98.8 | 6.79 | 85 / 40 | 147 | 21 |
| cordillera | 120.280117 / 16.21 / 120.9999982 / 16.984998 | 491,924 | 985,215 | 5.73 | 88.9 | 5.44 | 57 / 24 | 83 | 25 |
| ilocos-coast | 120.280117 / 16.5800023 / 120.6999991 / 18.5458383 | 469,133 | 951,625 | 5.51 | 86.4 | 5.09 | 58 / 24 | 74 | 33 |
| north-cagayan | 121.3700015 / 17.2300126 / 122.0899969 / 18.4830153 | 258,078 | 525,432 | 3.12 | 51.2 | 3.00 | 36 / 13 | 77 | 21 |
| bicol | 122.450003 / 12.4900032 / 124.2699985 / 14.309933 | 418,546 | 859,609 | 5.27 | 79.9 | 5.00 | 57 / 22 | 75 | 20 |
| zamboanga-north | 122.9200038 / 7.7300009 / 123.7699985 / 8.7270448 | 328,363 | 661,061 | 3.82 | 61.4 | 3.62 | 50 / 23 | 119 | 15 |
| zamboanga-south | 121.8980581 / 6.8977108 / 123.0199951 / 8.1099998 | 305,511 | 616,258 | 3.59 | 58.1 | 3.51 | 40 / 16 | 58 | 12 |
| northern-coast | 124.4000012 / 8.2800025 / 125.6599984 / 9.2199994 | 411,838 | 837,380 | 5.05 | 77.9 | 4.82 | 62 / 29 | 189 | 23 |
| davao-gulf | 125.3200014 / 6.6800005 / 125.8899999 / 7.5299997 | 338,559 | 693,187 | 4.41 | 64.3 | 4.29 | 51 / 22 | 81 | 33 |
| sarangani | 124.7200025 / 5.7500076 / 125.4599996 / 6.5399979 | 361,349 | 744,385 | 4.43 | 67.9 | 4.27 | 50 / 24 | 87 | 209 |
| maguindanao | 124.0600097 / 6.710005 / 124.7399994 / 7.4399958 | 232,869 | 472,292 | 2.75 | 45.2 | 2.80 | 43 / 14 | 46 | 55 |

The Panay row uses the previous cold baseline. Other rows are single desktop Chrome samples on an Apple M4 at 1440 × 900 with emulated 10 Mbps down and 70 ms latency. Bohol–Siquijor and Leyte–Samar had previously been fetched during the same test and used the browser’s HTTP cache. Other switch measurements include the network transfer. The loader retains one active decoded graph and prepares at most one candidate at a time. Ready heap is the post-collection JS heap for the browser tab. It excludes peak memory during switching, browser-process RSS, and typed-array backing storage. Large-graph cold switches are primarily transfer-bound.

A separate cold-start profile on the final build was ready in **6.10 s** at **89.5 MiB** of JS heap. The previous baseline was **6.06 s** and **89.4 MiB** under the same desktop test conditions. This is a single-run comparison. The new startup profile recorded **61 ms** for decompression and parsing, **88 ms** for graph construction and **43 ms** for the spatial index.

### CPU-throttled Chrome at 390 × 844

These single samples use 4× CPU throttling with the same emulated network. Leyte–Samar and Singapore use cached HTTP responses in this run. The test used a mobile-sized Chrome viewport and emulated touch. Physical phones can show different transfer, memory, and compute behavior.

| Dataset | Switch s | Parse / build / index ms | Ready JS heap MiB | Long route UI ms | Analyze ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Cebu and Mactan | 6.99 | 290 / 238 / 132 | 100.6 | 402 | 119 |
| Southern Manila and north CALABARZON | 7.31 | 335 / 301 / 162 | 96.6 | 438 | 259 |
| Leyte, Biliran and Samar | 0.61 | 257 / 206 / 103 | 82.3 | 195 | 426 |
| Central Singapore pilot | 0.16 | 23 / 20 / 7 | 9.3 | 52 | 386 |

The Singapore asset has **28,752 vertices**, **39,571 directed edges** and **491,805 compressed bytes**. Its modeled bounds are **103.8240011 / 1.2700008 / 103.8799972 / 1.3199978**. Chrome loaded it automatically for a **1,904.66 m** trip and all four comparisons agreed. The longer fixture shown in the profile was **3.54 km**.

## Validation and route examples

- The regional verifier passed **195 Philippine case/mode checks** and **nine Central Singapore checks**. The suite covers short and long trips, a geometrically selected link closure, all origin departures closed, one-way reverse attempts, and closure/reopen LPA* repair. Both objectives use the existing cost definitions. All four algorithms matched the Dijkstra baseline on unrounded cost and reachability. Returned paths were checked edge by edge. LPA* repair restored the original optimum on reopening. The calculation timings are single workload samples, separate from rendering.
- Reachable fastest-mode examples include **Tacloban → Catbalogan, 104.78 km**, **Puerto Princesa → El Nido, 267.78 km**, **Calapan → San Jose, 203.86 km**, and **Cagayan de Oro → Butuan, 170.98 km**. Endpoints are sampled road locations near these cities and are listed in the [regional fixtures](../scripts/philippine-region-fixtures.json).
- Bohol and Siquijor each have local routes, including **6.84 km** on Siquijor. A Bohol–Siquijor test found no connected road route. The app also returned no route between Iloilo and Bohol or Metro Manila, where no downloadable graph covers both endpoints. London remained searchable and outside routing coverage.
- Analyze keeps the existing scoring formula. Each new graph samples four road vertices at evenly spaced indices along the first approximately 3 km of its recorded short trip's shortest-distance path. For shorter trips it uses the full path. The six one-direction trips and at most 40 candidate links define the scope. Iloilo retains the nine presentation landmarks and 36 sampled trips.
- A short-stroke closure lookup took **0.10–0.39 ms** across the offline sample. Estimated-fastest LPA* repair took **0.25–23.28 ms** on closure and **0.03–7.17 ms** on reopening, excluding rendering. Chrome applied and repaired the Bohol closure in **37 ms** at a mobile-sized viewport, before CPU throttling was applied for the profile.
- The original Panay dataset, the Iloilo place index and the presentation fixture and guide are identical to the safety snapshot. Browser rehearsals retained the **396.833 s** original cost, the **571.840 s** detour and the **6,180-event** LPA* repair. [Iloilo presentation results](../PRESENTATION.md)

## Extraction and reproduction

The Philippine graphs reuse the original [Geofabrik Philippines PBF](https://download.geofabrik.de/asia/philippines.html) with replication time **2026-11-22 21:20:48 UTC** and SHA-256 `ef435abfbd425312409ff9df6bbd3c359425a99eb9310c10969da1b44e61578d`. Central Singapore uses the [BBBike Singapore PBF](https://download.bbbike.org/osm/bbbike/Singapore/) from **2026-11-21 00:00:00 UTC**, SHA-256 `d5fdb60fc41edb7d112750cfb70888218c6dcdba45ac01ed7614506691978f0d`. The generated database is © OpenStreetMap contributors under ODbL 1.0. [OpenStreetMap copyright and license](https://www.openstreetmap.org/copyright)

The extractor uses the existing OSM road classes, access filters and one-way rules. It clips ways to runs of consecutive included vertices and splits at an excluded or missing vertex. Shared OSM node and way IDs survive the clip, so overlapping graphs retain genuine intersections. The two Negros extracts were tested for shared source IDs and identical coordinates. Roads remain separate at grade-separated crossings where they have no shared node. The browser does not join extracts, fill clipped gaps or add ferry edges.

Single large clips were rejected if they exceeded **575,000 vertices**, **8 MiB gzip** or **155 MiB** of incremental ready Node heap in the offline verification gate. This excluded full Negros, northwest Luzon and broad Mindanao clips, among others. Tested smaller corridors were used instead. These are engineering gates based on browser profiles of representative graphs. Physical mobile-device limits can differ.

Use Node.js 24 and a separate working directory containing the source PBF. Supply the dataset keys to extract selected clips. Omitting keys extracts all candidate clips in the fixture. The runtime manifest admits only explicitly named, successfully verified outputs.

```sh
npm install --prefix "$work" osm-pbf-parser@2.3.0
mkdir -p "$work/regional"
node --max-old-space-size=4096 scripts/extract-region-samples.mjs \
  "$work/philippines.osm.pbf" "$work" "$work/regional" \
  --regional scripts/philippine-region-fixtures.json leyte-samar
node --expose-gc scripts/verify-region.mjs "$work/regional/leyte-samar.json.gz" \
  scripts/philippine-region-fixtures.json > "$work/regional/leyte-samar.verified.json"
node scripts/build-region-manifest.mjs "$work/regional" leyte-samar
node --test tests/network.test.mjs tests/regions.test.mjs
node scripts/audit-routing.mjs
BROWSER_BASE_URL=http://127.0.0.1:8000/ REGION_PROFILE=all node tests/routing-browser.mjs
```

Use `scripts/regional-benchmark-fixtures.json` and the `singapore-central-pilot` key with the Singapore PBF to reproduce that graph. Set `REGION_PROFILE_MOBILE=1` and list selected dataset keys in `REGION_PROFILE` to reproduce the throttled profile. Serve the app at localhost or on HTTPS for browser checksum verification.

## Routing limits

An administrative border has no routing effect within a graph. In overlaps the app keeps the active graph if its open network supports the journey, which preserves the current closure scenario. Otherwise it tries graphs in manifest order and checks actual endpoint connections. If no graph covers the complete request, the app explains the limitation. The displayed optimum applies to the selected graph and its current closures. An alternative through roads outside the clip is beyond the comparison.

The input data and static road speeds are dated snapshots. Turn restrictions, ferry schedules and live traffic are outside the model. Mainland China, Japan and South Korea remain discovery-only. A future shared graph must preserve the connecting topology and route costs across the full relevant search extent.

## Files changed from the presentation snapshot

- **Loader and interface** — `index.html`, `js/main.js`, `js/features/routing-region.js`, `js/graph/region-manifest.js`, `js/graph/regions.js`, `js/graph/road-graph.js`, `js/graph/road-spatial.js`, `js/map/map.js`.
- **Graph-specific behavior** — `js/features/chokepoints.js`, `js/features/closures.js`, `js/features/comparison.js`, `js/features/place-search.js`, `js/features/route-points.js`, `js/features/route-status.js`, `js/features/run-controller.js`.
- **Data** — `data/regions/manifest.js` and one `data/regions/<dataset-key>.json.gz` per additional Philippine and Singapore dataset documented above.
- **Extraction and verification** — `scripts/build-region-manifest.mjs`, `scripts/extract-region-samples.mjs`, `scripts/philippine-region-fixtures.json`, `scripts/profile-browser.mjs`, `scripts/regional-benchmark-fixtures.json`, `scripts/verify-region.mjs`, `tests/regions.test.mjs`, `tests/routing-browser.mjs`.
- **Documentation** — `README.md`, `HANDOVER.md`, `data/README.md`, `data/regional-coverage.md`.

The app has no new runtime dependencies. Offline extraction uses the existing `osm-pbf-parser@2.3.0` workflow.
