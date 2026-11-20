# ROADMAP — Domino Sky

| Phase | Scope | Status |
|---|---|---|
| 1. Repository & documentation | Inspect dataset, validation, 14 docs, contracts | ✅ Done |
| 2. Simulation engine | Time utils, rotations, closures, capacity, connections, crew, cancellations, tests | ✅ Done |
| 3. Frontend | Design system, dashboard, map, disruption controls, flight ops, passenger impact, playback | ✅ Done |
| 4. AI dispatcher | Provider abstraction, structured output, rule-based fallback, engine validation | ✅ Done |
| 5. Recovery Lab | Spares, swaps, cancellations, holds, comparisons, strategies, scenario persistence | ✅ Done |
| 6. Quality & delivery | Tests, type checks, lint, E2E, docs sync, deployment guide, Docker | ✅ Done |

## MVP milestones
- M1 Engine reproduces the BOM-90 cascade with explanations (✅ tests).
- M2 End-to-end workflow in UI: disrupt → run → investigate → recommend → apply → compare (✅ Playwright).
- M3 Scenario persistence + export (✅).

## Advanced functionality (next)
1. Multi-action recovery search (beam search over candidate combinations, scored by impact index).
2. Diversion alternates and holding-fuel limits.
3. Passenger itineraries (if data becomes available) for true distinct counts and rebooking.
4. Reserve crew roster and crew swaps independent of aircraft.
5. Conversational dispatcher (follow-up questions grounded in engine state).

## Testing milestones
- T1 Dataset & invariants (✅) · T2 Scenario regression set for all five templates (✅ API test) · T3 E2E on CI with Playwright container (⏳ CI pipeline) · T4 Visual regression snapshots (⏳).

## Deployment milestone
- D1 Docker images + compose (✅) · D2 Hosted demo: backend on a container host, frontend on static hosting with `VITE_API_BASE_URL` (instructions in docs/DEPLOYMENT.md) · D3 Postgres-backed scenario store for multi-instance (⏳).
