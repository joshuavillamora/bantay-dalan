# Bantay Dalan

An interactive road-network pathfinding visualizer for Iloilo. Choose two places or pin points on the map, then watch a search algorithm explore OpenStreetMap roads and build a route.

## Features

- Compare A*, Dijkstra, Greedy best-first, Breadth-first, and Depth-first search.
- Optimize routes for estimated travel time or distance.
- Animate the search, pause and resume it, advance one step at a time, or skip to the result.
- View explored roads, the current search frontier, route distance, estimated travel time, and results from repeated runs.
- Select from preset Iloilo locations, click the map to place endpoints, swap endpoints, or use the browser's current location.
- Responsive layout with light and dark color schemes.

## Run locally

This is a static website; it does not need a build step or package installation. Serve the project over HTTP rather than opening `index.html` directly.

From the project directory, run:

```powershell
py -m http.server 8000
```

If `py` is not available, try:

```powershell
python -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000) in a browser. Stop the server with `Ctrl+C`.

An internet connection is required to load Leaflet, map tiles, and road data.

## Carto API key (optional)

The map uses Esri street-map tiles by default, so a Carto key is not required to run the app. To use the Carto Voyager basemap instead, set `CARTO_API_KEY` near the top of `script.js`:

```js
const CARTO_API_KEY = "your-key";
```

The key is sent to Carto from the browser and is visible to anyone who can access the page. Do not put a private or server-side secret here. If you use a key, apply the provider's browser-key restrictions and avoid committing a real key to a public repository. A `.env` file will not be read by this static app.

## Using the visualizer

1. Choose a start and destination from the selectors, or click the map once for the start and a second time for the destination.
2. Select a search algorithm and choose **Fastest** or **Shortest**.
3. Adjust the animation speed, then select **Visualize**.
4. Use **Pause**, **Step**, or **Skip to end** to control the search. **Reset** clears the current visualization.
5. Run other algorithms with the same endpoints to compare their explored-node counts, distances, and estimated times.

The current default endpoints are Plaza Libertad and SM City Iloilo. Use **Swap** to reverse the selected endpoints. **Use my location** requests browser location permission and sets the start point.

## Data and limitations

- Road geometry is fetched at runtime from the [OpenStreetMap Overpass API](https://overpass-api.de/). The map view uses Leaflet 1.9.4 from cdnjs.
- Road speeds are estimates assigned by road type. Travel times are not live traffic predictions.
- Routes use the downloaded road graph and its one-way tags. Search results can be affected by incomplete or unavailable map data and Overpass service limits.
- A selected point is connected to its nearest road-network node; points more than 1.5 km from a road node are rejected.
- Geolocation generally requires a secure browser context (such as `localhost` or HTTPS) and user permission.
- BFS minimizes the number of road segments, not distance or travel time. DFS is not guaranteed to find an optimal route. Greedy best-first is also not guaranteed to be optimal. A* and Dijkstra are the algorithms intended to find optimal routes for the selected cost metric.

## Project files

| File | Purpose |
| --- | --- |
| `index.html` | Page structure and Leaflet CDN includes |
| `script.js` | Map setup, road-data loading, search algorithms, and controls |
| `style.css` | Layout and visual styling |
