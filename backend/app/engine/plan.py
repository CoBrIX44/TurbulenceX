"""Operating plan: who flies what, after recovery actions are applied.

The plan is built from the dataset rotations, then each recovery action is
checked for deterministic feasibility and — only if feasible — applied. The
simulator executes the resulting plan; it never trusts an action blindly.
"""

from __future__ import annotations

import heapq
from dataclasses import dataclass, field
from typing import Optional

from .constants import CREW_REPORT_MIN
from .dataset import Network
from .models import (
    ActionOutcome,
    CancelFlights,
    DeploySpare,
    ProtectConnection,
    RecoveryAction,
    SimulationSettings,
    SwapAircraft,
)
from .timeutil import fmt_minutes, parse_hhmm


@dataclass
class LegPlan:
    leg_id: str  # flight_id, or FERRY-<tail>-<n> for positioning legs
    origin: str
    destination: str
    sched_dep: int
    block: int
    pax: int
    is_ferry: bool = False

    @property
    def sched_arr(self) -> int:
        return self.sched_dep + self.block


@dataclass
class StandbyCrew:
    crew_id: str
    tail_id: str
    base: str
    duty_start: int
    max_duty_mins: int


@dataclass
class OperatingPlan:
    legs_by_tail: dict[str, list[LegPlan]]
    spare_tails: set[str]
    cancelled: dict[str, str] = field(default_factory=dict)  # flight_id -> reason
    cancel_source: dict[str, int] = field(default_factory=dict)  # flight_id -> action index
    protected: dict[str, tuple[str, int]] = field(default_factory=dict)  # to_flight -> (connection_id, max_hold)
    standby_crews: dict[str, StandbyCrew] = field(default_factory=dict)  # spare tail -> crew
    deployed_spares: set[str] = field(default_factory=set)
    swap_points: dict[str, str] = field(default_factory=dict)  # leg_id -> description
    recovery_airports: set[str] = field(default_factory=set)
    outcomes: list[ActionOutcome] = field(default_factory=list)

    def tail_of(self, leg_id: str) -> Optional[str]:
        for tail, legs in self.legs_by_tail.items():
            if any(leg.leg_id == leg_id for leg in legs):
                return tail
        return None


# --------------------------------------------------------------------------
# Positioning (ferry) model
# --------------------------------------------------------------------------


def route_graph(net: Network) -> dict[str, dict[str, int]]:
    """Directed city pairs with the shortest scheduled block time in the dataset.

    MODEL: positioning (ferry) times are taken from scheduled block times of
    flights in the dataset. A spare can only be positioned along city pairs the
    airline actually flies; otherwise deployment is infeasible.
    """
    g: dict[str, dict[str, int]] = {}
    for f in net.data.flights:
        cur = g.setdefault(f.origin, {}).get(f.destination)
        if cur is None or f.block_minutes < cur:
            g[f.origin][f.destination] = f.block_minutes
    return g


def ferry_path(net: Network, src: str, dst: str) -> Optional[tuple[list[str], list[int]]]:
    """Dijkstra over the scheduled route graph. Each intermediate stop costs the minimum turnaround.

    Returns (airports along the path, block minutes per hop) or None.
    """
    if src == dst:
        return [src], []
    g = route_graph(net)
    turn = net.min_turnaround
    heap: list[tuple[int, str, list[str], list[int]]] = [(0, src, [src], [])]
    best: dict[str, int] = {}
    while heap:
        cost, node, path, blocks = heapq.heappop(heap)
        if node == dst:
            return path, blocks
        if node in best and best[node] <= cost:
            continue
        best[node] = cost
        for nxt, blk in sorted(g.get(node, {}).items()):
            if nxt in path:
                continue
            step = blk + (turn if blocks else 0)
            heapq.heappush(heap, (cost + step, nxt, path + [nxt], blocks + [blk]))
    return None


def ferry_duration(blocks: list[int], turn: int) -> int:
    return sum(blocks) + turn * max(0, len(blocks) - 1)


# --------------------------------------------------------------------------
# Plan construction
# --------------------------------------------------------------------------


def base_plan(net: Network) -> OperatingPlan:
    legs: dict[str, list[LegPlan]] = {}
    for tail, ids in net.rotations.items():
        legs[tail] = [
            LegPlan(
                leg_id=fid,
                origin=net.flights[fid].origin,
                destination=net.flights[fid].destination,
                sched_dep=net.times[fid].dep,
                block=net.flights[fid].block_minutes,
                pax=net.flights[fid].pax,
            )
            for fid in ids
        ]
    for tail in sorted(net.spares):
        legs[tail] = []
    return OperatingPlan(legs_by_tail=legs, spare_tails=set(net.spares))


def _check(name: str, passed: bool, detail: str) -> dict:
    return {"check": name, "passed": passed, "detail": detail}


def static_position_cascade(plan: OperatingPlan, tail: str, extra_cancel: set[str]) -> list[str]:
    """Legs that would be cancelled because the aircraft is out of position (no timing)."""
    legs = plan.legs_by_tail.get(tail, [])
    if not legs:
        return []
    loc = legs[0].origin
    out = []
    for leg in legs:
        if leg.leg_id in plan.cancelled or leg.leg_id in extra_cancel:
            continue
        if leg.origin != loc:
            out.append(leg.leg_id)
            continue
        loc = leg.destination
    return out


def _crew_limit(net: Network, plan: OperatingPlan, tail: str) -> tuple[int, int]:
    if tail in plan.standby_crews:
        c = plan.standby_crews[tail]
        return c.duty_start, c.max_duty_mins
    crew = net.crews[net.crew_by_tail[tail]]
    return parse_hhmm(crew.duty_start), crew.max_duty_mins


def _scheduled_duty_end(plan: OperatingPlan, legs: list[LegPlan]) -> Optional[int]:
    flown = [lg for lg in legs if lg.leg_id not in plan.cancelled]
    return flown[-1].sched_arr if flown else None


def apply_cancel(net: Network, plan: OperatingPlan, idx: int, action: CancelFlights) -> ActionOutcome:
    checks = []
    ok = True
    for fid in action.flight_ids:
        exists = fid in net.flights
        checks.append(_check("flight_exists", exists, f"{fid} {'exists' if exists else 'is not in the dataset'}"))
        if not exists:
            ok = False
            continue
        dup = fid in plan.cancelled
        checks.append(_check("not_already_cancelled", not dup, f"{fid} {'already cancelled' if dup else 'is scheduled'}"))
        ok &= not dup
    warnings: list[str] = []
    if ok:
        ids = set(action.flight_ids)
        tails = sorted({t for t in (plan.tail_of(f) for f in ids) if t is not None})
        for tail in tails:
            cascade = static_position_cascade(plan, tail, ids)
            if cascade:
                warnings.append(
                    f"Aircraft {tail} would be out of position: {', '.join(cascade)} will also be cancelled. "
                    "Cancel a round-trip pair to keep the aircraft in place."
                )
        pax = sum(net.flights[f].pax for f in ids)
        checks.append(_check("passenger_impact", True, f"{pax} booked passengers on cancelled flight(s) need re-accommodation"))
        for fid in action.flight_ids:
            plan.cancelled[fid] = "Cancelled by recovery decision"
            plan.cancel_source[fid] = idx
    return ActionOutcome(
        index=idx,
        action=action.model_dump(),
        feasible=ok,
        applied=ok,
        checks=checks,
        warnings=warnings,
        message=("Cancelled " + ", ".join(action.flight_ids)) if ok else "Cancellation rejected",
    )


def apply_deploy_spare(net: Network, plan: OperatingPlan, idx: int, action: DeploySpare, settings: SimulationSettings) -> ActionOutcome:
    checks: list[dict] = []
    warnings: list[str] = []

    def fail(msg: str) -> ActionOutcome:
        return ActionOutcome(index=idx, action=action.model_dump(), feasible=False, applied=False, checks=checks, warnings=warnings, message=msg)

    spare = net.spares.get(action.spare_tail)
    checks.append(_check("is_spare", spare is not None, f"{action.spare_tail} {'is a spare aircraft' if spare else 'is not a spare aircraft'}"))
    if spare is None:
        return fail(f"{action.spare_tail} is not a spare aircraft")
    free = action.spare_tail not in plan.deployed_spares
    checks.append(_check("not_already_deployed", free, f"{spare.tail_id} {'is available' if free else 'is already assigned in this scenario'}"))
    if not free:
        return fail(f"{spare.tail_id} already deployed — overlapping assignment rejected")
    if action.replace_tail not in plan.legs_by_tail or action.replace_tail in plan.spare_tails:
        checks.append(_check("replace_tail_valid", False, f"{action.replace_tail} is not an active aircraft"))
        return fail(f"{action.replace_tail} is not an active aircraft")
    legs = plan.legs_by_tail[action.replace_tail]
    ids = [lg.leg_id for lg in legs]
    if action.from_flight not in ids:
        checks.append(_check("flight_on_tail", False, f"{action.from_flight} is not operated by {action.replace_tail} in this plan"))
        return fail(f"{action.from_flight} is not operated by {action.replace_tail}")
    k = ids.index(action.from_flight)
    if action.from_flight in plan.cancelled:
        checks.append(_check("flight_active", False, f"{action.from_flight} is cancelled"))
        return fail(f"{action.from_flight} is cancelled")
    suffix = legs[k:]
    first = suffix[0]
    checks.append(_check("flight_on_tail", True, f"{action.from_flight} is leg {k + 1} of {action.replace_tail}; spare takes {len(suffix)} leg(s)"))

    max_pax = max(lg.pax for lg in suffix)
    seat_ok = spare.seats >= max_pax
    checks.append(_check("seat_capacity", seat_ok, f"{spare.seats} seats vs max {max_pax} passengers on taken legs"))
    if not seat_ok:
        return fail("Spare has insufficient seats")

    avail = parse_hhmm(spare.available_from)
    path = ferry_path(net, spare.base, first.origin)
    if path is None:
        checks.append(_check("positioning", False, f"No scheduled route from {spare.base} to {first.origin} to position the spare"))
        return fail(f"{spare.tail_id} cannot reach {first.origin}: no positioning route in dataset")
    airports, blocks = path
    turn = net.min_turnaround
    p = ferry_duration(blocks, turn)
    if blocks:
        # Just-in-time positioning: arrive one minimum turnaround before the
        # first taken leg is scheduled, but never before the spare is available.
        ferry_dep = max(avail, first.sched_dep - turn - p)
        ready = ferry_dep + p + turn
        checks.append(
            _check(
                "positioning",
                True,
                f"Ferry {' → '.join(airports)} ({p} min, from scheduled block times) departs {fmt_minutes(ferry_dep)}; "
                f"spare ready at {first.origin} {fmt_minutes(ready)} after {turn}-min turnaround",
            )
        )
    else:
        ferry_dep = None
        ready = avail
        checks.append(_check("positioning", True, f"Spare already based at {first.origin}, available from {spare.available_from}"))
    checks.append(
        _check("availability", True, f"Available from {spare.available_from}; earliest departure of {first.leg_id} {fmt_minutes(max(ready, first.sched_dep))}")
    )
    if ready > first.sched_dep:
        warnings.append(f"Spare cannot be ready before {fmt_minutes(ready)}; {first.leg_id} will depart no earlier than that.")

    # Crew feasibility
    duty_start = (ferry_dep if ferry_dep is not None else max(first.sched_dep, avail)) - CREW_REPORT_MIN
    crew_limit = max(c.max_duty_mins for c in net.data.crews)
    if not settings.assume_standby_crew_for_spares:
        checks.append(_check("crew", False, "Dataset has no reserve crew for spare aircraft and the standby-crew assumption is disabled in Settings"))
        return fail("No crew available for spare aircraft")
    sched_end = _scheduled_duty_end(plan, suffix)
    sched_duty = (sched_end - duty_start) if sched_end is not None else 0
    crew_ok = sched_duty <= crew_limit
    checks.append(
        _check(
            "crew",
            crew_ok,
            f"ASSUMED standby crew (not in dataset): report {fmt_minutes(duty_start)}, scheduled duty {sched_duty} min vs limit {crew_limit}",
        )
    )
    if not crew_ok:
        return fail("Standby crew would exceed duty limit on the scheduled plan")
    warnings.append("Crew for the spare is an explicit modelling assumption: a standby crew co-located with the spare.")

    # Apply: move suffix to the spare, prefixed with ferry legs.
    new_legs: list[LegPlan] = []
    if blocks:
        t = ferry_dep
        assert t is not None
        for n, (a, b, blk) in enumerate(zip(airports, airports[1:], blocks), start=1):
            new_legs.append(LegPlan(leg_id=f"FERRY-{spare.tail_id}-{n}", origin=a, destination=b, sched_dep=t, block=blk, pax=0, is_ferry=True))
            t += blk + turn
    plan.legs_by_tail[spare.tail_id] = new_legs + suffix
    plan.legs_by_tail[action.replace_tail] = legs[:k]
    plan.deployed_spares.add(spare.tail_id)
    plan.standby_crews[spare.tail_id] = StandbyCrew(
        crew_id=f"SBY-{spare.tail_id}", tail_id=spare.tail_id, base=spare.base, duty_start=duty_start, max_duty_mins=crew_limit
    )
    plan.recovery_airports.update({spare.base, first.origin})
    checks.append(_check("no_overlap", True, f"{len(suffix)} leg(s) removed from {action.replace_tail}; each leg has exactly one aircraft"))
    return ActionOutcome(
        index=idx,
        action=action.model_dump(),
        feasible=True,
        applied=True,
        checks=checks,
        warnings=warnings,
        message=f"{spare.tail_id} takes over {', '.join(lg.leg_id for lg in suffix)} from {action.replace_tail}",
    )


def apply_swap(net: Network, plan: OperatingPlan, idx: int, action: SwapAircraft) -> ActionOutcome:
    checks: list[dict] = []

    def fail(msg: str) -> ActionOutcome:
        return ActionOutcome(index=idx, action=action.model_dump(), feasible=False, applied=False, checks=checks, message=msg)

    ta, tb = plan.tail_of(action.flight_a), plan.tail_of(action.flight_b)
    if ta is None or tb is None:
        checks.append(_check("flights_exist", False, "Both flights must be operated in the current plan"))
        return fail("Unknown flight in swap")
    if ta == tb:
        checks.append(_check("different_aircraft", False, f"Both flights are on {ta}"))
        return fail("Swap requires two different aircraft")
    la, lb = plan.legs_by_tail[ta], plan.legs_by_tail[tb]
    ia = [lg.leg_id for lg in la].index(action.flight_a)
    ib = [lg.leg_id for lg in lb].index(action.flight_b)
    a, b = la[ia], lb[ib]
    same = a.origin == b.origin
    checks.append(_check("common_airport", same, f"{a.leg_id} departs {a.origin}; {b.leg_id} departs {b.origin}"))
    if not same:
        return fail("Swap legs must depart from the same airport")
    for leg in (a, b):
        if leg.leg_id in plan.cancelled or leg.is_ferry:
            checks.append(_check("legs_active", False, f"{leg.leg_id} is not an active revenue leg"))
            return fail("Swap legs must be active revenue legs")
    new_a = la[:ia] + lb[ib:]
    new_b = lb[:ib] + la[ia:]
    # Crews stay with their aircraft: check scheduled duty of both crews on the new rotations.
    for tail, legs in ((ta, new_a), (tb, new_b)):
        start, limit = _crew_limit(net, plan, tail)
        end = _scheduled_duty_end(plan, legs)
        duty = (end - start) if end is not None else 0
        ok = duty <= limit
        crew_name = plan.standby_crews[tail].crew_id if tail in plan.standby_crews else net.crew_by_tail[tail]
        checks.append(_check("crew_duty", ok, f"{crew_name} on {tail}: scheduled duty {duty} min vs limit {limit}"))
        if not ok:
            return fail(f"Swap would put {crew_name} over its duty limit on the scheduled plan")
    plan.legs_by_tail[ta] = new_a
    plan.legs_by_tail[tb] = new_b
    plan.swap_points[a.leg_id] = f"now operated by {tb}"
    plan.swap_points[b.leg_id] = f"now operated by {ta}"
    plan.recovery_airports.add(a.origin)
    checks.append(_check("no_overlap", True, "Remaining rotations exchanged; no leg is double-assigned. Turnarounds enforced by simulation."))
    return ActionOutcome(
        index=idx,
        action=action.model_dump(),
        feasible=True,
        applied=True,
        checks=checks,
        message=f"{ta} and {tb} swap rotations at {a.origin} from {a.leg_id}/{b.leg_id}",
    )


def apply_protect(net: Network, plan: OperatingPlan, idx: int, action: ProtectConnection) -> ActionOutcome:
    checks: list[dict] = []
    c = net.connections.get(action.connection_id)
    if c is None:
        checks.append(_check("connection_exists", False, f"{action.connection_id} not in dataset"))
        return ActionOutcome(index=idx, action=action.model_dump(), feasible=False, applied=False, checks=checks, message="Unknown connection")
    for fid in (c.from_flight, c.to_flight):
        if fid in plan.cancelled:
            checks.append(_check("legs_active", False, f"{fid} is cancelled"))
            return ActionOutcome(index=idx, action=action.model_dump(), feasible=False, applied=False, checks=checks, message=f"{fid} is cancelled")
    if c.to_flight in plan.protected:
        checks.append(_check("single_hold", False, f"{c.to_flight} already holds for {plan.protected[c.to_flight][0]}"))
        return ActionOutcome(
            index=idx, action=action.model_dump(), feasible=False, applied=False, checks=checks, message="Outbound already protecting another connection"
        )
    plan.protected[c.to_flight] = (c.connection_id, action.max_hold_min)
    plan.recovery_airports.add(c.airport)
    checks.append(_check("hold_policy", True, f"{c.to_flight} may wait up to {action.max_hold_min} min for {c.passengers} passengers from {c.from_flight}"))
    return ActionOutcome(
        index=idx,
        action=action.model_dump(),
        feasible=True,
        applied=True,
        checks=checks,
        warnings=[f"Holding {c.to_flight} delays its {net.flights[c.to_flight].pax} passengers and may propagate down its rotation."],
        message=f"Protect {c.connection_id}: hold {c.to_flight} up to {action.max_hold_min} min",
    )


def build_plan(net: Network, actions: list[RecoveryAction], settings: SimulationSettings) -> OperatingPlan:
    plan = base_plan(net)
    for idx, action in enumerate(actions):
        if isinstance(action, CancelFlights):
            out = apply_cancel(net, plan, idx, action)
        elif isinstance(action, DeploySpare):
            out = apply_deploy_spare(net, plan, idx, action, settings)
        elif isinstance(action, SwapAircraft):
            out = apply_swap(net, plan, idx, action)
        elif isinstance(action, ProtectConnection):
            out = apply_protect(net, plan, idx, action)
        else:  # pragma: no cover - discriminated union guarantees exhaustiveness
            raise TypeError(f"Unsupported action {action!r}")
        plan.outcomes.append(out)
    return plan
