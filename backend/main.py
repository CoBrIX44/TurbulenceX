"""Entrypoint for Vercel / ASGI runners: `uvicorn main:app`."""

from __future__ import annotations

import json
import logging
import sys
import traceback
from pathlib import Path
from typing import Any

# Ensure backend root and _vendor directory are in sys.path
BASE_DIR = Path(__file__).resolve().parent
VENDOR_DIR = BASE_DIR / "_vendor"
if VENDOR_DIR.exists() and str(VENDOR_DIR) not in sys.path:
    sys.path.insert(0, str(VENDOR_DIR))
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

log = logging.getLogger("domino_sky")

startup_err: str | None = None
fastapi_app: Any = None

try:
    from app.main import app as fastapi_app
except Exception:
    startup_err = traceback.format_exc()
    log.exception("Startup import failed")


async def app(scope: dict[str, Any], receive: Any, send: Any) -> None:
    if startup_err or fastapi_app is None:
        if scope.get("type") == "http":
            body = json.dumps({"detail": f"Backend Startup Error: {startup_err}"}).encode("utf-8")
            await send({
                "type": "http.response.start",
                "status": 500,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"access-control-allow-origin", b"*"),
                ],
            })
            await send({"type": "http.response.body", "body": body, "more_body": False})
        return

    try:
        await fastapi_app(scope, receive, send)
    except Exception:
        err_msg = traceback.format_exc()
        log.exception("Unhandled runtime error in ASGI handler")
        if scope.get("type") == "http":
            body = json.dumps({"detail": f"Backend Runtime Error: {err_msg}"}).encode("utf-8")
            await send({
                "type": "http.response.start",
                "status": 500,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"access-control-allow-origin", b"*"),
                ],
            })
            await send({"type": "http.response.body", "body": body, "more_body": False})


handler = app
__all__ = ["app", "handler"]
