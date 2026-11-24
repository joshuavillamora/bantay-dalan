# Computational validity audit

## Reproduce the checks

```sh
node scripts/audit-routing.mjs > /tmp/bantay-routing-audit.jsonl
node --test tests/network.test.mjs
```

The audit reads the bundled `data/panay-roads.json.gz` with SHA-256 `67b5a94e45ce0b115335073c6f359c03874793fd67e73b5e5115c68f2f055a04`. Measurements used Node.js 24.16.0 on an Apple M4 with 16 GiB RAM. The script prints hardware identifiers, exact snapped vertex IDs, closure coordinates, costs, event counts, and individual measured timings.

The real fixtures cover trips from Plaza Libertad to University of San Agustin, Iloilo Airport, Kalibo Municipal Hall and Jordan Public Market. Costa Tropical Street supplies an actual one-way edge to a sink, checked both ways. A drawn line intersects an edge used by the open airport trip and forces a detour. A separate closure removes every departure edge at Plaza Libertad. A single-vertex trip tests the zero-cost case.

On Fishing Port Road, both legal alternatives round to 69 m, but their raw distances are 68.678907431 m and 68.678938811 m. The four algorithms must choose the lower-cost result even though the displayed distances are identical. A separate symmetric synthetic graph verifies genuinely equal-cost alternatives. Either of its two optimal paths is valid. This fixture is distinct from the real near-tie.

## Cost and topology model

- The road distance uses the **equirectangular approximation**. For latitudes `φ₁` and `φ₂` and longitude difference `Δλ` in radians, the edge length is `6,371,000 × hypot(Δφ, Δλ × cos((φ₁ + φ₂)/2))` metres. The compact decoder applies a 0.01 m floor to keep coincident but distinct nodes from creating zero-cost cycles. It uses neighboring OSM geometry vertices along the way. It does not measure elevation or user travel.
- **Shortest distance** minimizes the sum of edge metres. **Estimated fastest** minimizes the sum of `metres ÷ (km/h ÷ 3.6)` in seconds. Every reported path has both totals, calculated from the same canonical directed edges. The comparison verdict checks the selected objective before display rounding. Routes with equal cost can have different node sequences and different totals for the other objective.
- The audit verified each of the **1,003,602 directed edges** against the encoded flags and speed table. **8,926** have no reverse edge. All matching edges had unique destinations within each adjacency row. Decoded road lengths differed from spherical great-circle lengths by at most about **1.60 micrometres** on this snapshot. This quantifies the local approximation, with no claim of equivalent precision to real road geometry.
- The extraction applies OSM static directional car-access tags and barrier restrictions before the app loads the graph. It includes no turn-restriction model, temporal access schedule, or live road rules. The dataset contains one static road graph and one table of weights. There are no separately modeled private-car profiles, walking or running modes, public transit, ferries, or live traffic. [Extraction rules and limitations](README.md)
- A selected pin must lie near a modeled segment. The spatial index searches within **250 m** and routing uses a real endpoint of the selected segment within **1.5 km** of the pin. No virtual connector is added. The pin-to-vertex offset stays separate from both totals. A snap does not verify land access to the segment or guarantee access in a particular direction.
- Drawn closures disable directions whose physical segment properly crosses the line. Contact at an endpoint and collinear overlap do not count. Stored closures carry directed edge keys and combine by union. Dijkstra, Bidirectional Dijkstra, and A* use a filtered graph. Interactive LPA* maintains the same base graph with the equivalent blocked-key set. Filtered snapshots obtain reverse adjacency from the filtered forward edges.

### Static speeds

| Assumption | Highway classes |
| ---: | --- |
| 80 km/h | Motorway |
| 60 km/h | Trunk |
| 50 km/h | Primary |
| 40 km/h | Secondary, motorway link |
| 35 km/h | Tertiary, trunk link |
| 30 km/h | Unclassified, primary link, secondary link, tertiary link |
| 25 km/h | Residential and fallback |
| 15 km/h | Living street, service, track |

The deployed graph uses modeled values from **15 to 60 km/h**. The 80 km/h ceiling comes from the full configured speed table and bounds fastest-mode heuristics. Speeds represent static category assumptions. The model does not ingest OSM `maxspeed` or measurements. Travel estimates include movement along open modeled edges and omit live traffic, signals and junction delays, turning, grade, incidents beyond explicit simulated closures, parking, and travel between each pin and its routing vertex.

## Corrections and verification

1. **Heuristic consistency.** The old point-to-goal equirectangular estimate violated `h(u) ≤ c(u,v) + h(v)` on 464 edges toward Plaza Libertad, 511 toward Kalibo, and 772 toward San Joaquin, using a `10⁻⁷ m` numerical threshold. The largest observed excess was about **5.80 mm**. This exposed a correctness risk even where sampled routes still agreed. A* and LPA* now use the spherical chord with the existing edge weights. The Euclidean chord obeys the triangle inequality and bounds the equirectangular edge length from below. For the same endpoints, squared chord terms replace each squared angular difference with `4 sin²(Δ/2) ≤ Δ²` and the longitude cosine factor with `cos(φ₁)cos(φ₂) ≤ cos²((φ₁+φ₂)/2)`. Dividing by the model's speed ceiling preserves a lower bound in time mode. The all-edge checks for these three goals found no excess above the threshold after the correction. [LPA* paper](https://www.cs.cmu.edu/afs/cs/Web/People/maxim/files/aij04.pdf)
2. **Baseline timing.** The shared engine was computing a geographic estimate for Dijkstra on each successful relaxation, even though Dijkstra discarded it. The measured baseline now orders vertices by accumulated cost without calculating a geographic heuristic.
3. **Route reconstruction.** The compact graph already coalesced parallel directed edges with the same endpoints and distance using the higher modeled speed. The legacy reader now uses the same rule. Previously its search could use a faster duplicate while reporting the first, slower edge. Route totals now reject missing or closed edges. Interactive LPA* checks active closures when reporting the returned path.
4. **Drawn closures.** An endpoint-touch fixture reproduced a closure applied in only one direction on an otherwise bidirectional edge. Proper crossings now use a symmetric predicate and the same geometric endpoint order for both directions.
5. **Comparison labels.** The table calls the counter **Processed** and shows both route totals. A disagreement is identified in the summary as well as in the affected row. The in-app comparison is a single compute run per algorithm. Use this audit script for repeated timing.

For every audited path, the script verifies the snapped endpoints, each available directed edge, and both totals by an independent edge sum. It also computes the optimal score with an independent Dijkstra relaxation using the shared heap primitive. Comparisons accept a raw numerical difference up to `max(10⁻⁸, |reference| × 10⁻¹²)` in the objective's units.

All **16 regression tests** passed, including CHOKEPOINT scoring and cancellation. A local Chrome smoke test verified that the comparison displays four rows, reports all three matches to Dijkstra for a real Dueñas trip, and shows the expected rounded distance. It also exercised closure and reopening, failure messages, and visualization. Browser runs did not contribute to the computation timings below.

## Benchmark protocol

Each case and objective had **three warm-ups and nine measured runs per algorithm**, with the order rotated across repetitions. Timing starts before generator construction and ends when it returns its path. It includes algorithm initialization, queue work, generation of search events, and in-algorithm path reconstruction. Loading, graph building, snapping, closure-fixture construction, prebuilt reverse adjacency, cost verification, rendering, and animation are outside the timed region. The incremental LPA* rows include calculating the changed closure keys and updating the saved state for each transition.

One **processed event** is one nonterminal yield from the algorithm. Dijkstra and A* yield on each settled vertex, including the goal. Bidirectional Dijkstra yields on each settled vertex per direction, so the same vertex can count twice and a same-vertex trip yields zero. LPA* yields on each accepted queue pop that processes an inconsistent vertex, including repeat processing of the same vertex. Stale queue removals and neighbor relaxations do not count separately. The script also outputs distinct vertex counts for fresh comparisons. These units make the counts reproducible without treating every algorithm event as identical work.

The timing tables show **median [Q1, Q3] milliseconds / processed events**. The raw output includes minima, maxima, and all nine timings. Memory management, process scheduling, and very small runs can affect the numbers. They describe the tested host and protocol.

### Shortest distance

| Trip | Optimum | Bidirectional Dijkstra | A* | Fresh LPA* | Dijkstra |
| --- | ---: | ---: | ---: | ---: | ---: |
| Urban campus | 1834.149 m | 3.13 [2.78, 3.68] / 1,138 | 1.08 [0.77, 1.17] / 432 | 3.10 [1.58, 3.64] / 432 | 1.92 [1.23, 2.05] / 1,772 |
| Airport open | 20806.016 m | 9.82 [9.31, 11.52] / 42,805 | 6.66 [6.17, 8.77] / 26,484 | 16.74 [16.32, 21.47] / 26,484 | 11.24 [11.01, 12.07] / 53,234 |
| Kalibo | 156775.728 m | 105.33 [81.32, 115.93] / 329,660 | 75.81 [74.00, 86.07] / 273,619 | 168.30 [155.98, 169.26] / 273,619 | 96.17 [87.72, 117.68] / 410,263 |
| One-way forward | 9.007 m | 1.02 [0.94, 1.54] / 2 | 0.58 [0.40, 0.60] / 2 | 0.83 [0.62, 1.19] / 2 | 0.48 [0.42, 0.80] / 3 |
| One-way reverse | Unreachable | 0.95 [0.93, 1.26] / 1 | 0.45 [0.43, 0.50] / 1 | 0.64 [0.61, 0.97] / 1 | 0.45 [0.43, 0.52] / 1 |
| Guimaras disconnected | Unreachable | 31.65 [29.24, 34.58] / 127,247 | 117.71 [116.74, 121.67] / 454,861 | 233.88 [233.64, 235.38] / 454,861 | 100.37 [94.00, 100.75] / 454,861 |
| Airport drawn closure | 21363.052 m | 10.81 [9.16, 11.53] / 43,676 | 8.39 [7.19, 9.26] / 28,794 | 16.67 [15.56, 16.85] / 28,794 | 10.83 [9.04, 11.19] / 54,226 |
| All departures closed | Unreachable | 1.63 [0.97, 1.68] / 1 | 0.60 [0.45, 0.80] / 1 | 0.85 [0.71, 1.41] / 1 | 0.74 [0.51, 1.11] / 1 |
| Fishing Port near tie | 68.679 m | 0.93 [0.86, 0.94] / 4 | 0.45 [0.41, 0.46] / 3 | 0.63 [0.63, 0.69] / 3 | 0.44 [0.40, 0.46] / 6 |
| Exact tied alternatives | 304.811 m | 0.0084 [0.0060, 0.04] / 2 | 0.0060 [0.0050, 0.0081] / 4 | 0.02 [0.02, 0.03] / 4 | 0.0054 [0.0048, 0.01] / 4 |
| Same vertex | 0.000 m | 0.0005 [0.0003, 0.0007] / 0 | 0.48 [0.37, 0.54] / 1 | 0.70 [0.64, 0.99] / 1 | 0.36 [0.20, 0.50] / 1 |

### Estimated fastest

| Trip | Optimum | Bidirectional Dijkstra | A* | Fresh LPA* | Dijkstra |
| --- | ---: | ---: | ---: | ---: | ---: |
| Urban campus | 178.258 s | 1.29 [1.21, 1.46] / 1,281 | 1.04 [0.97, 1.32] / 1,108 | 1.57 [1.54, 2.13] / 1,108 | 1.03 [0.92, 1.33] / 1,850 |
| Airport open | 1587.556 s | 8.27 [8.21, 10.11] / 35,356 | 9.05 [8.92, 9.42] / 39,405 | 24.85 [24.56, 25.42] / 39,405 | 11.55 [9.60, 12.01] / 50,805 |
| Kalibo | 10688.404 s | 77.77 [76.69, 79.66] / 300,745 | 92.39 [87.72, 106.10] / 311,173 | 186.00 [181.31, 191.68] / 311,173 | 87.40 [86.67, 89.54] / 389,275 |
| One-way forward | 1.297 s | 1.27 [0.58, 1.42] / 2 | 0.64 [0.37, 0.75] / 3 | 0.91 [0.60, 0.96] / 3 | 0.63 [0.47, 0.68] / 3 |
| One-way reverse | Unreachable | 1.84 [1.74, 2.02] / 1 | 0.94 [0.72, 1.04] / 1 | 1.23 [1.02, 1.27] / 1 | 0.75 [0.71, 0.90] / 1 |
| Guimaras disconnected | Unreachable | 34.26 [33.73, 35.37] / 131,160 | 118.94 [117.98, 120.57] / 454,861 | 248.19 [246.07, 252.89] / 454,861 | 100.72 [100.10, 103.42] / 454,861 |
| Airport drawn closure | 1777.577 s | 9.64 [8.68, 11.47] / 40,405 | 11.36 [9.70, 12.68] / 43,224 | 26.39 [25.50, 29.56] / 43,224 | 10.72 [9.84, 11.47] / 54,940 |
| All departures closed | Unreachable | 1.67 [1.08, 1.84] / 1 | 0.45 [0.43, 0.51] / 1 | 1.00 [0.84, 1.52] / 1 | 0.69 [0.56, 1.05] / 1 |
| Fishing Port near tie | 16.483 s | 1.05 [0.97, 1.10] / 4 | 0.50 [0.46, 0.65] / 6 | 0.78 [0.69, 0.81] / 6 | 0.53 [0.49, 0.54] / 6 |
| Exact tied alternatives | 43.893 s | 0.0065 [0.0059, 0.0074] / 2 | 0.0052 [0.0050, 0.0055] / 4 | 0.01 [0.01, 0.02] / 4 | 0.0047 [0.0046, 0.0050] / 4 |
| Same vertex | 0.000 s | 0.0005 [0.0004, 0.0006] / 0 | 0.28 [0.21, 0.31] / 1 | 0.31 [0.29, 0.32] / 1 | 0.22 [0.21, 0.23] / 1 |

### Incremental LPA* on the airport trip

| Objective | Initial saved search | Repair after closing | Repair after reopening | Fresh search with closure | Fresh search after reopening |
| --- | ---: | ---: | ---: | ---: | ---: |
| Distance | 14.73 [14.40, 21.44] / 26,484 | 9.99 [9.85, 10.05] / 13,830 | 2.54 [2.44, 2.61] / 5,760 | 15.85 [15.73, 19.72] / 28,794 | 16.48 [16.28, 16.67] / 26,484 |
| Time | 23.72 [23.09, 24.54] / 39,405 | 14.81 [14.44, 15.48] / 22,773 | 3.86 [3.73, 3.95] / 9,477 | 24.83 [24.74, 25.73] / 43,224 | 23.59 [23.33, 25.73] / 39,405 |

Closing the tested road increased the airport objective cost. Reopening restored the open-graph optimum in every measured sequence. A cheaper repair in this sequence is workload-specific. The script tests the all-departures-closed case separately and the integration tests also cover LPA* repair to an unreachable state.
