"""
FutureFork FastAPI Main Application
Team FutureLabs | Elite Coders CodeSprint 2026 | Person B
"""

import os
import logging
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from backend.db.repository import init_db
from backend.api.routes import router

# Configure structured logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("futurefork")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: initialize DB tables and seed sample dataset
    logger.info("Initializing FutureFork Database...")
    init_db()
    logger.info("Database initialized with sample dataset.")
    yield
    # Shutdown
    logger.info("FutureFork Backend shutting down.")

app = FastAPI(
    title="FutureFork API",
    description="Optimization and Monte Carlo Scenario Branching Engine for Resource Allocation.",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS Configuration
allowed_origins = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173,https://futurefork.vercel.app",
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Allow all origins for hackathon / Vercel previews
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Standardized Error Handling Middleware: {error: code, message: text}
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception(f"Unhandled exception on {request.url.path}: {exc}")
    return JSONResponse(
        status_code=500,
        content={"error": "INTERNAL_SERVER_ERROR", "message": str(exc)},
    )

# Include API routes
app.include_router(router)

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("backend.main:app", host="0.0.0.0", port=port, reload=True)
