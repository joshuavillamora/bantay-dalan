# CHOKEPOINT final redesign

This records the November 24 build. The [November 25 engineering audit](master-audit.md) documents the later header, City default and administrative networks.

The redesign is in the local `chokepoint` checkout on `ui/bantay-dalan-redesign`, based on `b698a04`. The presentation still uses **Panay and Guimaras**. The optional **Iloilo City and Province** graph uses its own verified data and sampling configuration. The original working source and all six local map archives are available in `CHOKEPOINT-Redesign-Review-2026-11-24/baseline-source` beside the checkout.

## Interface and artwork

The pre-redesign build already had a map-first layout and stable workspaces. Its small line icons, full yellow navigation highlight, blue destination pin, Title Case controls, and neutral gray panels were the main points of visual change. The new layout uses warm porcelain, a graphite rail, sentence-case labels, signal-yellow actions, and a restrained tinted navigation selection. The header is 66 px, the rail is 92 px, and all four desktop workspaces are 388 px. Primary actions are 46 px and ordinary controls are 44 px. The compact and touch layouts use a narrower or stacked workspace with independent panel scrolling.

- **Route planner** shows used snapping offsets and coverage details. Metrics appear after a route is calculated.
- **Road closures** retains line and area drawing, closure preview, overlap handling, reopening, and the original-route reference. Closed segments use a high-contrast red stroke on the modeled road geometry.
- **Critical roads** shows the sampled scope, affected trips, and modeled impact. Technical link IDs and the scoring method are expandable.
- **Compare algorithms** presents optimized-cost verification, conditional shared totals, event and compute measurements, and a separate view of genuine LPA* repair. The full name Standard Dijkstra appears as the baseline and is selectable for visualization.
- **Help** presents the four core workflows and expandable details. The map controls retain attribution, viewport, and an expanded presentation view.

All seven original PNGs in `assets/icons/` match the supplied ZIP byte for byte (6,502,478 bytes). The UI serves 194,461 bytes of cropped and resampled PNG derivatives from `assets/icons/display/`.

| Source PNG | Placement |
| --- | --- |
| `logo.png` | Header, favicon and closure-tool cursor |
| `route.png` | Route rail item |
| `disrupt.png` | Disrupt rail item |
| `analyze.png` | Analyze rail item |
| `compare.png` | Compare rail item |
| `point-a.png` | Start field, Leaflet marker and map legend |
| `point-b.png` | Destination field, Leaflet marker and map legend |

Logo and rail derivatives are 168 × 168. The endpoints use identical 114 × 150 derivatives in a 38 × 50 CSS-pixel marker box. Their measured tips anchor at [18.4, 49.2] for A and [18.5, 49.2] for B. The full-size approved artwork remains replaceable independently of routing and drawing logic.

The 69,488-byte `assets/vendor/geist/Geist-Variable.woff2` is from `geist@1.9.2`. Chromium verified actual rendered Geist glyphs at four requested weights across headings, forms, controls, comparison metrics and Leaflet; WebKit verified the local variable face. There are no new runtime libraries. [Vercel Geist](https://github.com/vercel/geist-font) · [SIL Open Font License 1.1](../assets/vendor/geist/LICENSE.txt)

Measured solid-color contrast ratios were 14.63:1 for ink on porcelain, 5.40:1 for muted text on porcelain, 8.14:1 for the active rail label and 6.23:1 for blue focus on white. These are interface colors; imagery and antialiasing affect contrast over the map.

## Road networks

The picker offers 24 prepared graphs grouped into **Primary study area**, **Luzon**, **Visayas**, **Mindanao**, and **International**. It supports filtering by name or group, keyboard highlight, Enter, Escape, mouse and touch. Browsers without the modal dialog API retain the grouped select. A trip that already proved it connects in the active graph can reuse that coverage check. Route and closure evaluation continue to use the same graph and selected algorithm.

| Iloilo City and Province | Verified value |
| --- | --- |
| Source | Geofabrik Philippine OSM snapshot, 2026-11-22 21:20:48 UTC |
| Administrative scope | Independent Iloilo City plus 43 provincial municipalities and component city |
| Bounds | 122.0195687–123.3584859° E, 10.4677995–11.6378375° N |
| Vertices / directed edges | 240,324 / 488,978 |
| Weak / strong components | 290 / 585 |
| Largest weak / strong component | 235,032 / 234,645 vertices |
| Compressed graph / places | 3,223,574 bytes / 162,365 bytes for 7,618 entries |
| Graph SHA-256 | `8c3c0eeb7842fa0027b5e623eb0027a4553e5d376fb27277c832703cb7498540` |
| Reachability and costs | Nine cases checked against Standard Dijkstra, including both objectives, closures, isolated departures and one-way behavior |
| Longer fixture | Plaza Libertad to the vicinity of Iloilo International Airport, 21,900.99 m and 1,587.556 modeled seconds |
| Critical roads | Four fixed road sample points, six routed trips, 40 candidate links tested |

Municipal boundaries are applied at retained OSM vertices and through existing way splits. There are 592 blocked barrier nodes and zero missing references in retained runs. The snapshot reported 105 touching turn-restriction relations outside the existing node-and-edge model. No ferry links are modeled. Trips that leave and re-enter the study scope may require Panay and Guimaras. [Extraction and verification commands](README.md) · [Existing Philippine regional coverage](regional-coverage.md)

## Network view and online maps

**Network view** is a fifth map style in the existing Leaflet toolbar. It draws from the active graph’s spatial index into one high-DPI canvas, queries the viewport and paints in short animation-frame batches. The renderer deduplicates two-way physical segments, uses the stored edge direction, and retains the original graph for computation. Regional zoom shows the modeled faster road classes. Street zoom adds local roads, with optional vertices from zoom 16 and travel arrows from zoom 17 on segments with space for legible arrows. Search, closure and critical-road visibility controls retain the underlying results. The route, pins, closure state, playback and camera survive map-style changes.

**Streets** is the online default. **Offline map** uses local vector archives and range requests. Stadia **Satellite** and **Hybrid** remain available on localhost when the provider responds. Photo coverage and image dates vary, and the provider can rate-limit or reject requests.

### Measured samples

Measured on an Apple M4. Single-run samples include browser rendering or polling where indicated, so use the computational audit for algorithm comparisons.

| Measurement | Observed |
| --- | ---: |
| Cold Chrome, graph plus first detailed map tile, before → after | 371 → 380 ms |
| Warm reload with HTTP cache enabled, before → after | 258 → 277 ms |
| Warm reload after local Python server restart, before → after | 292 → 321 ms |
| Initial offline vector map transfers | 7 range requests, 201,889 bytes |
| Panay startup JavaScript heap after collection | about 94.5 MiB |
| Iloilo verification graph and index heap in Node | 61.5 MiB |
| Iloilo desktop Chrome network switch / route / Analyze | 114 ms / 71 ms / 53 ms |
| Iloilo browser JS heap after collection during regional walkthrough | 80.4 MiB |
| Network view, city framing, 21,729 segments | 12.0 ms paint / 33.7 ms elapsed |
| Network view, street zoom, 464 segments, 470 vertices, 275 arrows | 0.9 ms paint / 0.9 ms elapsed |
| Network view, regional overview, 1,331 segments | 28.2 ms paint / 78.3 ms elapsed |
| Offline vector pan and zoom sample | 89 ms |

## Presentation fixture

Cold Chrome used a fresh profile with HTTP cache disabled, localhost available, and every external request blocked. The full presentation workflow reproduced the established Panay results.

| Check | Reproduced |
| --- | --- |
| Plaza Libertad → SM City Iloilo | 5,356.37 m and 396.833 s |
| Open-network search events | 4,939 bidirectional, 5,548 A*, 5,548 fresh LPA*, 8,730 Standard Dijkstra |
| Exact southbound closure / Pison detour | 5,749.64 m and 571.840 s |
| LPA* incremental / fresh | 6,180 / 11,524 events, a 46.4% reduction with costs verified |
| Reopening | Restored the original optimized cost |
| Analyze | General Luna Avenue ranked first, affecting 15 of 36 sampled trips |

See [the rehearsal instructions](../PRESENTATION.md). The presentation and computational baseline maintain their original graph checksum, fixture coordinates, edge IDs and underlying algorithm code.

## Verification and evidence

- **Node:** all 30 automated tests passed. All 38 routing audit records matched the pre-redesign output after timing fields were removed.
- **Offline Chrome:** full regional and presentation tests, live vector tile pan/zoom, logo drawing including emulated touch, closure and region isolation, corrupted graph recovery, missing-map fallback, and missing/stale module recovery. Profiles routed and ran sampled analysis on all 23 selectable additional networks and the suite rehearsed Panay and Guimaras.
- **Online Chrome:** live OpenStreetMap Streets and Stadia Satellite/Hybrid tiles, geographic alignment, a blocked overseas tile fallback, and offline/online recovery passed. Discovery tests use deterministic Photon responses to test result selection, query handling, and pin alignment independently of provider latency.
- **Chrome layout and accessibility:** verified 1440 × 900, 1024 × 576, 768 × 720, 390 × 844, 320 × 568, keyboard picker selection and dismissal, Help focus, expanded map mode, and reduced-motion playback. Screenshots were visually inspected. No physical phone or assistive-technology session was used.
- **macOS WebKit:** cold localhost smoke test used a nonpersistent browser store and blocked external access. Verified local Geist, detailed offline map, Network view, picker, Help, routing and comparison. This used WKWebView rather than Safari’s desktop browser UI.
- **Visual record:** the sibling review folder contains before and after screenshots for Route, Disrupt, Analyze, Compare and Help, mobile screenshots, all five map styles, the region picker and the presentation closure. Use `before`, `after` and `online` for the full-resolution images. Measurements and command logs are under `verification`.

Run the active project from a VS Code terminal:

```sh
python3 scripts/serve.py --port 8000
```

Open [the offline presentation](http://127.0.0.1:8000/?offline=1) or [the online workbench](http://127.0.0.1:8000/). If port 8000 is occupied, choose another available port and use it in both places.

The original working-tree state is recoverable from the baseline source and patch in the sibling review folder. The previous portable demo remains independent. The sibling review folder includes a runnable `presentation-source` copy of this redesign (about 506 MiB on disk). Its local server and offline startup were verified separately. Existing working-tree changes were retained; the redesign is pending local Git review.
