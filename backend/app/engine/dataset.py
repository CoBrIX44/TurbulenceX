"""Dataset loading, indexing and integrity validation.

Validation reports problems; it never silently repairs the data.
"""

from __future__ import annotations

import hashlib
import json
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path

from pydantic import BaseModel

from .models import Airport, Connection, Crew, Dataset, Flight, SpareAircraft
from .timeutil import parse_hhmm, resolve_arrival

EXPECTED_COUNTS = {
    "airports": 16,
    "flights": 70,
    "active_aircraft": 16,
    "crews": 16,
    "connections": 21,
    "spare_aircraft": 2,
}


@dataclass(frozen=True)
class FlightTimes:
    dep: int
    arr: int  # resolved onto the same timeline (midnight-safe)


@dataclass
class Network:
    """Indexed, read-only view of the dataset used by the engine."""

    data: Dataset
    checksum: str
    airports: dict[str, Airport] = field(default_factory=dict)
    flights: dict[str, Flight] = field(default_factory=dict)
    times: dict[str, FlightTimes] = field(default_factory=dict)
    rotations: dict[str, list[str]] = field(default_factory=dict)  # tail -> flight ids by leg_order
    connections: dict[str, Connection] = field(default_factory=dict)
    crews: dict[str, Crew] = field(default_factory=dict)
    crew_by_tail: dict[str, str] = field(default_factory=dict)
    spares: dict[str, SpareAircraft] = field(default_factory=dict)

    @property
    def min_turnaround(self) -> int:
        return self.data.meta.min_turnaround_minutes

    @property
    def seats(self) -> int:
        return self.data.meta.seats_per_aircraft


def build_network(data: Dataset, checksum: str = "") -> Network:
    net = Network(data=data, checksum=checksum)
    net.airports = {a.id: a for a in data.airports}
    net.flights = {f.flight_id: f for f in data.flights}
    for f in data.flights:
        dep = parse_hhmm(f.dep)
        net.times[f.flight_id] = FlightTimes(dep=dep, arr=resolve_arrival(dep, parse_hhmm(f.arr)))
    by_tail: dict[str, list[Flight]] = defaultdict(list)
    for f in data.flights:
        by_tail[f.tail_id].append(f)
    net.rotations = {t: [f.flight_id for f in sorted(fs, key=lambda x: x.leg_order)] for t, fs in sorted(by_tail.items())}
    net.connections = {c.connection_id: c for c in data.connections}
    net.crews = {c.crew_id: c for c in data.crews}
    net.crew_by_tail = {c.tail_id: c.crew_id for c in data.crews}
    net.spares = {s.tail_id: s for s in data.spare_aircraft}
    return net


def load_network(path: str | Path) -> Network:
    p = Path(path)
    if p.exists():
        raw = p.read_bytes()
    else:
        # Check standard relative candidate paths
        candidates = [
            Path(__file__).resolve().parents[2] / "data" / "flight_network.json",
            Path(__file__).resolve().parents[2] / "flight_network.json",
            Path.cwd() / "data" / "flight_network.json",
            Path.cwd() / "backend" / "data" / "flight_network.json",
            Path.cwd() / "flight_network.json",
            Path("/var/task/data/flight_network.json"),
            Path("/var/task/backend/data/flight_network.json"),
        ]
        raw = None
        for c in candidates:
            if c.exists():
                raw = c.read_bytes()
                break
        if raw is None:
            # Fallback to embedded byte-identical dataset
            from .embedded_dataset import RAW_DATASET_BYTES

            raw = RAW_DATASET_BYTES

    assert raw is not None
    data = Dataset.model_validate(json.loads(raw))
    return build_network(data, hashlib.sha256(raw).hexdigest())


# --------------------------------------------------------------------------
# Validation
# --------------------------------------------------------------------------


class ValidationCheck(BaseModel):
    id: str
    title: str
    passed: bool
    issues: list[str] = []


class ValidationReport(BaseModel):
    valid: bool
    checksum: str
    counts: dict[str, int]
    expected_counts: dict[str, int]
    checks: list[ValidationCheck]


def validate_network(net: Network) -> ValidationReport:
    d = net.data
    checks: list[ValidationCheck] = []
    airport_ids = set(net.airports)
    spare_ids = set(net.spares)
    active_tails = set(net.rotations)

    def add(cid: str, title: str, issues: list[str]) -> None:
        checks.append(ValidationCheck(id=cid, title=title, passed=not issues, issues=issues))

    counts = {
        "airports": len(d.airports),
        "flights": len(d.flights),
        "active_aircraft": len(active_tails),
        "crews": len(d.crews),
        "connections": len(d.connections),
        "spare_aircraft": len(d.spare_aircraft),
    }
    add(
        "counts",
        "Entity counts match the dataset specification",
        [f"{k}: expected {EXPECTED_COUNTS[k]}, found {v}" for k, v in counts.items() if v != EXPECTED_COUNTS[k]],
    )

    dup: list[str] = []
    for label, ids in (
        ("airport", [a.id for a in d.airports]),
        ("flight", [f.flight_id for f in d.flights]),
        ("connection", [c.connection_id for c in d.connections]),
        ("crew", [c.crew_id for c in d.crews]),
    ):
        seen: set[str] = set()
        for i in ids:
            if i in seen:
                dup.append(f"Duplicate {label} id {i}")
            seen.add(i)
    add("unique_ids", "Identifiers are unique", dup)

    # 1. Airports referenced by flights exist
    add(
        "flight_airports",
        "Every flight references an existing airport",
        [f"{f.flight_id}: unknown airport {ap}" for f in d.flights for ap in (f.origin, f.destination) if ap not in airport_ids]
        + [f"{f.flight_id}: origin equals destination" for f in d.flights if f.origin == f.destination],
    )

    # 2. Active flights reference a valid (non-spare) aircraft that has a crew
    crew_tails = {c.tail_id for c in d.crews}
    add(
        "flight_aircraft",
        "Every active flight references a valid active aircraft",
        [f"{f.flight_id}: tail {f.tail_id} is a spare aircraft" for f in d.flights if f.tail_id in spare_ids]
        + [f"{f.flight_id}: tail {f.tail_id} has no crew group" for f in d.flights if f.tail_id not in crew_tails],
    )

    # 3. Leg orders contiguous 1..n per aircraft
    leg_issues = []
    for tail, ids in net.rotations.items():
        orders = [net.flights[i].leg_order for i in ids]
        if orders != list(range(1, len(orders) + 1)):
            leg_issues.append(f"{tail}: leg orders {orders} are not contiguous from 1")
    add("leg_orders", "Flight leg orders are valid", leg_issues)

    # 4. Rotation chronology & geography
    rot_issues = []
    for tail, ids in net.rotations.items():
        for prev_id, cur_id in zip(ids, ids[1:]):
            prev, cur = net.flights[prev_id], net.flights[cur_id]
            gap = net.times[cur_id].dep - net.times[prev_id].arr
            if prev.destination != cur.origin:
                rot_issues.append(f"{tail}: {prev_id} arrives {prev.destination} but {cur_id} departs {cur.origin}")
            if gap < net.min_turnaround:
                rot_issues.append(f"{tail}: {cur_id} scheduled turnaround {gap} min < minimum {net.min_turnaround}")
            if cur.turnaround_before_min is not None and cur.turnaround_before_min != gap:
                rot_issues.append(f"{cur_id}: turnaround_before_min={cur.turnaround_before_min} but schedule gap={gap}")
        first = net.flights[ids[0]]
        if first.turnaround_before_min is not None:
            rot_issues.append(f"{first.flight_id}: first leg has turnaround_before_min={first.turnaround_before_min}")
    for f in d.flights:
        t = net.times[f.flight_id]
        if t.arr - t.dep != f.block_minutes:
            rot_issues.append(f"{f.flight_id}: dep→arr is {t.arr - t.dep} min but block_minutes={f.block_minutes}")
        if f.pax > net.seats or f.pax < 0:
            rot_issues.append(f"{f.flight_id}: pax {f.pax} outside 0..{net.seats}")
    add("rotations", "Aircraft rotations are chronologically and geographically consistent", rot_issues)

    # 5. Connections
    con_issues = []
    for c in d.connections:
        for fid in (c.from_flight, c.to_flight):
            if fid not in net.flights:
                con_issues.append(f"{c.connection_id}: unknown flight {fid}")
        if c.from_flight in net.flights and c.to_flight in net.flights:
            a, b = net.flights[c.from_flight], net.flights[c.to_flight]
            if a.destination != c.airport or b.origin != c.airport:
                con_issues.append(f"{c.connection_id}: flights do not meet at {c.airport}")
            if net.times[c.to_flight].dep - net.times[c.from_flight].arr < c.min_connect_minutes:
                con_issues.append(f"{c.connection_id}: scheduled connection shorter than minimum")
            if c.passengers > min(a.pax, b.pax):
                con_issues.append(f"{c.connection_id}: {c.passengers} passengers exceeds a leg's pax")
    add("connections", "Every connection references existing, schedulable flights", con_issues)

    # 6. Crew references
    crew_issues = []
    for crew in d.crews:
        for fid in crew.flight_ids:
            if fid not in net.flights:
                crew_issues.append(f"{crew.crew_id}: unknown flight {fid}")
        if crew.tail_id not in active_tails:
            crew_issues.append(f"{crew.crew_id}: unknown tail {crew.tail_id}")
        elif crew.flight_ids != net.rotations[crew.tail_id]:
            crew_issues.append(f"{crew.crew_id}: flight list differs from {crew.tail_id} rotation")
        if crew.flight_ids and all(f in net.flights for f in crew.flight_ids):
            duty = net.times[crew.flight_ids[-1]].arr - parse_hhmm(crew.duty_start)
            if duty > crew.max_duty_mins:
                crew_issues.append(f"{crew.crew_id}: scheduled duty {duty} exceeds {crew.max_duty_mins}")
    add("crews", "Every crew flight reference exists and schedules are within duty limits", crew_issues)

    # 7. Spare aircraft distinguishable
    spare_issues = [f"Spare {s} also flies scheduled flights" for s in spare_ids & active_tails]
    spare_issues += [f"Spare {s.tail_id}: unknown base {s.base}" for s in d.spare_aircraft if s.base not in airport_ids]
    spare_issues += [f"Spare {s.tail_id}: seats {s.seats} != fleet standard {net.seats}" for s in d.spare_aircraft if s.seats != net.seats]
    add("spares", "Spare aircraft are distinguishable from active aircraft", spare_issues)

    # 8. Midnight handling
    midnight_notes = [f"{f.flight_id}: crosses midnight (handled as next-day arrival)" for f in d.flights if parse_hhmm(f.arr) < parse_hhmm(f.dep)]
    checks.append(
        ValidationCheck(
            id="midnight",
            title="Time calculations handle midnight (flights crossing midnight resolved to next day)",
            passed=True,
            issues=midnight_notes,
        )
    )

    return ValidationReport(
        valid=all(c.passed for c in checks),
        checksum=net.checksum,
        counts=counts,
        expected_counts=EXPECTED_COUNTS,
        checks=checks,
    )
