# TECH_STACK — Domino Sky

| Layer | Choice | Notes |
|---|---|---|
| Frontend framework | React 19 + TypeScript (strict) + Vite 8 | SPA, route-level code splitting (`React.lazy`) |
| Routing | react-router-dom 7 | 9 routes under a persistent layout |
| State | zustand 5 | single store `useSim` (scenario, results, playback, dispatcher, strategies) |
| UI & styling | Tailwind CSS v4 (`@tailwindcss/vite`), shadcn/ui-pattern components vendored in `src/components/ui` (cva + tailwind-merge + clsx), Lucide icons | No shadcn CLI dependency; same patterns/variants |
| Maps | Leaflet 1.9 + react-leaflet 5, OpenStreetMap tiles (dark via CSS filter; `VITE_MAP_TILE_URL` to override) | geographic airport positions from dataset |
| Graphs | @xyflow/react (React Flow) | causal dependency graph in flight inspector |
| Charts | Recharts 3 | delay distribution, airport impact, health gauge, comparisons |
| Backend | Python 3.11+ (tested on 3.13), FastAPI, Pydantic v2, pydantic-settings, uvicorn | |
| Engine | Pure Python module `app/engine` | integer-minute deterministic simulation |
| AI integration | `OpenAICompatibleProvider` (httpx → `/chat/completions`, JSON mode, temperature 0); env-configured; deterministic rule-based fallback | Works with OpenAI or any compatible gateway |
| Storage | `flight_network.json` (authoritative, read-only); scenarios in a JSON file (`SCENARIO_STORE_PATH`) with atomic writes | no database needed (see DATABASE.md) |
| Testing | pytest (69 tests), vitest (17 tests), Playwright (6 E2E flows) | |
| Quality | ruff (lint+format), mypy, oxlint, prettier, `tsc -b` | |
| Deployment | Backend: Docker/uvicorn (Render, Railway, Fly, Azure App Service…). Frontend: static build (Vercel, Netlify, S3+CloudFront, nginx). `docker-compose.yml` for both. | Independently deployable |

Dependency policy: no heavy optimisation or DB libraries; every dependency is used by a shipped feature.
