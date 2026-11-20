"""Deterministic flight disruption simulator.

Algorithm (event-ordered, single pass):

1. Build the operating plan (dataset rotations + feasible recovery actions).
2. Repeatedly pick, across all aircraft, the next unflown leg with the earliest
   *ready* time (ties: scheduled departure, then leg id). This global
   chronological order lets shared airport slot capacity be allocated
   first-come-first-served, deterministically.
3. For the chosen leg:
   ready = max(scheduled departure, previous actual arrival + turnaround)
   where turnaround = dataset minimum (30) plus any ground-handling penalty.
   A protected connection may hold the departure for its inbound passengers.
4. Departure slot: if the origin is restricted (closed, or hourly capacity
   reached) the departure moves to the next available minute/slot.
5. Arrival slot: if the destination is restricted at the computed arrival,
   * the flight is held on the ground at origin (departure re-timed) when it
     had not departed before the restriction began, or
   * it holds airborne until the destination reopens when it was already
     airborne when the restriction began. (No diversions are modelled.)
6. Block time is always the scheduled block_minutes.
7. Legs whose origin differs from the aircraft's current location (because an
   earlier leg was cancelled) are cancelled as "aircraft out of position".

After the pass, passenger connections, crew duty, capacity utilisation,
aircraft/airport summaries, events and KPIs are derived from the results.
The same inputs always produce identical outputs (no randomness, sorted
iteration everywhere).
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from typing import Literal, Optional

from .constants import (
    CANCELLED_PAX_PENALTY_MIN,
    DELAY_THRESHOLD_MIN,
    HEALTH_BANDS,
    MAX_SLOT_ITERATIONS,
    MISSED_CONNECTION_PAX_PENALTY_MIN,
    SEVERE_DELAY_MIN,
)
from .dataset import Network
from .models import (
    AircraftResult,
    AirportResult,
    CapacityBucket,
    ConnectionResult,
    CrewResult,
    DelayComponent,
    Disruption,
    DisruptionType,
    FlightResult,
    FlightStatus,
    KPIs,
    ScenarioInput,
    SimEvent,
    SimulationResult,
)
from .plan import LegPlan, OperatingPlan, build_plan
from .timeutil import fmt_minutes, hour_bucket, parse_hhmm

TYPE_LABEL = {
    DisruptionType.THUNDERSTORM: "thunderstorm",
    DisruptionType.AIRPORT_CLOSURE: "closure",
    DisruptionType.RUNWAY_BLOCKAGE: "runway blockage",
    DisruptionType.AIRSPACE_RESTRICTION: "airspace restriction",
    DisruptionType.GROUND_HANDLING: "ground handling disruption",
    DisruptionType.CAPACITY_REDUCTION: "capacity reduction",
}


@dataclass(frozen=True)
class Window:
    d: Disruption
    airport: str
    start: int
    end: int
    effective_capacity: Optional[int]  # None = no capacity effect (ground handling)
    arrivals: bool
    departures: bool

    @property
    def label(self) -> str:
        pct = "" if self.effective_capacity == 0 else f" ({self.d.capacity_reduction_pct}% capacity cut)"
        return f"{self.airport} {TYPE_LABEL[self.d.type]}{pct} {fmt_minutes(self.start)}–{fmt_minutes(self.end)}"


def build_windows(net: Network, disruptions: list[Disruption]) -> list[Window]:
    out = []
    for d in disruptions:
        if d.airport not in net.airports:
            raise ValueError(f"Disruption {d.id}: unknown airport {d.airport}")
        start = parse_hhmm(d.start)
        cap = net.airports[d.airport].capacity_per_hour
        if d.type == DisruptionType.GROUND_HANDLING:
            eff: Optional[int] = None
        else:
            pct = 100 if d.type == DisruptionType.AIRPORT_CLOSURE else d.capacity_reduction_pct
            eff = (cap * (100 - pct)) // 100
        arrivals_only = d.type == DisruptionType.AIRSPACE_RESTRICTION
        out.append(
            Window(
                d=d,
                airport=d.airport,
                start=start,
                end=start + d.duration_min,
                effective_capacity=eff,
                arrivals=True,
                departures=not arrivals_only,
            )
        )
    return out


class SlotBook:
    """Hourly movement capacity per airport (arrivals + departures share capacity)."""

    def __init__(self, net: Network, windows: list[Window]):
        self.net = net
        self.windows = [w for w in windows if w.effective_capacity is not None]
        self.usage: Counter[tuple[str, int]] = Counter()

    def restriction(self, airport: str, t: int, kind: str) -> Optional[Window]:
        best: Optional[Window] = None
        for w in self.windows:
            if w.airport != airport or not (w.start <= t < w.end):
                continue
            if (kind == "arr" and not w.arrivals) or (kind == "dep" and not w.departures):
                continue
            assert w.effective_capacity is not None
            if best is None or w.effective_capacity < (best.effective_capacity or 0) or (w.effective_capacity == best.effective_capacity and w.end > best.end):
                best = w
        return best

    def capacity_at(self, airport: str, t: int, kind: str) -> tuple[int, Optional[Window]]:
        base = self.net.airports[airport].capacity_per_hour
        w = self.restriction(airport, t, kind)
        if w is None or w.effective_capacity is None:
            return base, None
        return min(base, w.effective_capacity), w

    def find(self, airport: str, t: int, kind: str) -> tuple[int, list[tuple[str, Optional[Window]]]]:
        """Earliest time >= t at which a movement can take place. Does not book."""
        causes: list[tuple[str, Optional[Window]]] = []
        for _ in range(MAX_SLOT_ITERATIONS):
            cap, w = self.capacity_at(airport, t, kind)
            if cap == 0 and w is not None:
                causes.append(("closed", w))
                t = w.end
                continue
            if self.usage[(airport, hour_bucket(t))] >= cap:
                causes.append(("capacity", w))
                t = (hour_bucket(t) + 1) * 60
                continue
            return t, causes
        raise RuntimeError(f"Slot search did not converge at {airport}")

    def book(self, airport: str, t: int) -> None:
        self.usage[(airport, hour_bucket(t))] += 1


def _cause_text(airport: str, causes: list[tuple[str, Optional[Window]]], kind: str) -> tuple[str, Optional[str]]:
    for what, w in causes:
        if w is not None:
            verb = "departure" if kind == "dep" else "arrival"
            if what == "closed":
                return f"{w.label} prevented {verb}", w.d.id
            return f"{w.label}: hourly {verb} slots full", w.d.id
    return f"{airport} hourly capacity reached", None


@dataclass
class TailState:
    idx: int = 0
    location: Optional[str] = None
    prev_arr: Optional[int] = None
    prev_leg: Optional[str] = None
    last_cancelled: Optional[str] = None
    avail: Optional[int] = None


def _status(delay: int) -> FlightStatus:
    if delay >= SEVERE_DELAY_MIN:
        return FlightStatus.SEVERE
    if delay >= DELAY_THRESHOLD_MIN:
        return FlightStatus.DELAYED
    return FlightStatus.ON_TIME


PRIMARY_ORDER = [
    "departure_restriction",
    "arrival_ground_delay",
    "airborne_hold",
    "rotation",
    "ground_handling",
    "connection_hold",
    "spare_positioning",
]


def simulate(net: Network, scenario: ScenarioInput) -> SimulationResult:
    windows = build_windows(net, scenario.disruptions)
    gh_windows = [w for w in windows if w.d.type == DisruptionType.GROUND_HANDLING]
    plan = build_plan(net, scenario.actions, scenario.settings)
    slots = SlotBook(net, windows)
    turn = net.min_turnaround

    states: dict[str, TailState] = {}
    for tail, legs in plan.legs_by_tail.items():
        st = TailState()
        if tail in plan.spare_tails:
            spare = net.spares[tail]
            st.location = spare.base
            st.avail = parse_hhmm(spare.available_from)
        elif legs:
            st.location = legs[0].origin
        states[tail] = st

    results: dict[str, FlightResult] = {}
    leg_tail: dict[str, str] = {}
    for tail, legs in plan.legs_by_tail.items():
        for leg in legs:
            leg_tail[leg.leg_id] = tail

    def crew_for(tail: str) -> Optional[str]:
        if tail in plan.standby_crews:
            return plan.standby_crews[tail].crew_id
        return net.crew_by_tail.get(tail)

    def mk_result(leg: LegPlan, tail: str) -> FlightResult:
        f = net.flights.get(leg.leg_id)
        return FlightResult(
            flight_id=leg.leg_id,
            tail_id=f.tail_id if f else tail,
            operating_tail=tail,
            leg_order=f.leg_order if f else 0,
            origin=leg.origin,
            destination=leg.destination,
            pax=leg.pax,
            block_minutes=leg.block,
            sched_dep=leg.sched_dep,
            sched_arr=leg.sched_arr,
            actual_dep=None,
            actual_arr=None,
            dep_delay=0,
            arr_delay=0,
            status=FlightStatus.ON_TIME,
            is_ferry=leg.is_ferry,
            crew_id=crew_for(tail),
        )

    def cancel(leg: LegPlan, tail: str, reason: str, parent: Optional[str], root: Optional[str]) -> None:
        r = mk_result(leg, tail)
        r.operating_tail = None
        r.status = FlightStatus.CANCELLED
        r.cancel_reason = reason
        r.explanation = reason
        r.primary_reason = "cancelled"
        r.delay_parents = [parent] if parent else []
        r.root_cause = root
        results[leg.leg_id] = r

    def advance_skips(tail: str) -> None:
        st = states[tail]
        legs = plan.legs_by_tail[tail]
        while st.idx < len(legs):
            leg = legs[st.idx]
            if leg.leg_id in plan.cancelled:
                cancel(leg, tail, plan.cancelled[leg.leg_id], None, f"cancellation:{leg.leg_id}")
                st.last_cancelled = leg.leg_id
                st.idx += 1
                continue
            if st.location is not None and leg.origin != st.location:
                cause = st.last_cancelled
                cancel(
                    leg,
                    tail,
                    f"Aircraft {tail} out of position: it is at {st.location} but {leg.leg_id} departs {leg.origin}"
                    + (f" (after cancellation of {cause})" if cause else ""),
                    cause,
                    f"cancellation:{cause}" if cause else "out_of_position",
                )
                st.idx += 1
                continue
            break

    def ready_info(tail: str, leg: LegPlan) -> tuple[int, list[DelayComponent], bool]:
        st = states[tail]
        comps: list[DelayComponent] = []
        ready = leg.sched_dep
        if st.prev_arr is not None:
            base_ready = st.prev_arr + turn
            if base_ready > ready:
                comps.append(
                    DelayComponent(
                        kind="rotation",
                        minutes=base_ready - ready,
                        detail=f"Aircraft {tail} arrived late from {st.prev_leg} at {fmt_minutes(st.prev_arr)}; minimum {turn}-minute turnaround enforced",
                        source_flight=st.prev_leg,
                    )
                )
                ready = base_ready
            extra = max(
                (w.d.extra_turnaround_min for w in gh_windows if w.airport == leg.origin and w.start <= st.prev_arr < w.end),
                default=0,
            )
            if extra and st.prev_arr + turn + extra > ready:
                gh = next(w for w in gh_windows if w.airport == leg.origin and w.start <= st.prev_arr < w.end and w.d.extra_turnaround_min == extra)
                comps.append(
                    DelayComponent(
                        kind="ground_handling",
                        minutes=st.prev_arr + turn + extra - ready,
                        detail=f"{gh.label}: turnaround extended to {turn + extra} min",
                        disruption_id=gh.d.id,
                    )
                )
                ready = st.prev_arr + turn + extra
        elif st.avail is not None and st.avail > ready:
            comps.append(DelayComponent(kind="spare_positioning", minutes=st.avail - ready, detail=f"{tail} not available before {fmt_minutes(st.avail)}"))
            ready = st.avail
        blocked = False
        if leg.leg_id in plan.protected:
            cid, _ = plan.protected[leg.leg_id]
            if net.connections[cid].from_flight not in results:
                blocked = True
        return ready, comps, blocked

    # ---------------- main event-ordered loop ----------------
    for _ in range(10_000):
        cands = []
        for tail in sorted(plan.legs_by_tail):
            advance_skips(tail)
            st = states[tail]
            legs = plan.legs_by_tail[tail]
            if st.idx >= len(legs):
                continue
            leg = legs[st.idx]
            ready, comps, blocked = ready_info(tail, leg)
            cands.append((blocked, ready, leg.sched_dep, leg.leg_id, tail, comps))
        if not cands:
            break
        open_c = [c for c in cands if not c[0]] or cands
        _, ready, _, _, tail, comps = min(open_c, key=lambda c: (c[1], c[2], c[3]))
        st = states[tail]
        leg = plan.legs_by_tail[tail][st.idx]

        dep, dep_causes = slots.find(leg.origin, ready, "dep")
        if dep > ready:
            text, did = _cause_text(leg.origin, dep_causes, "dep")
            comps.append(DelayComponent(kind="departure_restriction", minutes=dep - ready, detail=f"{text}; departed {fmt_minutes(dep)}", disruption_id=did))
        if leg.leg_id in plan.protected:
            # Connection protection: hold the departure (beyond the time it could
            # otherwise leave) for inbound connecting passengers, up to max_hold.
            cid, max_hold = plan.protected[leg.leg_id]
            c = net.connections[cid]
            inbound = results.get(c.from_flight)
            if inbound is not None and inbound.status != FlightStatus.CANCELLED and inbound.actual_arr is not None:
                need = inbound.actual_arr + c.min_connect_minutes
                if dep < need <= dep + max_hold:
                    held, _ = slots.find(leg.origin, need, "dep")
                    comps.append(
                        DelayComponent(
                            kind="connection_hold",
                            minutes=held - dep,
                            detail=f"Held to protect connection {cid} ({c.passengers} passengers from {c.from_flight})",
                            source_flight=c.from_flight,
                        )
                    )
                    dep = held
        first_dep = dep
        hold = 0
        ground_text: Optional[tuple[str, Optional[str]]] = None
        air_text: Optional[tuple[str, Optional[str]]] = None
        for _ in range(MAX_SLOT_ITERATIONS):
            arr0 = dep + leg.block
            arr, arr_causes = slots.find(leg.destination, arr0, "arr")
            if arr == arr0:
                break
            cause_w = next((w for _, w in arr_causes if w is not None), None)
            if cause_w is not None and cause_w.start > dep:
                hold = arr - arr0
                air_text = _cause_text(leg.destination, arr_causes, "arr")
                break
            ground_text = _cause_text(leg.destination, arr_causes, "arr")
            new_dep, _ = slots.find(leg.origin, arr - leg.block, "dep")
            if new_dep <= dep:  # pragma: no cover - defensive
                hold = arr - arr0
                break
            dep = new_dep
        if dep > first_dep and ground_text:
            comps.append(
                DelayComponent(
                    kind="arrival_ground_delay",
                    minutes=dep - first_dep,
                    detail=f"Held on ground at {leg.origin}: {ground_text[0]} at {leg.destination}",
                    disruption_id=ground_text[1],
                )
            )
        arr = dep + leg.block + hold
        if hold and air_text:
            comps.append(
                DelayComponent(
                    kind="airborne_hold",
                    minutes=hold,
                    detail=f"Already airborne when restriction began: {air_text[0]}; held airborne until {fmt_minutes(arr)} (no diversion modelled)",
                    disruption_id=air_text[1],
                )
            )
        slots.book(leg.origin, dep)
        slots.book(leg.destination, arr)

        r = mk_result(leg, tail)
        r.actual_dep, r.actual_arr = dep, arr
        r.dep_delay = dep - leg.sched_dep
        r.arr_delay = arr - leg.sched_arr
        r.status = _status(max(r.dep_delay, r.arr_delay))
        r.components = comps
        r.previous_leg = st.prev_leg
        rot = sum(c.minutes for c in comps if c.kind == "rotation")
        r.inherited_delay = rot
        r.introduced_delay = max(0, r.arr_delay - rot)
        r.delay_parents = sorted({c.source_flight for c in comps if c.source_flight})
        if leg.leg_id in plan.swap_points:
            r.explanation = f"Aircraft swap: {plan.swap_points[leg.leg_id]}. "
        elif tail in plan.spare_tails and not leg.is_ferry:
            r.explanation = f"Operated by spare aircraft {tail} (recovery action). "
        results[leg.leg_id] = r

        st.prev_arr, st.prev_leg, st.location = arr, leg.leg_id, leg.destination
        st.idx += 1

    # Link next legs (as operated) and finalize explanations / root causes.
    for tail, legs in plan.legs_by_tail.items():
        flown = [lg.leg_id for lg in legs if results[lg.leg_id].status != FlightStatus.CANCELLED]
        for a, b in zip(flown, flown[1:]):
            results[a].next_leg = b
    order = sorted(results.values(), key=lambda r: (r.actual_dep if r.actual_dep is not None else r.sched_dep, r.flight_id))
    for r in order:
        if r.status == FlightStatus.CANCELLED:
            continue
        if not r.components:
            r.primary_reason = "" if r.arr_delay == 0 and r.dep_delay == 0 else "schedule"
            if not r.explanation:
                r.explanation = "Operated as scheduled."
            else:
                r.explanation += "Operated on schedule."
            continue
        top = max(r.components, key=lambda c: (c.minutes, -PRIMARY_ORDER.index(c.kind)))
        r.primary_reason = top.kind
        if top.kind == "rotation" and top.source_flight and top.source_flight in results:
            r.root_cause = results[top.source_flight].root_cause
        elif top.kind == "connection_hold":
            r.root_cause = f"connection_hold:{plan.protected[r.flight_id][0]}"
        elif top.disruption_id:
            r.root_cause = f"disruption:{top.disruption_id}"
        else:
            r.root_cause = top.kind
        parts = [f"{c.detail} (+{c.minutes} min)." for c in r.components]
        r.explanation = (r.explanation or "") + " ".join(parts)

    revenue = [results[f.flight_id] for f in net.data.flights]
    ferries = [r for r in results.values() if r.is_ferry]

    connections = _connections(net, results, plan)
    root_labels = {f"disruption:{w.d.id}": w.label for w in windows}
    crews = _crews(net, plan, results, root_labels)
    capacity = _capacity(net, windows, results)
    aircraft = _aircraft(net, plan, results)
    airports = _airports(net, windows, results, capacity, plan)
    kpis = _kpis(net, plan, revenue, connections, crews, aircraft)
    events = _events(net, windows, plan, revenue, ferries, connections, crews)

    return SimulationResult(
        flights=revenue,
        connections=connections,
        crews=crews,
        aircraft=aircraft,
        airports=airports,
        capacity=capacity,
        events=events,
        kpis=kpis,
        actions=plan.outcomes,
        disruptions=scenario.disruptions,
        ferries=sorted(ferries, key=lambda r: r.flight_id),
    )


# --------------------------------------------------------------------------
# Derived analyses
# --------------------------------------------------------------------------


def _connections(net: Network, results: dict[str, FlightResult], plan: OperatingPlan) -> list[ConnectionResult]:
    out = []
    for c in net.data.connections:
        a, b = results[c.from_flight], results[c.to_flight]
        sched_slack = net.times[c.to_flight].dep - net.times[c.from_flight].arr - c.min_connect_minutes
        prot = plan.protected.get(c.to_flight, ("",))[0] == c.connection_id
        conn_status: Literal["made", "missed", "inbound_cancelled", "outbound_cancelled"]
        if a.status == FlightStatus.CANCELLED:
            conn_status, actual, reason = "inbound_cancelled", None, f"Inbound {c.from_flight} cancelled: {c.passengers} passengers cannot reach {c.airport}"
        elif b.status == FlightStatus.CANCELLED:
            conn_status, actual, reason = "outbound_cancelled", None, f"Outbound {c.to_flight} cancelled: {c.passengers} passengers stranded at {c.airport}"
        else:
            assert a.actual_arr is not None and b.actual_dep is not None
            actual = b.actual_dep - a.actual_arr
            if actual >= c.min_connect_minutes:
                conn_status = "made"
                reason = f"{actual} min connection ≥ {c.min_connect_minutes} min minimum" + (" (protected by hold)" if prot and b.dep_delay > 0 else "")
            else:
                conn_status = "missed"
                reason = (
                    f"{c.from_flight} arrived {fmt_minutes(a.actual_arr)} ({a.arr_delay} min late); {c.to_flight} departed "
                    f"{fmt_minutes(b.actual_dep)} ({actual} min available vs {c.min_connect_minutes} min required)"
                )
        out.append(
            ConnectionResult(
                connection_id=c.connection_id,
                airport=c.airport,
                from_flight=c.from_flight,
                to_flight=c.to_flight,
                passengers=c.passengers,
                min_connect_minutes=c.min_connect_minutes,
                scheduled_slack=sched_slack,
                actual_connect_minutes=actual,
                status=conn_status,
                protected=prot,
                reason=reason,
            )
        )
    return out


def _crews(net: Network, plan: OperatingPlan, results: dict[str, FlightResult], root_labels: dict[str, str]) -> list[CrewResult]:
    """Crews stay with their aircraft (swaps move crews with aircraft); spares use an assumed standby crew."""
    out = []
    for tail in sorted(plan.legs_by_tail):
        legs = plan.legs_by_tail[tail]
        if tail in plan.standby_crews:
            sc = plan.standby_crews[tail]
            crew_id, base, start, limit, standby = sc.crew_id, sc.base, sc.duty_start, sc.max_duty_mins, True
        elif tail in net.crew_by_tail:
            c = net.crews[net.crew_by_tail[tail]]
            crew_id, base, start, limit, standby = c.crew_id, c.base, parse_hhmm(c.duty_start), c.max_duty_mins, False
        else:
            continue
        flown = [results[lg.leg_id] for lg in legs if results[lg.leg_id].status != FlightStatus.CANCELLED]
        planned = [lg for lg in legs if lg.leg_id not in plan.cancelled]
        sched_end = planned[-1].sched_arr if planned else None
        act_end = flown[-1].actual_arr if flown else None
        act_mins = (act_end - start) if act_end is not None else 0
        sched_mins = (sched_end - start) if sched_end is not None else 0
        viol = act_mins > limit
        cause = flown[-1].flight_id if flown else None
        if viol and cause:
            last = results[cause]
            root = root_labels.get(last.root_cause or "", last.root_cause or "delay")
            expl = (
                f"Duty {act_mins} min exceeds limit {limit} by {act_mins - limit} min. Final flight {cause} arrived "
                f"{fmt_minutes(last.actual_arr or 0)} ({last.arr_delay} min late; root cause {root}). No reserve crew in dataset."
            )
        elif flown:
            expl = f"Duty {act_mins} min within limit {limit} (margin {limit - act_mins} min)."
        else:
            expl = "No flights operated."
        out.append(
            CrewResult(
                crew_id=crew_id,
                tail_id=tail,
                is_standby=standby,
                base=base,
                duty_start=start,
                max_duty_mins=limit,
                flights=[r.flight_id for r in flown],
                scheduled_duty_end=sched_end,
                actual_duty_end=act_end,
                scheduled_duty_mins=sched_mins,
                actual_duty_mins=act_mins,
                violation=viol,
                excess_mins=max(0, act_mins - limit),
                cause_flight=cause if viol else None,
                explanation=expl,
            )
        )
    return sorted(out, key=lambda c: c.crew_id)


def _capacity(net: Network, windows: list[Window], results: dict[str, FlightResult]) -> list[CapacityBucket]:
    sched: Counter[tuple[str, int]] = Counter()
    actual: Counter[tuple[str, int]] = Counter()
    for f in net.data.flights:
        sched[(f.origin, hour_bucket(net.times[f.flight_id].dep))] += 1
        sched[(f.destination, hour_bucket(net.times[f.flight_id].arr))] += 1
    for r in results.values():
        if r.actual_dep is not None and r.actual_arr is not None:
            actual[(r.origin, hour_bucket(r.actual_dep))] += 1
            actual[(r.destination, hour_bucket(r.actual_arr))] += 1
    restricted: dict[tuple[str, int], int] = {}
    for w in windows:
        if w.effective_capacity is None:
            continue
        for h in range(hour_bucket(w.start), hour_bucket(w.end - 1) + 1):
            key = (w.airport, h)
            restricted[key] = min(restricted.get(key, 10**9), w.effective_capacity)
    keys = sorted(set(sched) | set(actual) | set(restricted))
    out = []
    for ap, h in keys:
        cap = net.airports[ap].capacity_per_hour
        eff = min(cap, restricted.get((ap, h), cap))
        out.append(
            CapacityBucket(
                airport=ap,
                hour=h,
                capacity=cap,
                effective_capacity=eff,
                scheduled_movements=sched[(ap, h)],
                actual_movements=actual[(ap, h)],
                scheduled_overload=sched[(ap, h)] > eff,
                restricted=(ap, h) in restricted,
            )
        )
    return out


def _aircraft(net: Network, plan: OperatingPlan, results: dict[str, FlightResult]) -> list[AircraftResult]:
    out = []
    for tail in sorted(plan.legs_by_tail):
        legs = plan.legs_by_tail[tail]
        rs = [results[lg.leg_id] for lg in legs]
        flown = [r for r in rs if r.status != FlightStatus.CANCELLED]
        is_spare = tail in plan.spare_tails
        delays = [r.arr_delay for r in flown if not r.is_ferry]
        maxd = max(delays, default=0)
        loc: Optional[str]
        ac_status: Literal["normal", "delayed", "disrupted", "idle", "deployed"]
        if is_spare:
            ac_status = "deployed" if legs else "idle"
            loc = flown[-1].destination if flown else net.spares[tail].base
        else:
            if any(r.status == FlightStatus.CANCELLED for r in rs) or maxd >= SEVERE_DELAY_MIN:
                ac_status = "disrupted"
            elif maxd >= DELAY_THRESHOLD_MIN:
                ac_status = "delayed"
            else:
                ac_status = "normal"
            loc = flown[-1].destination if flown else (legs[0].origin if legs else None)
        out.append(
            AircraftResult(
                tail_id=tail,
                is_spare=is_spare,
                base=net.spares[tail].base if is_spare else None,
                flights=[lg.leg_id for lg in legs],
                total_delay=sum(delays),
                max_delay=maxd,
                final_location=loc,
                status=ac_status,
            )
        )
    return out


def _airports(
    net: Network, windows: list[Window], results: dict[str, FlightResult], capacity: list[CapacityBucket], plan: OperatingPlan
) -> list[AirportResult]:
    out = []
    revenue = [results[f.flight_id] for f in net.data.flights]
    for ap in net.data.airports:
        deps = [r for r in revenue if r.origin == ap.id]
        arrs = [r for r in revenue if r.destination == ap.id]
        both = deps + arrs
        delayed = [r for r in both if r.status in (FlightStatus.DELAYED, FlightStatus.SEVERE)]
        cancelled = [r for r in both if r.status == FlightStatus.CANCELLED]
        aws = [w for w in windows if w.airport == ap.id]
        closed = any(w.effective_capacity == 0 for w in aws)
        restricted = bool(aws)
        congested = any(
            b.airport == ap.id and (b.scheduled_overload or b.actual_movements >= b.effective_capacity) and b.actual_movements > 0 for b in capacity
        )
        ap_state: Literal["normal", "disrupted", "closed", "congested", "recovery"]
        if closed:
            ap_state = "closed"
        elif restricted:
            ap_state = "disrupted"
        elif congested:
            ap_state = "congested"
        elif ap.id in plan.recovery_airports:
            ap_state = "recovery"
        elif any(r.origin == ap.id for r in delayed + cancelled):
            ap_state = "disrupted"
        else:
            ap_state = "normal"
        out.append(
            AirportResult(
                airport=ap.id,
                departures=len(deps),
                arrivals=len(arrs),
                delayed_flights=len({r.flight_id for r in delayed}),
                cancelled_flights=len({r.flight_id for r in cancelled}),
                affected_pax=sum(r.pax for r in {r.flight_id: r for r in delayed + cancelled}.values()),
                restricted=restricted,
                state=ap_state,
            )
        )
    return out


def _kpis(
    net: Network,
    plan: OperatingPlan,
    revenue: list[FlightResult],
    connections: list[ConnectionResult],
    crews: list[CrewResult],
    aircraft: list[AircraftResult],
) -> KPIs:
    on_time = [r for r in revenue if r.status == FlightStatus.ON_TIME]
    delayed = [r for r in revenue if r.status in (FlightStatus.DELAYED, FlightStatus.SEVERE)]
    severe = [r for r in revenue if r.status == FlightStatus.SEVERE]
    cancelled = [r for r in revenue if r.status == FlightStatus.CANCELLED]
    operated = [r for r in revenue if r.status != FlightStatus.CANCELLED]
    disrupted_ids = {r.flight_id for r in delayed + cancelled}
    broken = [c for c in connections if c.status != "made"]
    missed_only = [c for c in connections if c.status == "missed"]
    pax_cancelled = sum(r.pax for r in cancelled)
    pax_delay_min = sum(r.pax * r.arr_delay for r in operated)
    # Distinct-passenger ESTIMATE: flight boardings on disrupted flights, minus
    # connecting passengers counted on two disrupted legs, plus connecting
    # passengers who missed a connection although neither leg was disrupted.
    est = sum(r.pax for r in delayed + cancelled)
    for c in connections:
        a_d, b_d = c.from_flight in disrupted_ids, c.to_flight in disrupted_ids
        if a_d and b_d:
            est -= c.passengers
        elif not a_d and not b_d and c.status != "made":
            est += c.passengers
    total = len(revenue)
    otp = round(100.0 * len(on_time) / total, 1) if total else 100.0
    severity: Literal["normal", "minor", "moderate", "severe"] = "severe"
    for threshold, label in HEALTH_BANDS:
        if otp >= threshold:
            severity = label
            break
    spares_used = len(plan.deployed_spares)
    return KPIs(
        total_flights=total,
        operated_flights=len(operated),
        on_time=len(on_time),
        delayed=len(delayed),
        severe=len(severe),
        cancelled=len(cancelled),
        total_arr_delay_min=sum(r.arr_delay for r in operated),
        total_dep_delay_min=sum(r.dep_delay for r in operated),
        avg_delay_delayed_min=round(sum(r.arr_delay for r in delayed) / len(delayed), 1) if delayed else 0.0,
        max_delay_min=max((r.arr_delay for r in operated), default=0),
        pax_scheduled=sum(r.pax for r in revenue),
        pax_on_delayed=sum(r.pax for r in delayed),
        pax_on_cancelled=pax_cancelled,
        missed_connections=len(broken),
        missed_connection_pax=sum(c.passengers for c in broken),
        distinct_affected_pax_estimate=est,
        pax_awaiting_recovery=pax_cancelled + sum(c.passengers for c in missed_only),
        passenger_delay_minutes=pax_delay_min,
        aircraft_delayed=sum(1 for a in aircraft if not a.is_spare and a.status in ("delayed", "disrupted")),
        crew_violations=sum(1 for c in crews if c.violation),
        spares_total=len(net.spares),
        spares_used=spares_used,
        spares_available=len(net.spares) - spares_used,
        otp_pct=otp,
        health_score=otp,
        severity=severity,
        impact_index=pax_delay_min + pax_cancelled * CANCELLED_PAX_PENALTY_MIN + sum(c.passengers for c in missed_only) * MISSED_CONNECTION_PAX_PENALTY_MIN,
    )


KIND_ORDER = {
    "DISRUPTION_START": 0,
    "SPARE_DEPLOYED": 1,
    "AIRCRAFT_SWAP": 1,
    "CANCELLATION_DECISION": 2,
    "CANCELLED": 2,
    "DELAY_ASSIGNED": 3,
    "CONNECTION_PROTECTED": 3,
    "FERRY_DEPARTED": 4,
    "DEPARTED": 4,
    "CONNECTION_MISSED": 5,
    "FERRY_ARRIVED": 6,
    "ARRIVED": 6,
    "CREW_DUTY_VIOLATION": 7,
    "DISRUPTION_END": 8,
}


def _sev(delay: int) -> str:
    if delay >= SEVERE_DELAY_MIN:
        return "critical"
    if delay >= DELAY_THRESHOLD_MIN:
        return "warning"
    return "info"


def _events(
    net: Network,
    windows: list[Window],
    plan: OperatingPlan,
    revenue: list[FlightResult],
    ferries: list[FlightResult],
    connections: list[ConnectionResult],
    crews: list[CrewResult],
) -> list[SimEvent]:
    raw: list[dict] = []
    for w in windows:
        raw.append(
            dict(
                timestamp=w.start,
                kind="DISRUPTION_START",
                airport=w.airport,
                severity="critical",
                message=f"{w.label} begins" + (f" — {w.d.description}" if w.d.description else ""),
            )
        )
        raw.append(dict(timestamp=w.end, kind="DISRUPTION_END", airport=w.airport, severity="recovery", message=f"{w.label} ends"))
    by_id = {r.flight_id: r for r in revenue}
    for out in plan.outcomes:
        if not out.applied:
            continue
        a = out.action
        if a["type"] == "deploy_spare":
            legs = plan.legs_by_tail[a["spare_tail"]]
            raw.append(
                dict(
                    timestamp=legs[0].sched_dep,
                    kind="SPARE_DEPLOYED",
                    aircraft=a["spare_tail"],
                    airport=legs[0].origin,
                    severity="recovery",
                    message=out.message,
                )
            )
        elif a["type"] == "swap_aircraft":
            r = by_id.get(a["flight_a"])
            raw.append(
                dict(
                    timestamp=r.sched_dep if r else 0,
                    kind="AIRCRAFT_SWAP",
                    airport=r.origin if r else None,
                    flight_id=a["flight_a"],
                    severity="recovery",
                    message=out.message,
                )
            )
    for r in revenue:
        if r.status == FlightStatus.CANCELLED:
            user = r.flight_id in plan.cancelled
            raw.append(
                dict(
                    timestamp=r.sched_dep,
                    kind="CANCELLATION_DECISION" if user else "CANCELLED",
                    flight_id=r.flight_id,
                    airport=r.origin,
                    aircraft=r.tail_id,
                    previous_dependency=r.delay_parents[0] if r.delay_parents else None,
                    severity="recovery" if user else "critical",
                    message=f"{r.flight_id} {r.origin}→{r.destination} cancelled: {r.cancel_reason} ({r.pax} pax)",
                )
            )
            continue
        assert r.actual_dep is not None and r.actual_arr is not None
        delay = max(r.dep_delay, r.arr_delay)
        if delay > 0:
            raw.append(
                dict(
                    timestamp=r.sched_dep,
                    kind="DELAY_ASSIGNED",
                    flight_id=r.flight_id,
                    airport=r.origin,
                    aircraft=r.operating_tail,
                    previous_dependency=r.delay_parents[0] if r.delay_parents else None,
                    delay_introduced=r.introduced_delay,
                    cumulative_delay=r.arr_delay,
                    severity=_sev(delay),
                    message=f"{r.flight_id} {r.origin}→{r.destination} delayed {r.dep_delay} min (arrival +{r.arr_delay}). {r.explanation}",
                )
            )
        raw.append(
            dict(
                timestamp=r.actual_dep,
                kind="DEPARTED",
                flight_id=r.flight_id,
                airport=r.origin,
                aircraft=r.operating_tail,
                cumulative_delay=r.dep_delay,
                severity=_sev(r.dep_delay),
                message=f"{r.flight_id} departed {r.origin}→{r.destination}" + (f" {r.dep_delay} min late" if r.dep_delay else " on time"),
            )
        )
        raw.append(
            dict(
                timestamp=r.actual_arr,
                kind="ARRIVED",
                flight_id=r.flight_id,
                airport=r.destination,
                aircraft=r.operating_tail,
                cumulative_delay=r.arr_delay,
                severity=_sev(r.arr_delay),
                message=f"{r.flight_id} arrived {r.destination}" + (f" {r.arr_delay} min late" if r.arr_delay else " on time"),
            )
        )
    for r in ferries:
        if r.actual_dep is None or r.actual_arr is None:
            continue
        raw.append(
            dict(
                timestamp=r.actual_dep,
                kind="FERRY_DEPARTED",
                flight_id=r.flight_id,
                airport=r.origin,
                aircraft=r.operating_tail,
                severity="recovery",
                message=f"Positioning {r.flight_id} {r.origin}→{r.destination} departed",
            )
        )
        raw.append(
            dict(
                timestamp=r.actual_arr,
                kind="FERRY_ARRIVED",
                flight_id=r.flight_id,
                airport=r.destination,
                aircraft=r.operating_tail,
                severity="recovery",
                message=f"Positioning {r.flight_id} arrived {r.destination}",
            )
        )
    for c in connections:
        out_r = by_id[c.to_flight]
        if c.status != "made":
            ts = out_r.actual_dep if out_r.actual_dep is not None else out_r.sched_dep
            raw.append(
                dict(
                    timestamp=ts,
                    kind="CONNECTION_MISSED",
                    flight_id=c.to_flight,
                    airport=c.airport,
                    previous_dependency=c.from_flight,
                    severity="critical",
                    message=f"{c.connection_id}: {c.passengers} passengers missed {c.from_flight}→{c.to_flight}. {c.reason}",
                )
            )
        elif c.protected and out_r.dep_delay > 0:
            raw.append(
                dict(
                    timestamp=out_r.actual_dep or out_r.sched_dep,
                    kind="CONNECTION_PROTECTED",
                    flight_id=c.to_flight,
                    airport=c.airport,
                    previous_dependency=c.from_flight,
                    severity="recovery",
                    message=f"{c.connection_id}: {c.to_flight} held — {c.passengers} connecting passengers protected",
                )
            )
    for cr in crews:
        if cr.violation:
            raw.append(
                dict(
                    timestamp=cr.duty_start + cr.max_duty_mins,
                    kind="CREW_DUTY_VIOLATION",
                    flight_id=cr.cause_flight,
                    aircraft=cr.tail_id,
                    severity="critical",
                    message=f"{cr.crew_id} exceeds {cr.max_duty_mins}-min duty limit. {cr.explanation}",
                )
            )
    raw.sort(key=lambda e: (e["timestamp"], KIND_ORDER.get(e["kind"], 9), e.get("flight_id") or "", e.get("airport") or ""))
    return [SimEvent(event_id=f"E{n:04d}", **e) for n, e in enumerate(raw, start=1)]


def compare_kpis(baseline: KPIs, disrupted: KPIs, recovered: Optional[KPIs] = None) -> dict:
    """Comparison table plus network recovery percentage (impact-index based)."""
    fields = [
        ("delayed", "Delayed flights"),
        ("cancelled", "Cancelled flights"),
        ("total_arr_delay_min", "Total delay minutes"),
        ("missed_connections", "Missed connections"),
        ("missed_connection_pax", "Missed-connection passengers"),
        ("pax_on_delayed", "Passengers on delayed flights"),
        ("pax_on_cancelled", "Passengers on cancelled flights"),
        ("distinct_affected_pax_estimate", "Passengers affected (estimate)"),
        ("crew_violations", "Crew violations"),
        ("spares_used", "Spare aircraft used"),
        ("otp_pct", "On-time performance %"),
        ("impact_index", "Passenger impact index"),
    ]
    rows = []
    for key, label in fields:
        row = {"metric": key, "label": label, "baseline": getattr(baseline, key), "disrupted": getattr(disrupted, key)}
        if recovered is not None:
            row["recovered"] = getattr(recovered, key)
        rows.append(row)
    rec_pct = None
    delay_rec_pct = None
    if recovered is not None:
        denom = disrupted.impact_index - baseline.impact_index
        rec_pct = round(100.0 * (disrupted.impact_index - recovered.impact_index) / denom, 1) if denom > 0 else 0.0
        d2 = disrupted.total_arr_delay_min - baseline.total_arr_delay_min
        delay_rec_pct = round(100.0 * (disrupted.total_arr_delay_min - recovered.total_arr_delay_min) / d2, 1) if d2 > 0 else 0.0
    return {"rows": rows, "network_recovery_pct": rec_pct, "delay_minutes_recovery_pct": delay_rec_pct}
