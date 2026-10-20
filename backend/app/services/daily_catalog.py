"""Validated daily hydrology rows for timeline replay beyond the live API window."""

from __future__ import annotations

from datetime import date
from functools import lru_cache

import pandas as pd

from app.services.flood_history import history_path
from app.services.hydro_history import GLOFAS_DISCHARGE_START, NASA_POWER_START


@lru_cache(maxsize=1)
def _frame() -> pd.DataFrame:
    path = history_path()
    if not path.is_file():
        raise FileNotFoundError(path)
    frame = pd.read_csv(
        path,
        usecols=["date", "township_id", "rainfall_mm", "river_discharge_m3s", "lat", "lng"],
        parse_dates=["date"],
    )
    return frame.sort_values(["township_id", "date"])


def calendar_bounds(today: date, *, forecast_days: int = 7) -> dict[str, str]:
    from datetime import timedelta

    forecast_end = today + timedelta(days=forecast_days)
    validated_start: str | None = None
    validated_end: str | None = None
    try:
        frame = _frame()
        validated_start = frame["date"].min().date().isoformat()
        validated_end = frame["date"].max().date().isoformat()
    except FileNotFoundError:
        pass

    return {
        "history_start": GLOFAS_DISCHARGE_START.isoformat(),
        "history_end": today.isoformat(),
        "forecast_end": forecast_end.isoformat(),
        "select_max": forecast_end.isoformat(),
        "nasa_power_start": NASA_POWER_START.isoformat(),
        "validated_csv_start": validated_start,
        "validated_csv_end": validated_end,
    }


def catalog_observations(township_id: str) -> list[dict]:
    frame = _frame()
    rows = frame.loc[frame["township_id"] == township_id]
    observations: list[dict] = []
    for record in rows.itertuples(index=False):
        day = record.date.date() if hasattr(record.date, "date") else record.date
        rain = float(record.rainfall_mm) if pd.notna(record.rainfall_mm) else None
        discharge = float(record.river_discharge_m3s) if pd.notna(record.river_discharge_m3s) else None
        if rain is None or discharge is None:
            continue
        observations.append(
            {
                "date": day,
                "rainfall_mm": rain,
                "river_discharge_m3s": discharge,
                "temperature_c": None,
                "relative_humidity_pct": None,
                "wind_speed_m_s": None,
                "rainfall_source": "validated_daily.csv",
                "meteorology_source": "validated_daily.csv",
                "discharge_source": "validated_daily.csv",
            }
        )
    return observations
