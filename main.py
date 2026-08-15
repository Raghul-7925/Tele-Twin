"""
Tele-Twin — Root entry point for Railway deployment.
Imports and runs the FastAPI app from backend package.
"""
import sys
import os

# Ensure backend package is importable
sys.path.insert(0, os.path.dirname(__file__))

from backend.main import app

# This file exists so Railway/nixpacks can find the app at root level.
# The actual application logic lives in backend/.
