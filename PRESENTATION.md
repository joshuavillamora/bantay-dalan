# Slides 08–09 · Experiment and live demonstration

**CHOKEPOINT · Road Network Analysis & Resilience**

## Rehearse before presenting

From the CHOKEPOINT checkout, double-click `Start CHOKEPOINT.command` or run `python3 scripts/serve.py --port 8000`. Open [the offline presentation](http://127.0.0.1:8000/?offline=1&network=panay-guimaras) in a fresh Chrome tab. Wait for **Ready to route** and **Offline Panay and Guimaras streets**. Verify that **Road network** is set to **Panay and Guimaras**, **Estimated fastest** is selected, and there are **0 active closures**. Use the saved **Plaza Libertad** and **SM City Iloilo** suggestions or the default pins. If port 8000 is occupied, specify a free port and use the same port in the URL. The normal launch selects Iloilo City. Keep Panay and Guimaras selected for this experiment.

In **Route**, keep **Estimated fastest** selected. **Plaza Libertad** is at `10.69264, 122.57367`, snapped to routing vertex **431709**. **SM City Iloilo** is at `10.71417, 122.55106`, snapped to vertex **3719**. All runs use the bundled Panay and Guimaras graph from the November 22, 2026 OSM snapshot. Its gzip SHA-256 is `67b5a94e45ce0b115335073c6f359c03874793fd67e73b5e5115c68f2f055a04`.

## Two-minute run of show

| Time | Clicks and expected result |
| --- | --- |
| 0:00–0:20 | Show **Plaza Libertad → SM City Iloilo**. Click **Find route**. The blue route is **5.356 km**, **6.61 min estimated**. The Route summary shows **5.36 km** and **6.61 min**, using the same precision as Compare and Route impact. |
| 0:20–0:50 | Open **Compare**, select **Bidirectional Dijkstra**, and click **Visualize search**. Move **Speed** to its maximum. Show the two frontiers. Select **A\*** and click **Visualize search** to show its goal-directed expansion. Click **Run comparison** and point out the search events, compute time, and the Dijkstra verification above the table. |
| 0:50–1:25 | Select **LPA\*** and click **Visualize search**. Let it finish before changing the graph. In **Disrupt**, zoom to the closure location below. Click **Draw closure → Line**, click the header logo, draw the crossing, and click **Apply closure** when the preview says **Close 1 road segment?**. The blue detour uses **Donato Pison Avenue / Pison Avenue**. The **Route impact** table shows **5.75 km**, **9.53 min estimated**. |
| 1:25–1:45 | Return to **Compare**. Show **LPA* incremental repair** and **6,180 search events**. Click **Run comparison** again and show the **11,524** fresh events, **46.4%** event reduction, and Dijkstra verification in the repair section. |
| 1:45–2:00 | In **Disrupt**, click **Undo last closure** and let the original route return. Open **Analyze → Find critical roads** and point to **General Luna Avenue**. If time is tight, use the verified example on the slide. |

The earlier scripted Chrome rehearsals from Bidirectional visualization through LPA* initialization, closure, fresh comparison, undo, and Analyze took **2.24–2.30 s** after the page was ready. Applying, repairing, and rendering the detour took **0.42–0.45 s**, and Analyze took **0.57–0.59 s**. The two-minute schedule budgets time for manual navigation, drawing, and narration. Those parts were outside the automated timing.

### Exact closure

Target the **southbound carriageway of Benigno S. Aquino Jr. Avenue**, about 310 m northeast of the SM City Iloilo pin. Use zoom **18**. Draw a short east-to-west line across that carriageway near **10.7164489, 122.55274835**, keeping the stroke clear of the adjacent carriageway and of nearby junctions. The exact test stroke runs from **10.71645088, 122.55285333** to **10.71644692, 122.55264337**. It closes the modeled directed segment **3409 → 3410**. The expected preview and 9.53-minute result were verified through the browser tool. [View the closure point on OpenStreetMap](https://www.openstreetmap.org/?mlat=10.7164489&mlon=122.55274835#map=18/10.7164489/122.55274835)

Practice locating the crossing once at the presentation screen size. If the preview selects more than one segment, click **Cancel** and try a shorter line. If the route is already closed or the repair card is absent, undo the closure and run LPA* to completion before trying again. Keep the same endpoints and optimization mode.

## Slide 08 · Verified comparison

**Open network, estimated fastest, Plaza Libertad → SM City Iloilo.** Compute times are Node.js 24.16 medians in milliseconds across nine measured runs after three warm-ups on an Apple M4. The middle 50% ranges show variability. All four reproduced the same unrounded optimized cost to the audit tolerance. The browser table reports a single run and its times can vary.

| Algorithm | Search events | Median ms (middle 50%) | Cost, modeled seconds | Distance, m | Travel, min | Dijkstra check |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Bidirectional Dijkstra | 4,939 | 1.75 (1.20–1.92) | 396.833 | 5,356.37 | 6.614 | Agrees |
| A* | 5,548 | 1.88 (1.43–2.09) | 396.833 | 5,356.37 | 6.614 | Agrees |
| LPA* fresh | 5,548 | 3.71 (2.91–6.99) | 396.833 | 5,356.37 | 6.614 | Agrees |
| Standard Dijkstra | 8,730 | 1.52 (1.42–2.07) | 396.833 | 5,356.37 | 6.614 | Baseline |

The audit also counted distinct vertex IDs in separate instrumented runs. For this open trip, they happened to equal the event counts in the table. The app reports events, which can include repeated processing of a vertex. Timing includes computation and excludes animation and shared graph preparation. A* reduced events here while Dijkstra's median was lower, so use both measures when explaining performance.

## Slide 09 · Closure, repair, and critical roads

| LPA* run | Search events | Median ms (middle 50%) | Distance | Modeled cost |
| --- | ---: | ---: | ---: | ---: |
| Initial interactive search, open graph | 5,548 | 2.58 (2.51–3.87) | 5,356.37 m | 396.833 s |
| Incremental repair, one closed segment | 6,180 | 3.13 (2.97–4.25) | 5,749.64 m | 571.840 s |
| Fresh search on the same closed graph | 11,524 | 5.41 (5.30–6.64) | 5,749.64 m | 571.840 s |

The repaired route added **393.27 m** and **175.007 modeled seconds**. It used **46.4% fewer events** and about **42% less median compute time** than the fresh search on the closed graph. Repair processed more events than the initial open-network search. Dijkstra agreed on the detour cost and used **16,329 events**. The browser displayed genuine reuse and independently verified the unrounded result. Estimated travel time uses static road-class speeds with no live traffic.

**Critical-road example with closures reopened.** The top tested link was **General Luna Avenue**, graph link `20494:20495:20499` between approximately **10.700419, 122.559938** and **10.700243, 122.558077**. It affected **15 of 36** sampled trips. **0** became unreachable. The 15 detours added **545.79 total modeled seconds**, about **36.39 s per affected trip**. Its criticality score was **545.79**, with zero disconnection penalty for this link. The app tested 40 candidate links. Desktop analysis took about **0.6–0.7 s** across the recorded browser and Node runs. This ranking describes the sampled trips.

**Backup.** Save screenshots of the comparison, closure impact, and Analyze results during rehearsal. If the projector or closure gesture costs too much time, show the screenshots and report the verified figures above. If the local map archives are unavailable, the emergency road view still supports the demo. [Offline launch and verification](data/offline.md)

### Suggested narration

> These are four searches on the same weighted, directed graph. Dijkstra is our reference. All four agree on the estimated fastest cost, about 397 seconds. The event count shows how much search work each algorithm did, and the compute time is measured separately from the animation.
>
> I’ve run LPA* once and am closing one southbound segment. The new route takes about 9.5 modeled minutes. Repair processed 6,180 events, compared with 11,524 for a fresh LPA* search on the same closed graph. Dijkstra confirms the detour cost. In Analyze, General Luna Avenue affected 15 of our 36 sampled trips.

```sh
node scripts/audit-routing.mjs > /tmp/chokepoint-routing-audit.jsonl
CHOKEPOINT_OFFLINE=1 node tests/routing-browser.mjs
```

The [fixture](scripts/presentation-fixture.json) drives the computational audit and the browser closure rehearsal.
