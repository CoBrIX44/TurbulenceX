# AGENTS — instructions for coding agents

## Ground rules
1. **The engine is the source of truth.** Every operational number shown in the UI must come from `backend/app/engine`. The frontend may format and interpolate for display (e.g. aircraft position between engine dep/arr times) but must not compute delays, passenger counts, KPIs or feasibility.
2. **Never modify `flight_network.json`.** `backend/data/flight_network.json` must stay byte-identical to the root copy (test enforces). Never add airports, aircraft, flights or crews.
3. **AI never mutates state.** LLM output may only select candidate ids or propose actions that pass `parse_action` → `evaluate_action`. Ignore any numbers the LLM returns.
4. **Determinism.** No `random`, no wall-clock dependence, no unordered iteration in engine code (sort dict keys). Same input ⇒ identical JSON.
5. **Report, don't fix.** Dataset problems are surfaced by `validate_network`, never silently corrected.

## Repository structure
```
backend/app/engine/   timeutil, models, constants, dataset (load+validate), plan (actions+feasibility),
                      simulator (core + derived analyses + events + KPIs), recovery_search (candidates)
backend/app/dispatcher/ provider (OpenAI-compatible), service (LLM/rule-based pipeline)
backend/app/api/      routes, deps          backend/app/store/ scenarios (JSON file)
backend/app/presets.py  scenario templates (inputs only)
frontend/src/lib/     api, types (mirror Pydantic), time, playback, filters, routes, labels, validation
frontend/src/store/   useSim (zustand)      frontend/src/components, pages
```

## Coding standards
- Python 3.11+, Pydantic v2 models for all I/O, type hints everywhere, `ruff` + `mypy` clean. Integer minutes for time.
- TypeScript strict; types in `src/lib/types.ts` mirror backend models — update both together.
- UI components stay presentational; business rules live in the engine; pure helpers in `src/lib` with vitest tests.
- Comment complex algorithms (slot search, airborne vs ground delay, out-of-position cascade).
- Keep files focused; no "god" components.

## Architectural rules
- `app/engine` must not import FastAPI, httpx or dispatcher code.
- New recovery action: add model in `models.py` (discriminated union), feasibility in `plan.py`, candidate generation in `recovery_search.py`, TS type + UI form, tests.
- New disruption type: map onto `Window` semantics in `simulator.build_windows` (capacity %, direction, or turnaround penalty) and document in ARCHITECTURE.md.

## Testing requirements
Every engine change needs a pytest covering the behaviour and must keep the invariants green (`test_no_departure_before_aircraft_available_and_min_turn`, `test_closed_airport_processes_no_prohibited_movements`, `test_determinism`). UI flows touching the critical path need Playwright coverage.

## Prohibited shortcuts
Mock or replacement datasets in the app; hard-coded KPI values or simulation results; random numbers in calculations; fabricated passenger records; placeholder AI text presented as LLM output; dead buttons; fake loading states; reducing turnaround below 30 minutes; teleporting spares.

## Commands
```bash
# backend
cd backend && python -m venv .venv && . .venv/bin/activate && pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000
pytest -q && ruff check app tests && ruff format --check app tests && mypy app
# frontend
cd frontend && npm install && npm run dev
npm run typecheck && npm run lint && npm test && npm run build
npm run test:e2e        # needs Chromium: npx playwright install chromium (or PW_CHROMIUM_PATH)
```
