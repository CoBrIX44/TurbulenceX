"""FastAPI application entry point: `uvicorn app.main:app --reload`."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .api.deps import get_network
from .api.routes import router
from .config import get_settings
from .engine.dataset import validate_network

log = logging.getLogger("domino_sky")

SECURITY_HEADERS = [
    (b"x-content-type-options", b"nosniff"),
    (b"x-frame-options", b"DENY"),
    (b"referrer-policy", b"strict-origin-when-cross-origin"),
    (b"x-xss-protection", b"0"),
    (b"cross-origin-opener-policy", b"same-origin"),
    (b"cross-origin-resource-policy", b"cross-origin"),
    (b"strict-transport-security", b"max-age=31536000; includeSubDomains"),
    (
        b"content-security-policy",
        (
            b"default-src 'self'; "
            b"script-src 'self' 'unsafe-inline'; "
            b"style-src 'self' 'unsafe-inline' https:; "
            b"img-src 'self' data: https: blob:; "
            b"connect-src 'self' http: https: ws: wss:; "
            b"frame-ancestors 'none'; "
            b"object-src 'none'; "
            b"base-uri 'self';"
        ),
    ),
    (
        b"permissions-policy",
        b"accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
    ),
]


class SecurityHeadersMiddleware:
    """Pure ASGI middleware to attach security headers without BaseHTTPMiddleware overhead."""

    def __init__(self, app: Any):
        self.app = app

    async def __call__(self, scope: Any, receive: Any, send: Any) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_wrapper(message: dict) -> None:
            if message.get("type") == "http.response.start":
                headers = list(message.get("headers", []))
                headers.extend(SECURITY_HEADERS)
                message["headers"] = headers
            await send(message)

        await self.app(scope, receive, send_wrapper)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    try:
        net = get_network()
        report = validate_network(net)
        for c in report.checks:
            if not c.passed:
                log.warning("Dataset check failed: %s: %s", c.title, "; ".join(c.issues))
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
        lifespan=None,
    )
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_list,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization", "Accept", "Origin", "X-Requested-With"],
    )
    app.include_router(router)

    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        log.exception("Global exception on %s: %s", request.url.path, exc)
        return JSONResponse(
            status_code=500,
            content={"detail": f"Internal Server Error: {str(exc)}"},
        )

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
