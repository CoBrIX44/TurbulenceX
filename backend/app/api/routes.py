"""HTTP API (see docs/API.md)."""

from __future__ import annotations

import csv
import io
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from ..config import Settings, get_settings
from ..dispatcher.provider import OpenAICompatibleProvider
from ..dispatcher.service import DispatcherResponse, recommend
from ..engine import constants as C
from ..engine.dataset import Network, ValidationReport, validate_network
from ..engine.models import RecoveryAction, ScenarioInput, SimulationResult
from ..engine.recovery_search import EvaluatedAction, evaluate_action, rank_candidates, route_graph_public
from ..engine.simulator import compare_kpis, simulate
from ..engine.timeutil import fmt_minutes
from ..presets import PRESETS
from ..store.scenarios import ScenarioBody, ScenarioStore, StoredScenario
from .deps import get_network, get_store

router = APIRouter(prefix="/api")


class SimulateResponse(BaseModel):
    baseline: SimulationResult
    disrupted: SimulationResult
    recovered: Optional[SimulationResult]
    comparison: dict


class EvaluateRequest(BaseModel):
    scenario: ScenarioInput
    action: RecoveryAction


class ExportRequest(BaseModel):
    name: str = "scenario"
    scenario: ScenarioInput
    format: Literal["json", "csv"] = "json"


def _check_airports(net: Network, scenario: ScenarioInput) -> None:
    ids = [d.id for d in scenario.disruptions]
    if len(ids) != len(set(ids)):
        raise HTTPException(422, "Disruption ids must be unique")
    for d in scenario.disruptions:
        if d.airport not in net.airports:
            raise HTTPException(422, f"Unknown airport {d.airport}")


def run_all(net: Network, scenario: ScenarioInput) -> SimulateResponse:
    _check_airports(net, scenario)
    baseline = simulate(net, ScenarioInput(settings=scenario.settings))
    disrupted = simulate(net, scenario.model_copy(update={"actions": []}))
    recovered = simulate(net, scenario) if scenario.actions else None
    return SimulateResponse(
        baseline=baseline,
        disrupted=disrupted,
        recovered=recovered,
        comparison=compare_kpis(baseline.kpis, disrupted.kpis, recovered.kpis if recovered else None),
    )


@router.get("/health")
def health(net: Network = Depends(get_network)) -> dict:
    return {"status": "ok", "dataset_checksum": net.checksum}


@router.get("/network")
def network(net: Network = Depends(get_network)) -> dict:
    d = net.data
    routes = sorted({tuple(sorted((f.origin, f.destination))) for f in d.flights})
    return {
        "meta": d.meta.model_dump(),
        "airports": [a.model_dump() for a in d.airports],
        "flights": [{**f.model_dump(), "dep_min": net.times[f.flight_id].dep, "arr_min": net.times[f.flight_id].arr} for f in d.flights],
        "connections": [c.model_dump() for c in d.connections],
        "crews": [c.model_dump() for c in d.crews],
        "spare_aircraft": [s.model_dump() for s in d.spare_aircraft],
        "rotations": net.rotations,
        "routes": [list(r) for r in routes],
        "positioning_routes": route_graph_public(net),
        "checksum": net.checksum,
    }


@router.get("/validation", response_model=ValidationReport)
def validation(net: Network = Depends(get_network)) -> ValidationReport:
    return validate_network(net)


@router.get("/model")
def model_parameters(settings: Settings = Depends(get_settings), net: Network = Depends(get_network)) -> dict:
    return {
        "min_turnaround_minutes": net.min_turnaround,
        "seats_per_aircraft": net.seats,
        "delay_threshold_min": C.DELAY_THRESHOLD_MIN,
        "severe_delay_min": C.SEVERE_DELAY_MIN,
        "crew_report_min": C.CREW_REPORT_MIN,
        "cancelled_pax_penalty_min": C.CANCELLED_PAX_PENALTY_MIN,
        "missed_connection_pax_penalty_min": C.MISSED_CONNECTION_PAX_PENALTY_MIN,
        "health_bands": C.HEALTH_BANDS,
        "default_reduction_pct": C.DEFAULT_REDUCTION_PCT,
        "llm": {
            "configured": bool(settings.llm_api_key),
            "model": settings.llm_model if settings.llm_api_key else None,
            "base_url": settings.llm_base_url if settings.llm_api_key else None,
        },
    }


@router.get("/presets")
def presets() -> list[dict]:
    return [{**p, "disruptions": [d.model_dump(mode="json") for d in p["disruptions"]]} for p in PRESETS]


@router.post("/simulate", response_model=SimulateResponse)
def simulate_endpoint(scenario: ScenarioInput, net: Network = Depends(get_network)) -> SimulateResponse:
    return run_all(net, scenario)


@router.post("/recovery/evaluate", response_model=EvaluatedAction)
def evaluate(req: EvaluateRequest, net: Network = Depends(get_network)) -> EvaluatedAction:
    _check_airports(net, req.scenario)
    return evaluate_action(net, req.scenario, req.action)


@router.post("/recovery/candidates", response_model=list[EvaluatedAction])
def candidates(scenario: ScenarioInput, net: Network = Depends(get_network)) -> list[EvaluatedAction]:
    _check_airports(net, scenario)
    return rank_candidates(net, scenario)[:30]


@router.post("/dispatcher/recommend", response_model=DispatcherResponse)
def dispatcher(scenario: ScenarioInput, net: Network = Depends(get_network), settings: Settings = Depends(get_settings)) -> DispatcherResponse:
    _check_airports(net, scenario)
    provider = (
        OpenAICompatibleProvider(settings.llm_api_key, settings.llm_base_url, settings.llm_model, settings.llm_timeout_s) if settings.llm_api_key else None
    )
    return recommend(net, scenario, provider, settings.llm_max_candidates)


# ---------------------------- scenarios ----------------------------


@router.get("/scenarios", response_model=list[StoredScenario])
def list_scenarios(store: ScenarioStore = Depends(get_store)) -> list[StoredScenario]:
    return store.list()


@router.post("/scenarios", response_model=StoredScenario, status_code=201)
def create_scenario(body: ScenarioBody, store: ScenarioStore = Depends(get_store), net: Network = Depends(get_network)) -> StoredScenario:
    _check_airports(net, ScenarioInput(disruptions=body.disruptions))
    return store.create(body)


@router.get("/scenarios/{sid}", response_model=StoredScenario)
def get_scenario(sid: str, store: ScenarioStore = Depends(get_store)) -> StoredScenario:
    s = store.get(sid)
    if s is None:
        raise HTTPException(404, "Scenario not found")
    return s


@router.put("/scenarios/{sid}", response_model=StoredScenario)
def update_scenario(sid: str, body: ScenarioBody, store: ScenarioStore = Depends(get_store), net: Network = Depends(get_network)) -> StoredScenario:
    _check_airports(net, ScenarioInput(disruptions=body.disruptions))
    s = store.update(sid, body)
    if s is None:
        raise HTTPException(404, "Scenario not found")
    return s


@router.delete("/scenarios/{sid}", status_code=204)
def delete_scenario(sid: str, store: ScenarioStore = Depends(get_store)) -> Response:
    if not store.delete(sid):
        raise HTTPException(404, "Scenario not found")
    return Response(status_code=204)


@router.post("/scenarios/{sid}/duplicate", response_model=StoredScenario, status_code=201)
def duplicate_scenario(sid: str, store: ScenarioStore = Depends(get_store)) -> StoredScenario:
    s = store.duplicate(sid)
    if s is None:
        raise HTTPException(404, "Scenario not found")
    return s


@router.post("/export")
def export(req: ExportRequest, net: Network = Depends(get_network)) -> Response:
    res = run_all(net, req.scenario)
    safe = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in req.name)[:60] or "scenario"
    if req.format == "json":
        body = {"name": req.name, "dataset_checksum": net.checksum, "scenario": req.scenario.model_dump(mode="json"), **res.model_dump(mode="json")}
        import json

        return Response(
            json.dumps(body, indent=2),
            media_type="application/json",
            headers={"Content-Disposition": f'attachment; filename="{safe}.json"'},
        )
    final = res.recovered or res.disrupted
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(
        [
            "flight_id",
            "aircraft",
            "operating_aircraft",
            "leg",
            "origin",
            "destination",
            "sched_dep",
            "actual_dep",
            "sched_arr",
            "actual_arr",
            "dep_delay",
            "arr_delay",
            "pax",
            "status",
            "primary_reason",
            "root_cause",
            "explanation",
        ]
    )
    for f in final.flights:
        w.writerow(
            [
                f.flight_id,
                f.tail_id,
                f.operating_tail or "",
                f.leg_order,
                f.origin,
                f.destination,
                fmt_minutes(f.sched_dep),
                fmt_minutes(f.actual_dep) if f.actual_dep is not None else "",
                fmt_minutes(f.sched_arr),
                fmt_minutes(f.actual_arr) if f.actual_arr is not None else "",
                f.dep_delay,
                f.arr_delay,
                f.pax,
                f.status.value,
                f.primary_reason,
                f.root_cause or "",
                f.explanation,
            ]
        )
    return Response(buf.getvalue(), media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="{safe}.csv"'})
