# CHOKEPOINT interface standardization

This pass is a local working-tree change on `ui/bantay-dalan-redesign`, based on `b698a04`. It is pending review. The earlier implementation is available on GitHub main through PR #2. The previously verified portable presentation folder remains a separate backup.

## Interface rules

Named interface elements use conventional Title Case, including Plan a Route, Road Closures, Critical Roads, Compare Algorithms, Routing Objective, Comparison Results, Route Summary, About Measurements, and Map Legend. Descriptions, errors, status messages, and complete-sentence tooltips use sentence case. Geographic names, CHOKEPOINT, and algorithm acronyms retain their established capitalization.

Compare displays Bidirectional Dijkstra, A*, LPA*, and Dijkstra, with a separate Baseline label. The selected objective and closure count appear in neutral text above the verification message. Cost agreement, individual disagreements, and unreachable outcomes still come from the calculated results. About Measurements explains newly initialized comparison searches, repeated event processing, single-run timing, repeated benchmark medians, and separate LPA* repair. Dedicated repair results call the comparable newly initialized search Full Recalculation.

Route, Route Summary, individual comparison totals, and Route Impact use shared display formatters. Kilometres and estimated minutes use two decimal places. Sub-kilometre distances use whole metres. Internal costs retain their full precision. Snapping remains a separate whole-metre supporting measurement.

The pale-blue totals backgrounds, colored measurement borders, blue ordinary numbers, violet ranking badges, zebra stripes, yellow status accent, and tinted repair panel were removed. Ordinary closure notices use neutral text. Preview and destructive confirmation prompts retain their functional emphasis.

## Regional display names

The native Road Network select has four optgroups. All 23 dataset IDs are represented once, and Panay and Guimaras remains the startup selection. Presentation labels are held in `js/ui/region-labels.js`. The generated manifest, source identities, graph data, extraction parameters, and checksums retain their existing values.

| Group | Display names |
| --- | --- |
| Luzon | Metro Manila · Southern Manila and Northern CALABARZON · Laguna and Quezon · Pampanga and Nueva Ecija · Southern Cordillera and La Union · Coastal Ilocos · Northern Cagayan Valley · Bicol Peninsula · Mindoro · Palawan |
| Visayas | Panay and Guimaras · Northern Negros · Southern Negros · Cebu and Mactan · Bohol and Siquijor · Leyte, Biliran and Samar |
| Mindanao | Northern Zamboanga Peninsula · Southern Zamboanga Peninsula · Misamis Oriental and Agusan · Davao Gulf · Sarangani and South Cotabato · Cotabato and Maguindanao |
| International | Central Singapore |

The labels replace extraction wording such as “window,” “adjoining roads,” and the longer corridor labels. Network Coverage provides the selected extract’s rounded geographic bounds and states that coverage is limited to modeled roads inside that extent. Province names identify the prepared network. Coverage can end inside those provinces. Ferries and routes across separate datasets remain unavailable. Display names also appear in loading progress, regional search context, endpoint feedback, and analysis scope.

## Typography and colors

The existing local IBM Plex Sans files and license are retained. CSS defines shared 12, 13, 14, 16, and 24 px sizes. The wordmark and desktop workspace headings use 24 px / 700. Section headings use 16 px / 600, form labels 14 px / 500, body and input text 14 px / 400, table headings 13 px / 600, algorithm names 13 px / 500, table values 13 px / 400, primary measurements 24 px / 600, and supporting text 12–13 px. Secondary actions use medium weight. Measurements use tabular numerals.

The palette uses signal yellow `#FFC83D`, charcoal `#191E24`, white `#FFFFFF`, workspace neutral `#F6F7F8`, muted text `#52606C`, and borders `#DCE1E5`. Established route blue `#1E4BA8`, closure red `#D7263D`, forward and backward search colors, and analytical map colors retain their existing meanings. Teal `#16776D` is reserved for cost verification. Normal snapping information and analytical quantities use neutral text.

Chrome verified all four local font requests and actual IBM glyph faces on the header, navigation, workspace controls, Help, benchmark figures, status, and Leaflet controls. The offline test used a fresh browser profile with cache disabled and all non-local requests blocked.

## Measured layout

| Viewport | Header height | Rail width or mobile row | Workspace width | Workspace header height | Standard controls | Primary action |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1440 × 900 | 64 px | 72 px | 380 px | 64 px | 44 px | 46 px |
| 1024 × 576 | 64 px | 72 px | 380 px | 64 px | 44 px | 46 px |
| 768 × 720 | 64 px | 65 px | 315 px | 64 px | 44 px | 46 px |
| 390 × 844 | 56 px | 390 px row | 390 px | 44 px | 44 px | 46 px |
| 320 × 568 | 56 px | 320 px row | 320 px | 44 px | 44 px | 46 px |

At each viewport the four workspaces had equal bounds, heading positions, action-area bounds, map bounds, and camera coordinates. Tests compared these values during actual navigation. Desktop panel content uses 20 px horizontal padding, the narrow desktop uses 15 px, and phone workspaces use 13 px. The desktop action area measures 71 px high. Hiding the workspace increases the map area, and showing it restores the layout.

Native select, text input, map style, map buttons, swap, and endpoint-picking controls measure 44 px high on desktop. The two map icon buttons measure 44 × 44 px. Primary buttons measure 46 px high. The scroll-wheel button is intentionally hidden under touch emulation.

## Executed verification

| Command or check | Actual result |
| --- | --- |
| `node --test tests/network.test.mjs tests/regions.test.mjs tests/offline-assets.test.mjs` | 30/30 passed before and after. |
| `node scripts/audit-routing.mjs` | All 38 audit records matched the baseline after excluding wall-clock fields. |
| `BROWSER_BASE_URL=http://127.0.0.1:8043/ CHOKEPOINT_OFFLINE=1 REGION_PROFILE=all node tests/routing-browser.mjs` | Final suite passed, including default Panay and all 22 additional graph profiles, offline maps, local search, regional analysis, closures, playback, failure recovery, and the five viewport sizes. |
| `BROWSER_BASE_URL=http://127.0.0.1:8043/ node tests/routing-browser.mjs` | Final suite passed online search, imagery, connectivity recovery, routing, closures, comparison, and regional workflows. |
| Nonpersistent macOS WebKit offline smoke | Four local font weights, detailed local map, Help, the route, four benchmark rows, four regional groups, and a 380 px workspace with 64 px headers passed. |
| Responsive and accessibility checks | Stable workspace geometry and camera, focus visibility, keyboard Help and Escape restoration, touch selection and drawing, meaningful disabled controls, readable wrapped names, and no page-level horizontal overflow passed. |

One online test attempt failed when Chrome reported `Invalid InterceptionId` while the test interceptor handled an already cancelled request. The complete rerun passed. New dimension assertions were corrected to compare heading positions rather than the widths of different words and to set desktop or touch emulation to match each viewport. Existing route and cost assertions were retained. Copy expectations were updated for the requested labels, and checks were added for grouped IDs, consistent route precision, and tied observations.

The measured final cold offline startup was 429 ms with 95.6 MiB of collected JS heap. The baseline run measured 496 ms with 95.5 MiB. Both read 250,222 bytes in nine initial map range requests. These single runs establish successful startup, with wall-clock timing dependent on workload.

### Presentation results

The offline Plaza Libertad → SM City Iloilo trip reproduced 5,356.37 m and 396.833 s. The four event counts remain 4,939, 5,548, 5,548, and 8,730. The documented closure produced 5,749.64 m and 571.840 s, with 6,180 LPA* repair events versus 11,524 for full recalculation. Dijkstra agreed, reopening restored the original trip, and General Luna Avenue again affected 15 of 36 sampled trips.

## Screenshots and limitations

The sibling `CHOKEPOINT-Standardization-Review` folder contains before and after Route, Disrupt, Analyze, Compare, and Help screenshots. It also contains the final regional and map-style controls, closure preview, paused and unreachable states, phone-sized workspaces, and raw verification logs. Native selectors are captured focused in the app. The tests inspect their actual optgroups and options. The OS popup menu’s exact appearance depends on the browser and operating system.

Safari application automation remains disabled on this Mac. WebKit smoke coverage is recorded separately. Physical mobile devices and a physical projector were outside this verification. External raster labels and the local basemap renderer keep their own text rendering.

## Modified files

- Layout and markup — `css/style.css`, `index.html`.
- Presentation — `js/ui/region-labels.js` (new), `js/ui/dashboard.js`, `js/ui/results-table.js`, `js/ui/workspace.js`, `js/utils/format.js`.
- Feature labels and regional display — `js/features/chokepoints.js`, `js/features/closure-tool.js`, `js/features/closures.js`, `js/features/comparison.js`, `js/features/offline-places.js`, `js/features/place-search.js`, `js/features/route-points.js`, `js/features/routing-region.js`.
- Map labels — `js/map/basemaps.js`, `js/map/map.js`, `js/map/markers.js`, `js/map/route-view.js`.
- Verification and documentation — `tests/routing-browser.mjs`, `README.md`, `PRESENTATION.md`, `HANDOVER.md`, and this report.

The changes use the existing dependencies and local assets. The working tree remains available for review.

## Startup follow-up

A reported stall on Loading road network was investigated after this pass. The server delivered the 5,166,082-byte graph in about 3 ms, and a fresh cold Chrome session initialized the graph and detailed map in 414 ms. Chrome allowed identification of the affected local tab but blocked JavaScript inspection through Apple Events. Its original console error remains unconfirmed.

Previously, a missing module or incompatible cached export could prevent main from running and leave the static loading message visible. The new `js/bootstrap.js` catches import and initialization failures and offers Reload Application. `index.html` uses that entry point, and `scripts/serve.py` sends Cache-Control no-cache for application resources so reloads revalidate local files. PMTiles responses retain their existing range and cache handling. The browser suite includes deliberately missing and stale-module cases followed by reload and route calculation.
