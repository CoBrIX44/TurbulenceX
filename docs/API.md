# Domino Sky API

Base URL: `http://127.0.0.1:8000` (dev). Interactive OpenAPI docs: `/docs`, schema: `/openapi.json`.
All times are integer **minutes from midnight IST** in responses (≥1440 = next day) except where an `HH:MM` string is part of the dataset or a disruption input. Errors: FastAPI JSON `{"detail": ...}` with 404 / 422.

## Types
```ts
Disruption = { id: string, airport: string, type: "thunderstorm"|"airport_closure"|"runway_blockage"|"airspace_restriction"|"ground_handling"|"capacity_reduction",
               start: "HH:MM", duration_min: 5..1440, capacity_reduction_pct: 0..100 (default 100), extra_turnaround_min: 0..240 (default 0), description?: string }
RecoveryAction =
  | { type: "cancel_flights", flight_ids: string[] }
  | { type: "deploy_spare", spare_tail: "VT-DS17"|"VT-DS18", replace_tail: string, from_flight: string }
  | { type: "swap_aircraft", flight_a: string, flight_b: string }
  | { type: "protect_connection", connection_id: string, max_hold_min: 0..240 (default 60) }
ScenarioInput = { disruptions?: Disruption[], actions?: RecoveryAction[], settings?: { assume_standby_crew_for_spares: boolean } }
```
`SimulationResult` = `{ flights: FlightResult[70], connections[21], crews[], aircraft[18], airports[16], capacity[], events[], kpis, actions: ActionOutcome[], disruptions[], ferries[] }` — see `backend/app/engine/models.py` (mirrored in `frontend/src/lib/types.ts`).

## Endpoints

### GET /api/health
`{"status":"ok","dataset_checksum":"78529dd1…"}`

### GET /api/network
Dataset as loaded plus `dep_min`/`arr_min` per flight, `rotations` (tail → flight ids), undirected `routes`, `positioning_routes` (directed city pairs → minimum block minutes used for ferries), `checksum`.

### GET /api/validation
`ValidationReport { valid, checksum, counts, expected_counts, checks: [{id, title, passed, issues[]}] }`.

### GET /api/model
Engine parameters (turnaround, thresholds, crew report time, impact weights, health bands, default severities) and `llm: {configured, model, base_url}`.

### GET /api/presets
Five scenario templates: `[{id, name, description, disruptions[]}]` (inputs only).

### POST /api/simulate
Body `ScenarioInput` →
```json
{ "baseline": SimulationResult, "disrupted": SimulationResult, "recovered": SimulationResult | null,
  "comparison": { "rows": [{"metric","label","baseline","disrupted","recovered?"}],
                  "network_recovery_pct": number|null, "delay_minutes_recovery_pct": number|null } }
```
Example:
```bash
curl -s localhost:8000/api/simulate -H 'content-type: application/json' \
  -d '{"disruptions":[{"id":"D1","airport":"BOM","type":"airport_closure","start":"08:00","duration_min":90}]}' \
  | jq '.disrupted.kpis | {delayed, total_arr_delay_min, missed_connections, otp_pct}'
# {"delayed":9,"total_arr_delay_min":435,"missed_connections":2,"otp_pct":87.1}
```

### POST /api/recovery/evaluate
Body `{scenario: ScenarioInput, action: RecoveryAction}` → `EvaluatedAction { candidate_id, category, action, feasible, feasibility_status, checks[{check,passed,detail}], warnings[], message, flights_affected[], impact: ImpactDelta|null, trade_offs[] }`.
`ImpactDelta` fields: `delay_minutes_before/after, delay_reduction_min, impact_before/after, impact_reduction, pax_protected, missed_connection_pax_before/after, cancelled_pax_added, crew_violations_before/after, delayed_flights_before/after`.

### POST /api/recovery/candidates
Body `ScenarioInput` → up to 30 feasible, improving `EvaluatedAction`s ranked by impact reduction.

### POST /api/dispatcher/recommend
Body `ScenarioInput` →
```json
{ "source": "llm" | "rule_based", "model": "gpt-4o-mini" | null, "provider_error": null,
  "situation_summary": "...", "unverified_numbers": [],
  "recommendations": [{ "rank":1, "candidate_id":"SPARE:VT-DS18:VT-DS12:DS1203", "title":"...", "category":"Deploy spare aircraft",
       "action":{...}, "reason":"...", "reason_source":"llm|rule_based", "proposed_by":"llm_selected|llm_proposed|rule_based",
       "flights_affected":[...], "impact":{ImpactDelta}, "trade_offs":[...], "risks":[...], "checks":[...], "feasibility_status":"feasible_with_warnings" }],
  "rejected": [{"proposal":{...}, "reason":"Engine rejected: ..."}],
  "crew_alerts": [{crew_id, tail_id, excess_mins, explanation}],
  "priority_flights": [{flight_id, route, arr_delay, pax, passenger_delay_minutes, reason}],
  "candidates_evaluated": 5 }
```

### Scenarios
| Method | Path | Body | Response |
|---|---|---|---|
| GET | /api/scenarios | – | `StoredScenario[]` (newest first) |
| POST | /api/scenarios | `{name, description?, disruptions, actions, settings}` | 201 `StoredScenario` |
| GET | /api/scenarios/{id} | – | `StoredScenario` / 404 |
| PUT | /api/scenarios/{id} | same as POST | `StoredScenario` / 404 |
| DELETE | /api/scenarios/{id} | – | 204 / 404 |
| POST | /api/scenarios/{id}/duplicate | – | 201 copy named “… (copy)” |

### POST /api/export
Body `{name, scenario: ScenarioInput, format: "json"|"csv"}` → attachment. JSON contains the scenario, dataset checksum, all three results and the comparison; CSV contains one row per flight of the final state (recovered if actions exist, else disrupted).
