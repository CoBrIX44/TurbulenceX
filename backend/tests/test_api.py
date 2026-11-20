import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_store
from app.main import app
from app.store.scenarios import ScenarioStore

BOM = {"id": "D1", "airport": "BOM", "type": "airport_closure", "start": "08:00", "duration_min": 90}


@pytest.fixture()
def client(tmp_path):
    store = ScenarioStore(tmp_path / "scenarios.json")
    app.dependency_overrides[get_store] = lambda: store
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def test_network_endpoint(client):
    j = client.get("/api/network").json()
    assert len(j["airports"]) == 16 and len(j["flights"]) == 70 and len(j["rotations"]) == 16
    assert j["flights"][0]["dep_min"] == 480


def test_validation_endpoint(client):
    j = client.get("/api/validation").json()
    assert j["valid"] is True and j["counts"]["flights"] == 70


def test_simulate_three_way(client):
    body = {"disruptions": [BOM], "actions": [{"type": "deploy_spare", "spare_tail": "VT-DS18", "replace_tail": "VT-DS12", "from_flight": "DS1203"}]}
    j = client.post("/api/simulate", json=body).json()
    assert j["baseline"]["kpis"]["delayed"] == 0
    assert j["disrupted"]["kpis"]["delayed"] == 9
    assert j["recovered"]["kpis"]["total_arr_delay_min"] < j["disrupted"]["kpis"]["total_arr_delay_min"]
    assert j["comparison"]["network_recovery_pct"] > 0


def test_invalid_inputs_rejected(client):
    assert client.post("/api/simulate", json={"disruptions": [{**BOM, "airport": "XXX"}]}).status_code == 422
    assert client.post("/api/simulate", json={"disruptions": [{**BOM, "start": "25:00"}]}).status_code == 422
    assert client.post("/api/simulate", json={"disruptions": [{**BOM, "duration_min": 0}]}).status_code == 422
    assert client.post("/api/simulate", json={"disruptions": [BOM, BOM]}).status_code == 422
    assert client.post("/api/simulate", json={"actions": [{"type": "teleport"}]}).status_code == 422


def test_evaluate_action(client):
    body = {"scenario": {"disruptions": [BOM]}, "action": {"type": "deploy_spare", "spare_tail": "VT-DS17", "replace_tail": "VT-DS05", "from_flight": "DS0502"}}
    j = client.post("/api/recovery/evaluate", json=body).json()
    assert j["feasible"] and j["impact"]["delay_reduction_min"] == 35


def test_scenario_crud_and_duplicate(client):
    s = client.post("/api/scenarios", json={"name": "Mumbai storm", "disruptions": [BOM]}).json()
    assert s["id"] and s["name"] == "Mumbai storm"
    assert len(client.get("/api/scenarios").json()) == 1
    upd = client.put(
        f"/api/scenarios/{s['id']}",
        json={"name": "Mumbai storm v2", "disruptions": [BOM], "actions": [{"type": "cancel_flights", "flight_ids": ["DS0502", "DS0503"]}]},
    ).json()
    assert upd["name"] == "Mumbai storm v2" and upd["actions"][0]["type"] == "cancel_flights"
    dup = client.post(f"/api/scenarios/{s['id']}/duplicate").json()
    assert dup["id"] != s["id"] and dup["name"].endswith("(copy)") and dup["actions"] == upd["actions"]
    assert client.delete(f"/api/scenarios/{s['id']}").status_code == 204
    assert client.get(f"/api/scenarios/{s['id']}").status_code == 404
    assert len(client.get("/api/scenarios").json()) == 1


def test_presets_are_inputs_only(client):
    ps = client.get("/api/presets").json()
    assert len(ps) == 5
    for p in ps:
        assert "kpis" not in p and p["disruptions"]


def test_presets_all_simulate(client):
    for p in client.get("/api/presets").json():
        r = client.post("/api/simulate", json={"disruptions": p["disruptions"]})
        assert r.status_code == 200, p["id"]


def test_export_json_and_csv(client):
    j = client.post("/api/export", json={"name": "x", "scenario": {"disruptions": [BOM]}, "format": "json"})
    assert j.status_code == 200 and j.json()["disrupted"]["kpis"]["delayed"] == 9
    c = client.post("/api/export", json={"name": "x", "scenario": {"disruptions": [BOM]}, "format": "csv"})
    lines = c.text.strip().splitlines()
    assert lines[0].startswith("flight_id") and len(lines) == 71


def test_security_headers(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["x-frame-options"] == "DENY"
    assert r.headers["referrer-policy"] == "strict-origin-when-cross-origin"
    assert "accelerometer=()" in r.headers["permissions-policy"]


def test_dispatcher_rule_based_without_key(client):
    j = client.post("/api/dispatcher/recommend", json={"disruptions": [BOM]}).json()
    assert j["source"] == "rule_based" and j["recommendations"]
    for r in j["recommendations"]:
        assert r["reason_source"] == "rule_based" and r["impact"]["impact_reduction"] > 0
