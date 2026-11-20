# Deployment Guide — Domino Sky

Frontend (static SPA) and backend (FastAPI) are independently deployable.

## 1. Local production-like run
```bash
# backend
cd backend && pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
# frontend
cd frontend && npm ci && npm run build && npm run preview   # http://localhost:4173 (proxies /api)
```

## 2. Docker Compose (both services)
```bash
cp backend/.env.example backend/.env    # optional: set LLM_API_KEY
docker compose up --build
# UI: http://localhost:8080  (nginx proxies /api → backend)   API: http://localhost:8000/docs
```
Scenarios persist in the named volume `scenarios`.

## 3. Backend on a container host (Render / Railway / Fly.io / Azure / Cloud Run)
- Build from `backend/Dockerfile` (listens on `$PORT`, default 8000).
- Environment: `CORS_ORIGINS=https://<your-frontend-domain>`, optional `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`.
- Scenario persistence: mount a persistent disk at `/app/data/scenarios` or set `SCENARIO_STORE_PATH` to a mounted path. On ephemeral/serverless hosts saved scenarios reset on redeploy (see DATABASE.md for the Postgres path).
- Health check: `GET /api/health`.
- Without Docker: `pip install -r requirements.txt && uvicorn app.main:app --host 0.0.0.0 --port $PORT`.

## 4. Frontend on static hosting (Vercel / Netlify / S3+CloudFront / nginx)
```bash
cd frontend
VITE_API_BASE_URL=https://api.example.com npm run build     # outputs dist/
```
- Configure SPA fallback (all routes → `index.html`). Netlify: `_redirects` with `/* /index.html 200`; Vercel: rewrite `/(.*)` → `/index.html`.
- Alternatively build `frontend/Dockerfile` (nginx, includes SPA routing and an optional `/api` proxy to a `backend` host).
- `VITE_MAP_TILE_URL` can point to any XYZ tile server (respect the provider's usage policy; OpenStreetMap's public tiles are for light use).

## 5. Environment reference
| Variable | Service | Default | Purpose |
|---|---|---|---|
| DATASET_PATH | backend | data/flight_network.json | authoritative dataset |
| SCENARIO_STORE_PATH | backend | data/scenarios/scenarios.json | scenario JSON store |
| CORS_ORIGINS | backend | localhost:5173 | allowed browser origins |
| LLM_API_KEY | backend | (empty → rule-based) | enables LLM dispatcher |
| LLM_BASE_URL | backend | https://api.openai.com/v1 | any OpenAI-compatible endpoint |
| LLM_MODEL | backend | gpt-4o-mini | model name |
| LLM_TIMEOUT_S / LLM_MAX_CANDIDATES | backend | 30 / 12 | provider timeout / shortlist size |
| VITE_API_BASE_URL | frontend (build time) | empty (same origin) | backend URL |
| VITE_MAP_TILE_URL | frontend (build time) | OSM | map tiles |

## 6. Release checklist
`pytest -q && ruff check app tests && mypy app` · `npm run typecheck && npm run lint && npm test && npm run build` · `npm run test:e2e` · verify `/api/validation` returns `valid: true` in the target environment.
