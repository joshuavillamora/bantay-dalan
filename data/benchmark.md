# Road coverage benchmark

These are the original expansion measurements. The [computational validity audit](routing-audit.md) documents subsequent corrections and reports repeated routing timings on the current implementation.

Measured on an Apple M4 with 16 GiB RAM, Node.js 24.16 and Chrome 158. Node timings are local single-process samples. Routing timings are medians of three runs on the same endpoints and weight mode. The browser test used the same frontend for each candidate, a 390 × 844 emulated viewport, 4× CPU slowdown, a 10 Mbps downstream cap, and 70 ms added latency. It was an emulation rather than a physical phone test.

| Measure | Original | Iloilo + Guimaras candidate | Panay + Guimaras selected |
| --- | ---: | ---: | ---: |
| Vertices | 42,791 | 266,147 | 492,603 |
| Directed edges | 86,652 | 541,378 | 1,003,602 |
| Weak / strong components | 30 / 141 | 279 / 569 | 415 / 756 |
| Modeled road km | 1,489.40 | 9,688.77 | 17,280.29 |
| Raw JSON bytes | 7,898,797 | 7,893,492 | 14,664,530 |
| Served bytes in browser check | 7,898,797 | 2,794,491 | 5,166,082 |
| Node decompression and parse | 20 ms | 29 ms | 55 ms |
| Node graph construction | 21 ms | 43 ms | 83 ms |
| Node retained graph + reverse adjacency, before spatial lookup | 24.7 MiB | 122.6 MiB | 226.5 MiB |
| Emulated Chrome road asset fetch | 6.51 s | 2.41 s | 4.30–4.33 s |
| Emulated Chrome page ready | 10.55 s | 3.85 s | 5.95–8.57 s |
| CHOKEPOINT, 36 sampled trips and 40 links | 337 ms | 820 ms | 1,050 ms |

The original browser transfer above used the raw asset. Its hypothetical gzip size with the same compression level is 893,920 bytes. In the final fresh emulated Chrome run, Panay used **97.7 MiB** of JavaScript heap at route-ready and **172.2 MiB** after its first route. The 156.78 km Kalibo route took **664 ms** through the route button in that run, including its map update. These samples do not establish a memory ceiling for older devices.

The selected build uses compact storage, a spatial index for endpoint lookups and viewport road drawing, fixed-size adjacency rows, and updates limited to road rows touched by stored closures. Before adjacency preallocation, the same Panay graph with reverse adjacency retained **337.2 MiB** in Node. Route visualization retains bounded redraw history while live expansion counts still come from the full search. Skipping finishes the computation without painting the remaining exploration events.

## Correctness and routes

All four algorithms agreed with the Dijkstra baseline on reachability and optimal cost in both distance and time modes for the benchmark sample. Every returned path used directed edges from the tested graph. Routine CHOKEPOINT output still ranks the configured 36 sampled Iloilo trips and up to 40 candidate links. The results represent those trips.

| Trip from Plaza Libertad | Shortest distance | Bidirectional Dijkstra | A* | Fresh LPA* | Dijkstra |
| --- | ---: | ---: | ---: | ---: | ---: |
| University of San Agustin | 1.83 km | 1.58 ms | 0.61 ms | 2.89 ms | 1.59 ms |
| Dueñas Municipal Hall | 45.40 km | 20.84 ms | 6.13 ms | 17.03 ms | 32.14 ms |
| Kalibo Municipal Hall, Aklan | 156.78 km | 67.79 ms | 69.76 ms | 142.56 ms | 96.81 ms |

Other successful shortest routes from Plaza Libertad included Buray Barangay Hall (14.08 km), the airport parking area (20.81 km), Miag-ao Church (40.83 km), Bucari Elementary School (46.26 km), San Joaquin Church (53.73 km), Sara Municipal Hall (94.36 km), San Jose de Buenavista Municipal Hall (97.19 km), Roxas City Hall (112.78 km), and Carles town center (137.79 km). Dueñas Municipal Hall to Pototan Town Hall is **14.82 km**. The fixture records exact coordinates from local presets and mapped geocoder results. [Pototan Town Hall in OpenStreetMap](https://www.openstreetmap.org/way/169317629)

The separately measured airport LPA* search took **20.91 ms** initially. Closing a modeled link and repairing took **17.38 ms**, visiting **22,773** vertices. A fresh LPA* computation on the same closed graph took **76.12 ms** and agreed on cost. This is one closure example, and other closures can require more work. Reopening restored the initial path. In Chrome, closing all departure edges for the existing Dueñas trip made it unreachable and the route returned on reopening.

Offshore test pins failed the nearby-road check. Quezon Memorial Circle was searchable and outside the routing coverage. Jordan Public Market to Jordan Municipal Hall is **0.94 km** within Guimaras, and the graph has no route between Guimaras and Panay. The final test passed all **13** Node checks. Browser checks covered the bundled gzip, keyboard confirmation of a Dueñas search result, closure and reopening, endpoint failure messages, four-way comparison, animated expansion counts, and saved-place fallback after a simulated provider failure.

## Files changed for this expansion

- Data and documentation — `data/iloilo-roads.json` (replaced), `data/panay-roads.json.gz`, `data/README.md`, `data/benchmark.md`, `README.md`.
- Application — `js/config.js`, `js/graph/road-graph.js`, `js/graph/road-spatial.js`, `js/graph/closure-filter.js`, `js/features/comparison.js`, `js/features/geocoding.js`, `js/features/place-search.js`, `js/features/route-points.js`, `js/features/route-status.js`, `js/features/run-controller.js`, `js/map/map.js`, `js/map/explore-layer.js`.
- Extraction, audit, and tests — `scripts/extract-roads.mjs`, `scripts/osm-driving.mjs`, `scripts/audit-coverage.mjs`, `scripts/benchmark-network.mjs`, `scripts/benchmark-destinations.json`, `tests/network.test.mjs`.
