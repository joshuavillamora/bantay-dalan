# CHOKEPOINT handover

**Road Network Analysis & Resilience** · CC 204 Data Structures and Algorithms

## Recovery and current status

The checkout is on `ui/bantay-dalan-redesign` at `b698a04`. That implementation was merged into GitHub main through PR #2 at `5c54c49`. The redesign is in the local working tree on top of the earlier interface standardization.

**November 25 final release.** Iloilo City starts by default. The picker offers all four dedicated study areas, eight full administrative regions, Central Singapore, and the preserved geographic extracts and presentation graph. Iloilo Province follows the municipal outlines of 43 provincial LGUs and excludes Iloilo City. Panay Island covers the main island across four provinces. The original Panay and Guimaras presentation remains available separately. The WVSU Main Campus pin routes via the documented Luna Street access. [Priority graph verification and reproduction](data/README.md#priority-study-areas) · [Earlier administrative audit](data/master-audit.md)

**Final interface.** The 100 px desktop header uses the original 1,254 px square logo and a tighter arrangement of the approved wordmark paths. The original SVG remains in the artwork folder. The warm-stone rail centers its four modes with 24–36 px desktop spacing and retains click-to-collapse. Local Anton headlines, the Draw and Analyze actions, and explicit search status distinguish setup, visualization, and computation.

**Offline presentation.** Extract `CHOKEPOINT-Final-Release.zip` and follow [the presentation guide](PRESENTATION.md). The earlier `CHOKEPOINT-Demo-2026-11-25` and regional backup `chokepoint-regional-backup-2026-11-24.Jh8weh` remain separate snapshots. [Local map extents and test instructions](data/offline.md)

**Previous light workbench.** The earlier refinement restored the white header, charcoal rail, solid yellow selection and actions, and light workspaces. The app bundles IBM Plex Sans weights 400–700. Cold Chrome verified the local font requests and actual glyphs. `chokepoint-pre-light.ioGGvC` is a full sibling snapshot from before this pass. The older portable demo remains a separate backup. See [the refinement review](data/refinement-review.md) for changed files, tests, and measurements and [the presentation guide](PRESENTATION.md) for the demo sequence.

**Previous interface standardization.** The baseline used one 380 px desktop workspace, Title Case control names, neutral route summaries, full algorithm labels, and grouped native network options. Route, Compare, and Route Impact display the same two-decimal kilometre and minute totals. Generated manifests and routing datasets retain their existing identifiers and checksums. See [the standardization report](data/interface-standardization.md) for screenshots, measured dimensions, tests, and limitations.

**November 24 baseline.** The previous workbench uses local Geist Sans, the seven approved PNGs, a searchable 24-network picker, and offline Network view. Panay and Guimaras was the default and the original experiment keeps its own graph and fixture. [Changes, coverage, and verification](data/final-redesign.md)

**Startup recovery.** Opening `index.html` directly displays the local server command. Over HTTP, `js/bootstrap.js` catches module import and initialization failures before they can leave the default loading message on screen. It reports Application startup failed and offers Reload application. The local server revalidates application files while retaining PMTiles byte ranges.

Before implementation, the full checkout was copied to the separate sibling directory `chokepoint-presentation-2026-11-24.qniFZ6`. The copy matched the working tree, passed all 23 existing Node tests, and reproduced the presentation route, closure and General Luna Avenue calculation. The original data and presentation files were verified byte for byte after integration.

| Area | Modules |
| --- | --- |
| Startup and data | `js/main.js`, `js/config.js`, `js/graph/road-graph.js`, `js/graph/road-spatial.js` |
| Regional networks | `js/graph/regions.js`, `js/graph/region-manifest.js`, `js/features/routing-region.js`, `data/regions/` |
| Search and endpoint feedback | `js/features/geocoding.js`, `place-search.js`, `route-points.js`, `route-status.js` |
| Leaflet and imagery | `js/map/map.js`, `basemaps.js`, `markers.js`, `explore-layer.js` |
| Closures | `js/features/closure-tool.js`, `closures.js`, `js/graph/closure-selection.js`, `closure-filter.js`, `js/map/closure-view.js` |
| Measured routing | `js/algorithms/`, `js/features/comparison.js`, `run-controller.js`, `js/ui/results-table.js` |
| Critical roads | `js/analysis/chokepoints.js`, `js/features/chokepoints.js` |

The primary algorithms are Bidirectional Dijkstra, A*, and Lifelong Planning A*. Standard Dijkstra is the baseline. Distance uses segment lengths in metres. Estimated time adds segment distance divided by the configured static road-class speed. [Computational validity and model assumptions](data/routing-audit.md)

## Run locally

```sh
python3 scripts/serve.py --port 8000
```

Open [the Panay offline demonstration](http://127.0.0.1:8000/?offline=1&network=panay-guimaras) and wait for **Ready to route** and **Offline Panay and Guimaras streets**. The range-capable server supplies the offline maps and application assets. The [normal launch](http://127.0.0.1:8000/) retains the optional online map providers and Photon.

## Verify

```sh
node --test tests/network.test.mjs tests/regions.test.mjs tests/offline-assets.test.mjs
node scripts/audit-routing.mjs
node tests/routing-browser.mjs
CHOKEPOINT_OFFLINE=1 REGION_PROFILE=all node tests/routing-browser.mjs
```

The browser suite uses local Chrome and the running local server. Set `CHROME_BIN` or `BROWSER_BASE_URL` when necessary. **30 Node tests passed**. The Iloilo audit retained **26 trip/mode checks** and four LPA* repair sequences. The regional verifier passed **195 Philippine** and **nine Singapore** checks. Chrome passed the offline rehearsal, all 23 graph assets, online recovery, regional analysis, and LPA* repair and reopening. Four representative regional profiles used a mobile-sized viewport with 4× CPU throttling. Physical mobile hardware and access from mainland China remain untested.

## Geography and limitations

- **Panay and Guimaras presentation graph.** The 5,166,082-byte gzip covers modeled roads in Panay and Guimaras and some outlying islands. It contains **492,603 vertices**, **1,003,602 directed edges**, **415 weak components**, and **756 strong components**. Its largest strongly connected component has **454,630 vertices**. The extent is **10.4067564–12.1312694° N**, **121.3464470–123.3584859° E**. Panay and Guimaras have separate components. Snapping checks for a modeled road within 250 m and an endpoint vertex within 1.5 km. [Source and extraction rules](data/README.md)
- **Discovery.** The 292,043-byte Iloilo index has 4,542 entries. Saved places and local suggestions appear without waiting for queries. Photon is used on local and hosted builds with an Iloilo bias and worldwide results. Recorded responses included Manila, Cebu City, Davao City, Beijing, Shanghai, Tokyo, Seoul, Singapore, London, and New York. Live Chrome tests selected **北京 → Beijing**, **上海 → Shanghai**, **Cebu City**, and **London**, each with a centered Streets pin and an outside-coverage message. [Photon API and result formats](https://github.com/komoot/photon/blob/master/docs/api-v1.md)
- **Coordinates and imagery.** The app reads Photon GeoJSON longitude/latitude in WGS-84 and reverses the tuple when calling Leaflet. Leaflet projects to EPSG:3857 for tiles. The China samples used the existing providers. Baidu's BD-09 and GCJ-02 were reviewed as alternative coordinate systems and were not used. The sampled Stadia Satellite and Hybrid tile URLs near Beijing and Shanghai returned JPEGs. That verifies sample availability, with imagery date, positional accuracy and visibility dependent on the provider. The photo styles require localhost under the present setup. [GeoJSON coordinates](https://www.rfc-editor.org/rfc/rfc7946#section-4) · [Leaflet CRS](https://leafletjs.com/reference-1.9.4.html#crs) · [Baidu coordinate systems](https://lbsyun.baidu.com/docs/jsapi?title=jsapi4%2Fguide%2Fconcept%2Fcoord) · [Stadia Satellite](https://docs.stadiamaps.com/map-styles/alidade-satellite/)
- **Closure geometry and scoring.** The closure cursor uses the same approved logo image as the header, served from `assets/icons/display/logo.png`. Drawing previews only modeled segments before applying a group. The red map layer draws the union of actual closed roads, and reopening retains overlapping closures. The longest links are consecutive source-way vertices. Analyze ranks up to 40 frequently used links across 36 sampled trips between nine configured Iloilo places. The score sums extra modeled seconds and adds 1,800 seconds per disconnected trip. Active closures define the open graph for each run and invalidate prior rankings.

## Previous performance baseline and isolated benchmark clips

Single representative Chrome profiles on an Apple M4, served locally under a 10 Mbps cap and 70 ms added latency. Heap is JS heap after collection when ready. The after-routing Panay heap was **90.2 MiB**, plus **9.54 MiB** of reverse-index buffers reported separately. Regional windows are clipped samples. Timed routes and analysis demand differ by fixture, so the times describe each test workload.

| Graph | Vertices / directed edges | Gzip | Transfer | Ready JS heap | Build / spatial index | Mean snap | Long route UI | Cold Analyze UI |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Panay and Guimaras | 492,603 / 1,003,602 | 4.93 MiB | 4.93 s | 89.4 MiB | 82 / 40 ms | 0.040 ms | 162 ms | 0.55 s |
| Iloilo City window | 43,065 / 86,898 | 0.44 MiB | 1.15 s | 11.3 MiB | 15 / 10 ms | 0.070 ms | 47 ms | 0.66 s |
| Iloilo Province and Guimaras candidate | 266,147 / 541,378 | 2.67 MiB | 3.03 s | 51.2 MiB | 56 / 26 ms | 0.065 ms | 110 ms | 9.03 s |
| Metro Manila window | 439,230 / 855,364 | 4.85 MiB | 4.88 s | 79.8 MiB | 83 / 48 ms | 0.128 ms | 146 ms | 6.47 s |
| Cebu window | 129,550 / 255,169 | 1.33 MiB | 1.89 s | 26.3 MiB | 36 / 22 ms | 0.087 ms | 46 ms | 2.76 s |
| Davao window | 110,054 / 226,371 | 1.15 MiB | 1.74 s | 23.0 MiB | 34 / 19 ms | 0.098 ms | 48 ms | 3.83 s |
| Central Singapore pilot | 28,752 / 39,571 | 0.33 MiB | 1.05 s | 7.8 MiB | 11 / 11 ms | 0.190 ms | 49 ms | 1.05 s |

The bundled graph was ready in **6.06 s** desktop and **6.05 s** in a separate 390 × 844, 4×-CPU-throttled profile. The mobile profile showed 243 ms graph construction, 0.155 ms mean snap lookup, 608 ms for a long route, 2.26 s cold Analyze, and about 3 ms for its cached rerun. The desktop search visualization probe took **64 ms** through its route-ready observation. Local suggestions rendered in **1.5 ms** desktop and **2.7 ms** in the throttled run. The controlled online probe took **0.60–0.62 s** with a 120 ms simulated provider response and debounce. Live browser selections took **0.78–1.61 s** to appear. Transfer dominates startup under these conditions.

Existing spatial indexing, cooperative work slicing, Canvas closure layers, capped animation history, and analysis caching remain in use. The previous closure benchmark prepared a one-road stroke in **0.17 ms** and a 180,443-segment loop in **166 ms**, excluding map painting. No new broad optimization or application dependency was needed for the presentation.

**Previous Singapore benchmark.** The temporary Chrome benchmark loaded a real BBBike OSM clip, routed an approximately **908 m** test trip, and matched Dijkstra on unrounded cost for all four algorithms under both objectives. A separate closed-path trial confirmed LPA* reuse at **132.665617 modeled seconds**. The later integrated pilot preserves source IDs and is verified separately in the regional report. [BBBike Singapore source](https://download.bbbike.org/osm/bbbike/Singapore/)

Reproduce clipped samples with the [Philippines source data](data/README.md) and `osm-pbf-parser@2.3.0` installed in a temporary prefix. To reproduce the Singapore pilot, place `singapore.osm.pbf` in the same temporary directory.

```sh
node scripts/extract-region-samples.mjs "$work/philippines.osm.pbf" "$work" "$work" \
  iloilo-city-window=122.47,10.64,122.63,10.80 metro-manila-window=120.91,14.37,121.19,14.82 \
  cebu-window=123.78,10.18,124.02,10.44 davao-window=125.43,6.96,125.68,7.22
node scripts/extract-region-samples.mjs "$work/singapore.osm.pbf" "$work" "$work" \
  singapore-central-pilot=103.824,1.270,103.880,1.320
node -e 'const fs=require("node:fs");const rows=require("./scripts/regional-benchmark-fixtures.json"); for(const [name, fixture] of Object.entries(rows)) fs.writeFileSync(process.argv[1]+"/"+name+".scenario.json",JSON.stringify(fixture))' "$work"
PERF_REGION="$work/singapore-central-pilot.scenario.json" node scripts/profile-browser.mjs
PERF_MOBILE=1 PERF_SMOKE=1 node scripts/profile-browser.mjs
```

The Philippines sample source has SHA-256 `ef435abfbd425312409ff9df6bbd3c359425a99eb9310c10969da1b44e61578d` and the Singapore PBF has `d5fdb60fc41edb7d112750cfb70888218c6dcdba45ac01ed7614506691978f0d`. Newer OSM extracts may change graph vertex IDs and route results.

## Presentation and next steps

Use the [presentation guide](PRESENTATION.md) for exact clicks, closure coordinates, the two-minute run of show and backup. For **Plaza Libertad → SM City Iloilo** under **Estimated fastest**, the one verified closure changes **5,356.37 m / 396.833 s** to **5,749.64 m / 571.840 s**. Reused LPA* processes **6,180** events versus **11,524** for fresh LPA* on the same closed graph. The guide includes medians, variability, and a verified Analyze example.

The app keeps one active regional graph and clears graph-specific scenarios on switching, while retaining selected coordinates for snapping on the new graph. The loader checks the gzip size, SHA-256, metadata, directed-edge count, and geographic bounds before activating a candidate. The extraction preserves OSM identities in the new assets. A future cross-clip routing workflow requires a complete connecting search extent. Full administrative-region coverage, ferry edges, turn restrictions, live traffic, and physical mobile benchmarks remain future work.
