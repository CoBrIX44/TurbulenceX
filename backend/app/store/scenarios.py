"""Lightweight JSON-file scenario persistence (no database needed for the MVP)."""

from __future__ import annotations

import json
import threading
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Optional

from pydantic import BaseModel, Field

from ..engine.models import Disruption, RecoveryAction, SimulationSettings


class ScenarioBody(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = ""
    disruptions: list[Disruption] = []
    actions: list[RecoveryAction] = []
    settings: SimulationSettings = SimulationSettings()


class StoredScenario(ScenarioBody):
    id: str
    created_at: str
    updated_at: str


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


class ScenarioStore:
    def __init__(self, path: Path):
        self.path = Path(path)
        self._lock = threading.Lock()

    def _read(self) -> list[StoredScenario]:
        if not self.path.exists():
            return []
        data = json.loads(self.path.read_text(encoding="utf-8") or "[]")
        return [StoredScenario.model_validate(x) for x in data]

    def _write(self, items: list[StoredScenario]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps([i.model_dump(mode="json") for i in items], indent=2), encoding="utf-8")
        tmp.replace(self.path)

    def list(self) -> list[StoredScenario]:
        with self._lock:
            return sorted(self._read(), key=lambda s: s.updated_at, reverse=True)

    def get(self, sid: str) -> Optional[StoredScenario]:
        with self._lock:
            return next((s for s in self._read() if s.id == sid), None)

    def create(self, body: ScenarioBody) -> StoredScenario:
        with self._lock:
            items = self._read()
            now = _now()
            s = StoredScenario(id=uuid.uuid4().hex[:12], created_at=now, updated_at=now, **body.model_dump())
            items.append(s)
            self._write(items)
            return s

    def update(self, sid: str, body: ScenarioBody) -> Optional[StoredScenario]:
        with self._lock:
            items = self._read()
            for i, s in enumerate(items):
                if s.id == sid:
                    items[i] = StoredScenario(id=sid, created_at=s.created_at, updated_at=_now(), **body.model_dump())
                    self._write(items)
                    return items[i]
            return None

    def delete(self, sid: str) -> bool:
        with self._lock:
            items = self._read()
            keep = [s for s in items if s.id != sid]
            if len(keep) == len(items):
                return False
            self._write(keep)
            return True

    def duplicate(self, sid: str) -> Optional[StoredScenario]:
        src = self.get(sid)
        if src is None:
            return None
        body = ScenarioBody(**src.model_dump(include={"description", "disruptions", "actions", "settings"}), name=f"{src.name} (copy)")
        return self.create(body)
