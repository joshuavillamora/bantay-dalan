# CHOKEPOINT

**Road Network Analysis & Resilience**

CHOKEPOINT is a CC 204 Data Structures and Algorithms project that started in Iloilo. It uses OpenStreetMap-derived road graphs to find routes, compare pathfinding algorithms, simulate closures, replan routes, and rank critical road links for sampled trips.

See the [two-minute presentation guide](PRESENTATION.md) for the verified experiment and [the handover](HANDOVER.md) for test results, regional benchmarks, and implementation status.

## Run locally

From this directory, start the local server. Open [CHOKEPOINT offline](http://127.0.0.1:8000/?offline=1) for the demonstration, or [CHOKEPOINT online](http://127.0.0.1:8000/) for the online basemaps and Photon. Serve hosted copies over HTTPS so the browser can verify the dataset checksums.

```sh
python3 scripts/serve.py --port 8000
```

The package serves Leaflet, IBM Plex Sans, icons, and graph assets locally. IBM Plex Sans uses four WOFF2 weights from IBM’s `@ibm/plex-sans` 2.0.0 release under the SIL Open Font License 1.1. [IBM Plex](https://github.com/IBM/plex) · [Bundled font license](assets/vendor/plex-sans/LICENSE)

**Offline map** reads detailed vector tiles in byte ranges. If the local archives are unavailable, the map can draw the active modeled roads and overlays. The online street layer continues to use OpenStreetMap Standard tiles. [Offline package, map coverage and verification](data/offline.md) · [OpenStreetMap tile policy](https://operations.osmfoundation.org/policies/tiles/)

For a lighter raster style with native high-DPI tiles, supply a public, site-restricted key in `CARTO_API_KEY` in `js/config.js`. The app uses [CARTO Positron](https://carto.com/basemaps/) with native `@2x` tiles on high-DPI displays. The default OpenStreetMap service sends standard-resolution tiles at each zoom, and search overlays size their canvas to the display’s pixel ratio.

### Map styles and imagery

- **Streets** uses labeled OpenStreetMap tiles. The optional CARTO configuration still applies to Streets.
- **Offline map** draws locally prepared vector streets, buildings, water and geographic labels where available. Panay and Singapore have native zoom-15 data, and the broader Philippine archives have native zoom-14 data.
- **Satellite** uses Stadia’s imagery-only JPEG tiles. They are 512 × 512 pixels and served through provider zoom 18. At standard display density, Leaflet uses a 512-pixel tile grid with a one-level URL offset. High-DPI displays use those pixels in 256-pixel slots up to zoom 18. At map zoom 19 the imagery remains capped at provider zoom 18.
- **Hybrid** uses Stadia’s labeled Alidade Satellite raster tiles and requests the provider’s `@2x` variant on high-DPI displays. The map caps both photo styles at zoom 19. Image sharpness and capture date depend on the source imagery. A tile zoom or pixel count alone does not establish ground resolution or capture date.

[Stadia’s localhost development access](https://docs.stadiamaps.com/authentication/#local-development) enables Satellite and Hybrid at `localhost` and `127.0.0.1` without a key. It has strict rate limits. Under this configuration, other hosts show Streets and disable the two photo options. Hosted satellite access requires an eligible [Stadia plan](https://stadiamaps.com/pricing/) and domain authorization. Style switches leave the trip and camera in place. An imagery failure falls back to Streets or the local network when street tiles are also unavailable. Keep the provider credits visible. [Tile specifications and credits](https://docs.stadiamaps.com/map-styles/alidade-satellite/)

Browser samples around Plaza Libertad and SM City Iloilo showed roofs, road layouts, and readable Hybrid road names. Both 512-pixel imagery and `@2x` Hybrid tiles loaded at the sampled coordinates. Cloud cover obscured parts of the city at overview zoom. Capture dates and ground sampling distances for the Stadia samples were unavailable. Google’s public map showed additional business labels near Plaza Libertad. An in-app Google satellite or hybrid integration requires a billing-enabled Google Maps Platform project. Esri World Imagery’s Plaza Libertad request was unreachable in the test browser, and its legacy raster service is deprecated. [Esri service documentation](https://developers.arcgis.com/esri-leaflet/api-reference/layers/basemap-layer/) · [Google Maps Tile API billing](https://developers.google.com/maps/documentation/tile/usage-and-billing)

Select an A or B pin and choose **View street in Google Maps**. The [Google Maps URL](https://developers.google.com/maps/documentation/urls/get-started#street-view-action) opens the nearest available panorama in a separate tab or the Maps app. **Open location map** is available when a panorama is missing or too far from the selected place. The app sends the selected coordinates to Google only when you follow one of these links.

## Workbench

- **Route** starts with Plaza Libertad and SM City Iloilo. Search, swap, use your location, or select **Pick A** or **Pick B**. **Find route** uses either modeled road distance or estimated travel time with fixed road speeds.
- **Disrupt** previews and applies line or area selections to modeled roads. Reopen a closure, undo the most recent active closure, or clear all. Route impact compares the current result with the last completed route before the closure edits for the same endpoints and cost mode.
- **Analyze** ranks road links under the current closures. Rank is based on the extra estimated travel time across affected sampled trips, plus a 30-minute penalty per trip that becomes unreachable. Select a ranked link to preview it. **Simulate** applies the closure separately.
- **Compare** offers **Bidirectional Dijkstra**, **A\*** and **LPA\***. **Visualize search** animates the selected algorithm's expansion events. **Run comparison** measures each fresh search and checks its optimal cost against **Dijkstra (baseline)** on the same endpoints, cost mode and active closure scenario. Comparison results have their own status. If the map cannot draw a route, Route still shows its calculated distance and estimated time. LPA* repairs appear separately when an existing search for the same trip is updated.

### Draw a road closure

1. Open **Disrupt → Draw closure** and choose **Line** or **Area**.
2. Click or drag the header logo onto the map to activate drawing. **Use drawing tool** activates the same mode on mouse and touch. Draw across roads in Line mode, or finish your Area loop near its starting point.
3. Review the highlighted segments and count. **Apply closure** disables those segments. **Cancel** or **Escape** discards the drawing.

Use **Two-point line** for precise endpoints or keyboard access. Click the endpoints, or move the map with the arrow keys and press **Enter** twice to select the map center at each end.

Line hits must intersect the interior of a modeled segment. A 4-pixel extension at each stroke tip helps with near misses. Area includes segments inside, touching, or crossing the loop. The selection follows the road graph geometry, and it can include both directions of an existing road. The results depend on the snapped routing vertex and the remaining traversable edges.

Red strokes show the union of active road closures. If a road belongs to more than one closure, clicking its stroke reopens the most recently applied group for that road. Roads shared with another active group remain closed. **Clear all** asks before reopening every road.

### Geographic coverage

**Panay and Guimaras** is the default road network, and Iloilo City remains the study area for the presentation and its landmark-based CHOKEPOINT analysis. Other Philippine networks load on demand. Choose two endpoints and click **Find route**, or use **Road network** to set the scope for Disrupt and Analyze. Switching keeps the pins and clears the previous network’s closures and calculated results. A trip needs both endpoints in one graph with a valid directed path. Each result is optimal within its loaded graph. See the [regional coverage report](data/regional-coverage.md) for the 18-region checklist, exact extents, and benchmark results.

| Graph measure | Original Iloilo extract | Panay and Guimaras |
| --- | ---: | ---: |
| Usable vertices | 42,791 | 492,603 |
| Directed edges | 86,652 | 1,003,602 |
| Modeled road length | 1,489.40 km | 17,280.29 km |
| Weak components, ignoring direction | 30 | 415 |
| Strong components, with two-way reachability | 141 | 756 |
| Largest weak component | 40,723 | 455,135 |
| Largest strong component | 40,572 | 454,630 |

The new graph spans **121.3464470° E to 123.3584859° E** and **10.4067564° N to 12.1312694° N**. Its Plaza Libertad round-trip component spans **121.8433192° E to 123.1623225° E** and **10.4118139° N to 11.9392232° N**.

A DPWH polygon overlay found usable vertices in all **101** included city and municipal areas. From Plaza Libertad, roads were reachable both ways in parts of all **44** included Iloilo areas, all **17** in Aklan, all **17** in Capiz, and **17 of 18** in Antique. Caluya and the five Guimaras municipalities have local roads in separate components. The largest separate component has **24,210 vertices** in Guimaras. These are vertex counts, and coverage within each municipality varies. **398** vertices fell outside the supplied polygons.

See [the data notes](data/README.md) for access rules, source hashes, reproduction commands, and the model’s limitations. See [the coverage benchmark](data/benchmark.md) for the candidate comparison and route results.

### Location search

Focus an endpoint field or clear its contents to see four suggested places. Typing searches the bundled Iloilo City OpenStreetMap index and saved places immediately. After a typing pause, online search starts from three letters or digits, or two for Chinese, Japanese, and Korean scripts. Use **↑** or **↓** and **Enter** to choose a suggestion. **Escape** restores the confirmed endpoint. Use **Pick A** or **Pick B** to place a point directly on the map.

Offline search also loads a nationwide Philippine locality index and a regional index on demand. Pan to the region or choose a nearby locality to search for regional streets, schools, hospitals, and other named places. The presentation URL uses local search only. [Prepared place indexes and limitations](data/offline.md)

Online autocomplete uses Photon's public OpenStreetMap service with Iloilo City as a ranking preference and no geographic filter. It can find countries, cities, streets, landmarks and addresses that the provider indexes. Country and regional labels distinguish similarly named places. CHOKEPOINT debounces queries, cancels stale requests, limits starts to one per second per session, and briefly caches results. Saved places and map picking remain available during service failures. Photon may throttle heavy use and offers no uptime guarantee. [Photon search and location bias](https://github.com/komoot/photon/blob/master/docs/api-v1.md) · [Photon public use](https://github.com/komoot/photon#demo-server)

Pins mark the selected coordinates. Routing uses nearby vertices in the selected graph and shows the straight-line offset in the endpoint field after loading. Snapping looks for the nearest modeled road segment within 250 m of the pin and uses a vertex on that segment. The vertex can be farther along a sparsely sampled road, up to 1.5 km from the pin. This distance check cannot verify barriers such as waterways or private access. Routes cover only the modeled roads between the snapped vertices. The saved airport location is at the mapped terminal-side parking area.

If both pins snap successfully, direction and closures determine whether a route exists. When a trip fails under active closures, CHOKEPOINT checks whether it would succeed on the base graph before reporting a closure-related disruption.

### Map navigation

- Selecting a search result centers the world map on that place. Use **Return to Iloilo City** beside the map-style control to return to the study area. Places outside the loaded graph can still be explored and pinned.
- Drag the map to pan. In Route, drag the A or B pin to change that endpoint. While a pick or closure tool is active, clicks and taps on overlays are available to the tool.
- A mouse wheel or two-finger scroll pans the map. Hold **Ctrl** while scrolling to zoom, or switch **Scroll pans** to **Scroll zooms** for wheel-only zoom.
- On a touchscreen, drag to pan and pinch to zoom. Desktop trackpad pinch zooms on browsers that expose it as **Ctrl** + wheel. Safari on macOS can reserve an outward pinch for its [tab overview](https://bugs.webkit.org/show_bug.cgi?id=233141). The map’s **+** and **−** buttons work independently of gesture support.
- With the map focused, use the arrow keys to pan and **+** or **−** to zoom. After activating an endpoint pick or the **Two-point line**, press **Enter** to use the map center. Press **Escape** to cancel picking or drawing.

CHOKEPOINT ranks tested links for the configured landmark sample. Verified hospital accessibility is pending.

## Regression checks

```sh
node --test tests/network.test.mjs tests/regions.test.mjs tests/offline-assets.test.mjs
```

The tests use the bundled Panay and Guimaras network. They cover endpoint snapping, route-cost agreement, closures and reopening, isolated endpoints, LPA* repair state, and CHOKEPOINT scoring and cancellation. See the [computational validity audit](data/routing-audit.md) for the distance formula, static speed assumptions, test fixtures, and repeated computation-only benchmarks.

With the local server running, use Node.js 24 and Chrome to check the interactive route workflow.

```sh
node tests/routing-browser.mjs
CHOKEPOINT_OFFLINE=1 REGION_PROFILE=all node tests/routing-browser.mjs
```

Set `CHROME_BIN` if Chrome is installed in a different location. The script checks the default A* trip, Leaflet route rendering, playback and cancellation, comparisons, closures and LPA* repair, and the CHOKEPOINT branding at desktop and mobile-sized viewports. It verifies that the browser renders IBM Plex Sans from local files and simulates rendering errors to check that valid route and comparison results remain available. [Final visual and code review](data/refinement-review.md)

See the [performance report](data/performance.md) for the browser measurements and instructions for regenerating the Iloilo City place index.

## Structure

| Path | Responsibility |
| --- | --- |
| `index.html`, `css/style.css` | Workbench structure, map layout and responsive styles |
| `css/fonts.css`, `assets/vendor/plex-sans/` | Local IBM Plex Sans faces and SIL Open Font License |
| `data/panay-roads.json.gz` | Compressed road snapshot derived from Geofabrik OSM data |
| `data/regions/` | Versioned regional road assets and their generated manifest |
| `scripts/` | Offline extraction, connectivity audit, and reproducible benchmarks |
| `js/main.js`, `js/config.js`, `js/state.js`, `js/events.js` | Startup, settings, shared state and feature events |
| `js/graph/` | Directed road graph, snapping, costs and closure filtering |
| `js/core/`, `js/algorithms/` | Priority queues and four search implementations. A* and Dijkstra share `best-first.js`. |
| `js/analysis/` | Sampled CHOKEPOINT calculations |
| `js/features/` | Route, closures, place search, analysis, comparison and playback interactions |
| `js/map/` | Leaflet tiles, local roads, markers and result overlays |
| `js/ui/`, `js/utils/` | Workspace navigation, summaries and shared helpers |

Algorithms and graph processing are independent of the DOM and Leaflet. Search generators yield expansion events and return a path or `null`.
