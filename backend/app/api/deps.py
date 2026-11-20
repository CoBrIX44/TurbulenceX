from __future__ import annotations

from functools import lru_cache

from ..config import get_settings
from ..engine.dataset import Network, load_network
from ..store.scenarios import ScenarioStore


@lru_cache
def get_network() -> Network:
    return load_network(get_settings().dataset_path)


@lru_cache
def get_store() -> ScenarioStore:
    return ScenarioStore(get_settings().scenario_store_path)
