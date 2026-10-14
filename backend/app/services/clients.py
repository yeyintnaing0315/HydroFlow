import os
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

import httpx

from app.schemas.api import ForecastPoint, HistoricalPoint

TIMEOUT_SECONDS = 10.0
POINT_ELEVATION_URL = "https://portal.opentopography.org/API/v1/elevation"
ELEVATION_DATASET = "COP30"
_elevation_cache: dict[tuple[float, float, str], dict[str, float | str]] = {}


class OpenTopographyConfigError(RuntimeError):
    """Raised when the OpenTopography key is missing."""


def _load_project_env() -> None:
    """Fill unset variables from the project .env. Existing variables win."""
    path = Path(__file__).resolve().parents[3] / ".env"
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        name, value = stripped.split("=", 1)
        name = name.strip()
        value = value.strip().strip('"').strip("'")
        if name and name not in os.environ:
            os.environ[name] = value


def redact_secret(message: str) -> str:
    _load_project_env()
    redacted = message
    for name in ("OPENTOPOGRAPHY_API_KEY", "KARDINAL_API_KEY"):
        key = os.getenv(name, "").strip()
        if key:
            redacted = redacted.replace(key, "[redacted]")
    return redacted


def _opentopography_key() -> str:
    _load_project_env()
    key = os.getenv("OPENTOPOGRAPHY_API_KEY", "").strip()
    if not key:
        raise OpenTopographyConfigError("OPENTOPOGRAPHY_API_KEY is not set")
    return key


def _number(value: Any) -> float | None:
    if value is None:
        return None
    number = float(value)
    return None if number == -999 else number


async def nasa_power_history(
    latitude: float, longitude: float, start: date, end: date
) -> list[HistoricalPoint]:
    params = {
        "parameters": "PRECTOTCORR,T2M,RH2M",
        "community": "AG",
        "longitude": longitude,
        "latitude": latitude,
        "start": start.strftime("%Y%m%d"),
        "end": end.strftime("%Y%m%d"),
        "format": "JSON",
        "time-standard": "UTC",
    }
    async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
        response = await client.get("https://power.larc.nasa.gov/api/temporal/daily/point", params=params)
        response.raise_for_status()
    try:
        values = response.json()["properties"]["parameter"]
        precipitation = values["PRECTOTCORR"]
        temperature = values["T2M"]
        humidity = values["RH2M"]
        keys = sorted(set(precipitation) | set(temperature) | set(humidity))
        return [
            HistoricalPoint(
                date=datetime.strptime(key, "%Y%m%d").date(),
                precipitation_mm=_number(precipitation.get(key)),
                temperature_c=_number(temperature.get(key)),
                relative_humidity_pct=_number(humidity.get(key)),
            )
            for key in keys
        ]
    except (KeyError, TypeError, ValueError) as exc:
        raise ValueError("Invalid NASA POWER response") from exc


async def open_meteo_forecast(latitude: float, longitude: float) -> list[ForecastPoint]:
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "hourly": "temperature_2m,precipitation",
        "forecast_days": 7,
        "timezone": "UTC",
    }
    async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
        response = await client.get("https://api.open-meteo.com/v1/forecast", params=params)
        response.raise_for_status()
    try:
        hourly = response.json()["hourly"]
        times = hourly["time"]
        precipitation = hourly["precipitation"]
        temperature = hourly["temperature_2m"]
        if not (len(times) == len(precipitation) == len(temperature)):
            raise ValueError
        return [
            ForecastPoint(
                timestamp=datetime.fromisoformat(timestamp).replace(tzinfo=timezone.utc),
                precipitation_mm=_number(precipitation[index]),
                temperature_c=_number(temperature[index]),
            )
            for index, timestamp in enumerate(times)
        ]
    except (KeyError, TypeError, ValueError) as exc:
        raise ValueError("Invalid Open-Meteo forecast response") from exc


async def _daily_values(
    url: str, params: dict[str, object], value_key: str
) -> list[tuple[date, float | None]]:
    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.get(url, params=params)
        response.raise_for_status()
    try:
        daily = response.json()["daily"]
        times = daily["time"]
        values = daily[value_key]
        if len(times) != len(values):
            raise ValueError
        return [
            (datetime.fromisoformat(timestamp).date(), _number(values[index]))
            for index, timestamp in enumerate(times)
        ]
    except (KeyError, TypeError, ValueError) as exc:
        raise ValueError(f"Invalid daily response from {url}") from exc


async def open_meteo_daily_precipitation(
    latitude: float, longitude: float, past_days: int = 7, forecast_days: int = 7
) -> list[tuple[date, float | None]]:
    return await _daily_values(
        "https://api.open-meteo.com/v1/forecast",
        {
            "latitude": latitude,
            "longitude": longitude,
            "daily": "precipitation_sum",
            "past_days": past_days,
            "forecast_days": forecast_days,
            "timezone": "UTC",
        },
        "precipitation_sum",
    )


async def glofas_daily_discharge(
    latitude: float, longitude: float, past_days: int = 7, forecast_days: int = 7
) -> list[tuple[date, float | None]]:
    return await _daily_values(
        "https://flood-api.open-meteo.com/v1/flood",
        {
            "latitude": latitude,
            "longitude": longitude,
            "daily": "river_discharge",
            "past_days": past_days,
            "forecast_days": forecast_days,
        },
        "river_discharge",
    )


async def glofas_discharge_forecast(latitude: float, longitude: float) -> list[ForecastPoint]:
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "daily": "river_discharge",
        "forecast_days": 7,
    }
    async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
        response = await client.get("https://flood-api.open-meteo.com/v1/flood", params=params)
        response.raise_for_status()
    try:
        daily = response.json()["daily"]
        times = daily["time"]
        discharge = daily["river_discharge"]
        if len(times) != len(discharge):
            raise ValueError
        return [
            ForecastPoint(
                timestamp=datetime.fromisoformat(timestamp).replace(tzinfo=timezone.utc),
                discharge_m3_s=_number(discharge[index]),
            )
            for index, timestamp in enumerate(times)
        ]
    except (KeyError, TypeError, ValueError) as exc:
        raise ValueError("Invalid GloFAS discharge response") from exc


async def opentopography_elevation(
    latitude: float, longitude: float, dataset: str = ELEVATION_DATASET
) -> dict[str, float | str]:
    """Return Copernicus surface elevation in meters for one WGS84 point.

    Results are cached so repeated township views stay inside the daily
    OpenTopography point-query limit. The value is terrain context, not a
    flood-model feature.
    """
    key = _opentopography_key()
    cache_key = (round(latitude, 5), round(longitude, 5), dataset)
    cached = _elevation_cache.get(cache_key)
    if cached is not None:
        return cached
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "dataset": dataset,
        "API_Key": key,
    }
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.get(POINT_ELEVATION_URL, params=params)
            response.raise_for_status()
            payload = response.json()
    except httpx.HTTPError as exc:
        raise ValueError(redact_secret("OpenTopography request failed")) from exc
    try:
        elevation = float(payload["Elevation"])
        shortname = str(payload.get("Shortname") or dataset)
        epsg = str(payload.get("VCRS_EPSG") or "")
        unit = str(payload.get("Unit") or "Meters")
        if not epsg or unit.lower() != "meters":
            raise ValueError
    except (KeyError, TypeError, ValueError) as exc:
        raise ValueError("Invalid OpenTopography elevation response") from exc
    point: dict[str, float | str] = {
        "elevation_m": elevation,
        "dataset": shortname,
        "vertical_datum_epsg": epsg,
        "unit": "Meters",
    }
    _elevation_cache[cache_key] = point
    return point
