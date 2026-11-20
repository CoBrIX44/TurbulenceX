"""AI dispatcher: LLM output can never bypass the deterministic engine."""

import json

import httpx

from app.dispatcher.provider import LLMError, OpenAICompatibleProvider
from app.dispatcher.service import find_unverified_numbers, recommend
from app.engine.recovery_search import evaluate_action, parse_action

from .conftest import closure, scen

BOM = closure("BOM", "08:00", 90)


class FakeProvider:
    name = "fake"
    model = "fake-model"

    def __init__(self, payload):
        self.payload = payload
        self.last_user = None

    def complete_json(self, system, user):
        self.last_user = user
        if isinstance(self.payload, Exception):
            raise self.payload
        return self.payload


def test_llm_numbers_are_ignored_engine_numbers_used(net):
    payload = {
        "situation_summary": "BOM is closed.",
        "recommendations": [
            {
                "candidate_id": "SPARE:VT-DS17:VT-DS05:DS0502",
                "reason": "Use the BLR spare.",
                "risks": [],
                "pax_protected": 99999,
                "impact": {"delay_reduction_min": 99999},
            }
        ],
    }
    res = recommend(net, scen(BOM), FakeProvider(payload))
    assert res.source == "llm" and res.model == "fake-model"
    rec = res.recommendations[0]
    truth = evaluate_action(net, scen(BOM), parse_action(rec.action))
    assert rec.impact == truth.impact.model_dump()
    assert rec.impact["delay_reduction_min"] == 35
    assert rec.reason_source == "llm" and rec.proposed_by == "llm_selected"


def test_llm_proposed_action_validated_by_engine(net):
    payload = {
        "situation_summary": "x",
        "recommendations": [
            {"action": {"type": "deploy_spare", "spare_tail": "VT-DS01", "replace_tail": "VT-DS05", "from_flight": "DS0502"}, "reason": "bad"},
            {"action": {"type": "teleport_aircraft"}, "reason": "nonsense"},
            {"candidate_id": "NOT-A-CANDIDATE", "reason": "made up"},
            {"action": {"type": "deploy_spare", "spare_tail": "VT-DS18", "replace_tail": "VT-DS12", "from_flight": "DS1203"}, "reason": "good"},
        ],
    }
    res = recommend(net, scen(BOM), FakeProvider(payload))
    assert [r.candidate_id for r in res.recommendations] == ["SPARE:VT-DS18:VT-DS12:DS1203"]
    assert res.recommendations[0].proposed_by == "llm_proposed"
    assert len(res.rejected) == 3


def test_llm_cannot_double_book_a_spare(net):
    payload = {
        "situation_summary": "x",
        "recommendations": [
            {"candidate_id": "SPARE:VT-DS17:VT-DS05:DS0502", "reason": "a"},
            {"candidate_id": "SPARE:VT-DS17:VT-DS12:DS1204", "reason": "b"},
        ],
    }
    res = recommend(net, scen(BOM), FakeProvider(payload))
    assert len(res.recommendations) == 1 and len(res.rejected) == 1


def test_unverified_numbers_flagged(net):
    payload = {"situation_summary": "Delays affect 4321 passengers and 435 minutes.", "recommendations": []}
    res = recommend(net, scen(BOM), FakeProvider(payload))
    assert "4321" in res.unverified_numbers and "435" not in res.unverified_numbers


def test_find_unverified_numbers_helper():
    assert find_unverified_numbers("saves 77 minutes on DS0502", {"a": 12}) == ["77"]


def test_provider_failure_falls_back_to_rule_engine(net):
    res = recommend(net, scen(BOM), FakeProvider(LLMError("timeout")))
    assert res.source == "rule_based" and res.provider_error == "timeout"
    assert res.recommendations and all(r.reason_source == "rule_based" for r in res.recommendations)


def test_context_contains_only_engine_state(net):
    fp = FakeProvider({"situation_summary": "", "recommendations": []})
    recommend(net, scen(BOM), fp)
    ctx = json.loads(fp.last_user)
    assert ctx["kpis"]["delayed"] == 9
    assert {c["tail_id"] for c in ctx["spare_aircraft"]} == {"VT-DS17", "VT-DS18"}
    assert all(c["impact"] for c in ctx["candidates"])


def test_rule_based_never_reuses_spare(net):
    res = recommend(net, scen(BOM), None)
    spares = [r.action.get("spare_tail") for r in res.recommendations if r.action.get("spare_tail")]
    assert len(spares) == len(set(spares))


def test_openai_compatible_provider_parsing():
    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        assert body["response_format"] == {"type": "json_object"} and body["temperature"] == 0
        assert request.headers["authorization"] == "Bearer k"
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps({"situation_summary": "ok", "recommendations": []})}}]})

    p = OpenAICompatibleProvider("k", "https://example.test/v1", "m", transport=httpx.MockTransport(handler))
    assert p.complete_json("s", "u")["situation_summary"] == "ok"


def test_openai_compatible_provider_errors():
    import pytest

    p = OpenAICompatibleProvider("k", "https://example.test/v1", "m", transport=httpx.MockTransport(lambda r: httpx.Response(500, text="boom")))
    with pytest.raises(LLMError):
        p.complete_json("s", "u")
    p2 = OpenAICompatibleProvider(
        "k",
        "https://example.test/v1",
        "m",
        transport=httpx.MockTransport(lambda r: httpx.Response(200, json={"choices": [{"message": {"content": "not json"}}]})),
    )
    with pytest.raises(LLMError):
        p2.complete_json("s", "u")
