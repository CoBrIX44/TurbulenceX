"""Serverless entrypoint for Vercel Functions."""

import json
import logging
import sys
import traceback
from pathlib import Path

# Ensure backend directory is in sys.path
BASE_DIR = Path(__file__).resolve().parents[1]
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

log = logging.getLogger("domino_sky")

try:
    from app.main import app  # noqa: E402
except Exception as exc:
    err_text = traceback.format_exc()
    exc_msg = str(exc)
    log.error("Fatal initialization error in app.main: %s", err_text)

    async def app(scope, receive, send):
        if scope.get("type") == "http":
            payload = json.dumps({
                "detail": f"FastAPI initialization failed on Vercel: {exc_msg}",
                "traceback": err_text,
                "sys_path": sys.path,
            }).encode("utf-8")
            await send({
                "type": "http.response.start",
                "status": 500,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"access-control-allow-origin", b"*"),
                ],
            })
            await send({
                "type": "http.response.body",
                "body": payload,
                "more_body": False,
            })

__all__ = ["app"]
