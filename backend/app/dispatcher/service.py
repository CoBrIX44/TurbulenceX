"""AI dispatcher.

Pipeline: simulation engine -> calculated state -> (LLM or rule engine) ->
structured recommendation -> deterministic validation -> response.

The LLM may only *select* engine-evaluated candidates (by id) or *propose* a
structured action. Every proposal is re-simulated; every number in the
response comes from the engine. Numeric fields the LLM returns are ignored, and
numbers inside its narrative that do not appear in the engine context are
flagged as unverified.
"""

from __future__ import annotations

import json
import re
from typing import Literal, Optional

from pydantic import BaseModel, ValidationError

from ..engine.dataset import Network
from ..engine.models import FlightStatus, ScenarioInput, SimulationResult
from ..engine.recovery_search import EvaluatedAction, evaluate_action, parse_action, rank_candidates
from ..engine.simulator import simulate
from ..engine.timeutil import fmt_minutes
from .provider import LLMError, LLMProvider

MAX_RECOMMENDATIONS = 5


class Recommendation(BaseModel):
    rank: int
    candidate_id: str
    title: str
    category: str
    action: dict
    reason: str
    reason_source: Literal["llm", "rule_based"]
    proposed_by: Literal["llm_selected", "llm_proposed", "rule_based"]
    flights_affected: list[str]
    impact: dict
    trade_offs: list[str]
    risks: list[str]
    checks: list[dict]
    feasibility_status: str


class RejectedProposal(BaseModel):
    proposal: dict
    reason: str


class CrewAlert(BaseModel):
    crew_id: str
    tail_id: str
    excess_mins: int
    explanation: str


class PriorityFlight(BaseModel):
    flight_id: str
    route: str
    arr_delay: int
    pax: int
    passenger_delay_minutes: int
    reason: str


class DispatcherResponse(BaseModel):
    source: Literal["llm", "rule_based"]
    model: Optional[str] = None
    provider_error: Optional[str] = None
    situation_summary: str
    unverified_numbers: list[str] = []
    recommendations: list[Recommendation]
    rejected: list[RejectedProposal] = []
    crew_alerts: list[CrewAlert]
    priority_flights: list[PriorityFlight]
    candidates_evaluated: int


SYSTEM_PROMPT = """You are an airline operations recovery dispatcher assistant.
You receive the output of a deterministic flight-disruption simulation engine and a list of
recovery candidates that the engine has ALREADY simulated. Your job: choose the best recovery
actions and explain them clearly to an operations controller.

STRICT RULES:
- Never invent or compute operational numbers. Only refer to numbers present in the input.
- Recommend at most 5 actions. Prefer candidates by their candidate_id.
- You may propose a new action only using one of these JSON shapes:
  {"type":"deploy_spare","spare_tail":"VT-DS17|VT-DS18","replace_tail":"VT-DSxx","from_flight":"DSxxxx"}
  {"type":"cancel_flights","flight_ids":["DSxxxx",...]}
  {"type":"swap_aircraft","flight_a":"DSxxxx","flight_b":"DSxxxx"}
  {"type":"protect_connection","connection_id":"CXnn","max_hold_min":60}
  The engine will validate it; infeasible proposals are rejected.
- Do not use the same spare aircraft twice.
Respond ONLY with JSON:
{"situation_summary": "<3-5 sentences>",
 "recommendations": [{"candidate_id": "<id or null>", "action": <object or null>, "reason": "<why>", "risks": ["..."]}]}"""


def build_context(net: Network, sim: SimulationResult, candidates: list[EvaluatedAction]) -> dict:
    """Compact, engine-computed state handed to the LLM."""
    k = sim.kpis
    delayed = [f for f in sim.flights if f.status in (FlightStatus.DELAYED, FlightStatus.SEVERE)]
    used = {o.action.get("spare_tail") for o in sim.actions if o.applied and o.action.get("type") == "deploy_spare"}
    return {
        "kpis": k.model_dump(),
        "disruptions": [d.model_dump(mode="json") for d in sim.disruptions],
        "applied_actions": [o.action for o in sim.actions if o.applied],
        "delayed_flights": [
            {
                "flight_id": f.flight_id,
                "aircraft": f.operating_tail,
                "route": f"{f.origin}-{f.destination}",
                "sched_dep": fmt_minutes(f.sched_dep),
                "actual_dep": fmt_minutes(f.actual_dep or 0),
                "arr_delay_min": f.arr_delay,
                "pax": f.pax,
                "reason": f.primary_reason,
                "root_cause": f.root_cause,
            }
            for f in sorted(delayed, key=lambda x: -x.arr_delay)[:25]
        ],
        "cancelled_flights": [f.flight_id for f in sim.flights if f.status == FlightStatus.CANCELLED],
        "connections_broken": [c.model_dump() for c in sim.connections if c.status != "made"],
        "crew_violations": [
            c.model_dump(include={"crew_id", "tail_id", "actual_duty_mins", "max_duty_mins", "excess_mins", "cause_flight"}) for c in sim.crews if c.violation
        ],
        "spare_aircraft": [
            {"tail_id": s.tail_id, "base": s.base, "available_from": s.available_from, "seats": s.seats, "available": s.tail_id not in used}
            for s in net.data.spare_aircraft
        ],
        "airport_restrictions": [a.model_dump() for a in sim.airports if a.restricted],
        "candidates": [
            {
                "candidate_id": c.candidate_id,
                "category": c.category,
                "action": c.action,
                "summary": c.message,
                "impact": c.impact.model_dump() if c.impact else None,
                "trade_offs": c.trade_offs,
                "warnings": c.warnings,
            }
            for c in candidates
        ],
    }


def _numbers(obj: object) -> set[str]:
    return set(re.findall(r"\d+(?:\.\d+)?", json.dumps(obj)))


def find_unverified_numbers(text: str, context: dict) -> list[str]:
    allowed = _numbers(context)
    found = re.findall(r"(?<![A-Za-z0-9\-.:])\d+(?:\.\d+)?", text)
    return sorted({n for n in found if n not in allowed and not (len(n) <= 2 and int(float(n)) <= 10)})


def _title(c: EvaluatedAction) -> str:
    a = c.action
    if a["type"] == "deploy_spare":
        return f"Deploy {a['spare_tail']} on {a['replace_tail']} rotation from {a['from_flight']}"
    if a["type"] == "cancel_flights":
        return f"Cancel {' + '.join(a['flight_ids'])}"
    if a["type"] == "swap_aircraft":
        return f"Swap aircraft at {a['flight_a']} / {a['flight_b']}"
    return f"Protect connection {a['connection_id']} (hold ≤ {a['max_hold_min']} min)"


def _rule_reason(c: EvaluatedAction) -> str:
    i = c.impact
    assert i is not None
    parts = [c.message + "."]
    if i.delay_reduction_min > 0:
        parts.append(f"Cuts network arrival delay from {i.delay_minutes_before} to {i.delay_minutes_after} minutes.")
    if i.missed_connection_pax_after < i.missed_connection_pax_before:
        parts.append(f"Missed-connection passengers fall from {i.missed_connection_pax_before} to {i.missed_connection_pax_after}.")
    if i.crew_violations_after < i.crew_violations_before:
        parts.append(f"Removes {i.crew_violations_before - i.crew_violations_after} crew duty violation(s).")
    parts.append(f"Passenger impact index improves by {i.impact_reduction}.")
    return " ".join(parts)


def _to_rec(rank: int, c: EvaluatedAction, reason: str, reason_source: str, proposed_by: str, extra_risks: list[str]) -> Recommendation:
    return Recommendation(
        rank=rank,
        candidate_id=c.candidate_id,
        title=_title(c),
        category=c.category,
        action=c.action,
        reason=reason,
        reason_source=reason_source,  # type: ignore[arg-type]
        proposed_by=proposed_by,  # type: ignore[arg-type]
        flights_affected=c.flights_affected,
        impact=c.impact.model_dump() if c.impact else {},
        trade_offs=c.trade_offs,
        risks=list(dict.fromkeys(c.warnings + extra_risks)),
        checks=c.checks,
        feasibility_status=c.feasibility_status,
    )


def _diverse_top(cands: list[EvaluatedAction], n: int) -> list[EvaluatedAction]:
    """Best candidate per category first, then by impact; never reuse a spare."""
    picked: list[EvaluatedAction] = []
    spares: set[str] = set()

    def ok(c: EvaluatedAction) -> bool:
        s = c.action.get("spare_tail")
        return not (s and s in spares)

    for cat in ("Deploy spare aircraft", "Protect connection", "Reassign aircraft", "Cancel flight(s)"):
        best = next((c for c in cands if c.category == cat and ok(c)), None)
        if best:
            picked.append(best)
            if best.action.get("spare_tail"):
                spares.add(best.action["spare_tail"])
    for c in cands:
        if len(picked) >= n:
            break
        if c not in picked and ok(c):
            picked.append(c)
            if c.action.get("spare_tail"):
                spares.add(c.action["spare_tail"])
    picked.sort(key=lambda c: -(c.impact.impact_reduction if c.impact else 0))
    return picked[:n]


def _rule_summary(sim: SimulationResult) -> str:
    k = sim.kpis
    if not sim.disruptions:
        return "No disruptions are configured. The network operates to schedule; no recovery is required."
    ds = ", ".join(f"{d.airport} {d.type.value.replace('_', ' ')} from {d.start} for {d.duration_min} min" for d in sim.disruptions)
    worst = max(sim.flights, key=lambda f: f.arr_delay)
    return (
        f"Active disruption(s): {ds}. {k.delayed} of {k.total_flights} flights are delayed ({k.severe} severely) and "
        f"{k.cancelled} cancelled, totalling {k.total_arr_delay_min} arrival-delay minutes across {k.aircraft_delayed} aircraft. "
        f"{k.missed_connections} connection(s) are broken ({k.missed_connection_pax} connecting passengers) and "
        f"{k.crew_violations} crew duty violation(s) are projected. Worst delay: {worst.flight_id} at {worst.arr_delay} min. "
        f"On-time performance {k.otp_pct}%; {k.spares_available} spare aircraft available."
    )


def recommend(net: Network, scenario: ScenarioInput, provider: Optional[LLMProvider], max_candidates: int = 12) -> DispatcherResponse:
    sim = simulate(net, scenario)
    ranked = rank_candidates(net, scenario, sim)
    crew_alerts = [CrewAlert(crew_id=c.crew_id, tail_id=c.tail_id, excess_mins=c.excess_mins, explanation=c.explanation) for c in sim.crews if c.violation]
    prio = sorted(
        (f for f in sim.flights if f.status in (FlightStatus.DELAYED, FlightStatus.SEVERE)),
        key=lambda f: (-(f.pax * f.arr_delay), f.flight_id),
    )[:5]
    priority = [
        PriorityFlight(
            flight_id=f.flight_id,
            route=f"{f.origin}→{f.destination}",
            arr_delay=f.arr_delay,
            pax=f.pax,
            passenger_delay_minutes=f.pax * f.arr_delay,
            reason=f.explanation,
        )
        for f in prio
    ]
    by_id = {c.candidate_id: c for c in ranked}

    provider_error: Optional[str] = None
    if provider is not None:
        shortlist = ranked[:max_candidates]
        context = build_context(net, sim, shortlist)
        try:
            raw = provider.complete_json(SYSTEM_PROMPT, json.dumps(context))
            recs: list[Recommendation] = []
            rejected: list[RejectedProposal] = []
            used_spares: set[str] = set()
            for item in (raw.get("recommendations") or [])[: MAX_RECOMMENDATIONS * 2]:
                if not isinstance(item, dict):
                    continue
                reason = str(item.get("reason") or "")[:1200]
                risks = [str(r)[:300] for r in (item.get("risks") or []) if isinstance(r, (str, int, float))][:5]
                cand: Optional[EvaluatedAction] = None
                proposed_by = "llm_selected"
                cid = item.get("candidate_id")
                if isinstance(cid, str) and cid in by_id:
                    cand = by_id[cid]
                elif isinstance(item.get("action"), dict):
                    proposed_by = "llm_proposed"
                    try:
                        action = parse_action(item["action"])
                    except ValidationError as exc:
                        rejected.append(RejectedProposal(proposal=item["action"], reason=f"Malformed action: {exc.errors()[0]['msg']}"))
                        continue
                    ev = evaluate_action(net, scenario, action, sim)
                    if not ev.feasible:
                        rejected.append(RejectedProposal(proposal=item["action"], reason=f"Engine rejected: {ev.message}"))
                        continue
                    if not ev.impact or ev.impact.impact_reduction <= 0:
                        rejected.append(RejectedProposal(proposal=item["action"], reason="Engine simulation shows no improvement"))
                        continue
                    cand = ev
                else:
                    rejected.append(RejectedProposal(proposal={"candidate_id": cid}, reason="Unknown candidate id"))
                    continue
                spare = cand.action.get("spare_tail")
                if spare and spare in used_spares:
                    rejected.append(RejectedProposal(proposal=cand.action, reason=f"{spare} already recommended (overlapping assignment)"))
                    continue
                if spare:
                    used_spares.add(spare)
                if any(r.candidate_id == cand.candidate_id for r in recs):
                    continue
                recs.append(_to_rec(len(recs) + 1, cand, reason or _rule_reason(cand), "llm", proposed_by, risks))
                if len(recs) >= MAX_RECOMMENDATIONS:
                    break
            summary = str(raw.get("situation_summary") or "")[:2000] or _rule_summary(sim)
            narrative = summary + " " + " ".join(r.reason for r in recs if r.reason_source == "llm")
            return DispatcherResponse(
                source="llm",
                model=provider.model,
                situation_summary=summary,
                unverified_numbers=find_unverified_numbers(narrative, context),
                recommendations=recs,
                rejected=rejected,
                crew_alerts=crew_alerts,
                priority_flights=priority,
                candidates_evaluated=len(ranked),
            )
        except LLMError as exc:
            provider_error = str(exc)

    top = _diverse_top(ranked, MAX_RECOMMENDATIONS)
    return DispatcherResponse(
        source="rule_based",
        provider_error=provider_error,
        situation_summary=_rule_summary(sim),
        recommendations=[_to_rec(i + 1, c, _rule_reason(c), "rule_based", "rule_based", []) for i, c in enumerate(top)],
        crew_alerts=crew_alerts,
        priority_flights=priority,
        candidates_evaluated=len(ranked),
    )
