"""
FutureFork: Backend Server Entry Point
Convenience script to start the FastAPI server from the project root.

Usage:
    python run_backend.py
    # or:
    python backend/main.py
"""

import sys
import os
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from backend.main import app
import uvicorn

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    print(f"Starting FutureFork API server on http://0.0.0.0:{port} (docs at http://localhost:{port}/docs) ...", flush=True)
    uvicorn.run(app, host="0.0.0.0", port=port)
