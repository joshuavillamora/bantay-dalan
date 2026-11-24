# Panay and Guimaras road data

The original Panay and Guimaras graph remains the presentation dataset. Iloilo City is the default. See the [regional coverage report](regional-coverage.md) for earlier on-demand extracts and the [administrative audit](master-audit.md) for the full-region candidates.

## Priority study areas

| Network | Scope | Vertices | Directed edges | Compressed graph |
| --- | --- | ---: | ---: | ---: |
| Iloilo City | City of Iloilo | 27,204 | 55,055 | 0.38 MiB |
| Iloilo Province | Passi City and 42 municipalities, including mapped offshore roads | 213,114 | 433,828 | 2.68 MiB |
| Iloilo City and Province | City of Iloilo and all 43 provincial LGUs | 240,324 | 488,978 | 3.07 MiB |
| Panay Island | Main island across Aklan, Antique, Capiz and Iloilo, including Iloilo City | 459,609 | 936,373 | 5.84 MiB |

All four were verified with both objectives, all four algorithms, directed reconstruction, closure and reopening, and LPA* repair. City-to-municipality travel was checked on the combined graph. Panay verification includes Iloilo City to Kalibo, Roxas City and San Jose de Buenavista. Separate island components are preserved where the road data provides no connection. The local place indexes and Panay offline tiles work across these study areas. Provincial outlines follow the source municipal polygons and can show internal boundaries. [PSA Iloilo roster](https://psa.gov.ph/classification/psgc/citimuni/0603000000) · [Boundary sources](regions/coverage/README.md)

To regenerate the two new graphs, use the archived PBF, DPWH municipal GeoJSON, matching 2026-Q3 regional boundary GeoJSON and pinned `osm-pbf-parser@2.3.0` described below and in the [administrative audit](master-audit.md#reproduction-and-launch). Set `pbf`, `municipalities`, `regions` and `parser_dir` to their local paths.

```sh
run="$(mktemp -d)"
mkdir -p "$run/roads" "$run/places" "$run/proofs"
node scripts/prepare-priority-boundaries.mjs "$municipalities" "$regions" "$run/study-areas.geojson"
node --max-old-space-size=4096 scripts/extract-region-samples.mjs "$pbf" "$parser_dir" "$run/roads" --administrative "$run/study-areas.geojson"
node scripts/extract-regional-places.mjs "$pbf" "$parser_dir" "$run/places" philippines "$run/study-areas.geojson" iloilo-province panay-island
for id in iloilo-province panay-island; do
  node --expose-gc scripts/verify-region.mjs "$run/roads/$id.json.gz" scripts/administrative-fixtures.json > "$run/proofs/$id.json"
done
node scripts/build-administrative-catalog.mjs "$run/roads" "$run/places" "$run/proofs" "$run/study-areas.geojson" "$run/staged" iloilo-province panay-island
```

The staged catalog contains only the requested entries. Integrate those rows and assets alongside the other verified networks.

`panay-roads.json.gz` is a local, gzip-compressed `bantay-roads-v1` snapshot derived from © OpenStreetMap contributors. The snapshot is available under the [Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/). [OpenStreetMap attribution](https://www.openstreetmap.org/copyright)

## Source and reproduction

The [Geofabrik Philippines PBF](https://download.geofabrik.de/asia/philippines.html) reports a replication timestamp of **2026-11-22 21:20:48 UTC**. The [DPWH municipal polygons](https://services1.arcgis.com/IwZZTMxZCmAmFYvF/ArcGIS/rest/services/City_Municipal_Boundaries/FeatureServer/0) define the extraction area. Both files are processed offline. The project serves only the generated road asset. A later Geofabrik download can contain different edits, so use the original input hashes when reproducing these exact results.

| File | SHA-256 |
| --- | --- |
| Geofabrik Philippines PBF | `ef435abfbd425312409ff9df6bbd3c359425a99eb9310c10969da1b44e61578d` |
| DPWH five-province GeoJSON | `f51015cf24c8a8402203724d2f5c2fd194bd8d83271da2c7d4383e627dd40fc7` |
| Distributed gzip snapshot | `67b5a94e45ce0b115335073c6f359c03874793fd67e73b5e5115c68f2f055a04` |
| Original Iloilo snapshot | `9308915566401b2fe0f0792345d45be602d93f736756f0db5112937b4a1e770c` |

The following commands require Node.js 24 and install a pinned PBF parser in a temporary folder for extraction only. The browser has no npm dependency. The original dataset backup is recoverable from the checked-out Git history.

```sh
work="$(mktemp -d)"
curl --fail --location 'https://download.geofabrik.de/asia/philippines-latest.osm.pbf' -o "$work/philippines.osm.pbf"
curl --fail --location 'https://services1.arcgis.com/IwZZTMxZCmAmFYvF/ArcGIS/rest/services/City_Municipal_Boundaries/FeatureServer/0/query?where=UPPER%28PROVINCE%29%20IN%20%28%27ILOILO%27%2C%27CAPIZ%27%2C%27AKLAN%27%2C%27ANTIQUE%27%2C%27GUIMARAS%27%29&outFields=MUNICIPAL%2CPROVINCE%2CMUN_CODE&returnGeometry=true&outSR=4326&f=geojson' -o "$work/municipalities.geojson"
npm install --prefix "$work" --no-audit --no-fund --ignore-scripts osm-pbf-parser@2.3.0
node --max-old-space-size=4096 scripts/extract-roads.mjs "$work/philippines.osm.pbf" "$work/municipalities.geojson" "$work" "$work"
node -e 'const fs=require("node:fs"), z=require("node:zlib"); for(const name of ["iloilo-candidate","panay-candidate"]) {const file=process.argv[1]+"/"+name+".json";fs.writeFileSync(file+".gz",z.gzipSync(fs.readFileSync(file),{level:9}));}' "$work"
git show 418f32c52b0a1e5e31bae020e5fa7a14546573b3:data/iloilo-roads.json > "$work/iloilo-roads.original.json"
node scripts/audit-coverage.mjs "$work/municipalities.geojson" "$work/panay-candidate.json.gz"
node --expose-gc scripts/benchmark-network.mjs "$work/panay-candidate.json.gz" scripts/benchmark-destinations.json
node --test tests/network.test.mjs
```

Use the same audit and benchmark commands with the Iloilo candidate or original file for comparisons. Verify the generated candidate before promoting it to `data/panay-roads.json.gz`.

## Road model

- The extraction selects a way when an OSM node lies inside the selected DPWH municipal polygons. It retains the rest of that way for boundary continuity, so a few roads can extend beyond the selection boundary. The wider selection covers Iloilo, Aklan, Antique, Capiz, Guimaras and their included outlying islands. Retained roads can connect across municipal and provincial boundaries.
- The car model includes the usual highway hierarchy, residential and living streets, suitable service roads, and explicitly permitted tracks. Static directional access prefers `motorcar` over `motor_vehicle`, `vehicle`, and `access`. It respects explicit forward and reverse one-ways, explicit two-way overrides, and the default for roundabouts and motorways. It omits known private, permit-only, destination-only, and other restricted directions. Unsupported conditional or reversible directions are conservatively excluded. At 842 blocked barrier nodes the extraction splits ways instead of joining them across the barrier.
- Intersections use shared OSM node IDs. Bridge and tunnel geometry retains its original topology, even where ways cross in the map. The selected Panay snapshot had zero missing node references in retained ways. Duplicate directed pairs share one edge with the faster modeled travel cost. Edge distance uses the existing local distance calculation, with a 1 cm floor for distinct nodes at the same coordinates. Travel time uses the existing fixed class speeds, with 15 km/h for service roads and tracks.
- Ferries, pedestrian paths, and cycleways are outside the car model. The snapshot does not implement posted turn-restriction relations, live closures, or posted-speed routing. The extractor counted 124 restriction relations touching included ways. Access tags may be incomplete or outdated. Geometric proximity alone cannot verify whether a person or vehicle can reach a road from a selected pin.

Public Overpass is useful for targeted inspections. One bulk Geofabrik download and offline filtering supplied the Panay candidates and the later Philippine regional assets. Runtime loads the prepared graph assets from the app’s own host. [Overpass public-use guidance](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html)

## Iloilo City and Province

The dedicated study graph is generated from the same Philippine PBF and DPWH boundary snapshot listed above. It includes Iloilo City (DPWH code `063022000`) and the 43 provincial governments at the city or municipal level, including Passi City. It follows the union of the 44 polygons, including their component islands. The extent is 10.4677995–11.6378375° N and 122.0195687–123.3584859° E. The original Panay and Guimaras graph remains the default and is still used by the presentation fixture.

The extraction uses consecutive OSM road vertices inside the union. It splits a retained way at excluded vertices and blocked barriers. A segment whose endpoints are inside can still cross a narrow boundary sliver. Paths that leave and re-enter the province can require the wider Panay graph. Stable OSM node and way IDs, directionality, shared junctions, and class-speed weights are preserved. The same-snapshot place index filters the prepared Panay place records to the study extent and municipal polygons.

With the matching inputs and parser installed as above, regenerate both gzip assets in a temporary output directory:

```sh
node --max-old-space-size=4096 scripts/extract-roads.mjs "$work/philippines.osm.pbf" "$work/municipalities.geojson" "$work" "$work" --iloilo data/places/panay-guimaras.json.gz
node scripts/audit-coverage.mjs "$work/municipalities.geojson" "$work/iloilo-city-province.json.gz"
node --expose-gc scripts/verify-region.mjs "$work/iloilo-city-province.json.gz" scripts/iloilo-region-fixture.json
```

Use `iloilo-city-province.json.gz` in `data/regions/` and install `iloilo-city-province-places.json.gz` as `data/places/iloilo-city-province.json.gz`. Validate the graph against the regional fixture and refresh the two manifests if the input snapshot changes. [Current checksum, limits, and results](final-redesign.md)
