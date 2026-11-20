from __future__ import annotations

import copy
import json
from pathlib import Path

import pytest

from app.engine.dataset import Network, build_network, load_network
from app.engine.models import Dataset, Disruption, ScenarioInput

BACKEND = Path(__file__).resolve().parents[1]
DATASET = BACKEND / "data" / "flight_network.json"


@pytest.fixture(scope="session")
def net() -> Network:
    return load_network(DATASET)


@pytest.fixture()
def raw() -> dict:
    return json.loads(DATASET.read_text())


def network_from(raw: dict) -> Network:
    return build_network(Dataset.model_validate(copy.deepcopy(raw)))


def closure(airport: str, start: str, duration: int, did: str = "D1", **kw) -> Disruption:
    return Disruption(id=did, airport=airport, type=kw.pop("type", "airport_closure"), start=start, duration_min=duration, **kw)


def scen(*disruptions: Disruption, actions=None, **settings) -> ScenarioInput:
    return ScenarioInput(disruptions=list(disruptions), actions=actions or [], settings=settings or {})
