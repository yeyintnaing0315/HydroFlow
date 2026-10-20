from datetime import date

from fastapi.testclient import TestClient

from app.main import app

today = date.today().isoformat()
with TestClient(app, raise_server_exceptions=False) as client:
    outlook = client.post(
        "/outlook",
        json={
            "date": today,
            "township_id": "MMR007001701",
            "latitude": 17.3358,
            "longitude": 96.4839,
        },
    )
    print("OUTLOOK", outlook.status_code)
    print(outlook.text[:2500])
    start = date.fromordinal(date.today().toordinal() - 7).isoformat()
    end = date.fromordinal(date.today().toordinal() - 1).isoformat()
    history = client.get(
        "/historical",
        params={
            "latitude": 17.3358,
            "longitude": 96.4839,
            "start": start,
            "end": end,
            "township_id": "MMR007001701",
        },
    )
    print("HISTORY", history.status_code)
    print(history.text[:1500])
