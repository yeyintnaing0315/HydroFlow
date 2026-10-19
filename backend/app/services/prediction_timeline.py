from __future__ import annotations

import time
from datetime import date, datetime, time as dt_time, timedelta, timezone
from typing import Any, Literal
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AdminArea
from app.services import admin_areas, census, flood_history, geography, live_features, prediction
from app.services.risk import RiskLevel, academic_risk_score

DEFAULT_TZ = ZoneInfo("Asia/Yangon")
WINDOW_DAYS = 7
PROBABILITY_RISK_BANDS = (0.25, 0.5, 0.75)

PeriodType = Literal["historical", "current", "forecast"]
DataStatus = Literal[
    "model_estimate",
    "observed_impact",
    "unavailable",
    "insufficient_features",
]
EvidenceType = Literal["model_prediction", "none"]

_map_scores_cache: dict[tuple[str, str | None], tuple[float, list[dict[str, Any]]]] = {}
_MAP_CACHE_TTL_SECONDS = 600


def local_today(tz: ZoneInfo = DEFAULT_TZ) -> date:
    return datetime.now(tz).date()


def date_window(as_of: date) -> tuple[date, date]:
    start = as_of - timedelta(days=WINDOW_DAYS)
    end = as_of + timedelta(days=WINDOW_DAYS)
    return start, end


def period_type_for(day: date, as_of: date) -> PeriodType:
    if day < as_of:
        return "historical"
    if day == as_of:
        return "current"
    return "forecast"


def probability_risk_level(probability: float | None) -> RiskLevel | None:
    if probability is None:
        return None
    if probability < PROBABILITY_RISK_BANDS[0]:
        return "low"
    if probability < PROBABILITY_RISK_BANDS[1]:
        return "moderate"
    if probability < PROBABILITY_RISK_BANDS[2]:
        return "high"
    return "severe"


def _outlook_uncertainty(in_training_set: bool, period: PeriodType) -> str:
    base = (
        "Uncalibrated academic score for flood in the next 3 days. "
        "Live rainfall is Open-Meteo, not CHIRPS. Not an official warning."
        if in_training_set
        else (
            "This township is outside the 14 close-river training set. "
            "The score is an out-of-sample academic estimate, not an official warning."
        )
    )
    if period == "historical":
        return f"{base} Historical day uses reanalysis or archived provider inputs, not a lead-time forecast."
    if period == "forecast":
        return f"{base} Future day uses forecast provider inputs joined for that calendar date."
    return base


def _feature_payload(row: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in row.items() if key != "date"}


def _forecast_horizon_hours(day: date, generated_at: datetime) -> int:
    return max(
        0,
        int((datetime.combine(day, dt_time.min, tzinfo=timezone.utc) - generated_at).total_seconds() // 3600),
    )


def _recorded_by_date(relief_slug: str, start: date, end: date) -> dict[date, flood_history.FloodHistoryRecord]:
    try:
        _matched, records = flood_history.recorded_floods(relief_slug, start, end, limit=500)
    except FileNotFoundError:
        return {}
    return {record.date: record for record in records}


def _census_exposure(township_name_en: str | None) -> int | None:
    if not township_name_en:
        return None
    try:
        profile = census.township_profile(township_name_en)
    except census.CensusUnavailableError:
        return None
    if profile is None:
        return None
    _district, township = profile
    return int(township.population.total)


def _blank_day(day: date, as_of: date) -> dict[str, Any]:
    period = period_type_for(day, as_of)
    return {
        "date": day,
        "period_type": period,
        "flood_probability": None,
        "predicted_flood": None,
        "probability_risk_level": None,
        "risk_level": "unknown",
        "hydrology_risk_score": None,
        "hydrology_risk_level": None,
        "rainfall_mm": None,
        "discharge_m3_s": None,
        "temperature_c": None,
        "relative_humidity_pct": None,
        "wind_speed_m_s": None,
        "rainfall_7d_mm": None,
        "impact_level": "unknown",
        "potentially_exposed_population": None,
        "potentially_affected_population": None,
        "observed_flood": None,
        "recorded_affected_people": None,
        "data_status": "unavailable",
        "evidence_type": "none",
        "probability_status": None,
        "forecast_horizon_hours": 0,
        "input_freshness": {},
        "uncertainty": "Insufficient joined features for this date.",
        "key_factors": [],
    }


async def build_timeline(
    township_id: str,
    latitude: float,
    longitude: float,
    as_of: date,
    *,
    township_name_en: str | None = None,
    relief_slug: str | None = None,
) -> dict[str, Any]:
    prediction.load_model()
    start, end = date_window(as_of)
    generated_at = datetime.now(timezone.utc)
    slug = relief_slug or township_id
    recorded = _recorded_by_date(slug, start, end)
    exposure = _census_exposure(township_name_en)
    river = live_features.nearest_river_cell(latitude, longitude)
    in_training_set = bool(river and river["in_training_set"])

    try:
        observations = await live_features.load_observations(latitude, longitude)
    except (httpx.HTTPError, ValueError) as exc:
        raise ValueError(f"Forecast provider error: {exc}") from exc

    feature_rows = live_features.features_on_or_after(
        observations,
        start,
        township_id,
        latitude,
        longitude,
    )
    rows_by_date = {row["date"]: row for row in feature_rows}
    names = prediction.feature_names()
    version = prediction.model_version_name(prediction.load_model()[1])

    days: list[dict[str, Any]] = []
    cursor = start
    while cursor <= end:
        period = period_type_for(cursor, as_of)
        record = recorded.get(cursor)
        row = rows_by_date.get(cursor)
        if row is None or not live_features.row_has_model_features(row, names):
            day = _blank_day(cursor, as_of)
            day["data_status"] = "insufficient_features"
            if record is not None:
                day["observed_flood"] = True
                day["recorded_affected_people"] = record.affected_people
                day["impact_level"] = record.impact_severity
                day["data_status"] = "observed_impact"
            days.append(day)
            cursor += timedelta(days=1)
            continue

        try:
            probability, predicted_flood, _threshold, version = prediction.predict(_feature_payload(row))
        except ValueError as exc:
            day = _blank_day(cursor, as_of)
            day["uncertainty"] = str(exc)
            days.append(day)
            cursor += timedelta(days=1)
            continue

        hydrology_score, hydrology_level = academic_risk_score(
            float(row["rainfall_mm"]), float(row["river_discharge_m3s"])
        )
        prob_level = probability_risk_level(float(probability))
        day_in_training = bool(row.get("in_training_set", in_training_set))
        factors = [
            f"Rainfall {float(row['rainfall_mm']):.1f} mm",
            f"Modeled discharge {float(row['river_discharge_m3s']):.1f} m³/s",
        ]
        if row.get("rainfall_7d_mm") is not None:
            factors.append(f"7-day rainfall {float(row['rainfall_7d_mm']):.1f} mm")

        impact_level: str = "unknown"
        observed_flood: bool | None = None
        affected: int | None = None
        data_status: DataStatus = "model_estimate"
        if record is not None:
            observed_flood = True
            affected = record.affected_people
            impact_level = record.impact_severity
            if record.impact_severity != "none":
                data_status = "observed_impact"

        days.append(
            {
                "date": cursor,
                "period_type": period,
                "flood_probability": float(probability),
                "predicted_flood": bool(predicted_flood),
                "probability_risk_level": prob_level,
                "risk_level": prob_level or "unknown",
                "hydrology_risk_score": hydrology_score,
                "hydrology_risk_level": hydrology_level,
                "rainfall_mm": float(row["rainfall_mm"]),
                "discharge_m3_s": float(row["river_discharge_m3s"]),
                "temperature_c": row.get("temperature_c"),
                "relative_humidity_pct": row.get("relative_humidity_pct"),
                "wind_speed_m_s": row.get("wind_speed_m_s"),
                "rainfall_7d_mm": row.get("rainfall_7d_mm"),
                "impact_level": impact_level,
                "potentially_exposed_population": exposure,
                "potentially_affected_population": affected,
                "observed_flood": observed_flood,
                "recorded_affected_people": affected,
                "data_status": data_status,
                "evidence_type": "model_prediction",
                "probability_status": "uncalibrated_academic_score",
                "forecast_horizon_hours": _forecast_horizon_hours(cursor, generated_at),
                "input_freshness": {
                    "retrieved_at": generated_at.isoformat(),
                    "rainfall": row.get("rainfall_source") or "Open-Meteo forecast/reanalysis",
                    "meteorology": row.get("meteorology_source") or "NASA POWER",
                    "discharge": row.get("discharge_source")
                    or "Open-Meteo Flood API modeled GloFAS-derived discharge",
                },
                "uncertainty": _outlook_uncertainty(day_in_training, period),
                "key_factors": factors,
            }
        )
        cursor += timedelta(days=1)

    return {
        "township_id": township_id,
        "as_of": as_of,
        "timezone": str(DEFAULT_TZ),
        "model_version": version,
        "in_training_set": in_training_set,
        "generated_at": generated_at,
        "potentially_exposed_population": exposure,
        "disclaimer": (
            "Flood probabilities are uncalibrated academic model scores. "
            "Recorded impacts are validated relief labels, not model outputs."
        ),
        "days": days,
    }


def _weather_cell_key(latitude: float, longitude: float) -> tuple[float, float]:
    river = live_features.nearest_river_cell(latitude, longitude)
    if river is None:
        return (round(latitude, 4), round(longitude, 4))
    return (round(float(river["weather_latitude"]), 4), round(float(river["weather_longitude"]), 4))


async def _observations_for_cell(cell: tuple[float, float]) -> list[Any]:
    lat, lon = cell
    return await live_features.load_observations(lat, lon)


async def score_township_on_date(
    area: AdminArea,
    target: date,
    observations_cache: dict[tuple[float, float], list[Any]],
) -> dict[str, Any]:
    if area.centroid_latitude is None or area.centroid_longitude is None:
        return {
            "township_id": area.source_code,
            "township_name": area.name_en,
            "latitude": None,
            "longitude": None,
            "parent_id": None,
            "flood_probability": None,
            "probability_risk_level": None,
            "risk_level": "unknown",
            "rainfall_mm": None,
            "data_status": "unavailable",
        }

    lat = float(area.centroid_latitude)
    lon = float(area.centroid_longitude)
    cell = _weather_cell_key(lat, lon)
    if cell not in observations_cache:
        try:
            observations_cache[cell] = await _observations_for_cell(cell)
        except (httpx.HTTPError, ValueError):
            observations_cache[cell] = []

    observations = observations_cache[cell]
    names = prediction.feature_names()
    row = None
    if observations:
        rows = live_features.features_on_or_after(
            observations,
            target,
            area.source_code,
            lat,
            lon,
        )
        row = next((item for item in rows if item["date"] == target), None)

    if row is None or not live_features.row_has_model_features(row, names):
        return {
            "township_id": area.source_code,
            "township_name": area.name_en,
            "latitude": lat,
            "longitude": lon,
            "parent_id": area.parent_id,
            "flood_probability": None,
            "probability_risk_level": None,
            "risk_level": "unknown",
            "rainfall_mm": None if row is None else float(row.get("rainfall_mm") or 0),
            "data_status": "insufficient_features",
        }

    try:
        probability, _predicted, _threshold, _version = prediction.predict(_feature_payload(row))
    except ValueError:
        return {
            "township_id": area.source_code,
            "township_name": area.name_en,
            "latitude": lat,
            "longitude": lon,
            "parent_id": area.parent_id,
            "flood_probability": None,
            "probability_risk_level": None,
            "risk_level": "unknown",
            "rainfall_mm": float(row["rainfall_mm"]),
            "data_status": "unavailable",
        }

    level = probability_risk_level(float(probability))
    return {
        "township_id": area.source_code,
        "township_name": area.name_en,
        "latitude": lat,
        "longitude": lon,
        "parent_id": area.parent_id,
        "flood_probability": float(probability),
        "probability_risk_level": level,
        "risk_level": level or "unknown",
        "rainfall_mm": float(row["rainfall_mm"]),
        "data_status": "model_estimate",
    }


async def map_scores_for_date(
    session: Session,
    target: date,
    district_source_code: str | None = None,
) -> dict[str, Any]:
    cache_key = (target.isoformat(), district_source_code)
    now = time.monotonic()
    cached = _map_scores_cache.get(cache_key)
    if cached is not None and now - cached[0] < _MAP_CACHE_TTL_SECONDS:
        return {"date": target, "scores": cached[1], "cached": True}

    prediction.load_model()
    version_id = geography.latest_dataset_id(session)
    townships = session.scalars(
        select(AdminArea).where(
            AdminArea.dataset_version_id == version_id,
            AdminArea.level == 3,
        )
    ).all()

    if district_source_code:
        district = session.scalar(
            select(AdminArea).where(
                AdminArea.dataset_version_id == version_id,
                AdminArea.source_code == district_source_code,
                AdminArea.level == 2,
            )
        )
        if district is None:
            townships = []
        else:
            townships = [item for item in townships if item.parent_id == district.id]

    observations_cache: dict[tuple[float, float], list[Any]] = {}
    scores = []
    for area in townships:
        scores.append(await score_township_on_date(area, target, observations_cache))

    _map_scores_cache[cache_key] = (now, scores)
    return {
        "date": target,
        "model_version": prediction.model_version_name(prediction.load_model()[1]),
        "scores": scores,
        "cached": False,
    }
