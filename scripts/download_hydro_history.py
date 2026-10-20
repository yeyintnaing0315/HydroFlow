#!/usr/bin/env python3
"""Download long-range met + discharge for one lat/lon (JSON bundle).

For all Bago townships and CSV caches used by prediction, prefer:
  python scripts/download_bago_hydro_sources.py
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.services import clients  # noqa: E402
from app.services.hydro_history import GLOFAS_DISCHARGE_START, NASA_POWER_START  # noqa: E402


async def _download(
    latitude: float,
    longitude: float,
    start: date,
    end: date,
    out_dir: Path,
) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    weather = await clients.open_meteo_archive_daily_weather(latitude, longitude, start, end)
    discharge = await clients.glofas_discharge_daily_range(latitude, longitude, start, end)
    nasa_start = max(start, NASA_POWER_START)
    nasa = await clients.nasa_power_history_range(latitude, longitude, nasa_start, end)
    payload = {
        "latitude": latitude,
        "longitude": longitude,
        "start": start.isoformat(),
        "end": end.isoformat(),
        "open_meteo_archive_daily": [
            {**row, "date": row["date"].isoformat()} for row in weather
        ],
        "glofas_discharge_daily": [
            {"date": day.isoformat(), "river_discharge_m3s": value} for day, value in discharge
        ],
        "nasa_power_daily": [
            {
                "date": point.date.isoformat(),
                "precipitation_mm": point.precipitation_mm,
                "temperature_c": point.temperature_c,
                "relative_humidity_pct": point.relative_humidity_pct,
                "wind_speed_m_s": point.wind_speed_m_s,
            }
            for point in nasa
        ],
    }
    tag = f"{latitude:.4f}_{longitude:.4f}_{start}_{end}".replace(".", "p")
    path = out_dir / f"hydro_{tag}.json"
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Wrote {path} ({len(weather)} weather days, {len(discharge)} discharge days)")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--lat", type=float, required=True)
    parser.add_argument("--lon", type=float, required=True)
    parser.add_argument("--start", type=date.fromisoformat, default=GLOFAS_DISCHARGE_START)
    parser.add_argument("--end", type=date.fromisoformat, default=date.today())
    parser.add_argument(
        "--out",
        type=Path,
        default=ROOT / "data" / "external" / "hydro_cache",
    )
    args = parser.parse_args()
    asyncio.run(_download(args.lat, args.lon, args.start, args.end, args.out))


if __name__ == "__main__":
    main()
