# CHOKEPOINT light workbench and code review

Verified on November 24, 2026, in the local `chokepoint` checkout on `ui/bantay-dalan-redesign` at `c849541`. The full pre-change working tree is in the sibling directory `chokepoint-pre-light.ioGGvC`. It includes the untracked assets, Git metadata, and presentation data. The earlier `CHOKEPOINT-Demo-2026-11-25` folder remains a separate rehearsal backup.

The sibling `CHOKEPOINT-Light-Review` folder contains the matched before/after screenshots for Route, Disrupt, Analyze, Compare, and Help, along with the raw test logs.

## Visual changes

The previous graphite overrides applied a second palette to the header, panels, status bar, and Help. Leaflet also specified its own font, while several app markers used Plex Mono. The current workbench uses a white header, a charcoal rail with solid yellow selection, light panels and playback, and one type stack for app-controlled text. Compare uses a lightly shaded totals band and aligned numerical columns. Route keeps compact, expandable snap details, a visible route summary, and a fixed action row. Disrupt and Analyze keep the same control flow and readouts. Map layer colors, provider attribution, and map data were retained.

Four official IBM Plex Sans WOFF2 faces from `@ibm/plex-sans` 2.0.0 replace the old bundled Sans and Mono subsets. Chrome loaded weights 400, 500, 600, and 700 with the HTTP cache disabled and all external requests blocked. DevTools identified the actual custom IBM glyphs on the wordmark, subtitle, navigation, workbench headings and buttons, Help, benchmark figures, status, and Leaflet zoom controls. Input and select text also use the shared computed font. Native menu chrome, external raster labels, and labels drawn by the offline map renderer follow their own font handling. [Upstream IBM Plex](https://github.com/IBM/plex) · [Bundled SIL OFL 1.1](../assets/vendor/plex-sans/LICENSE)

Measured text contrast includes 16.77:1 on the header, 6.13:1 for muted workspace text, 10.84:1 on yellow primary controls, 7.58:1 for blue actions, and 4.90:1 for teal text on the tinted repair surface. The offline browser suite exercised the four workspaces at 1440 × 900, 1024 × 576, 768 × 720, 390 × 844, and 320 × 568, including keyboard Help, Escape focus restoration, and the expanded presentation map. Touch gestures were emulated in Chrome.

## Code review

| Area | Finding and action |
| --- | --- |
| HTML, CSS, and UI | Removed the parallel graphite cascade, retained the existing IDs and event hooks, removed unused CSS tokens, and put a static comparison class in the markup. Endpoint feedback now handles an unsupported snap first and formats a successful measured distance once. |
| Algorithms, queues, graph build, and spatial indexing | Reviewed directed edges, reverse adjacency, queue ordering, heuristic bounds, repair state, and snap eligibility. Added explanations of these invariants. All deterministic audit records matched. |
| Benchmarks, playback, and analysis | Kept method-specific search and timing boundaries. Consolidated duplicate algorithm descriptions and clarified the separate tests for shared route totals and baseline cost agreement. Verified route rendering failure recovery, stale-result cancellation, independent timing labels, and the existing criticality calculation. |
| Regions, maps, closures, and search | Reviewed graph identity, cancellation, overlap, closure group ownership, tile fallbacks, viewport rendering, and local and remote search caching. Documented why region loading waits for the old request and why reopening rebuilds the active closure union. |
| OSM preparation and repository files | The road and place extractors now share a packed source-node index. Each keeps its original coordinate precision and output formats. A fresh Leyte–Samar export and all 24 Philippine and Singapore place-index exports matched the bundled files byte for byte. The local map archive ignore rule and existing VS Code launch settings were retained. |

The local renderer currently retains a rejected startup promise if its script cannot load. The emergency road view covers the tested missing-archive case. A renderer-script failure that resolves after startup would need a page reload. Runtime behavior was preserved in this pass.

## Verification

| Executed check | Result |
| --- | --- |
| `node --test tests/network.test.mjs tests/regions.test.mjs tests/offline-assets.test.mjs` | 30 of 30 passed before and after. |
| `node scripts/audit-routing.mjs` | All 38 records matched after excluding wall-clock timings, including 26 trip and mode checks and four repair sequences. |
| `node --expose-gc scripts/verify-region.mjs <graph> <fixtures>` | 204 fixture checks passed across the 22 additional graphs, with directed reconstruction, Dijkstra agreement, closures, reopening, and sampled analysis. |
| `BROWSER_BASE_URL=http://127.0.0.1:8043/ CHOKEPOINT_OFFLINE=1 REGION_PROFILE=all node tests/routing-browser.mjs` | Cold Chrome passed across all 23 graphs, both optimization modes, playback, closures and repair, local search, offline tiles and emergency fallback, regional cancellation and checksum failure, and the exact demo. Baseline Chrome passed the same main workflow without the all-region profiling loop. |
| `BROWSER_BASE_URL=http://127.0.0.1:8043/ node tests/routing-browser.mjs` | Chrome online passed before and after, including discovery, optional imagery, connectivity recovery, and rendering error handling. |
| Local nonpersistent macOS WebKit smoke | External resources blocked. Four font weights, offline vector tiles, Help, the default route and four benchmark rows passed. Safari WebDriver declined a session because remote automation is disabled. |
| Syntax, import, asset, and diff checks | 67 maintained JS and Python files parsed. Relative module import scan found no missing targets or cycles. The Mac launcher passed shell syntax validation. All six map archive checksums and `git diff --check` passed. |

The full-page cold Chrome sample was 418 ms before and 428 ms after. A separate post-change run measured 365 ms. Both full-suite runs read 250,222 bytes across nine initial map range requests and used about 95.5 MiB of JS heap after collection. The ready observation includes the graph, visible offline tiles, and local font checks. These single-run observations do not establish a timing improvement.

### Offline presentation rehearsal

| Stage | Verified result |
| --- | --- |
| Plaza Libertad to SM City Iloilo, estimated fastest | 5,356.37 m and 396.833 s. Bidirectional Dijkstra 4,939 events, A* 5,548, LPA* fresh 5,548, Standard Dijkstra 8,730. |
| Close the documented southbound segment | Donato Pison Avenue / Pison Avenue detour. 5,749.64 m and 571.840 s, verified against Dijkstra. |
| LPA* repair and reopening | 6,180 incremental events versus 11,524 fresh on the closed graph. The original modeled cost returned after reopening. |
| Critical roads | General Luna Avenue ranked first and affected 15 of 36 sampled trips. |

The projection and phone-sized checks used viewport emulation. Physical mobile hardware, a physical projector, and the Safari app remain unverified for this pass. The range-capable local HTTP server is required for the detailed offline basemap. Browser benchmarks continue to report live measurements for each run.

## Files changed

- Interface and fonts — `index.html`, `css/style.css`, and `css/fonts.css`. Added `IBMPlexSans-Regular.woff2`, `IBMPlexSans-Medium.woff2`, `IBMPlexSans-SemiBold.woff2`, and `IBMPlexSans-Bold.woff2` in `assets/vendor/plex-sans/` and replaced its `LICENSE` with the upstream notice. Removed the old `assets/vendor/plex-sans/files/` and `assets/vendor/plex-mono/` bundles.
- Presentation code — `js/algorithms/index.js`, `js/features/algorithm-panel.js`, `js/features/route-points.js`, and `js/ui/results-table.js`.
- Comments — `js/algorithms/astar.js`, `js/algorithms/best-first.js`, `js/algorithms/bidirectional.js`, `js/algorithms/common.js`, `js/algorithms/dijkstra.js`, `js/algorithms/lpa-star.js`, `js/analysis/chokepoints.js`, `js/config.js`, `js/features/closures.js`, `js/graph/closure-filter.js`, `js/graph/regions.js`, `js/graph/road-graph.js`, and `js/utils/work-slices.js`.
- Preparation — `scripts/extract-region-samples.mjs`, `scripts/extract-regional-places.mjs`, and the new `scripts/osm-node-index.mjs`.
- Verification and records — `tests/routing-browser.mjs`, `README.md`, `HANDOVER.md`, `data/offline.md`, and this review. No runtime package dependencies were added.
