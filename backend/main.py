"""
Tele-Twin — Telecom Digital Twin and RF Planning Platform

FastAPI application entry point.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from .database.schema import init_db
from .api.routes import router

app = FastAPI(
    title="Tele-Twin API",
    description="Telecom Digital Twin for Coverage Prediction and RF Network Planning",
    version="2.0.0",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routes
app.include_router(router)

# Serve frontend static files if built
frontend_build = os.path.join(os.path.dirname(__file__), "..", "frontend", "build")
if os.path.isdir(frontend_build):
    app.mount("/", StaticFiles(directory=frontend_build, html=True), name="frontend")


@app.on_event("startup")
def startup():
    init_db()


@app.get("/")
def root():
    return {
        "status": "ok",
        "project": "Tele-Twin",
        "version": "2.0.0",
        "description": "Telecom Digital Twin for Coverage Prediction and RF Network Planning",
        "docs": "/docs",
        "api": "/api/health",
    }
