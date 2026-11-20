# DEFINITION_OF_DONE — Domino Sky

A change (or the prototype as a whole) is done when:

## Functional completion
- [x] The 14-step success path in the brief works end-to-end in the UI (covered by Playwright).
- [x] Every button performs a real action; no dead buttons, fake loaders or placeholder AI text.
- [x] All nine modules are reachable from the persistent sidebar.
- [x] Disruptions can be created, edited, removed, run and reset; invalid input is blocked client- and server-side.
- [x] Recovery actions are gated by deterministic feasibility; re-simulation happens after every change; undo works.

## Visual quality
- [x] Dark aviation design system applied consistently (DESIGN_SYSTEM.md); status colours carry meaning.
- [x] Map uses dataset coordinates; states for airports/routes visible and legend present.
- [x] Responsive down to tablet; no horizontal page overflow on desktop (tables scroll in their cards).
- [x] Empty, loading and error states present (backend unavailable screen, empty dispatcher, no saved scenarios).

## Calculation correctness
- [x] Engine invariants hold (turnaround ≥ 30, no early departures, closures respected, capacity respected).
- [x] Prompt example reproduced exactly (DS0501 dep 09:30 +75; DS0502 dep 11:45 +35).
- [x] Passenger metrics labelled as flight-level, connection-level or estimate.
- [x] No hard-coded results; identical inputs ⇒ identical outputs.

## Testing
- [x] `pytest` green (69), `ruff` + `mypy` clean.
- [x] `vitest` green (17), `tsc -b` and `oxlint` clean, production build succeeds.
- [x] Playwright essential flows green (6).

## Documentation
- [x] 14 root documents + README + docs/API.md + docs/DEPLOYMENT.md describe the actual implementation.
- [x] Assumptions listed (SCOPE.md) and modelling rules documented (ARCHITECTURE.md).

## Deployment readiness
- [x] `.env.example` for backend and frontend; LLM optional with labelled fallback.
- [x] Backend and frontend independently deployable; Dockerfiles + docker-compose provided.
- [x] Health endpoint and dataset checksum exposed.
