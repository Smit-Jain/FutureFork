"""
FutureFork FastAPI Main Application
Team FutureLabs | Elite Coders CodeSprint 2026
"""

import logging
import os
import sys
from pathlib import Path

# Ensure project root is in sys.path so running `python backend/main.py` directly works
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend import settings
from backend.api.auth_routes import router as auth_router
from backend.api.routes import router
from backend.api.tax_routes import router as tax_router
from backend.db.repository import init_db

# Configure structured logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("futurefork")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create tables and seed the bundled sample datasets
    settings.validate_auth_settings()
    if not settings.GOOGLE_CLIENT_ID:
        logger.warning("GOOGLE_CLIENT_ID is not set: Google Sign-In is disabled%s.",
                       " (dev login is enabled)" if settings.AUTH_DEV_LOGIN else "")
    logger.info("Initializing FutureFork Database...")
    init_db()
    logger.info("Database initialized with sample datasets.")
    yield
    # Shutdown
    logger.info("FutureFork Backend shutting down.")

app = FastAPI(
    title="FutureFork API",
    description="Financial decision forking: CP-SAT cash-flow optimization and Monte Carlo stress tests.",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS: explicit origins from CORS_ORIGINS. A wildcard is only honoured without credentials,
# since browsers reject credentialed requests to "*".
_wildcard = "*" in settings.CORS_ORIGINS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if _wildcard else settings.CORS_ORIGINS,
    allow_credentials=not _wildcard,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Standardized error shape: {error: code, message: text}. Details stay in the server log.
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception(f"Unhandled exception on {request.url.path}: {exc}")
    message = "An unexpected error occurred." if settings.IS_PRODUCTION else f"{type(exc).__name__}: {exc}"
    return JSONResponse(
        status_code=500,
        content={"error": "INTERNAL_SERVER_ERROR", "message": message},
    )

# Include API routes (auth endpoints are public; everything in `router` requires a session)
app.include_router(auth_router)
app.include_router(router)
app.include_router(tax_router)

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    reload_env = os.getenv("RELOAD", "false").lower() in ("true", "1", "yes")
    print(f"Starting FutureFork API server on http://0.0.0.0:{port} (docs at http://localhost:{port}/docs) ...", flush=True)
    if reload_env:
        uvicorn.run("backend.main:app", host="0.0.0.0", port=port, reload=True, app_dir=str(ROOT_DIR))
    else:
        uvicorn.run(app, host="0.0.0.0", port=port)
