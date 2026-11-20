"""Centralised configuration (environment variables, see .env.example)."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", env_file_encoding="utf-8", extra="ignore")

    dataset_path: Path = BACKEND_DIR / "data" / "flight_network.json"
    scenario_store_path: Path = BACKEND_DIR / "data" / "scenarios" / "scenarios.json"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # OpenAI-compatible LLM provider. Leave LLM_API_KEY empty to use the
    # deterministic rule-based dispatcher.
    llm_api_key: str = ""
    llm_base_url: str = "https://api.openai.com/v1"
    llm_model: str = "gpt-4o-mini"
    llm_timeout_s: float = 30.0
    llm_max_candidates: int = 12

    @field_validator("dataset_path")
    @classmethod
    def _resolve_dataset(cls, v: Path) -> Path:
        resolved = v if v.is_absolute() else (BACKEND_DIR / v).resolve()
        if resolved.exists():
            return resolved
        candidates = [
            BACKEND_DIR / "data" / "flight_network.json",
            BACKEND_DIR / "flight_network.json",
            Path.cwd() / "backend" / "data" / "flight_network.json",
            Path.cwd() / "data" / "flight_network.json",
            Path.cwd() / "flight_network.json",
            Path(__file__).resolve().parents[2] / "flight_network.json",
            Path(__file__).resolve().parents[2] / "backend" / "data" / "flight_network.json",
        ]
        for c in candidates:
            if c.exists():
                return c.resolve()
        return resolved

    @field_validator("scenario_store_path")
    @classmethod
    def _resolve_scenario_store(cls, v: Path) -> Path:
        import os
        if os.environ.get("VERCEL") and "SCENARIO_STORE_PATH" not in os.environ:
            return Path("/tmp/scenarios.json")
        return v if v.is_absolute() else (BACKEND_DIR / v).resolve()

    @property
    def cors_list(self) -> list[str]:
        import os
        if self.cors_origins.strip() == "*" or os.environ.get("VERCEL"):
            return ["*"]
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
