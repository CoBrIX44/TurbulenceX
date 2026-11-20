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
    report = validate_network(get_network())
    for c in report.checks:
        if not c.passed:
            log.warning("Dataset check failed: %s — %s", c.title, "; ".join(c.issues))
    log.info("Dataset loaded (sha256 %s), valid=%s", report.checksum[:12], report.valid)
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

    return app


app = create_app()
