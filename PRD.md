# PRD — Domino Sky

## User personas
| Persona | Goal | Key needs |
|---|---|---|
| Priya, OCC duty manager | Contain a weather disruption | Fast impact picture, ranked feasible actions, clear trade-offs |
| Arjun, network planner | Find schedule fragility | Slack and capacity headroom, crew margins, scenario comparison, exports |
| Meera, trainer | Teach cascade dynamics | Playback, causal explanations, safe what-if sandbox |

## Core use cases
1. Create, edit or remove a disruption (airport, type, start, duration, severity, description).
2. Run the simulation and view KPIs, the map, the Gantt chart and the event log.
3. Replay the day (play, pause, step, reset, speed) and see airport and aircraft states change.
4. Trace a delayed flight's cause chain backward and forward.
5. Review passenger connection failures and crew duty violations.
6. Ask the AI dispatcher, then apply a recommendation.
7. Build recovery actions manually, check feasibility, apply, undo and compare strategies.
8. Save, duplicate, compare and export scenarios.

## Functional requirements
- **FR-1 Dataset**: load `flight_network.json` unchanged; validate 8+ integrity checks; report issues and never auto-fix them (`GET /api/validation`, Settings page).
- **FR-2 Disruptions**: types thunderstorm, airport closure, runway blockage, airspace restriction, ground handling, capacity reduction. Closure and capacity reduction are fully modelled; the others map onto documented simplified models (ARCHITECTURE §Disruption models). Inputs are validated on client and server.
- **FR-3 Engine**: rotation propagation with a 30-minute minimum turnaround, closures (departure hold, ground delay, airborne hold), hourly capacity slots, connections, crew duty, cancellations with out-of-position cascade, ferry positioning for spares, connection holds.
- **FR-4 Explainability**: per-flight delay components, primary reason, root cause, inherited and introduced delay, and an event log whose events have ID, timestamp, flight, airport, aircraft, previous dependency, delay introduced, cumulative delay and message.
- **FR-5 Playback**: simulated-time timeline with event markers; map, Gantt chart and event log stay synchronised.
- **FR-6 Flight table**: all columns listed in the brief, plus filters (status, severe, aircraft, airport, text) and sorting. A row opens the inspector.
- **FR-7 Passenger Impact**: scheduled, delayed, cancelled and missed-connection counts, distinct-affected *estimate*, awaiting recovery, and a connection table with reasons.
- **FR-8 AI dispatcher**: LLM provider abstraction (OpenAI-compatible) and deterministic fallback. Structured recommendations show action, reason, flights affected, passengers protected, delay reduction, trade-offs, feasibility checks, risks and feasibility status. The source is clearly labelled.
- **FR-9 Recovery Lab**: deploy VT-DS17/VT-DS18, cancel flights, swap aircraft, protect connections; feasibility gate; automatic re-simulation; three-way comparison; network recovery %; undo; strategy snapshots.
- **FR-10 Scenarios**: create, name, save, duplicate, rename, delete, load, compare and export (JSON with full results, CSV of flights). Five templates are provided as inputs only.
- **FR-11 Settings**: validation report, LLM status, standby-crew assumption toggle, engine parameters, playback speed.

## Non-functional requirements
- Determinism: the same input gives byte-identical output (test `test_determinism`).
- Performance: one simulation takes under 10 ms; the dispatcher's candidate search takes under 1 s on the dataset.
- Integrity: the AI cannot change state; every displayed metric comes from engine output.
- Accessibility: keyboard-reachable controls, aria labels on icon buttons, text contrast on dark surfaces.
- Responsiveness: usable from 1280 px desktop down to tablet width; the sidebar collapses to a top nav on small screens.
- Portability: frontend and backend deploy independently; configuration through environment variables.

## Acceptance criteria (selected)
- BOM closure 08:00–09:30: DS0501 departs 09:30 (+75); DS0502 departs 11:45 (+35), explained as a late inbound aircraft with a 30-minute turnaround; 9 delayed flights; CX05 and CX10 missed (48 pax). Verified by `tests/test_simulation.py` and the Playwright flow.
- BLR closure 14:00–15:00: CR08 duty is 610 min against a 600 limit, caused by DS0805.
- Infeasible actions (spare not a spare, double deployment, missing positioning route, no crew assumption, swap across airports) are rejected with failed checks.
- The dispatcher response marks `source = llm | rule_based`; LLM numeric fields are ignored (test `test_llm_numbers_are_ignored_engine_numbers_used`).

## System constraints
- Single operating day, IST, the supplied dataset only. No live flight data.
- No passenger identities: no individual-level deduplication.
- No reserve crews in the data: spare crews are an explicit assumption.
- The scenario store is a JSON file. For multi-instance hosting, replace it (see DATABASE.md).
