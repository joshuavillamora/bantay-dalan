# CHOKEPOINT performance report

## Verified bottlenecks

1. **Covered road geometry was being rebuilt on map movement.** The old fallback renderer maintained two Leaflet Canvas polylines and recreated their segment arrays on every `moveend`, including when opaque basemap tiles covered the roads. Eight scripted pans and one zoom took **1,335 ms** of synchronous work on the throttled viewport. The layers were few, but their geometry was large.
2. **Graph preparation and route execution monopolized the main thread.** The throttled startup recorded a **455 ms** long task, and the long-route workflow recorded a **439 ms** task. The first routing request also retained a copy of every reverse edge's distance and speed. The road payload already used compact gzip and was fetched once in the sampled session. Over the controlled link its transfer alone took about **4.3–4.8 s**.
3. **CHOKEPOINT repeated expensive work.** A cold run took **3.62 s** with 41 long tasks on the throttled viewport. It performed nine full-graph nearest-vertex scans and repeated A* for the 36 sampled trips and for affected trips under each of up to 40 candidate closures. An unchanged rerun repeated all that work.

Regular endpoint snapping was already spatially indexed and averaged under 0.3 ms. Basemap request counts at startup were 20 desktop and four mobile in both measured runs. The autocomplete miss path already debounced requests. Its delay was visible, but it produced no measured long task in the controlled probe. A repeated-use sample retained approximately the same final heap as the post-route sample. This was a session check, with no exhaustive leak claim.

## Changes

- The local road fallback runs when tiles are unavailable or report errors. It batches viewport updates, reuses padded geometry through small pans, and releases the geometry when tile coverage recovers. Basemap sources, native zoom behavior, attribution, and image quality are unchanged.
- Graph decoding, spatial-index preparation, and first-use incoming-edge indexing yield between batches. The incoming index stores predecessor and forward-edge references in typed arrays. Routing, comparison, and CHOKEPOINT reuse the exact closure snapshot where applicable. The **492,603-vertex, 1,003,602-edge** road graph and its weights are unchanged.
- Drawn closures use the road spatial index for candidate segments and keep the same crossing and direction rules. CHOKEPOINT's demand lookup uses that index with an exact nearest-vertex fallback. Route and search work yields between bounded batches. Explore overlay painting is separately time-sliced and retains its existing bounded history. Step consumes one emitted algorithm event, and Skip completes the remaining search without painting its intermediate events.
- CHOKEPOINT shares reusable search buffers across its own searches, runs candidate simulations on private adjacency rows, and yields while routing. A completed result is cached for the same base graph and closure state. Closure edits and graph replacement invalidate it. The candidate and score definitions remain unchanged.

## Iloilo City place index

`iloilo-places.json` has **4,542 entries in 23 categories**, **292,043 bytes**. It includes mapped roads, barangays, neighborhoods, education and health sites, government offices, landmarks, terminals, shops, markets, parks, and other named points. OSM aliases participate in matching. The index contains coordinates for search. Routing and connectivity still depend on the Panay and Guimaras road graph.

Local lookups use prepared name tokens and small prefix buckets. Matching is case-insensitive and handles partial names. The existing dropdown shows up to six matches, combines duplicates near one another, and can keep a slot for a distinct relevant online result. A local match is visible before the online check, which waits 850 ms of inactivity when local results are available and 450 ms otherwise. The earlier one-request-per-second start limit, cancellation, session cache, and failure backoff remain in use. Local and saved places work when the geocoder is unavailable and the local app assets are reachable. Broader search remains online. There is no service worker or new browser dependency. [Stadia autocomplete](https://docs.stadiamaps.com/geocoding-search-autocomplete/autocomplete/) · [Photon public server](https://github.com/komoot/photon)

The index comes from the same **2026-11-22 21:20:48 UTC** Geofabrik extract as the roads, clipped to the DPWH Iloilo City polygon. Repeating the extraction reproduced the bundled file byte for byte. It retains named OpenStreetMap features and source IDs. Coordinates are representative feature positions, including a representative vertex for streets. Exact entrances and address coverage depend on the source. © OpenStreetMap contributors, [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). [OpenStreetMap attribution](https://www.openstreetmap.org/copyright)

## Reproduce

Use the PBF, DPWH GeoJSON and temporary parser installation described in [the source data notes](README.md).

```sh
node scripts/extract-places.mjs "$work/philippines.osm.pbf" "$work/municipalities.geojson" "$work" data/iloilo-places.json
node scripts/profile-browser.mjs
PERF_MOBILE=1 node scripts/profile-browser.mjs
PERF_SMOKE=1 node scripts/profile-browser.mjs
node --test tests/network.test.mjs
node scripts/audit-routing.mjs
node scripts/audit-coverage.mjs
```

The Chrome script accepts `CHROME_BIN` and `PERF_ROOT`. Use `PERF_ROOT` to repeat the scenario against a copy of the starting checkout. Timings below compare one captured run per viewport and revision on Apple M4 hardware with Chrome and Node 24. The desktop viewport was 1440 × 900 with native CPU speed. The 390 × 844 run used 4× CPU slowdown. Both used a controlled 10 Mbps download link with 70 ms latency. These are emulations and headless browser samples. Tile availability and compositor scheduling can vary.

Elapsed times include the time until the observed result became available, with roughly 45 ms polling granularity. A long task is one reported by Chrome at 50 ms or more. Search and map scenario readings include any concurrent browser tasks during that probe. The online response benchmark used a fixed 120 ms provider response so it could compare application delay independently of internet variability. It is not a provider latency measurement.

## Before and after measurements

| Workflow | Desktop elapsed ms | Throttled viewport elapsed ms |
| --- | ---: | ---: |
| Cold route-ready | 5819.5 → 5834.5 | 6060.8 → 5942.7 |
| Road transfer | 4651.7 → 4752.9 | 4323.7 → 4509.6 |
| Short urban route | 100.1 → 36.4 | 311.3 → 80.2 |
| Long route to Kalibo | 177.5 → 161.9 | 1448.8 → 558.8 |
| Eight pans and one zoom | 426.3 → 9.2 | 1495.9 → 16 |
| Short search visualization | 36.2 → 62.6 | 235.2 → 64.4 |
| Pan/zoom with search overlay | 8.8 → 4.6 | 23.1 → 7.1 |
| Drawn-closure lookup | 32.4 → 0.9 | 104.2 → 2 |
| LPA* initial route | 190.4 → 100.6 | 386.4 → 207.8 |
| LPA* close and repair | 153.2 → 49.2 | 298 → 160.5 |
| LPA* reopen and repair | 139.7 → 47.7 | 182.3 → 62.8 |
| Four-algorithm comparison | 64.3 → 66.3 | 236.3 → 221.1 |
| Cold CHOKEPOINT | 1023.9 → 526.5 | 3621.9 → 2151.9 |
| Same-scenario CHOKEPOINT rerun | 1009.3 → 2.4 | 3547.8 → 2.8 |
| Broader autocomplete fixture | 617.6 → 615.2 | 599.9 → 604.3 |

The longest startup task on the throttled viewport dropped from **455 to 95 ms**. Synchronous map work for the pan/zoom probe dropped from **1,335 to 11.3 ms**. The long-route probe had six long tasks before and none after. Cold CHOKEPOINT had 41 before and none after in the reported sample. The short visual search took longer to reach a result on desktop. Its drawing now yields separately, so elapsed time to the route result alone is not a frame-rate measure.

The road payload stayed at **5,166,082 bytes**. Median JSON parse alone from already decompressed bytes was **25.03 ms** over five Node runs on the same host. The old Chrome graph build took **219 ms** on the throttled viewport in a single task. The new decoder and spatial index took **243 ms** and **124 ms** elapsed respectively. These measurements include yields and describe preparation time rather than a single period of main-thread blocking. Cold load stayed near six seconds, with transfer still the main wall-time cost.

After routing, Chrome reported **172.1 → 90.2 MiB** of JS heap on both viewports. The incoming index additionally uses **9.54 MiB** of typed-array buffers, accounted for separately. After the repeated-use desktop scenario, the reported heap was **90.2 MiB**. The viewport fallback can retain geometry while tiles are missing. No long-running leak stress test or physical phone measurement was performed.

In the throttled lookup sample, endpoint snapping was **0.17 → 0.20 ms** on average. The separate exact nearest-vertex lookup used by CHOKEPOINT was **27.37 → 3.67 ms** per city probe. The new local Museum search showed matches within **2.4 ms** on the throttled viewport and **1.7 ms** on desktop, measured across the input handler. The old build provided no immediate Museum result. The broader query sent one request in each run.

A separate live query for Dueñas Municipal Hall returned the expected result from both providers. The single response samples were **409 ms** for Stadia and **1,118 ms** for Photon. These are availability checks, with no claim of a typical provider response time.

## Verification and limitations

- All **18 Node regression tests** passed. The routing audit also passed all 22 scenario-and-objective combinations. Exact CHOKEPOINT rankings and scores matched the starting implementation on both open and closed graphs. Forty indexed drawn-closure probes matched the previous full scan, including mixed stored and drawn closures.
- Chrome checked the first route, a long route, pan and zoom, comparison, visual playback, Pause/Resume, Step, Skip, Reset, a drawn closure and reopening, CHOKEPOINT highlighting and invalidation, and local search during a simulated outage. Desktop keyboard selection and marker dragging passed. Touch-emulated selection exposed a duplicate focus event that replaced the typed query's matches. The final run confirmed that tapping now selects the intended match. The desktop run loaded OpenStreetMap Streets, Stadia Satellite, and Stadia Hybrid and exercised the local-road fallback with tile requests blocked.
- The asset still needs to arrive over the network on a cold load. JSON parsing, heavy computations, Leaflet, and tile work can still consume CPU. Small or slow physical devices may behave differently. The image styles continue to depend on the configured provider. Local search accuracy is limited by mapped names and features.

## Files changed during this task

- Documentation and data — `README.md`, `data/performance.md`, `data/iloilo-places.json`.
- Graph and algorithms — `js/graph/road-graph.js`, `js/graph/road-spatial.js`, `js/graph/closure-filter.js`, `js/algorithms/astar.js`, `js/algorithms/best-first.js`, `js/algorithms/bidirectional.js`, `js/algorithms/lpa-star.js`, `js/utils/work-slices.js`.
- Features and map — `js/analysis/chokepoints.js`, `js/features/chokepoints.js`, `js/features/closures.js`, `js/features/comparison.js`, `js/features/geocoding.js`, `js/features/place-search.js`, `js/features/run-controller.js`, `js/map/basemaps.js`, `js/map/explore-layer.js`, `js/map/map.js`, `js/ui/dashboard.js`.
- Reproduction and tests — `scripts/audit-coverage.mjs`, `scripts/extract-places.mjs`, `scripts/profile-browser.mjs`, `tests/network.test.mjs`.
