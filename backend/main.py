"""Entrypoint for Vercel / ASGI runners: `uvicorn main:app`."""

import sys
from pathlib import Path

# Ensure the backend directory is in sys.path
BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from app.main import app, create_app  # noqa: E402

__all__ = ["app", "create_app"]
