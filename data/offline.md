# CHOKEPOINT offline demonstration

## Start on the presentation Mac

Open `Start CHOKEPOINT.command` in the portable folder, or run the following command in that folder. The app uses the Mac's existing Python 3 installation. Node.js 24 and Chrome are needed only for the automated tests.

```sh
python3 scripts/serve.py --port 8000
```

Open [the local presentation](http://127.0.0.1:8000/?offline=1) in Chrome. The link selects **Offline map** and local-only autocomplete. Wait for **Ready to route** and **Offline Panay and Guimaras streets**. Use the original **Panay and Guimaras** network, **Estimated fastest**, and zero closures. A fresh tab works even with Wi-Fi turned off. Keep the server’s Terminal window open.

The development repository is separate from the portable folder. The verified pre-offline regional backup is `chokepoint-regional-backup-2026-11-24.Jh8weh`. The earlier Panay presentation backup is `chokepoint-presentation-2026-11-24.qniFZ6`. Both are siblings of the development checkout.

The portable folder `CHOKEPOINT-Demo-2026-11-25` is approximately **496 MiB**. Its Mac launcher, six archives, bundled libraries, all routing graphs and place indexes were tested from that folder.

## Maps and search

Leaflet 1.9.4 still handles navigation and interactive overlays. An on-demand Protomaps Leaflet 5.1.0 canvas layer reads static PMTiles v3 vector archives via HTTP ranges. The range-capable Python server uses only the Python standard library. JS, CSS, marker images, the logo, and fonts are served locally. The current checkout bundles four official IBM Plex Sans WOFF2 faces. Glyphs outside their coverage use the browser’s installed fonts. The separate older portable package contains its original Plex Sans and Plex Mono subsets. [Current font and offline verification](refinement-review.md)

The offline style draws the provider's mapped roads and street names, buildings, land use, parks, coastlines, waterways, boundaries, locality labels, points of interest, and transport features where present. Panay and Singapore retain more individual mapped building outlines and minor detail than the Philippine medium-detail archives. The default Protomaps light palette and label density differ from online Streets. Overzoom enlarges and restyles the prepared vectors through display zoom 19. It does not create new shapes or labels.

| Archive | Extraction bounds, west / south / east / north | Native max zoom | Bytes |
| --- | --- | ---: | ---: |
| Panay and Guimaras | 121.34 / 10.35 / 123.39 / 12.18 | 15 | 45,265,607 |
| Luzon and nearby islands | 117.40 / 12.00 / 125.15 / 21.45 | 14 | 141,459,777 |
| Visayas and nearby islands | 116.75 / 9.00 / 126.20 / 12.40 | 14 | 87,224,398 |
| Mindanao and nearby islands | 116.75 / 4.45 / 127.15 / 9.65 | 14 | 107,655,284 |
| Central Singapore and surroundings | 103.79 / 1.23 / 103.92 / 1.38 | 15 | 10,712,968 |
| World overview | Web Mercator worldwide | 5 | 15,052,438 |

The archives total **407,370,472 bytes (388.5 MiB)**. The map chooses an archive based on the viewport center and zoom. At the outside edge of a clip, useful detail can end before the viewport edge. The world overview is offered through display zoom 10. At street zoom outside prepared areas, the app reports unavailable map data. The emergency view retains the modeled roads and interactive overlays if the detailed map cannot be loaded.

All **22 Philippine routing graphs** previously verified for selected roads across 18 administrative regions, and the **Central Singapore pilot**, are available from the local server. There are also larger preprocessed Philippine candidate clips deferred by the regional memory and size gate, including full Negros, northwest Luzon and broad Mindanao. The demonstration package uses the verified graphs. The compressed 23-graph payload is **105,805,485 bytes**. Route eligibility and native basemap coverage remain independent. An island can have an offline map even when the graph has no road connection to it. [Exact graph coverage, validation and deferred clips](regional-coverage.md)

The 4,542-entry Iloilo City index remains intact. The new catalog provides a **2,941-record nationwide locality index** and a searchable index for every bundled graph. The 24 gzip files total about **5.2 MiB**. The browser loads a regional index from the map location, matching region name, or active network and retains at most two prepared regional indexes. For a regional school, hospital, market, street, or landmark, first find the locality or move the map to its area. Entries come from the actual OSM extracts and include named locality, government, transport, commercial, and other records. Larger indexes are capped at 18,000 prioritized entries, so some mapped names are omitted. Results identify the local index, and pins are snapped by the road graph as before. [Place catalog and checksums](places/manifest.json)

Streets, Satellite, Hybrid and Photon remain available online. Loss of connectivity or failed tile requests lets the app display the local vector map where available. The **Offline map** menu option also works in an online session and keeps the current camera and overlays. Desktop redistribution of the existing commercial imagery is restricted. Open Sentinel-2 visible bands have 10 m pixels, too coarse to identify the two carriageways reliably at the closure zoom. The package uses vector streets for the presentation. [Stadia terms](https://stadiamaps.com/terms-of-service/) · [Copernicus Sentinel-2 data and resolution](https://sentinels.copernicus.eu/sentinel-data-access/sentinel-products/sentinel-2-data-products)

## Performance and verification

A cold Chrome launch at 1440 × 900 on the Mac M4 with cache disabled and external requests blocked reached **Ready to route** and a rendered local map in **0.44 s**. Panay graph download from localhost took **35 ms**, decompress and parse **59 ms**, graph construction **95 ms**, and spatial indexing **48 ms**. The browser read **250,222 bytes** in nine pre-ready map range requests. Ready JS heap was **95.5 MiB** after collection, compared with the previous online profile's **89.5 MiB** without the vector renderer. Heap figures exclude the browser process, canvas buffers, and typed-array backing stores. Network conditions differ between the prior throttled online profile and this loopback run.

The independent cold check from the portable folder was ready in **0.38 s** at **95.5 MiB** of JS heap. It repeated the full rehearsal, routed all 23 graphs, and passed the missing-archive and corrupted-graph fallback scenarios.

Single desktop region samples loaded in **55–264 ms** with the HTTP cache disabled and local server retained. Long-route UI time was **11–195 ms** and regional Analyze took **13–637 ms** in the same loopback run. Per-region ready heap after repeated switching varied from approximately **71–172 MiB**. A Metro Manila pan plus zoom rendered in **62 ms**. The 390 × 844, 4× CPU-throttled profiles for Cebu, Leyte–Samar, southern NCR and Central Singapore measured **109–848 ms** for graph switching and **42–464 ms** for long routing. These are individual workload measurements from the same Mac. Physical phones were not profiled.

The offline rehearsal reproduced the **5,356.37 m / 396.833 s** open route, the four original search-event counts, and the exact one-segment closure at zoom 18. The detour was **5,749.64 m / 571.840 s**, with **6,180** incremental events versus **11,524** for fresh LPA*. Dijkstra agreed, reopening restored the original cost, and General Luna Avenue remained the top tested link with **15 of 36** trips. Browser wall time was about **2.70 s** for the scripted sequence after startup, **448 ms** to apply and display the detour, and **594 ms** for Analyze. [Presentation fixture and complete procedure](../PRESENTATION.md)

All **30 Node tests** passed. The blocked-network Chrome suite tested cold local libraries and fonts, nationwide and regional place search, map panning and zooming, the world overview, regional graph switching, shortest and fastest routing, all four algorithms, playback, logo and line/area closures, overlap, reopening, touch emulation, corrupted graph checksum recovery, and missing-map emergency rendering. All 23 graph assets loaded and routed during the suite, including the default graph. The browser began with an empty temporary profile and disallowed every non-local HTTP request through the test interceptor. Startup made zero external attempts. Some later steps intentionally tested failed online requests. In a separate online run, simulated connectivity loss and recovery preserved the camera, endpoints, current route, and active closure overlay.

An initial browser run caught a stale Leaflet callback during archive switching. Removing the layer before clearing its handlers fixed the crash. The full offline and online suites passed after the fix.

```sh
node --test tests/network.test.mjs tests/regions.test.mjs tests/offline-assets.test.mjs
BROWSER_BASE_URL=http://127.0.0.1:8000/ CHOKEPOINT_OFFLINE=1 REGION_PROFILE=all node tests/routing-browser.mjs
BROWSER_BASE_URL=http://127.0.0.1:8000/ node tests/routing-browser.mjs
```

## Recreate the assets and package

The six map archives are attributed OpenStreetMap and Natural Earth from the open Protomaps **4.15.2** daily build. Use the official PMTiles CLI **1.31.2**. The extraction source records **2026-11-23 04:00 UTC**. Daily build URLs can expire. The package's local files and checksums preserve the exact tested output. Public basemap tiles from the online Streets and imagery providers were not copied. [Protomaps source](https://docs.protomaps.com/basemaps/downloads) · [PMTiles CLI](https://docs.protomaps.com/pmtiles/cli)

```sh
source_url=https://build.protomaps.com/20261123.pmtiles
pmtiles extract "$source_url" assets/maps/world.pmtiles --maxzoom=5
pmtiles extract "$source_url" assets/maps/panay.pmtiles --bbox=121.34,10.35,123.39,12.18 --maxzoom=15
pmtiles extract "$source_url" assets/maps/singapore.pmtiles --bbox=103.79,1.23,103.92,1.38 --maxzoom=15
pmtiles extract "$source_url" assets/maps/luzon.pmtiles --bbox=117.40,12.00,125.15,21.45 --maxzoom=14
pmtiles extract "$source_url" assets/maps/visayas.pmtiles --bbox=116.75,9.00,126.20,12.40 --maxzoom=14
pmtiles extract "$source_url" assets/maps/mindanao.pmtiles --bbox=116.75,4.45,127.15,9.65 --maxzoom=14
(cd assets/maps && shasum -a 256 -c SHA256SUMS)

node --max-old-space-size=4096 scripts/extract-regional-places.mjs \
  "$work/philippines.osm.pbf" "$work" "$place_output"
node scripts/extract-regional-places.mjs \
  "$work/singapore.osm.pbf" "$work" "$place_output" singapore
python3 scripts/package-offline.py ../CHOKEPOINT-Demo-2026-11-25
```

The place extractor uses the existing offline `osm-pbf-parser@2.3.0` preparation dependency. Source hashes are verified against the graph manifest. Extraction emits the per-index record counts and SHA-256 values for updating the place catalog. The package excludes Git metadata, raw files, and development caches.
