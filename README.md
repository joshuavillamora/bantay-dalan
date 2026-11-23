# Bantay Dalan

Pathfinding visualizer for Iloilo City's real road network (OpenStreetMap data).

## Run
Serve the folder (browsers block `fetch` and ES modules from `file://`):

    python -m http.server 8000      # then open http://localhost:8000

## Structure
```
index.html
css/style.css
data/iloilo-roads.json          road data (Overpass JSON, ways with geometry)
js/
  main.js                       entry point: initialises each feature
  config.js                     places, tile key, road speeds, constants
  state.js                      shared plain-data state
  events.js                     tiny pub/sub (route:changed, settings:changed, closures:changed)
  analysis/    chokepoints.js                      finds the roads whose closure hurts the community most (pure logic)
  core/        heap.js, two-key-heap.js            priority queues
  graph/       road-graph.js                       load JSON -> adjacency list, nearest node, route metrics
               closure-filter.js                   apply closure lines to a graph
  algorithms/  common.js                           edge cost, heuristic, path tracing
               best-first.js                       engine shared by Dijkstra / A* / Greedy
               dijkstra.js astar.js greedy.js bfs.js dfs.js bidirectional.js lpa-star.js
               index.js                            registry (name, description, run) -> add new algorithms here
  map/         map.js                              Leaflet map + tiles
               explore-layer.js                    canvas layer for the search animation
               markers.js                          start / destination pins
               route-view.js                       search head dot + final route line
               chokepoint-view.js                  numbered red markers for chokepoints
  features/    algorithm-panel.js                  dropdown + Fastest/Shortest
               route-points.js                     map clicks, swap, GPS, defaults
               place-search.js                     search-as-you-type boxes
               closures.js                         draw / remove road closures
               chokepoints.js                      'Find critical roads' button + ranked list
               run-controller.js                   start, animate, pause/step/skip, results, LPA* repair
  ui/          dashboard.js results-table.js welcome.js
  utils/       dom.js format.js geo.js
```

## Rules of the structure
- `algorithms/` and `graph/` know nothing about the DOM or Leaflet. They can be tested in Node.
- `map/` is the only place that draws on the map.
- `features/` connect user input to the rest; they talk to each other through `events.js`, not direct imports.
- Every algorithm is a generator: `run(graph, start, goal, mode, closures)` yields `{u, p, found, q}` per expanded node and returns the path (array of node indices) or `null`.
