"""Serverless entrypoint for Vercel Functions."""

import sys
from pathlib import Path

# Ensure backend directory is in sys.path
BASE_DIR = Path(__file__).resolve().parents[1]
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

try:
    import traceback
    from app.main import app as real_app  # noqa: E402
    app = real_app
except Exception as exc:
    import traceback
    from fastapi import FastAPI
    from fastapi.responses import JSONResponse
    err = traceback.format_exc()
    app = FastAPI(title="Domino Sky Error Fallback")

    @app.api_route("/{full_path:path}", methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD"])
    async def error_route(full_path: str):
        return JSONResponse(
            status_code=500,
            content={"error": "FastAPI initialization failed", "detail": str(exc), "traceback": err},
        )

handler = app
__all__ = ["app", "handler"]
