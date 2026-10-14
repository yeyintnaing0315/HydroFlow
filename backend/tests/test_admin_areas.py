import asyncio

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app
from app.services import admin_areas


def _place(entity_id: str, name: str, parent_id: str, lat: float, lon: float) -> dict:
    return {
        "id": entity_id,
        "name_local": name,
        "name_en": name,
        "slug": f"{name.lower()}-{entity_id}",
        "lat": lat,
        "lon": lon,
        "parent_id": parent_id,
    }


class FakeResponse:
    def __init__(self, payload: dict):
        self.payload = payload

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict:
        return self.payload


class FakeClient:
    def __init__(self, payloads: dict[str, dict]):
        self.payloads = payloads
        self.urls: list[str] = []

    async def get(self, url: str) -> FakeResponse:
        self.urls.append(url)
        return FakeResponse(self.payloads[url])


# Open Admin Data still files these under the old four districts.
_OLD_API_TOWNSHIPS = {
    "Bago": ["Bago", "Kawa", "Thanatpin", "Waw", "Nyaunglebin", "Kyauktaga", "Daik-U", "Shwegyin", "Hpayargyi"],
    "Taungoo": ["Kyaukkyi", "Taungoo", "Phyu", "Yedashe", "Oktwin"],
    "Pyay": ["Pyay", "Padaung", "Paukkhaung", "Paungde", "Paungdale", "Shwedaung", "Thegon"],
    "Thayarwady": ["Gyobingauk", "Letpadan", "Minhla", "Monyo", "Nattalin", "Okpho", "Thayarwady", "Zigon"],
}


def _payloads() -> dict[str, dict]:
    districts = {
        "Taungoo": _place("MMR007D002", "Taungoo", "MMR007", 18.87, 96.41),
        "Bago": _place("MMR007D001", "Bago", "MMR007", 17.67, 96.62),
        "Pyay": _place("MMR008D001", "Pyay", "MMR007", 18.69, 95.32),
        "Thayarwady": _place("MMR008D002", "Thayarwady", "MMR007", 18.04, 95.65),
    }
    region_children = [_place("MMR013D001", "Yangon", "MMR013", 16.8, 96.15), *districts.values()]
    payloads = {
        f"{admin_areas.API_ROOT}/region/bago-MMR007.json": {
            "entity": {
                "id": "MMR007",
                "name_local": "Bago Region",
                "name_en": "Bago",
                "slug": "bago-MMR007",
                "lat": 18.2638,
                "lon": 96.0673,
            },
            "children": {"level": "district", "entities": region_children},
        }
    }
    for district_name, township_names in _OLD_API_TOWNSHIPS.items():
        district = districts[district_name]
        townships = []
        for name in township_names:
            latitude = 17.33583 if name == "Bago" else 17.1
            longitude = 96.48389 if name == "Bago" else 96.2
            townships.append(_place(f"{district['id']}-{name}", name, district["id"], latitude, longitude))
        payloads[f"{admin_areas.API_ROOT}/district/{district['slug']}.json"] = {
            "entity": district,
            "children": {"level": "township", "entities": townships},
        }
    return payloads


@pytest.fixture()
def client() -> TestClient:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    session = Session(engine)
    app.dependency_overrides[get_db] = lambda: session
    with TestClient(app) as value:
        yield value
    app.dependency_overrides.clear()
    session.close()
    Base.metadata.drop_all(engine)


def test_bago_loader_follows_2022_six_districts() -> None:
    client = FakeClient(_payloads())
    result = asyncio.run(admin_areas.load_bago_admin(client))
    by_name = {item["name_en"]: item for item in result["districts"]}

    assert result["region_id"] == "MMR007"
    assert [item["name_en"] for item in result["districts"]] == [
        "Bago",
        "Nyaunglebin",
        "Taungoo",
        "Thayarwady",
        "Nattalin",
        "Pyay",
    ]
    assert [len(item["townships"]) for item in result["districts"]] == [4, 5, 5, 6, 4, 4]
    assert [item["name_en"] for item in by_name["Nyaunglebin"]["townships"]] == [
        "Nyaunglebin",
        "Kyauktaga",
        "Daik-U",
        "Shwegyin",
        "Kyaukkyi",
    ]
    assert [item["name_en"] for item in by_name["Nattalin"]["townships"]] == [
        "Nattalin",
        "Zigon",
        "Thegon",
        "Paungde",
    ]
    assert by_name["Nyaunglebin"]["id"] == "nyaunglebin"
    assert by_name["Nattalin"]["id"] == "nattalin"
    assert by_name["Bago"]["townships"][0]["latitude"] == 17.33583
    assert by_name["Taungoo"]["townships"][-1]["id"] == "htantabin-taungoo"
    names = [township["name_en"] for district in result["districts"] for township in district["townships"]]
    assert "Hpayargyi" not in names
    assert "Paungdale" not in names
    assert not any("yangon" in url for url in client.urls)


def test_bago_areas_route(client: TestClient, monkeypatch) -> None:
    async def fake_areas() -> dict:
        return {
            "region_name_local": "Bago Region",
            "latitude": 18.2638,
            "longitude": 96.0673,
            "districts": [
                {
                    "id": "MMR007D001",
                    "slug": "bago-MMR007D001",
                    "name_en": "Bago",
                    "name_local": "Bago District",
                    "latitude": 17.67,
                    "longitude": 96.62,
                    "townships": [
                        {
                            "id": "MMR007001701",
                            "slug": "bago-MMR007001701",
                            "name_en": "Bago",
                            "name_local": "Bago",
                            "latitude": 17.33583,
                            "longitude": 96.48389,
                        }
                    ],
                }
            ],
        }

    monkeypatch.setattr(admin_areas, "bago_areas", fake_areas)
    response = client.get("/bago-areas")
    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "Open Admin Data"
    assert body["region_id"] == "MMR007"
    assert body["districts"][0]["townships"][0]["name_en"] == "Bago"


def test_bago_areas_provider_failure(client: TestClient, monkeypatch) -> None:
    async def broken() -> dict:
        raise httpx.ConnectError("down")

    monkeypatch.setattr(admin_areas, "bago_areas", broken)
    response = client.get("/bago-areas")
    assert response.status_code == 502
