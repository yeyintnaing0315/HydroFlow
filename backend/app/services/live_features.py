import csv
import json
import math
from datetime import date, datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.services import clients

DailyObservation = tuple[date, float, float]
PROJECT_ROOT = Path(__file__).resolve().parents[3]
RIVER_POINTS_CSV = PROJECT_ROOT / "data" / "external" / "bago_river_points.csv"
MODEL_METADATA_PATH = PROJECT_ROOT / "ml" / "models" / "bago_flood_model_metadata.json"
CONTEXT_DAYS = 62
FORECAST_DAYS = 7

NEW_MODEL_FEATURES = (
    "rainfall_1d_mm",
    "rainfall_3d_mm",
    "rainfall_7d_mm",
    "rainfall_14d_mm",
    "rainfall_30d_mm",
    "temperature_c",
    "relative_humidity_pct",
    "wind_speed_m_s",
    "latitude",
    "longitude",
    "day_of_year_sin",
    "day_of_year_cos",
    "discharge_lag_1d_m3s",
    "discharge_lag_3d_mean_m3s",
)


@lru_cache(maxsize=1)
def river_points() -> tuple[dict[str, Any], ...]:
    if not RIVER_POINTS_CSV.is_file():
        return ()
    with RIVER_POINTS_CSV.open(encoding="utf-8", newline="") as handle:
        return tuple(dict(row) for row in csv.DictReader(handle))


@lru_cache(maxsize=1)
def trained_river_townships() -> frozenset[str]:
    if not MODEL_METADATA_PATH.is_file():
        return frozenset()
    payload = json.loads(MODEL_METADATA_PATH.read_text(encoding="utf-8"))
    return frozenset(str(name) for name in payload.get("townships", []))


def nearest_river_cell(latitude: float, longitude: float) -> dict[str, Any] | None:
    rows = river_points()
    if not rows:
        return None
    best = min(
        rows,
        key=lambda row: (float(row["weather_latitude"]) - latitude) ** 2
        + (float(row["weather_longitude"]) - longitude) ** 2,
    )
    return {
        "township": best["township"],
        "district": best["district"],
        "code": best["code"],
        "weather_latitude": float(best["weather_latitude"]),
        "weather_longitude": float(best["weather_longitude"]),
        "river_latitude": float(best["river_latitude"]),
        "river_longitude": float(best["river_longitude"]),
        "in_training_set": best["township"] in trained_river_townships(),
    }


def _first_number(*values: float | None) -> float | None:
    for value in values:
        if value is not None:
            return float(value)
    return None


def _normalize_observation(item: DailyObservation | dict[str, Any]) -> dict[str, Any]:
    if isinstance(item, dict):
        row = dict(item)
        row["date"] = item["date"]
        return row
    day, rain, discharge = item
    return {"date": day, "rainfall_mm": rain, "river_discharge_m3s": discharge}


def _window_sum(values: list[float | None], dates: list[date], index: int, size: int) -> float | None:
    start = index - size + 1
    if start < 0:
        return None
    if (dates[index] - dates[start]).days != size - 1:
        return None
    selected = values[start : index + 1]
    if any(value is None for value in selected):
        return None
    return float(sum(selected))


def _lagged_discharge(values: list[float | None], dates: list[date], index: int, offset: int) -> float | None:
    source = index - offset
    if source < 0 or (dates[index] - dates[source]).days != offset:
        return None
    value = values[source]
    return None if value is None else float(value)


async def load_observations(latitude: float, longitude: float) -> list[DailyObservation] | list[dict[str, Any]]:
    """Join Open-Meteo weather, NASA POWER meteorology, and GloFAS discharge."""
    river = nearest_river_cell(latitude, longitude)
    river_latitude = float(river["river_latitude"]) if river else latitude
    river_longitude = float(river["river_longitude"]) if river else longitude
    today = datetime.now(timezone.utc).date()
    history_start = today - timedelta(days=CONTEXT_DAYS)
    weather, discharge, nasa = await _fetch_live(
        latitude,
        longitude,
        river_latitude,
        river_longitude,
        history_start,
        today,
    )
    nasa_by_day = {point.date: point for point in nasa}
    weather_by_day = {item["date"]: item for item in weather}
    discharge_by_day = {day: value for day, value in discharge if value is not None}
    days = sorted(set(weather_by_day) | set(discharge_by_day) | set(nasa_by_day))
    observations: list[dict[str, Any]] = []
    for day in days:
        weather_row = weather_by_day.get(day, {})
        nasa_row = nasa_by_day.get(day)
        rain = _first_number(
            weather_row.get("rainfall_mm"),
            None if nasa_row is None else nasa_row.precipitation_mm,
        )
        discharge_value = discharge_by_day.get(day)
        if rain is None or discharge_value is None:
            continue
        observations.append(
            {
                "date": day,
                "rainfall_mm": rain,
                "river_discharge_m3s": discharge_value,
                "temperature_c": _first_number(
                    None if nasa_row is None else nasa_row.temperature_c,
                    weather_row.get("temperature_c"),
                ),
                "relative_humidity_pct": _first_number(
                    None if nasa_row is None else nasa_row.relative_humidity_pct,
                    weather_row.get("relative_humidity_pct"),
                ),
                "wind_speed_m_s": _first_number(
                    None if nasa_row is None else nasa_row.wind_speed_m_s,
                    weather_row.get("wind_speed_m_s"),
                ),
                "rainfall_source": "Open-Meteo forecast/reanalysis"
                if weather_row.get("rainfall_mm") is not None
                else "NASA POWER PRECTOTCORR",
                "meteorology_source": "NASA POWER"
                if nasa_row is not None
                and nasa_row.temperature_c is not None
                else "Open-Meteo forecast/reanalysis",
                "discharge_source": "Open-Meteo Flood API modeled GloFAS-derived discharge",
                "river_township": None if river is None else river["township"],
                "in_training_set": False if river is None else river["in_training_set"],
            }
        )
    if not observations:
        raise ValueError("Weather APIs returned no complete rainfall and discharge days")
    return observations


async def _fetch_live(
    latitude: float,
    longitude: float,
    river_latitude: float,
    river_longitude: float,
    history_start: date,
    history_end: date,
):
    import asyncio

    weather_task = clients.open_meteo_daily_weather(
        latitude, longitude, CONTEXT_DAYS, FORECAST_DAYS
    )
    discharge_task = clients.glofas_daily_discharge(
        river_latitude, river_longitude, CONTEXT_DAYS, FORECAST_DAYS
    )
    nasa_task = clients.nasa_power_history(latitude, longitude, history_start, history_end)
    weather, discharge, nasa = await asyncio.gather(
        weather_task, discharge_task, nasa_task, return_exceptions=True
    )
    if isinstance(weather, Exception):
        raise weather
    if isinstance(discharge, Exception):
        raise discharge
    if isinstance(nasa, Exception):
        nasa = []
    return weather, discharge, nasa


async def _fetch_pair(latitude: float, longitude: float):
    import asyncio

    return await asyncio.gather(
        clients.open_meteo_daily_precipitation(latitude, longitude),
        clients.glofas_daily_discharge(latitude, longitude),
    )


def features_on_or_after(
    observations: list[DailyObservation] | list[dict[str, Any]],
    start: date,
    township_id: str,
    latitude: float,
    longitude: float,
) -> list[dict[str, float | str | date | None | bool]]:
    """Build model rows for the start date and every later API day. Earlier days are context only."""
    ordered = sorted((_normalize_observation(item) for item in observations), key=lambda row: row["date"])
    dates = [row["date"] for row in ordered]
    rains = [None if row.get("rainfall_mm") is None else float(row["rainfall_mm"]) for row in ordered]
    discharges = [
        None if row.get("river_discharge_m3s") is None else float(row["river_discharge_m3s"])
        for row in ordered
    ]
    rows: list[dict[str, float | str | date | None | bool]] = []
    for index, item in enumerate(ordered):
        day = item["date"]
        if day < start:
            continue
        rain = rains[index]
        discharge = discharges[index]
        if rain is None or discharge is None:
            continue
        rain_window = [value for value in rains[max(0, index - 6) : index + 1] if value is not None]
        discharge_window = [
            value for value in discharges[max(0, index - 2) : index + 1] if value is not None
        ]
        previous_rain = rains[index - 1] if index else 0.0
        previous_discharge = discharges[index - 1] if index else 0.0
        if previous_rain is None:
            previous_rain = 0.0
        if previous_discharge is None:
            previous_discharge = 0.0
        day_number = day.timetuple().tm_yday
        lag1 = _lagged_discharge(discharges, dates, index, 1)
        lag2 = _lagged_discharge(discharges, dates, index, 2)
        lag3 = _lagged_discharge(discharges, dates, index, 3)
        lag_mean = None if None in (lag1, lag2, lag3) else (lag1 + lag2 + lag3) / 3
        rows.append(
            {
                "date": day,
                "rainfall_mm": rain,
                "river_discharge_m3s": discharge,
                "rainfall_1d_mm": rain,
                "rainfall_3d_mm": _window_sum(rains, dates, index, 3) or sum(rain_window[-3:]),
                "rainfall_7d_mm": _window_sum(rains, dates, index, 7) or sum(rain_window),
                "rainfall_14d_mm": _window_sum(rains, dates, index, 14),
                "rainfall_30d_mm": _window_sum(rains, dates, index, 30),
                "rainfall_lag_1d_mm": previous_rain,
                "discharge_lag_1d_m3s": lag1 if lag1 is not None else previous_discharge,
                "discharge_delta_1d_m3s": discharge - previous_discharge,
                "discharge_3d_mean_m3s": sum(discharge_window) / len(discharge_window),
                "discharge_lag_3d_mean_m3s": lag_mean,
                "day_of_year_sin": math.sin(2 * math.pi * day_number / 365.25),
                "day_of_year_cos": math.cos(2 * math.pi * day_number / 365.25),
                "lat": latitude,
                "lng": longitude,
                "latitude": latitude,
                "longitude": longitude,
                "township_id": township_id,
                "temperature_c": item.get("temperature_c"),
                "relative_humidity_pct": item.get("relative_humidity_pct"),
                "wind_speed_m_s": item.get("wind_speed_m_s"),
                "rainfall_source": item.get("rainfall_source"),
                "meteorology_source": item.get("meteorology_source"),
                "discharge_source": item.get("discharge_source"),
                "river_township": item.get("river_township"),
                "in_training_set": bool(item.get("in_training_set")),
            }
        )
    if not rows:
        raise ValueError("Selected date is outside the API forecast window")
    return rows


def row_has_model_features(row: dict[str, Any], feature_names: list[str] | tuple[str, ...] | None) -> bool:
    names = feature_names or NEW_MODEL_FEATURES
    return all(row.get(name) is not None for name in names)
