"""Entrypoint for Vercel / ASGI runners: `uvicorn main:app`."""

from __future__ import annotations

import sys
from pathlib import Path

# Ensure backend root is in sys.path
BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from app.main import app, create_app  # noqa: E402

handler = app
application = app
__all__ = ["app", "handler", "application", "create_app"]
