"""Root level serverless entrypoint for Vercel Functions."""

import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[1] / "backend"
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from app.main import app, create_app  # noqa: E402

__all__ = ["app", "create_app"]
