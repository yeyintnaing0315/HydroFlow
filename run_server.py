import os
import sys

# Ensure the backend package (backend/app) is importable
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend"))

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.main import app as api_app

PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
dist = os.path.join(PROJECT_ROOT, "frontend", "dist")

api_app.mount("/assets", StaticFiles(directory=os.path.join(dist, "assets")), name="assets")


@api_app.get("/")
async def index():
    return FileResponse(os.path.join(dist, "index.html"))


@api_app.get("/{path:path}")
async def spa_fallback(path: str):
    if path.startswith(("api/", "assets/", "openapi.json", "docs", "favicon.ico")):
        raise HTTPException(status_code=404)
    return FileResponse(os.path.join(dist, "index.html"))


if __name__ == "__main__":
    uvicorn.run(api_app, host="127.0.0.1", port=5176)
