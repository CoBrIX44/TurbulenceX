# Domino Sky — Flight Disruption Cascade & Recovery Simulator

> One disruption. A thousand consequences. One intelligent recovery system.

Domino Sky is a working airline operations-control prototype. Close an airport (for example, BOM for 90 minutes) and the **deterministic simulation engine** propagates the impact through aircraft rotations, passenger connections, crew duty limits and airport capacity. Every delay comes with an explanation you can trace backwards and forwards. An **AI dispatcher** then proposes recovery actions (deploy a spare, cancel a round trip, swap aircraft, protect a connection). Each action is re-simulated by the engine before any number is shown, and you can compare baseline, disrupted and recovered operations side by side.

The supplied `flight_network.json` (16 airports, 70 flights, 16 aircraft, 16 crews, 21 connections, 2 spares) is the only data source. The backend uses a byte-identical copy (`backend/data/flight_network.json`). A test checks that the two files match.

## Repository layout

```
flight_network.json        authoritative dataset (as supplied)
backend/                   FastAPI + deterministic engine (Python 3.11+)
  app/engine/              simulation engine (pure Python, no web/LLM imports)
  app/dispatcher/          LLM provider abstraction + rule-based fallback
  app/api/                 HTTP routes
  app/store/               JSON-file scenario persistence
  tests/                   pytest suite (dataset, simulation, recovery, API, dispatcher)
frontend/                  React 19 + TypeScript + Vite + Tailwind v4
  src/lib/                 typed API client, pure display helpers (vitest-tested)
  src/store/               zustand store (scenario, results, playback)
  src/components/, pages/  UI modules
  e2e/                     Playwright end-to-end flows
docs/API.md, docs/DEPLOYMENT.md
*.md (root)                project documentation (see list below)
```

## Quick start

Prerequisites: Python 3.11+, Node.js 20+ (22 recommended).

### 1. Backend

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate      macOS/Linux: source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env            # optional; add LLM_API_KEY to enable the LLM dispatcher
uvicorn app.main:app --reload --port 8000
```

The API runs at http://127.0.0.1:8000, with interactive docs at http://127.0.0.1:8000/docs.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev                     # http://localhost:5173 (proxies /api to :8000)
```

### 3. Try the core workflow

1. Open http://localhost:5173. The Overview shows the real network running on time (100% OTP).
2. Click **Mumbai Thunderstorm — 90 minutes**, or go to **Simulations**, choose BOM / Airport closure / 08:00 / 90 min, and click **Run simulation**.
3. Press **Play**. The map, Gantt chart and event log replay the day. 9 flights are delayed and 2 connections (48 passengers) are missed.
4. In **Flight Operations**, click DS0502 to see *"Aircraft VT-DS05 arrived late from DS0501 … minimum 30-minute turnaround enforced"* and its causal graph.
5. In **AI Dispatcher**, click *Get recovery recommendations* and then **Apply** a recommendation.
6. In **Recovery Lab**, compare Baseline / Disrupted / Recovered, undo, snapshot strategies, or build your own actions.
7. In **Scenario History**, save, duplicate, compare and export your scenarios.

## Commands

| Task | Command |
|---|---|
| Backend tests | `cd backend && pytest -q` |
| Backend lint / types | `ruff check app tests && mypy app` |
| Frontend unit tests | `cd frontend && npm test` |
| Frontend type check / lint | `npm run typecheck && npm run lint` |
| Frontend production build | `npm run build` |
| End-to-end (starts both servers) | `npx playwright install chromium && npm run test:e2e` |
| E2E against running servers | `E2E_BASE_URL=http://127.0.0.1:5173 npm run test:e2e` |
| Docker (both services) | `docker compose up --build`, then open http://localhost:8080 |

If `npx playwright install` is blocked on your network, set `PW_CHROMIUM_PATH` to a local Chrome or Chromium executable.

## Environment

See `backend/.env.example` and `frontend/.env.example`. The LLM is optional. Without `LLM_API_KEY`, the dispatcher uses the deterministic rule-based engine and labels its output **Rule-based fallback engine**. Any OpenAI-compatible endpoint works (`LLM_BASE_URL`, `LLM_MODEL`).

## Documentation

[PROJECT](PROJECT.md) · [PRD](PRD.md) · [SCOPE](SCOPE.md) · [AGENTS](AGENTS.md) · [TECH_STACK](TECH_STACK.md) · [ARCHITECTURE](ARCHITECTURE.md) · [FEATURES](FEATURES.md) · [USER_FLOWS](USER_FLOWS.md) · [DATABASE](DATABASE.md) · [DESIGN_SYSTEM](DESIGN_SYSTEM.md) · [ROADMAP](ROADMAP.md) · [TASKS](TASKS.md) · [TESTING_STRATEGY](TESTING_STRATEGY.md) · [DEFINITION_OF_DONE](DEFINITION_OF_DONE.md) · [API](docs/API.md) · [DEPLOYMENT](docs/DEPLOYMENT.md)

## Key modelling rules (summary)

- Time is integer minutes from midnight IST. Values of 1440 or more are the next day, so midnight is handled safely.
- Required turnaround = **30 minutes** (dataset minimum), plus any ground-handling penalty. `turnaround_before_min` equals the scheduled ground time, which the engine treats as slack that absorbs delay. Turnaround is never below 30.
- Closures: departures wait until the airport reopens. A flight already airborne when a destination closes holds in the air until reopening; a flight that has not yet departed is held on the ground at its origin. Diversions are not modelled.
- Capacity: hourly movement slots per airport (`capacity_per_hour`, reduced by the disruption percentage), allocated first-come-first-served in chronological order.
- Connections: made if `outbound actual departure − inbound actual arrival ≥ min_connect_minutes`.
- Crew: duty = last actual arrival − `duty_start`, compared with `max_duty_mins`.
- Spares: positioning uses the dataset's scheduled block times along routes the airline actually flies. The standby crew is an explicit, switchable assumption, because the dataset has no reserve crews.

The full rules are in [ARCHITECTURE.md](ARCHITECTURE.md#simulation-engine).
