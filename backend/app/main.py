from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.allocation import router as allocation_router
from app.api.health import router as health_router
from app.api.hydrology import router as hydrology_router
from app.api.inventory import router as inventory_router
from app.api.operations import router as operations_router
from app.api.prediction import router as prediction_router
from app.db import create_tables


@asynccontextmanager
async def lifespan(_: FastAPI):
    create_tables()
    yield


app = FastAPI(
    title="HydroFlow V1 API",
    version="0.1.0",
    description="Academic flood-risk prototype; not for operational warnings.",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:8080"],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(health_router)
app.include_router(hydrology_router)
app.include_router(operations_router)
app.include_router(prediction_router)
app.include_router(allocation_router)
app.include_router(inventory_router)
