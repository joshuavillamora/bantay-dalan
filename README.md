# CHOKEPOINT

**Road Network Analysis & Resilience**

CHOKEPOINT is a CC 204 Data Structures and Algorithms project focused on Iloilo. It uses a local OpenStreetMap-derived road graph to find routes, compare pathfinding algorithms, simulate closures, replan routes, and rank critical road links for sampled trips.

## Run locally

From this directory, start a local server and open [http://localhost:8000](http://localhost:8000).

```sh
python3 -m http.server 8000
```

The browser loads Leaflet from a CDN. The default street layer uses [OpenStreetMap Standard tiles](https://operations.osmfoundation.org/policies/tiles/) at native zoom levels through 19. If tiles are unavailable, the map shows the local roads and selected Iloilo landmarks.

For a lighter raster style with native high-DPI tiles, supply a public, site-restricted key in `CARTO_API_KEY` in `js/config.js`. The app uses [CARTO Positron](https://carto.com/basemaps/) with native `@2x` tiles on high-DPI displays. The default OpenStreetMap service sends standard-resolution tiles at each zoom, and search overlays size their canvas to the display’s pixel ratio.

### Map styles and imagery

- **Streets** uses labeled OpenStreetMap tiles, with the local road and landmark layer as a fallback. The optional CARTO configuration still applies to Streets.
- **Satellite** uses Stadia’s imagery-only JPEG tiles. They are 512 × 512 pixels and served through provider zoom 18. At standard display density, Leaflet uses a 512-pixel tile grid with a one-level URL offset. High-DPI displays use those pixels in 256-pixel slots up to zoom 18. At map zoom 19 the imagery remains capped at provider zoom 18.
- **Hybrid** uses Stadia’s labeled Alidade Satellite raster tiles and requests the provider’s `@2x` variant on high-DPI displays. The map caps both photo styles at zoom 19. Image sharpness and capture date depend on the source imagery. A tile zoom or pixel count alone does not establish ground resolution or capture date.

[Stadia’s localhost development access](https://docs.stadiamaps.com/authentication/#local-development) enables Satellite and Hybrid at `localhost` and `127.0.0.1` without a key. It has strict rate limits. Under this configuration, other hosts show Streets and disable the two photo options. Hosted satellite access requires an eligible [Stadia plan](https://stadiamaps.com/pricing/) and domain authorization. Style switches leave the trip and camera in place. An imagery failure falls back to Streets or the local network when street tiles are also unavailable. Keep the provider credits visible. [Tile specifications and credits](https://docs.stadiamaps.com/map-styles/alidade-satellite/)

Browser samples around Plaza Libertad and SM City Iloilo showed roofs, road layouts, and readable Hybrid road names. Both 512-pixel imagery and `@2x` Hybrid tiles loaded at the sampled coordinates. Cloud cover obscured parts of the city at overview zoom. Capture dates and ground sampling distances for the Stadia samples were unavailable. Google’s public map showed additional business labels near Plaza Libertad. An in-app Google satellite or hybrid integration requires a billing-enabled Google Maps Platform project. Esri World Imagery’s Plaza Libertad request was unreachable in the test browser, and its legacy raster service is deprecated. [Esri service documentation](https://developers.arcgis.com/esri-leaflet/api-reference/layers/basemap-layer/) · [Google Maps Tile API billing](https://developers.google.com/maps/documentation/tile/usage-and-billing)

Select an A or B pin and choose **View street in Google Maps**. The [Google Maps URL](https://developers.google.com/maps/documentation/urls/get-started#street-view-action) opens the nearest available panorama in a separate tab or the Maps app. **Open location map** is available when a panorama is missing or too far from the selected place. The app sends the selected coordinates to Google only when you follow one of these links.

## Workbench

- **Route** starts with Plaza Libertad and SM City Iloilo. Search, swap, use your location, or select **Pick A** or **Pick B**. **Find route** uses either modeled road distance or estimated travel time with fixed road speeds.
- **Disrupt** lets you draw a line across roads and highlights the actual disabled segments. Reopen individual closures, undo the most recent active closure, or clear all. Route impact compares the current result with the last completed route before the closure edits for the same endpoints and cost mode.
- **Analyze** ranks road links under the current closures. Rank is based on the extra estimated travel time across affected sampled trips, plus a 30-minute penalty per trip that becomes unreachable. Select a ranked link to preview it. **Simulate** applies the closure separately.
- **Compare** offers **Bidirectional Dijkstra**, **A\*** and **LPA\***. **Visualize search** animates the selected algorithm's expansion events. **Run comparison** measures each fresh search and checks its optimal cost against **Dijkstra (baseline)** on the same endpoints, cost mode and active closure scenario. Comparison results have their own status. If the map cannot draw a route, Route still shows its calculated distance and estimated time. LPA* repairs appear separately when an existing search for the same trip is updated.

### Geographic coverage

Iloilo City remains the study area for the sample trips and CHOKEPOINT analysis. The bundled road graph now covers modeled roads across **Panay and Guimaras**, including parts of outlying islands. Connected roads can be routed across province boundaries. Search can also return locations elsewhere.

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

Focus an endpoint field or clear its contents to see four suggested places. Typing searches a bundled OpenStreetMap index of named places in Iloilo City and the saved places immediately. After at least three characters and a typing pause, online search can add matches from farther away. Use **↑** or **↓** and **Enter** to choose a suggestion. **Escape** restores the confirmed endpoint. Use **Pick A** or **Pick B** to place a point directly on the map.

On `localhost` and `127.0.0.1`, the search uses Stadia Maps’ keyless development autocomplete with OpenStreetMap data. Other hosts use Photon’s public demo server. Both requests use Iloilo City as a ranking preference and allow results beyond the study area. The app favors equally relevant matches near modeled roads. Search still depends on what providers index and return. Public Photon permits reasonable use and gives no uptime guarantee, and Stadia’s keyless endpoint has strict local rate limits. The app debounces requests, briefly caches results, and pauses online requests for 30 seconds after a provider failure. Saved places and map picking work during the pause. [Stadia local authentication](https://docs.stadiamaps.com/authentication/#local-development) · [Stadia autocomplete](https://docs.stadiamaps.com/geocoding-search-autocomplete/autocomplete/) · [Photon search and location bias](https://github.com/komoot/photon/blob/master/docs/api-v1.md) · [Photon public use](https://github.com/komoot/photon#demo-server)

Pins mark the selected coordinates. Routing uses nearby vertices in the bundled graph and shows the straight-line offset in the endpoint field. Snapping looks for the nearest modeled road segment within 250 m of the pin and uses a vertex on that segment. The vertex can be farther along a sparsely sampled road, up to 1.5 km from the pin. This distance check cannot verify barriers such as waterways or private access. Routes cover only the modeled roads between the snapped vertices. The saved airport location is at the mapped terminal-side parking area.

If both pins snap successfully, direction and closures determine whether a route exists. When a trip fails under active closures, CHOKEPOINT checks whether it would succeed on the base graph before reporting a closure-related disruption.

### Map navigation

- Drag the map to pan. In Route, drag the A or B pin to change that endpoint. While a pick or closure tool is active, clicks and taps on overlays are available to the tool.
- A mouse wheel or two-finger scroll pans the map. Hold **Ctrl** while scrolling to zoom, or switch **Scroll pans** to **Scroll zooms** for wheel-only zoom.
- On a touchscreen, drag to pan and pinch to zoom. Desktop trackpad pinch zooms on browsers that expose it as **Ctrl** + wheel. Safari on macOS can reserve an outward pinch for its [tab overview](https://bugs.webkit.org/show_bug.cgi?id=233141). The map’s **+** and **−** buttons work independently of gesture support.
- With the map focused, use the arrow keys to pan and **+** or **−** to zoom. After activating a pick or closure tool, press **Enter** to use the map center or **Escape** to cancel.

CHOKEPOINT ranks tested links for the configured landmark sample. Verified hospital accessibility is pending.

## Regression checks

```sh
node --test tests/network.test.mjs
```

The tests use the bundled Panay and Guimaras network. They cover endpoint snapping, route-cost agreement, closures and reopening, isolated endpoints, LPA* repair state, and CHOKEPOINT scoring and cancellation. See the [computational validity audit](data/routing-audit.md) for the distance formula, static speed assumptions, test fixtures, and repeated computation-only benchmarks.

With the local server running, use Node.js 24 and Chrome to check the interactive route workflow.

```sh
node tests/routing-browser.mjs
```

Set `CHROME_BIN` if Chrome is installed in a different location. The script checks the default A* trip, Leaflet route rendering, playback and cancellation, comparisons, closures and LPA* repair, and the CHOKEPOINT branding at desktop and mobile-sized viewports. It also simulates rendering errors to check that valid route and comparison results remain available.

See the [performance report](data/performance.md) for the browser measurements and instructions for regenerating the Iloilo City place index.

## Structure

| Path | Responsibility |
| --- | --- |
| `index.html`, `css/style.css` | Workbench structure, map layout and responsive styles |
| `data/panay-roads.json.gz` | Compressed road snapshot derived from Geofabrik OSM data |
| `scripts/` | Offline extraction, connectivity audit, and reproducible benchmarks |
| `js/main.js`, `js/config.js`, `js/state.js`, `js/events.js` | Startup, settings, shared state and feature events |
| `js/graph/` | Directed road graph, snapping, costs and closure filtering |
| `js/core/`, `js/algorithms/` | Priority queues and four search implementations. A* and Dijkstra share `best-first.js`. |
| `js/analysis/` | Sampled CHOKEPOINT calculations |
| `js/features/` | Route, closures, place search, analysis, comparison and playback interactions |
| `js/map/` | Leaflet tiles, local roads, markers and result overlays |
| `js/ui/`, `js/utils/` | Workspace navigation, summaries and shared helpers |

Algorithms and graph processing are independent of the DOM and Leaflet. Search generators yield expansion events and return a path or `null`.
