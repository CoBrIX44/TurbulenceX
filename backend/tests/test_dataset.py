import hashlib

import pytest

from app.engine.dataset import validate_network
from app.engine.timeutil import fmt_minutes, parse_hhmm, resolve_arrival

from .conftest import BACKEND, network_from


def test_entity_counts(net):
    d = net.data
    assert len(d.airports) == 16
    assert len(d.flights) == 70
    assert len(net.rotations) == 16
    assert len(d.crews) == 16
    assert len(d.connections) == 21
    assert len(d.spare_aircraft) == 2
    assert {s.tail_id: s.base for s in d.spare_aircraft} == {"VT-DS17": "BLR", "VT-DS18": "DEL"}
    assert net.min_turnaround == 30 and net.seats == 180


def test_active_aircraft_ids(net):
    assert sorted(net.rotations) == [f"VT-DS{i:02d}" for i in range(1, 17)]


def test_dataset_validates_cleanly(net):
    report = validate_network(net)
    failed = [(c.id, c.issues) for c in report.checks if not c.passed]
    assert report.valid, failed
    assert {c.id for c in report.checks} >= {
        "counts",
        "flight_airports",
        "flight_aircraft",
        "leg_orders",
        "rotations",
        "connections",
        "crews",
        "spares",
        "midnight",
    }


def test_backend_dataset_is_byte_identical_to_repository_root():
    root = BACKEND.parent / "flight_network.json"
    if not root.exists():
        pytest.skip("root dataset not present")
    a = hashlib.sha256(root.read_bytes()).hexdigest()
    b = hashlib.sha256((BACKEND / "data" / "flight_network.json").read_bytes()).hexdigest()
    assert a == b


def test_turnaround_before_matches_schedule(net):
    for tail, ids in net.rotations.items():
        for p, c in zip(ids, ids[1:]):
            assert net.flights[c].turnaround_before_min == net.times[c].dep - net.times[p].arr


def test_validation_reports_rather_than_fixes(raw):
    raw["flights"][0]["origin"] = "XXX"
    raw["flights"][5]["leg_order"] = 9
    raw["connections"][0]["to_flight"] = "DS9999"
    raw["crews"][0]["flight_ids"].append("DS9998")
    raw["spare_aircraft"][0]["tail_id"] = "VT-DS01"
    net = network_from(raw)
    report = validate_network(net)
    assert not report.valid
    failed = {c.id for c in report.checks if not c.passed}
    assert {"flight_airports", "leg_orders", "connections", "crews", "spares"} <= failed
    # data unchanged: the bad origin is still there
    assert net.flights["DS0101"].origin == "XXX"


def test_rotation_geography_break_detected(raw):
    for f in raw["flights"]:
        if f["flight_id"] == "DS0102":
            f["origin"] = "BOM"
    report = validate_network(network_from(raw))
    rot = next(c for c in report.checks if c.id == "rotations")
    assert not rot.passed and any("DS0102" in i for i in rot.issues)


def test_time_parsing_and_midnight():
    assert parse_hhmm("00:00") == 0
    assert parse_hhmm("23:59") == 1439
    for bad in ("24:00", "7:00", "12-00", "ab:cd"):
        with pytest.raises(ValueError):
            parse_hhmm(bad)
    assert resolve_arrival(parse_hhmm("23:30"), parse_hhmm("00:45")) == 1485
    assert fmt_minutes(1485) == "00:45 +1"
    assert fmt_minutes(615) == "10:15"


def test_midnight_crossing_flight_is_resolved(raw):
    for f in raw["flights"]:
        if f["flight_id"] == "DS1604":  # last leg of VT-DS16 (20:20 -> 21:30)
            f["dep"], f["arr"] = "23:30", "00:40"
    net = network_from(raw)
    assert net.times["DS1604"].arr == 1440 + 40
    report = validate_network(net)
    midnight = next(c for c in report.checks if c.id == "midnight")
    assert any("DS1604" in i for i in midnight.issues)
