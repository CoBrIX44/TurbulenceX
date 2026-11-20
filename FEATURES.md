# FEATURES — Domino Sky

Status legend: ✅ implemented · 🟡 implemented with documented simplification · ⏳ future

## MVP features
| Feature | Status | Acceptance criteria |
|---|---|---|
| Dataset load + validation (8 checks + counts, checksum) | ✅ | Settings shows VALID, 16/70/16/16/21/2; broken data produces failed checks without changing values (tests) |
| Airport closure model | ✅ | No movements inside the window; departures released at reopening; airborne vs ground-delay rule |
| Capacity reduction model (hourly slots) | ✅ | Actual movements ≤ effective capacity in restricted hours (test) |
| Thunderstorm / runway / airspace / ground handling | 🟡 | Mapped onto capacity %, arrivals-only or turnaround penalty (ARCHITECTURE) |
| Rotation propagation, 30-min turnaround | ✅ | DS0501 → DS0502 +35 example reproduced; invariants hold |
| Connections (pax from connection data) | ✅ | CX05/CX10 missed (48 pax) for BOM 90; MCT boundary tests |
| Crew duty violations with cause | ✅ | CR08 +10 min for BLR closure 14:00–15:00 |
| Cancellations + out-of-position cascade | ✅ | Single-leg cancel cascades; round-trip pair keeps aircraft in place |
| Explainable events + causal chain | ✅ | Event fields per brief; inspector graph backward/forward |
| Operations dashboard (10 KPIs, health, charts, map, table, timeline, AI panel) | ✅ | All values from engine; no hard-coded KPIs |
| Interactive map (geo positions, states, routes, aircraft, filters, clicks) | ✅ | Airport and route panels; 5 airport states, 4 route states |
| Disruption panel (create/edit/remove/run/reset, validation) | ✅ | Invalid times/durations/severity blocked client- and server-side |
| Playback (play/pause/step/reset/speed) + synced log | ✅ | Clock, map, Gantt, log move together |
| Flight operations table + inspector | ✅ | Columns/filters per brief; rotation history; causal graph |
| Passenger Impact Center | ✅ | Flight-level vs connection-level vs estimate labels |
| AI dispatcher (LLM abstraction + fallback, labelled) | ✅ | Recommendation fields per brief; engine-validated |
| Recovery Lab (spares, cancel, swap, protect; feasibility; compare; undo) | ✅ | Infeasible actions cannot be applied; recovery % from engine |
| Scenario management (save, name, duplicate, rename, delete, compare, export) | ✅ | JSON-file persistence; JSON/CSV export |

## Advanced features (implemented)
- Spare positioning ferries routed over real city pairs with dataset block times; just-in-time departure.
- Aircraft swap with crew-duty feasibility.
- Connection protection with max-hold policy.
- Strategy snapshots for side-by-side recovery comparison.
- Engine-ranked candidate search (Recovery Lab) independent of the AI.
- Unverified-number detection in LLM narrative; rejected-proposal list.
- Rotation Gantt chart with disruption bands and playback cursor.
- Hourly capacity utilisation per airport.

## Future features
- ⏳ Multi-action optimisation (search over combinations / MIP).
- ⏳ Diversion modelling and fuel-limited holding.
- ⏳ Reserve crew data and crew re-pairing.
- ⏳ Passenger itinerary data → true distinct-passenger counts and re-accommodation.
- ⏳ Multi-day schedules, curfews, maintenance windows.
- ⏳ Multi-user persistence (PostgreSQL), auth, audit trail.
- ⏳ Streaming LLM explanations and conversational follow-ups.
