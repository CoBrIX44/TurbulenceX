"""LLM provider abstraction (OpenAI-compatible chat completions)."""

from __future__ import annotations

import json
from typing import Protocol

import httpx


class LLMError(RuntimeError):
    pass


class LLMProvider(Protocol):
    name: str
    model: str

    def complete_json(self, system: str, user: str) -> dict: ...


class OpenAICompatibleProvider:
    """Works with any server exposing POST {base_url}/chat/completions (OpenAI, Azure-compatible gateways, vLLM, Ollama...)."""

    name = "openai-compatible"

    def __init__(self, api_key: str, base_url: str, model: str, timeout_s: float = 30.0, transport: httpx.BaseTransport | None = None):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout_s = timeout_s
        self._transport = transport

    def complete_json(self, system: str, user: str) -> dict:
        payload = {
            "model": self.model,
            "temperature": 0,
            "response_format": {"type": "json_object"},
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        }
        try:
            with httpx.Client(timeout=self.timeout_s, transport=self._transport) as client:
                resp = client.post(
                    f"{self.base_url}/chat/completions",
                    headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
                    json=payload,
                )
        except httpx.HTTPError as exc:
            raise LLMError(f"LLM request failed: {exc}") from exc
        if resp.status_code >= 400:
            raise LLMError(f"LLM provider returned HTTP {resp.status_code}: {resp.text[:300]}")
        try:
            content = resp.json()["choices"][0]["message"]["content"]
            data = json.loads(content)
        except (KeyError, IndexError, ValueError, TypeError) as exc:
            raise LLMError(f"LLM response was not valid JSON: {exc}") from exc
        if not isinstance(data, dict):
            raise LLMError("LLM response JSON must be an object")
        return data
