from datetime import date

from fastapi.testclient import TestClient

from app.main import app
from app.services import live_features
from app.services.prediction import load_model


def test_saved_model_serves_probability(monkeypatch) -> None:
    async def fake_observations(latitude: float, longitude: float):
        return [(date(2026, 10, 1), 25.0, 250.0), (date(2026, 10, 2), 10.0, 200.0)]

    monkeypatch.setattr(live_features, "load_observations", fake_observations)
    load_model.cache_clear()
    with TestClient(app) as client:
        response = client.post(
            "/outlook",
            json={
                "date": "2026-10-01",
                "township_id": "bago",
                "latitude": 17.336,
                "longitude": 96.481,
            },
        )

    assert response.status_code == 200
    body = response.json()
    assert [day["date"] for day in body["days"]] == ["2026-10-01", "2026-10-02"]
    assert body["source"] == "Open-Meteo rainfall and GloFAS discharge"
    assert all(0 <= day["flood_probability"] <= 1 for day in body["days"])
