import os
from collections.abc import Generator
from pathlib import Path

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


class Base(DeclarativeBase):
    pass


_project_db = (Path(__file__).resolve().parents[2] / "hydroflow.db").as_posix()
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{_project_db}")
_connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=_connect_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

INVENTORY_DATABASE_URL = os.getenv("INVENTORY_DATABASE_URL", DATABASE_URL)
_inventory_connect_args = (
    {"check_same_thread": False} if INVENTORY_DATABASE_URL.startswith("sqlite") else {}
)
inventory_engine = create_engine(
    INVENTORY_DATABASE_URL,
    connect_args=_inventory_connect_args,
    pool_pre_ping=not INVENTORY_DATABASE_URL.startswith("sqlite"),
)
InventorySession = sessionmaker(bind=inventory_engine, autoflush=False, expire_on_commit=False)


REQUIRED_TABLES = {
    "locations",
    "observations",
    "alerts",
    "data_sources",
    "dataset_versions",
    "admin_areas",
    "admin_aliases",
    "settlements",
    "provider_observations",
    "official_warnings",
    "inundation_products",
    "exposure_summaries",
    "model_versions",
    "job_runs",
    "risk_results",
    "historical_days",
}


def schema_status() -> dict[str, object]:
    """Report migration readiness without changing or deleting user data."""
    available = set(inspect(engine).get_table_names())
    missing = sorted(REQUIRED_TABLES - available)
    revision = None
    if "alembic_version" in available:
        with engine.connect() as connection:
            revision = connection.execute(text("SELECT version_num FROM alembic_version")).scalar()
    return {
        "ready": not missing,
        "missing_tables": missing,
        "revision": revision,
    }


def create_tables() -> None:
    """Test/development helper; deployments must run Alembic migrations."""
    from app import models  # noqa: F401

    Base.metadata.create_all(engine)


def drop_tables() -> None:
    from app import models  # noqa: F401

    Base.metadata.drop_all(engine)


def get_db() -> Generator[Session, None, None]:
    with SessionLocal() as session:
        yield session


def get_inventory_db() -> Generator[Session, None, None]:
    with InventorySession() as session:
        yield session
