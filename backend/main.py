"""Entrypoint for Vercel / ASGI runners: `uvicorn main:app`."""

from __future__ import annotations

import json
import sys
import traceback
from pathlib import Path
from typing import Any

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

diag: dict[str, Any] = {"sys_path": sys.path[:5]}

try:
    import fastapi
    diag["fastapi"] = fastapi.__version__
except Exception:
    diag["fastapi_err"] = traceback.format_exc()

real_app: Any = None
try:
    from app.main import app as imported_app
    real_app = imported_app
    diag["app_loaded"] = True
except Exception:
    diag["app_load_err"] = traceback.format_exc()


async def app(scope: dict[str, Any], receive: Any, send: Any) -> None:
    if scope.get("type") == "http":
        path = scope.get("path", "")
        if path == "/api/__diag" or real_app is None or "app_load_err" in diag:
            body = json.dumps(diag, indent=2).encode("utf-8")
            await send({
                "type": "http.response.start",
                "status": 200,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"access-control-allow-origin", b"*"),
                ],
            })
            await send({"type": "http.response.body", "body": body, "more_body": False})
            return

        try:
            await real_app(scope, receive, send)
        except Exception:
            err_body = json.dumps({"runtime_err": traceback.format_exc()}).encode("utf-8")
            await send({
                "type": "http.response.start",
                "status": 200,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"access-control-allow-origin", b"*"),
                ],
            })
            await send({"type": "http.response.body", "body": err_body, "more_body": False})


handler = app
__all__ = ["app", "handler"]
