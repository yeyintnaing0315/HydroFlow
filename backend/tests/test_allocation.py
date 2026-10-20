import asyncio
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db, get_inventory_db
from app.main import app
from app.schemas.api import AllocationPlanRequest
from app.services import allocation, help_prediction
from app.services.inventory import add_region_stock, seed_regions


@pytest.fixture()
def inventory_session() -> Session:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        seed_regions(session)
        add_region_stock(
            session,
            region="east",
            category_code="foods",
            item_code="rice",
            quantity=100,
            entry_mode="manual",
            direction="in",
        )
        add_region_stock(
            session,
            region="east",
            category_code="utility",
            item_code="blanket",
            quantity=50,
            entry_mode="manual",
            direction="in",
        )
        session.commit()
        yield session
    Base.metadata.drop_all(engine)


@pytest.fixture()
def geo_session() -> Session:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        yield session
    Base.metadata.drop_all(engine)


def _sample_townships():
    return [
        allocation.TownshipCatalog("bago", "Bago", 17.336, 96.481),
        allocation.TownshipCatalog("taungoo", "Taungoo", 18.937, 96.433),
    ]


def _help_score(*, people: int, priority: str) -> dict:
    households = max(1, people // 4)
    return {
        "help_probability": 0.6,
        "predicted_help": True,
        "expected_affected_people": people,
        "expected_households": households,
        "assistance_priority": priority,
        "shelter_kits": households,
        "food_rations_3d": people * 3,
        "drinking_water_liters_3d": people * 9,
        "model_version": "flood-help-v2",
    }


def test_allocation_plan_ranks_townships_and_assigns_routes(
    monkeypatch: pytest.MonkeyPatch,
    geo_session: Session,
    inventory_session: Session,
) -> None:
    async def fake_help(township: allocation.TownshipCatalog, _day: date):
        if township.id == "bago":
            return _help_score(people=120, priority="high")
        return _help_score(people=8000, priority="severe")

    monkeypatch.setattr(allocation, "_iter_townships", lambda _s, _ids: _sample_townships())
    monkeypatch.setattr(allocation, "_help_for_township", fake_help)
    monkeypatch.setattr(help_prediction, "load_help_model", lambda: ({}, {}))
    async def _no_osrm(_pts):
        return None

    monkeypatch.setattr(allocation.osrm, "driving_path", _no_osrm)

    request = AllocationPlanRequest(date=date(2026, 10, 15), warehouse_region="east")
    plan = asyncio.run(build_allocation_plan(geo_session, inventory_session, request))

    assert len(plan.rows) == 2
    assert plan.rows[0].township_name == "Taungoo"
    assert plan.rows[1].township_name == "Bago"
    assert plan.rows[0].route_id in {"Route A", "Route B", "Route C"}
    assert plan.totals.affected_population == 8120
    assert plan.shortages
    assert plan.routes


def test_allocation_api(client: TestClient, monkeypatch: pytest.MonkeyPatch, inventory_session: Session) -> None:
    async def fake_help(township: allocation.TownshipCatalog, _day: date):
        return _help_score(people=200, priority="high")

    monkeypatch.setattr(allocation, "_iter_townships", lambda _s, _ids: _sample_townships()[:1])
    monkeypatch.setattr(allocation, "_help_for_township", fake_help)
    monkeypatch.setattr(help_prediction, "load_help_model", lambda: ({}, {}))
    async def _no_osrm(_pts):
        return None

    monkeypatch.setattr(allocation.osrm, "driving_path", _no_osrm)

    app.dependency_overrides[get_inventory_db] = lambda: inventory_session
    response = client.post(
        "/allocation/plan",
        json={"date": "2026-10-15", "warehouse_region": "east", "min_priority": "moderate"},
    )
    app.dependency_overrides.pop(get_inventory_db, None)
    assert response.status_code == 200
    body = response.json()
    assert body["rows"][0]["township_name"] == "Bago"
    assert "plan_id" in body


def test_allocation_dispatch_reduces_stock(inventory_session: Session) -> None:
    app.dependency_overrides[get_inventory_db] = lambda: inventory_session
    with TestClient(app) as client:
        response = client.post(
            "/allocation/dispatch",
            json={
                "warehouse_region": "east",
                "lines": [
                    {
                        "category_code": "foods",
                        "item_code": "rice",
                        "quantity": 10,
                        "destination": "Bago",
                    }
                ],
            },
        )
    app.dependency_overrides.pop(get_inventory_db, None)
    assert response.status_code == 200
    rice = next(
        item
        for klass in response.json()["classes"]
        if klass["code"] == "foods"
        for item in klass["items"]
        if item["code"] == "rice"
    )
    assert rice["quantity"] == 90.0


def build_allocation_plan(geo_session, inventory_session, request):
    return allocation.build_allocation_plan(geo_session, inventory_session, request)
