"""Entrypoint for Vercel / ASGI runners: `uvicorn main:app`."""

from __future__ import annotations

import json
import logging
import sys
import traceback
from pathlib import Path
from typing import Any

# Ensure backend root is in sys.path
BASE_DIR = Path(__file__).resolve().parent
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
    if scope.get("type") == "lifespan":
        while True:
            message = await receive()
            if message.get("type") == "lifespan.startup":
                if startup_err:
                    await send({"type": "lifespan.startup.failed", "message": startup_err})
                else:
                    await send({"type": "lifespan.startup.complete"})
            elif message.get("type") == "lifespan.shutdown":
                await send({"type": "lifespan.shutdown.complete"})
                return
        return

    if startup_err or fastapi_app is None:
        if scope.get("type") == "http":
            body = json.dumps({"error": "StartupError", "detail": startup_err}).encode("utf-8")
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
            body = json.dumps({"error": "RuntimeError", "detail": err_msg}).encode("utf-8")
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
