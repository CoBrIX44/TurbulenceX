# SCOPE — Domino Sky

## In scope
- Dataset load and validation; all engine calculations (rotations, closures, capacity, connections, crew, cancellations).
- Six disruption types, with full models for closure and capacity reduction and documented simplified models for the rest.
- Nine UI modules: Overview, Network Map, Simulations, Flight Operations, Passenger Impact, AI Dispatcher, Recovery Lab, Scenario History, Settings.
- Recovery actions: spare deployment (VT-DS17 at BLR, VT-DS18 at DEL), cancellations, aircraft swaps, connection protection.
- AI dispatcher with an OpenAI-compatible provider and a deterministic fallback.
- Scenario persistence (JSON file), comparison and export (JSON/CSV).
- Automated tests: pytest, vitest and Playwright.

## Out of scope
- Live ADS-B or ACARS data, real-time flight tracking, multi-day schedules.
- Passenger re-accommodation or rebooking optimisation; individual passenger records.
- Crew pairing optimisation and reserve crew rostering (no such data exists).
- Diversions, fuel modelling, slot trading, maintenance constraints, curfews.
- Authentication, multi-tenant access control, audit trails.
- Global optimisation (MIP or CP) of the recovery plan. The prototype ranks single actions by simulation.

## Prototype limitations
- Actions are evaluated one at a time on top of the current plan (greedy). Combinations are explored manually in the Recovery Lab.
- Capacity is modelled per clock hour (arrivals and departures share it), with first-come-first-served allocation in chronological processing order. Because the airline's schedule uses at most 5 movements per airport-hour, a 50% capacity cut at DEL has no effect. This is reported honestly.
- An airborne hold assumes enough fuel; no diversion alternative is modelled.
- A connection hold is evaluated only when the inbound flight has already been simulated (always true in this dataset).

## MVP boundaries
MVP = everything listed in FEATURES.md under "MVP". Advanced items are implemented where noted; future items are not implemented.

## Assumptions
| # | Assumption | Source / rationale |
|---|---|---|
| A1 | Minimum turnaround is 30 minutes. `turnaround_before_min` is the scheduled ground time (validated equal to the schedule gap) and acts as slack | dataset meta and validation |
| A2 | Crew report time is 45 minutes before the first departure | derived: true for all 16 crews |
| A3 | Crews stay with their aircraft (swaps move crews with aircraft) | dataset crew lists equal tail rotations |
| A4 | A spare's crew is an assumed standby crew (duty limit 600, report 45 min); switchable in Settings | the dataset has no reserve crews |
| A5 | Ferry time is the minimum scheduled block time on flown city pairs (Dijkstra, 30-minute turns at intermediate stops). No route means deployment is infeasible | dataset flights |
| A6 | Ferries are just in time: they arrive one turnaround before the first leg taken over, never before `available_from` | modelling choice |
| A7 | On time means max(dep delay, arr delay) < 15 minutes; severe means 60 minutes or more | industry A15/D15 |
| A8 | Impact index = Σ pax×arrival delay + 240 × cancelled pax + 180 × missed-connection pax | policy weights so cancelling is never free |
| A9 | Distinct affected passengers is an estimate, deduplicated only through listed connections | no passenger identities |
| A10 | Health score = OTP %. Bands: normal ≥ 95, minor ≥ 85, moderate ≥ 70, otherwise severe | simple and explainable |
