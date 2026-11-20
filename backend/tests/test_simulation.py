"""Simulation engine tests: closures, rotation propagation, connections, crew, capacity, midnight."""

from app.engine.models import DisruptionType, FlightStatus
from app.engine.simulator import simulate
from app.engine.timeutil import parse_hhmm as t

from .conftest import closure, network_from, scen


def by_id(res):
    return {f.flight_id: f for f in res.flights}


def test_baseline_has_no_delays(net):
    r = simulate(net, scen())
    k = r.kpis
    assert k.total_flights == 70 and k.on_time == 70 and k.delayed == 0 and k.cancelled == 0
    assert k.missed_connections == 0 and k.crew_violations == 0 and k.total_arr_delay_min == 0
    assert k.pax_scheduled == sum(f.pax for f in net.data.flights)
    assert k.spares_available == 2 and k.health_score == 100.0
    assert all(c.status == "made" for c in r.connections)


def test_bom_closure_holds_departures_until_reopening(net):
    f = by_id(simulate(net, scen(closure("BOM", "08:00", 90))))
    assert f["DS0501"].actual_dep == t("09:30") and f["DS0501"].dep_delay == 75
    assert f["DS0501"].primary_reason == "departure_restriction"
    assert "BOM closure" in f["DS0501"].explanation
    for fid in ("DS1202", "DS1502", "DS0702"):
        assert f[fid].actual_dep == t("09:30")
    # Flights departing BOM before the closure are untouched
    assert f["DS0401"].dep_delay == 0


def test_rotation_delay_propagates_with_min_turnaround(net):
    f = by_id(simulate(net, scen(closure("BOM", "08:00", 90))))
    # DS0501 arrives 11:15; DS0502 (sched 11:10) departs 11:15 + 30 = 11:45
    assert f["DS0501"].actual_arr == t("11:15")
    assert f["DS0502"].actual_dep == t("11:45") and f["DS0502"].dep_delay == 35
    assert f["DS0502"].primary_reason == "rotation"
    assert f["DS0502"].delay_parents == ["DS0501"]
    assert f["DS0502"].root_cause == "disruption:D1"
    # Planned ground time at COK (65 min) absorbs the 35 min delay
    assert f["DS0503"].dep_delay == 0


def test_multiple_consecutive_aircraft_delays(net):
    f = by_id(simulate(net, scen(closure("BOM", "08:00", 90))))
    chain = ["DS1202", "DS1203", "DS1204"]
    delays = [f[x].dep_delay for x in chain]
    assert delays == [80, 35, 30]  # slack absorbs part of the delay at each turn
    assert f["DS1203"].delay_parents == ["DS1202"] and f["DS1204"].delay_parents == ["DS1203"]
    assert f["DS1204"].root_cause == "disruption:D1"


def test_airborne_flight_is_not_grounded_at_origin(net):
    f = by_id(simulate(net, scen(closure("BOM", "08:00", 90))))
    d = f["DS0201"]  # DEL->BOM departs 06:00, scheduled arrival 08:10 (inside closure)
    assert d.dep_delay == 0, "already airborne before closure: must not be held at origin"
    assert d.actual_arr == t("09:30") and d.primary_reason == "airborne_hold"


def test_arrival_into_future_closure_is_ground_delayed(net):
    # BLR closed 08:00-09:00; DS0602 COK->BLR departs 07:35 (before the closure) -> airborne hold.
    f = by_id(simulate(net, scen(closure("BLR", "08:00", 60))))
    d = f["DS0602"]
    assert d.dep_delay == 0 and d.actual_arr == t("09:00") and d.primary_reason == "airborne_hold"
    # A flight scheduled to depart after the closure began is held on the ground instead
    f2 = by_id(simulate(net, scen(closure("BLR", "09:30", 60))))
    g = f2["DS0501"]  # BOM 08:15 -> BLR 10:00 departed before 09:30 -> airborne
    assert g.primary_reason == "airborne_hold"
    f3 = by_id(simulate(net, scen(closure("BLR", "08:00", 150))))  # 08:00-10:30
    g = f3["DS0501"]  # departs 08:15 after the closure started -> ground delay at BOM
    assert g.primary_reason == "arrival_ground_delay"
    assert g.actual_arr == t("10:30") and g.actual_dep == t("10:30") - g.block_minutes


def test_closed_airport_processes_no_prohibited_movements(net):
    for ap in ("BOM", "DEL", "BLR", "HYD"):
        r = simulate(net, scen(closure(ap, "09:00", 120)))
        lo, hi = t("09:00"), t("11:00")
        for f in r.flights:
            if f.status == FlightStatus.CANCELLED:
                continue
            if f.origin == ap:
                assert not (lo <= f.actual_dep < hi), f.flight_id
            if f.destination == ap:
                assert not (lo <= f.actual_arr < hi), f.flight_id


def test_missed_connections_use_connection_passengers(net):
    r = simulate(net, scen(closure("BOM", "08:00", 90)))
    missed = {c.connection_id: c for c in r.connections if c.status != "made"}
    assert set(missed) == {"CX05", "CX10"}
    assert r.kpis.missed_connection_pax == 30 + 18
    # Not every passenger on the delayed flight is stranded
    assert r.kpis.missed_connection_pax < by_id(r)["DS0201"].pax


def test_connection_exactly_at_minimum_is_made(net):
    # CX14: DS1101 arr 14:25 -> DS0105 dep 15:15 ; MCT 45, slack 5. Delay DS1101 by exactly 5 min.
    r = simulate(net, scen(closure("CCU", "11:55", 10)))  # DS1101 12:00 -> 12:05
    f = by_id(r)
    assert f["DS1101"].arr_delay == 5
    cx14 = next(c for c in r.connections if c.connection_id == "CX14")
    assert cx14.actual_connect_minutes == 45 and cx14.status == "made"
    r2 = simulate(net, scen(closure("CCU", "11:55", 11)))
    cx14 = next(c for c in r2.connections if c.connection_id == "CX14")
    assert cx14.actual_connect_minutes == 44 and cx14.status == "missed"


def test_crew_duty_violation_detected_and_attributed(net):
    r = simulate(net, scen(closure("BLR", "14:00", 60)))
    viol = [c for c in r.crews if c.violation]
    assert [c.crew_id for c in viol] == ["CR08"]
    c = viol[0]
    assert c.actual_duty_mins == 610 and c.excess_mins == 10 and c.cause_flight == "DS0805"
    assert "BLR closure 14:00–15:00" in c.explanation
    assert r.kpis.crew_violations == 1
    assert any(e.kind == "CREW_DUTY_VIOLATION" for e in r.events)


def test_crew_duty_math(net):
    r = simulate(net, scen())
    cr03 = next(c for c in r.crews if c.crew_id == "CR03")
    assert cr03.actual_duty_mins == t("21:20") - t("11:30") == 590 and not cr03.violation


def test_capacity_reduction_allocates_hourly_slots(net):
    # BOM capacity 32/h -> 3% leaves floor(32*0.03)=0 -> behaves as closure; 90% leaves 3/h
    r = simulate(net, scen(closure("BOM", "07:00", 180, type=DisruptionType.CAPACITY_REDUCTION, capacity_reduction_pct=90)))
    eff = 32 * 10 // 100
    assert eff == 3
    for b in r.capacity:
        if b.airport == "BOM" and b.restricted:
            assert b.actual_movements <= b.effective_capacity
    buckets = {(b.airport, b.hour): b for b in r.capacity}
    assert buckets[("BOM", 7)].scheduled_movements == 4 and buckets[("BOM", 7)].scheduled_overload
    assert r.kpis.delayed >= 1
    assert any(c.kind == "departure_restriction" or c.kind == "arrival_ground_delay" for f in r.flights for c in f.components)


def test_capacity_overload_flag_in_baseline_is_false(net):
    r = simulate(net, scen())
    assert not any(b.scheduled_overload for b in r.capacity)


def test_airspace_restriction_blocks_arrivals_only(net):
    r = simulate(net, scen(closure("BOM", "08:00", 90, type=DisruptionType.AIRSPACE_RESTRICTION)))
    f = by_id(r)
    assert f["DS0501"].dep_delay == 0  # departures still allowed
    assert f["DS0201"].actual_arr == t("09:30")


def test_ground_handling_extends_turnaround(net):
    r = simulate(net, scen(closure("BLR", "09:00", 120, type=DisruptionType.GROUND_HANDLING, extra_turnaround_min=40)))
    f = by_id(r)
    # DS0501 arrives BLR 10:00 (inside window) -> DS0502 needs 30+40=70 min -> 11:10 exactly (no delay)
    assert f["DS0502"].dep_delay == 0
    r = simulate(net, scen(closure("BLR", "09:00", 120, type=DisruptionType.GROUND_HANDLING, extra_turnaround_min=60)))
    f = by_id(r)
    assert f["DS0502"].actual_dep == t("10:00") + 90 and f["DS0502"].primary_reason == "ground_handling"


def test_no_departure_before_aircraft_available_and_min_turn(net):
    scenarios = [
        scen(closure(ap, start, dur)) for ap in ("BOM", "DEL", "BLR", "HYD", "CCU", "MAA") for start, dur in (("07:00", 60), ("12:00", 120), ("16:30", 45))
    ]
    for s in scenarios:
        r = simulate(net, s)
        f = by_id(r)
        for tail, ids in net.rotations.items():
            prev = None
            for fid in ids:
                x = f[fid]
                if x.status == FlightStatus.CANCELLED:
                    continue
                assert x.actual_dep >= x.sched_dep
                assert x.actual_arr - x.actual_dep >= x.block_minutes
                if prev is not None:
                    assert x.actual_dep >= prev.actual_arr + 30, (fid, prev.flight_id)
                prev = x


def test_determinism(net):
    s = scen(closure("BOM", "08:00", 90), closure("BLR", "14:00", 60, did="D2"))
    a = simulate(net, s).model_dump_json()
    b = simulate(net, s).model_dump_json()
    assert a == b


def test_event_log_contents(net):
    r = simulate(net, scen(closure("BOM", "08:00", 90)))
    kinds = {e.kind for e in r.events}
    assert {"DISRUPTION_START", "DISRUPTION_END", "DELAY_ASSIGNED", "DEPARTED", "ARRIVED", "CONNECTION_MISSED"} <= kinds
    ts = [e.timestamp for e in r.events]
    assert ts == sorted(ts)
    ev = next(e for e in r.events if e.kind == "DELAY_ASSIGNED" and e.flight_id == "DS0502")
    assert ev.previous_dependency == "DS0501" and ev.cumulative_delay == 35 and ev.aircraft == "VT-DS05"
    assert len({e.event_id for e in r.events}) == len(r.events)


def test_passenger_metrics_are_labelled_counts(net):
    r = simulate(net, scen(closure("BOM", "08:00", 90)))
    k = r.kpis
    assert k.pax_on_delayed == sum(f.pax for f in r.flights if f.status in (FlightStatus.DELAYED, FlightStatus.SEVERE))
    # estimate never exceeds the boarding count plus connection pax
    assert k.distinct_affected_pax_estimate <= k.pax_on_delayed + k.pax_on_cancelled + k.missed_connection_pax
    assert k.pax_awaiting_recovery == k.pax_on_cancelled + sum(c.passengers for c in r.connections if c.status == "missed")


def test_delay_pushed_past_midnight(raw):
    # Close BBI late in the evening so DS0805 (HYD->BBI 19:40-21:25) arrives after midnight
    net = network_from(raw)
    r = simulate(net, scen(closure("BBI", "21:00", 200)))
    f = by_id(r)["DS0805"]
    assert f.actual_arr == t("21:00") + 200 and f.actual_arr > 1440
    assert f.arr_delay == f.actual_arr - t("21:25")


def test_unknown_airport_rejected(net):
    import pytest

    with pytest.raises(ValueError):
        simulate(net, scen(closure("XXX", "08:00", 30)))


def test_capacity_rounding_to_zero_acts_as_closure(net):
    # GAU capacity 8/h; 90% cut -> floor(0.8) = 0 -> closed
    r = simulate(net, scen(closure("GAU", "17:00", 60, type=DisruptionType.CAPACITY_REDUCTION, capacity_reduction_pct=90)))
    f = by_id(r)
    # DS1003 CCU->GAU departs 16:20 (before the restriction) -> airborne hold until 18:00
    assert f["DS1003"].actual_arr == t("18:00")
    assert f["DS1004"].actual_dep >= t("18:00")


def test_overlapping_windows_most_restrictive_wins(net):
    a = closure("BOM", "08:00", 120, did="D1", type=DisruptionType.CAPACITY_REDUCTION, capacity_reduction_pct=50)
    b = closure("BOM", "08:00", 90, did="D2")
    f = by_id(simulate(net, scen(a, b)))
    assert f["DS0501"].actual_dep == t("09:30")
