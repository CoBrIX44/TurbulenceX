"""Deterministic recovery candidate generation and evaluation.

Every candidate action is executed through the simulator; all impact numbers
attached to a candidate are simulator outputs. This module is used both by the
rule-based dispatcher and to validate LLM proposals.
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, TypeAdapter

from .dataset import Network
from .models import (
    CancelFlights,
    DeploySpare,
    FlightStatus,
    ProtectConnection,
    RecoveryAction,
    ScenarioInput,
    SimulationResult,
    SwapAircraft,
)
from .simulator import simulate

ACTION_ADAPTER: TypeAdapter[RecoveryAction] = TypeAdapter(RecoveryAction)  # type: ignore[arg-type]

SWAP_WINDOW_MIN = 120  # MODEL: only consider swaps between legs scheduled within 2h of each other


class ImpactDelta(BaseModel):
    delay_minutes_before: int
    delay_minutes_after: int
    delay_reduction_min: int
    impact_before: int
    impact_after: int
    impact_reduction: int
    pax_protected: int
    missed_connection_pax_before: int
    missed_connection_pax_after: int
    cancelled_pax_added: int
    crew_violations_before: int
    crew_violations_after: int
    delayed_flights_before: int
    delayed_flights_after: int


class EvaluatedAction(BaseModel):
    candidate_id: str
    category: str
    action: dict
    feasible: bool
    feasibility_status: str  # feasible | feasible_with_warnings | infeasible
    checks: list[dict]
    warnings: list[str]
    message: str
    flights_affected: list[str]
    impact: Optional[ImpactDelta] = None
    trade_offs: list[str] = []


def candidate_id(action: RecoveryAction) -> str:
    if isinstance(action, DeploySpare):
        return f"SPARE:{action.spare_tail}:{action.replace_tail}:{action.from_flight}"
    if isinstance(action, CancelFlights):
        return "CANCEL:" + "+".join(action.flight_ids)
    if isinstance(action, SwapAircraft):
        return f"SWAP:{action.flight_a}:{action.flight_b}"
    if isinstance(action, ProtectConnection):
        return f"PROTECT:{action.connection_id}:{action.max_hold_min}"
    raise TypeError(action)  # pragma: no cover


CATEGORY = {
    "deploy_spare": "Deploy spare aircraft",
    "cancel_flights": "Cancel flight(s)",
    "swap_aircraft": "Reassign aircraft",
    "protect_connection": "Protect connection",
}


def evaluate_action(net: Network, scenario: ScenarioInput, action: RecoveryAction, current: Optional[SimulationResult] = None) -> EvaluatedAction:
    """Run `action` on top of the scenario's existing actions and measure its impact."""
    current = current or simulate(net, scenario)
    trial = scenario.model_copy(update={"actions": [*scenario.actions, action]})
    after = simulate(net, trial)
    outcome = after.actions[-1]
    cid = candidate_id(action)
    if not outcome.applied:
        return EvaluatedAction(
            candidate_id=cid,
            category=CATEGORY[action.type],
            action=action.model_dump(),
            feasible=False,
            feasibility_status="infeasible",
            checks=outcome.checks,
            warnings=outcome.warnings,
            message=outcome.message,
            flights_affected=[],
        )
    before_f = {f.flight_id: f for f in current.flights}
    changed = sorted(
        f.flight_id
        for f in after.flights
        if (f.status, f.actual_dep, f.actual_arr, f.operating_tail)
        != (before_f[f.flight_id].status, before_f[f.flight_id].actual_dep, before_f[f.flight_id].actual_arr, before_f[f.flight_id].operating_tail)
    )
    b, a = current.kpis, after.kpis
    trade = []
    worse = [
        f.flight_id
        for f in after.flights
        if f.status != FlightStatus.CANCELLED and before_f[f.flight_id].status != FlightStatus.CANCELLED and f.arr_delay > before_f[f.flight_id].arr_delay
    ]
    if worse:
        trade.append(f"Increases delay on {', '.join(worse)}")
    newly_cancelled = [f.flight_id for f in after.flights if f.status == FlightStatus.CANCELLED and before_f[f.flight_id].status != FlightStatus.CANCELLED]
    if newly_cancelled:
        trade.append(f"Cancels {', '.join(newly_cancelled)} ({a.pax_on_cancelled - b.pax_on_cancelled} passengers need re-accommodation)")
    if a.crew_violations > b.crew_violations:
        trade.append(f"Creates {a.crew_violations - b.crew_violations} additional crew duty violation(s)")
    if a.spares_used > b.spares_used:
        trade.append("Consumes a spare aircraft (no longer available for other disruptions)")
    impact = ImpactDelta(
        delay_minutes_before=b.total_arr_delay_min,
        delay_minutes_after=a.total_arr_delay_min,
        delay_reduction_min=b.total_arr_delay_min - a.total_arr_delay_min,
        impact_before=b.impact_index,
        impact_after=a.impact_index,
        impact_reduction=b.impact_index - a.impact_index,
        pax_protected=max(0, b.distinct_affected_pax_estimate - a.distinct_affected_pax_estimate)
        if not newly_cancelled
        else max(0, (b.pax_on_delayed + b.missed_connection_pax) - (a.pax_on_delayed + a.missed_connection_pax) - (a.pax_on_cancelled - b.pax_on_cancelled)),
        missed_connection_pax_before=b.missed_connection_pax,
        missed_connection_pax_after=a.missed_connection_pax,
        cancelled_pax_added=a.pax_on_cancelled - b.pax_on_cancelled,
        crew_violations_before=b.crew_violations,
        crew_violations_after=a.crew_violations,
        delayed_flights_before=b.delayed,
        delayed_flights_after=a.delayed,
    )
    return EvaluatedAction(
        candidate_id=cid,
        category=CATEGORY[action.type],
        action=action.model_dump(),
        feasible=True,
        feasibility_status="feasible_with_warnings" if outcome.warnings else "feasible",
        checks=outcome.checks,
        warnings=outcome.warnings,
        message=outcome.message,
        flights_affected=changed,
        impact=impact,
        trade_offs=trade,
    )


def generate_candidates(net: Network, scenario: ScenarioInput, current: SimulationResult) -> list[RecoveryAction]:
    """Enumerate plausible recovery actions around the disrupted flights (deterministic order)."""
    flights = {f.flight_id: f for f in current.flights}
    disrupted = {f.flight_id for f in current.flights if f.status in (FlightStatus.DELAYED, FlightStatus.SEVERE)}
    out: list[RecoveryAction] = []
    seen: set[str] = set()

    def add(a: RecoveryAction) -> None:
        cid = candidate_id(a)
        if cid not in seen:
            seen.add(cid)
            out.append(a)

    tails_legs = {a.tail_id: [fid for fid in a.flights if fid in flights] for a in current.aircraft}
    used_spares = {a["spare_tail"] for a in (o.action for o in current.actions if o.applied) if a.get("type") == "deploy_spare"}
    # 1. Spare deployments: take over a delayed tail from a delayed leg.
    for spare in sorted(net.spares):
        if spare in used_spares:
            continue
        for tail, legs in sorted(tails_legs.items()):
            if tail in net.spares:
                continue
            for fid in legs:
                if fid in disrupted:
                    add(DeploySpare(spare_tail=spare, replace_tail=tail, from_flight=fid))
    # 2. Cancellations: round-trip pairs or final legs on delayed tails.
    for tail, legs in sorted(tails_legs.items()):
        active = [fid for fid in legs if flights[fid].status != FlightStatus.CANCELLED]
        for i, fid in enumerate(active):
            if fid not in disrupted:
                continue
            f = flights[fid]
            if i + 1 < len(active):
                nxt = flights[active[i + 1]]
                if nxt.destination == f.origin:
                    add(CancelFlights(flight_ids=[fid, nxt.flight_id]))
            if i == len(active) - 1:
                add(CancelFlights(flight_ids=[fid]))
    # 3. Aircraft swaps: delayed leg vs another aircraft's leg from the same airport.
    for fid in sorted(disrupted):
        f = flights[fid]
        for g in current.flights:
            if g.flight_id == fid or g.status == FlightStatus.CANCELLED or g.origin != f.origin:
                continue
            if g.operating_tail == f.operating_tail or g.operating_tail is None:
                continue
            if abs(g.sched_dep - f.sched_dep) > SWAP_WINDOW_MIN or g.dep_delay >= f.dep_delay:
                continue
            add(SwapAircraft(flight_a=fid, flight_b=g.flight_id))
    # 4. Protect missed connections.
    for c in current.connections:
        if c.status == "missed":
            add(ProtectConnection(connection_id=c.connection_id, max_hold_min=60))
    return out


def rank_candidates(net: Network, scenario: ScenarioInput, current: Optional[SimulationResult] = None) -> list[EvaluatedAction]:
    current = current or simulate(net, scenario)
    evaluated = [evaluate_action(net, scenario, a, current) for a in generate_candidates(net, scenario, current)]
    useful = [e for e in evaluated if e.feasible and e.impact and e.impact.impact_reduction > 0]
    useful.sort(key=lambda e: (-(e.impact.impact_reduction if e.impact else 0), e.candidate_id))
    return useful


def parse_action(data: dict) -> RecoveryAction:
    return ACTION_ADAPTER.validate_python(data)


def route_graph_public(net: Network) -> dict[str, dict[str, int]]:
    """Positioning graph exposed to the UI (same data the feasibility check uses)."""
    from .plan import route_graph

    return route_graph(net)
