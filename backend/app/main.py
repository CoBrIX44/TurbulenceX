"""FastAPI application entry point: `uvicorn app.main:app --reload`."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from .api.deps import get_network
from .api.routes import router
from .config import get_settings
from .engine.dataset import validate_network

log = logging.getLogger("domino_sky")


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        response: Response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()"
        return response


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    try:
        report = validate_network(get_network())
        for c in report.checks:
            if not c.passed:
                log.warning("Dataset check failed: %s — %s", c.title, "; ".join(c.issues))
        log.info("Dataset loaded (sha256 %s), valid=%s", report.checksum[:12], report.valid)
    except Exception as exc:
        log.error("Failed to load/validate network during lifespan startup: %s", exc)
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Domino Sky API",
        version="1.0.0",
        description="Deterministic flight disruption cascade & recovery simulator",
        lifespan=lifespan,
    )
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_list,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization", "Accept", "Origin", "X-Requested-With"],
    )
    app.include_router(router)

    @app.get("/")
    @app.get("/api")
    def api_root() -> dict:
        return {"status": "ok", "service": "domino-sky-backend"}

    # Mirror routes without the /api prefix in case an upstream proxy or rewrite strips it
    for r in list(router.routes):
        r_path = getattr(r, "path", "")
        if r_path.startswith("/api/"):
            subpath = r_path[4:]
            methods = list(getattr(r, "methods", []))
            endpoint = getattr(r, "endpoint", None)
            if endpoint and methods:
                app.add_api_route(subpath, endpoint, methods=methods, include_in_schema=False)

    return app


app = create_app()
