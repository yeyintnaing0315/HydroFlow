import os
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


class Base(DeclarativeBase):
    pass


DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./hydroflow.db")
_connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=_connect_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def create_tables() -> None:
    from sqlalchemy import text

    from app import models  # noqa: F401

    Base.metadata.create_all(engine)
    with engine.begin() as connection:
        connection.execute(text(
            """
            DELETE FROM alerts
            WHERE location_id IN (
                SELECT id FROM locations
                WHERE id NOT IN (SELECT MIN(id) FROM locations GROUP BY name)
            )
            """
        ))
        connection.execute(text(
            """
            DELETE FROM observations
            WHERE location_id IN (
                SELECT id FROM locations
                WHERE id NOT IN (SELECT MIN(id) FROM locations GROUP BY name)
            )
            """
        ))
        connection.execute(text(
            """
            DELETE FROM locations
            WHERE id NOT IN (SELECT MIN(id) FROM locations GROUP BY name)
            """
        ))
        connection.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_location_name ON locations (name)"
        ))


def drop_tables() -> None:
    from app import models  # noqa: F401

    Base.metadata.drop_all(engine)


def get_db() -> Generator[Session, None, None]:
    with SessionLocal() as session:
        yield session
