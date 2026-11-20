"""FastAPI application entry point: `uvicorn app.main:app --reload`."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
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
        response.headers["X-XSS-Protection"] = "0"
        response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
        response.headers["Cross-Origin-Resource-Policy"] = "cross-origin"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline'; "
            "style-src 'self' 'unsafe-inline' https:; "
            "img-src 'self' data: https: blob:; "
            "connect-src 'self' http: https: ws: wss:; "
            "frame-ancestors 'none'; "
            "object-src 'none'; "
            "base-uri 'self';"
        )
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

    @app.middleware("http")
    async def error_handling_middleware(request: Request, call_next):
        try:
            return await call_next(request)
        except Exception as exc:
            log.exception("Unhandled error processing %s: %s", request.url.path, exc)
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
