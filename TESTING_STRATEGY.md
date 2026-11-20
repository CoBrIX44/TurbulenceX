# TESTING_STRATEGY — Domino Sky

| Layer | Tool | Location | Count |
|---|---|---|---|
| Dataset, engine, recovery, API, dispatcher | pytest | `backend/tests` | 69 |
| Frontend pure logic | vitest (jsdom) | `frontend/src/lib/lib.test.ts` | 17 |
| End-to-end flows | Playwright | `frontend/e2e/core-flows.spec.ts` | 6 |

Run: `cd backend && pytest -q` · `cd frontend && npm test` · `npm run test:e2e`.

## Dataset validation tests (`test_dataset.py`)
Counts (16 airports, 70 flights, 16 active aircraft, 16 crews, 21 connections, 2 spares, VT-DS17@BLR, VT-DS18@DEL, 30-min turn, 180 seats); clean validation; backend copy byte-identical to root dataset; `turnaround_before_min` equals schedule gap (regression for discovered dataset property); corrupted copies produce failed checks **without** modifying data; rotation geography break detected; time parsing; midnight-crossing flights resolved to +1 day.

## Simulation tests (`test_simulation.py`)
Baseline (0 delays, 100% OTP); BOM closure holds departures to 09:30 (DS0501 +75); rotation propagation (DS0502 11:45, cause DS0501, slack absorbed at COK); multiple consecutive delays (DS1202→1203→1204 = 80/35/30); airborne flights not grounded (DS0201 airborne hold); ground delay vs airborne hold for destination closures; closed airports process no movements (4 airports); missed connections use connection pax (CX05+CX10 = 48); connection exactly at MCT is made, 1 minute less is missed; crew violation CR08 610/600 attributed to DS0805 and the BLR closure; crew duty arithmetic; capacity reduction never exceeds effective slots + scheduled overload flag; airspace restriction affects arrivals only; ground-handling extends turnaround; property sweep: no departure before availability and ≥ 30-min turn across 18 scenarios; determinism (identical JSON); event log fields & ordering; passenger metric definitions; delay past midnight; unknown airport rejected; capacity rounding to zero acts as a closure; overlapping windows (most restrictive wins).

## Recovery tests (`test_recovery.py`)
Single cancellation cascades out-of-position (DS0503) with dependency; round-trip pair keeps aircraft in place; unknown flight rejected; spare at base takes over rotation (standby crew report time); spare positioning uses dataset block times (DEL→AMD 95 min) and respects turnaround; double deployment rejected (overlap); crew assumption off → infeasible; no positioning route → infeasible; non-spare rejected; swap needs common airport; swap exchanges rotations and crews; connection protection holds outbound; max-hold respected; cancelled inbound means no hold; three-way comparison and recovery % formula; ranked candidates reproducible; removing an action restores the disrupted result.

## API tests (`test_api.py`)
Network & validation endpoints; three-way simulate; input validation (unknown airport, bad time, zero duration, duplicate ids, unknown action → 422); evaluate; scenario CRUD + duplicate (temp store); presets are inputs only and all simulate; JSON & CSV export; rule-based dispatcher without key.

## AI tests (`test_dispatcher.py`)
LLM numeric fields ignored — engine values used; LLM-proposed actions validated (non-spare, malformed and unknown ids rejected; valid proposal accepted); no spare double-booking; unverified narrative numbers flagged; provider failure falls back to rule engine; LLM context contains only engine state; rule engine never reuses a spare; OpenAI-compatible provider request/response parsing and error handling (httpx MockTransport).

## UI tests
- **vitest**: time formatting/parsing, disruption validation, filters/sorting/buckets, causal tracing, flight phases, aircraft interpolation, timeline bounds, bearings, airport state at t, event stepping, recovery airports, route aggregation.
- **Playwright**: baseline overview (70 flights, 100% OTP, map); BOM 90-min closure configured through the form → 87.1% OTP → 9 delayed → DS0501 75m → inspector explains DS0502 → connection CX05 in Passenger Impact; invalid time blocked; template → dispatcher → apply → Recovery Lab recovery % → manual spare feasibility → apply → undo; save scenario → history; playback step.

## Critical invariants (where enforced)
| Invariant | Test |
|---|---|
| No aircraft departs before physically available | `test_no_departure_before_aircraft_available_and_min_turn` |
| Minimum turnaround never violated | same + `test_spare_positioning_uses_dataset_block_times` |
| Closed airports process no prohibited movements | `test_closed_airport_processes_no_prohibited_movements` |
| Connection with exactly MCT is made | `test_connection_exactly_at_minimum_is_made` |
| Crew duty computed correctly | `test_crew_duty_math`, `test_crew_duty_violation_detected_and_attributed` |
| AI numbers cannot bypass engine | `test_llm_numbers_are_ignored_engine_numbers_used`, `test_llm_proposed_action_validated_by_engine` |
| Same scenario twice ⇒ identical results | `test_determinism`, `test_ranked_candidates_are_engine_validated` |

## Edge cases covered
Midnight crossing and post-midnight delays; capacity resolving to 0 (acts as closure); overlapping windows (most restrictive wins); cancellations leaving aircraft out of position; spares already in use; protect hold exceeding max; inbound cancelled for a protected connection (no hold); LLM returning malformed JSON / HTTP errors.
