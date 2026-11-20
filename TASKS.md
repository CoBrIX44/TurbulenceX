# TASKS — Domino Sky implementation checklist

Priority: P0 critical path · P1 required · P2 polish. Dependencies in brackets.

## Engine (backend/app/engine)
- [x] P0 Dataset models + loader + checksum
- [x] P0 Validation (counts, ids, airports, aircraft, leg orders, rotations, connections, crews, spares, midnight) [loader]
- [x] P0 Time utilities (minutes, +1 day formatting, midnight resolution)
- [x] P0 Rotation propagation with 30-min turnaround [time]
- [x] P0 Closure windows: departure hold, ground delay, airborne hold [rotation]
- [x] P0 Hourly capacity slot model [closure]
- [x] P0 Connections, crew duty, KPIs [rotation]
- [x] P0 Cancellations + out-of-position cascade [rotation]
- [x] P1 Explainability components, root cause, event log [all above]
- [x] P1 Ground handling, airspace (arrivals-only) models
- [x] P1 Recovery plan: spare (ferry routing, crew assumption), swap, protect, cancel; feasibility checks
- [x] P1 Candidate generation & evaluation; comparison & recovery %

## API & AI
- [x] P0 /simulate (baseline/disrupted/recovered), /network, /validation
- [x] P1 /recovery/evaluate, /recovery/candidates
- [x] P1 Dispatcher pipeline, OpenAI-compatible provider, rule-based fallback, unverified-number check
- [x] P1 Scenario store + CRUD + duplicate; presets; export JSON/CSV; /model

## Frontend
- [x] P0 Design tokens, layout (sidebar, top bar), store, API client
- [x] P0 Overview (KPIs, map, health, charts, table, timeline, AI panel)
- [x] P0 Disruption panel with validation; run/reset
- [x] P0 Flight table + inspector (causal graph, rotation timeline)
- [x] P1 Network map page (filters, airport/route panels), playback + Gantt + event log
- [x] P1 Passenger Impact, AI Dispatcher, Recovery Lab, Scenario History, Settings
- [x] P2 Code splitting, toasts, empty states, responsive nav

## Testing
- [x] P0 pytest: dataset (9), simulation (23), recovery (17), API (10), dispatcher (10) → 69 total
- [x] P1 vitest: time, validation, filters, playback, routes (17)
- [x] P1 Playwright: 6 essential flows
- [ ] P2 CI workflow running all three suites (see ROADMAP T3)

## Docs & delivery
- [x] 14 docs + README + API + Deployment + .env.example + Dockerfiles + compose
