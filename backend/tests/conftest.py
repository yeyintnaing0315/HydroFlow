import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app


@pytest.fixture()
def session() -> Session:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    with Session(engine) as value:
        yield value
    Base.metadata.drop_all(engine)


@pytest.fixture()
def client(session: Session):
    app.dependency_overrides[get_db] = lambda: session
    with TestClient(app) as value:
        yield value
    app.dependency_overrides.clear()
