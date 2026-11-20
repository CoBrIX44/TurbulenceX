"""Recovery actions: feasibility checks and re-simulation."""

from app.engine.models import CancelFlights, DeploySpare, FlightStatus, ProtectConnection, SwapAircraft
from app.engine.recovery_search import evaluate_action, rank_candidates
from app.engine.simulator import compare_kpis, simulate
from app.engine.timeutil import parse_hhmm as t

from .conftest import closure, scen

BOM = closure("BOM", "08:00", 90)


def by_id(res):
    return {f.flight_id: f for f in res.flights}


def test_cancel_single_leg_cascades_out_of_position(net):
    r = simulate(net, scen(BOM, actions=[CancelFlights(flight_ids=["DS0502"])]))
    out = r.actions[0]
    assert out.applied and any("out of position" in w for w in out.warnings)
    f = by_id(r)
    assert f["DS0502"].status == FlightStatus.CANCELLED and "recovery decision" in f["DS0502"].cancel_reason
    assert f["DS0503"].status == FlightStatus.CANCELLED and "out of position" in f["DS0503"].cancel_reason
    assert f["DS0503"].delay_parents == ["DS0502"]
    # aircraft is still at BLR so DS0504 (BLR->MAA) operates
    assert f["DS0504"].status != FlightStatus.CANCELLED
    assert r.kpis.cancelled == 2
    assert r.kpis.pax_on_cancelled == f["DS0502"].pax + f["DS0503"].pax
    assert any(e.kind == "CANCELLATION_DECISION" and e.flight_id == "DS0502" for e in r.events)


def test_cancel_round_trip_pair_keeps_aircraft_in_position(net):
    r = simulate(net, scen(BOM, actions=[CancelFlights(flight_ids=["DS0502", "DS0503"])]))
    assert r.actions[0].warnings == []
    f = by_id(r)
    assert f["DS0504"].status != FlightStatus.CANCELLED
    assert f["DS0504"].dep_delay == 0  # aircraft waits at BLR, delay absorbed
    # cancelling the inbound of CX09 breaks the connection
    cx09 = next(c for c in r.connections if c.connection_id == "CX09")
    assert cx09.status == "inbound_cancelled"


def test_cancel_unknown_flight_rejected(net):
    r = simulate(net, scen(BOM, actions=[CancelFlights(flight_ids=["DS9999"])]))
    assert not r.actions[0].applied and r.kpis.cancelled == 0


def test_spare_at_base_takes_over_rotation(net):
    a = DeploySpare(spare_tail="VT-DS17", replace_tail="VT-DS05", from_flight="DS0502")
    r = simulate(net, scen(BOM, actions=[a]))
    out = r.actions[0]
    assert out.feasible and out.applied
    f = by_id(r)
    assert f["DS0502"].operating_tail == "VT-DS17" and f["DS0502"].dep_delay == 0
    assert f["DS0501"].operating_tail == "VT-DS05"
    standby = next(c for c in r.crews if c.is_standby)
    assert standby.crew_id == "SBY-VT-DS17" and standby.duty_start == t("11:10") - 45
    assert r.kpis.spares_used == 1 and r.kpis.spares_available == 1


def test_spare_positioning_uses_dataset_block_times(net):
    a = DeploySpare(spare_tail="VT-DS18", replace_tail="VT-DS12", from_flight="DS1203")
    r = simulate(net, scen(BOM, actions=[a]))
    out = r.actions[0]
    assert out.applied
    pos = next(c for c in out.checks if c["check"] == "positioning")
    assert "DEL → AMD" in pos["detail"] and "95 min" in pos["detail"]
    ferry = r.ferries[0]
    assert ferry.origin == "DEL" and ferry.destination == "AMD" and ferry.block_minutes == 95
    f = by_id(r)
    assert f["DS1203"].actual_dep >= ferry.actual_arr + 30


def test_spare_cannot_be_deployed_twice(net):
    acts = [
        DeploySpare(spare_tail="VT-DS17", replace_tail="VT-DS05", from_flight="DS0502"),
        DeploySpare(spare_tail="VT-DS17", replace_tail="VT-DS12", from_flight="DS1203"),
    ]
    r = simulate(net, scen(BOM, actions=acts))
    assert r.actions[0].applied and not r.actions[1].applied
    assert "overlapping" in r.actions[1].message


def test_spare_requires_crew_assumption(net):
    a = DeploySpare(spare_tail="VT-DS17", replace_tail="VT-DS05", from_flight="DS0502")
    r = simulate(net, scen(BOM, actions=[a], assume_standby_crew_for_spares=False))
    assert not r.actions[0].applied
    assert any(c["check"] == "crew" and not c["passed"] for c in r.actions[0].checks)


def test_spare_without_positioning_route_is_infeasible(net, monkeypatch):
    # Simulate a network where no scheduled route can position the spare.
    from app.engine import plan as planmod

    monkeypatch.setattr(planmod, "route_graph", lambda n: {})
    a = DeploySpare(spare_tail="VT-DS17", replace_tail="VT-DS12", from_flight="DS1203")
    r = simulate(net, scen(BOM, actions=[a]))
    assert not r.actions[0].applied
    assert any(c["check"] == "positioning" and not c["passed"] for c in r.actions[0].checks)


def test_spare_not_a_spare(net):
    r = simulate(net, scen(BOM, actions=[DeploySpare(spare_tail="VT-DS01", replace_tail="VT-DS05", from_flight="DS0502")]))
    assert not r.actions[0].applied


def test_swap_requires_common_airport(net):
    r = simulate(net, scen(BOM, actions=[SwapAircraft(flight_a="DS0502", flight_b="DS0702")]))
    assert not r.actions[0].applied


def test_swap_exchanges_rotations_and_crews(net):
    r = simulate(net, scen(BOM, actions=[SwapAircraft(flight_a="DS1202", flight_b="DS0702")]))
    assert r.actions[0].applied
    f = by_id(r)
    assert f["DS1202"].operating_tail == "VT-DS07" and f["DS0702"].operating_tail == "VT-DS12"
    cr07 = next(c for c in r.crews if c.crew_id == "CR07")
    assert "DS1204" in cr07.flights  # crew stays with aircraft


def test_protect_connection_holds_outbound(net):
    r = simulate(net, scen(BOM, actions=[ProtectConnection(connection_id="CX05", max_hold_min=60)]))
    cx = next(c for c in r.connections if c.connection_id == "CX05")
    assert cx.status == "made" and cx.protected
    f = by_id(r)
    assert f["DS0702"].actual_dep == f["DS0201"].actual_arr + 45
    assert any(c.kind == "connection_hold" for c in f["DS0702"].components)


def test_protect_connection_respects_max_hold(net):
    r = simulate(net, scen(BOM, actions=[ProtectConnection(connection_id="CX05", max_hold_min=30)]))
    cx = next(c for c in r.connections if c.connection_id == "CX05")
    assert cx.status == "missed"


def test_recovery_comparison(net):
    base = simulate(net, scen()).kpis
    dis = simulate(net, scen(BOM)).kpis
    rec = simulate(net, scen(BOM, actions=[DeploySpare(spare_tail="VT-DS18", replace_tail="VT-DS12", from_flight="DS1203")])).kpis
    cmp = compare_kpis(base, dis, rec)
    assert rec.total_arr_delay_min < dis.total_arr_delay_min
    assert 0 < cmp["network_recovery_pct"] <= 100
    exp = round(100 * (dis.impact_index - rec.impact_index) / dis.impact_index, 1)
    assert cmp["network_recovery_pct"] == exp
    row = next(r for r in cmp["rows"] if r["metric"] == "total_arr_delay_min")
    assert row["baseline"] == 0 and row["disrupted"] == dis.total_arr_delay_min and row["recovered"] == rec.total_arr_delay_min


def test_ranked_candidates_are_engine_validated(net):
    s = scen(BOM)
    ranked = rank_candidates(net, s)
    assert ranked, "expected at least one improving action"
    top = ranked[0]
    assert top.feasible and top.impact.impact_reduction > 0
    # Re-evaluating the action reproduces the same numbers (no hidden state)
    from app.engine.recovery_search import parse_action

    again = evaluate_action(net, s, parse_action(top.action))
    assert again.impact == top.impact


def test_actions_are_reversible_by_removal(net):
    with_action = simulate(net, scen(BOM, actions=[CancelFlights(flight_ids=["DS0502", "DS0503"])]))
    without = simulate(net, scen(BOM))
    assert with_action.kpis != without.kpis
    assert simulate(net, scen(BOM)).model_dump() == without.model_dump()


def test_protected_connection_with_cancelled_inbound_does_not_hold(net):
    acts = [ProtectConnection(connection_id="CX05", max_hold_min=60), CancelFlights(flight_ids=["DS0201"])]
    r = simulate(net, scen(BOM, actions=acts))
    # cancellation of the inbound is applied after the protection was accepted; outbound must not wait
    f = by_id(r)
    assert f["DS0702"].status != FlightStatus.CANCELLED
    assert not any(c.kind == "connection_hold" for c in f["DS0702"].components)
    cx = next(c for c in r.connections if c.connection_id == "CX05")
    assert cx.status == "inbound_cancelled"
