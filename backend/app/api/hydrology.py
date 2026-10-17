import asyncio
from datetime import date, datetime, time, timedelta, timezone
from typing import Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas.api import (
    AlertCreate,
    AlertResponse,
    BagoAreasResponse,
    CensusResponse,
    FloodHistoryResponse,
    ForecastResponse,
    HelpBriefResponse,
    HelpResponse,
    HistoricalResponse,
    OutlookResponse,
    PredictRequest,
    PredictResponse,
    RiskResponse,
    RoutePlanRequest,
    RoutePlanResponse,
    TopographyResponse,
    TownshipResponse,
)
from app.services import (
    admin_areas,
    census,
    clients,
    flood_history,
    help_prediction,
    kardinal,
    live_features,
    persistence,
    prediction,
)
from app.services.risk import academic_risk_score

router = APIRouter()


def _ensure_model() -> None:
    try:
        prediction.load_model()
    except prediction.ModelUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


def _ensure_help_model() -> None:
    try:
        help_prediction.load_help_model()
    except prediction.ModelUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


def _record_alert(session: Session, data: PredictRequest, day: date, level: str) -> bool:
    # Retained for response compatibility. Model and heuristic outputs are
    # deliberately not persisted as official warnings or alerts.
    return False


def _feature_payload(row: dict) -> dict:
    return {key: value for key, value in row.items() if key != "date"}


def _can_score(row: dict) -> bool:
    names = prediction.feature_names()
    return live_features.row_has_model_features(row, names) if names else True


def _outlook_uncertainty(in_training_set: bool) -> str:
    if in_training_set:
        return (
            "Uncalibrated academic score for flood in the next 3 days. "
            "Live rainfall is Open-Meteo, not CHIRPS. Not an official warning."
        )
    return (
        "This township is outside the 14 close-river training set. "
        "The score is an out-of-sample academic estimate, not an official warning."
    )


async def _api_feature_rows(data: PredictRequest) -> list[dict]:
    try:
        observations = await live_features.load_observations(data.latitude, data.longitude)
        return live_features.features_on_or_after(
            observations,
            data.date,
            data.township_id,
            data.latitude,
            data.longitude,
        )
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=502, detail=f"Forecast provider error: {exc}") from exc


@router.post("/predict", response_model=PredictResponse, tags=["prediction"])
async def create_prediction(
    data: PredictRequest, session: Session = Depends(get_db)
) -> PredictResponse:
    _ensure_model()
    rows = await _api_feature_rows(data)
    row = next((item for item in rows if item["date"] == data.date), None)
    if row is None:
        raise HTTPException(status_code=422, detail="Selected date is outside the API forecast window")
    if not _can_score(row):
        raise HTTPException(
            status_code=422,
            detail="Selected date is missing complete joined API features for the flood model",
        )
    try:
        probability, predicted_flood, threshold, version = prediction.predict(_feature_payload(row))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    _score, level = academic_risk_score(
        float(row["rainfall_mm"]), float(row["river_discharge_m3s"])
    )
    return PredictResponse(
        flood_probability=probability,
        predicted_flood=bool(predicted_flood),
        threshold=threshold,
        model_version=version,
        alert_recorded=_record_alert(session, data, data.date, level),
    )


@router.post("/outlook", response_model=OutlookResponse, tags=["prediction"])
async def create_outlook(
    data: PredictRequest, session: Session = Depends(get_db)
) -> OutlookResponse:
    _ensure_model()
    days = []
    version = prediction.model_version_name(prediction.load_model()[1])
    generated_at = datetime.now(timezone.utc)
    river = live_features.nearest_river_cell(data.latitude, data.longitude)
    in_training_set = bool(river and river["in_training_set"])
    for row in await _api_feature_rows(data):
        if not _can_score(row):
            continue
        try:
            probability, predicted_flood, _threshold, version = prediction.predict(
                _feature_payload(row)
            )
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        score, level = academic_risk_score(
            float(row["rainfall_mm"]), float(row["river_discharge_m3s"])
        )
        day = row["date"]
        days.append(
            {
                "date": day,
                "precipitation_mm": row["rainfall_mm"],
                "discharge_m3_s": row["river_discharge_m3s"],
                "temperature_c": row.get("temperature_c"),
                "relative_humidity_pct": row.get("relative_humidity_pct"),
                "wind_speed_m_s": row.get("wind_speed_m_s"),
                "rainfall_7d_mm": row.get("rainfall_7d_mm"),
                "rainfall_30d_mm": row.get("rainfall_30d_mm"),
                "flood_probability": probability,
                "predicted_flood": bool(predicted_flood),
                "risk_score": score,
                "risk_level": level,
                "alert_recorded": _record_alert(session, data, day, level),
                "forecast_horizon_hours": max(
                    0,
                    int(
                        (
                            datetime.combine(day, time.min, tzinfo=timezone.utc) - generated_at
                        ).total_seconds()
                        // 3600
                    ),
                ),
                "uncertainty": _outlook_uncertainty(bool(row.get("in_training_set", in_training_set))),
                "input_freshness": {
                    "retrieved_at": generated_at.isoformat(),
                    "rainfall": row.get("rainfall_source") or "Open-Meteo forecast/reanalysis",
                    "meteorology": row.get("meteorology_source") or "NASA POWER",
                    "discharge": row.get("discharge_source")
                    or "Open-Meteo Flood API modeled GloFAS-derived discharge",
                },
            }
        )
    return OutlookResponse(
        township_id=data.township_id,
        model_version=version,
        in_training_set=in_training_set,
        days=days,
    )


@router.post("/help", response_model=HelpResponse, tags=["humanitarian"])
async def create_help_outlook(data: PredictRequest) -> HelpResponse:
    _ensure_help_model()
    days = []
    version = "flood-help-v2"
    for row in await _api_feature_rows(data):
        try:
            scored = help_prediction.predict_help(
                {key: value for key, value in row.items() if key != "date"}
            )
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        version = str(scored["model_version"])
        days.append(
            {
                "date": row["date"],
                **{key: value for key, value in scored.items() if key != "model_version"},
            }
        )
    return HelpResponse(township_id=data.township_id, model_version=version, days=days)


@router.get("/help-brief", response_model=HelpBriefResponse, tags=["humanitarian"])
def get_help_brief(limit: int = Query(default=5, ge=1, le=20)) -> HelpBriefResponse:
    try:
        brief = flood_history.assistance_brief(limit)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail="Validated flood history is unavailable") from exc
    return HelpBriefResponse.model_validate(brief)


@router.get("/risk", response_model=RiskResponse, tags=["risk"])
def get_risk(
    precipitation_mm: float = Query(ge=0),
    discharge_m3_s: float = Query(ge=0),
    predicted_value: float = Query(default=0, ge=0),
) -> RiskResponse:
    score, level = academic_risk_score(precipitation_mm, discharge_m3_s, predicted_value)
    return RiskResponse(score=score, level=level)


@router.get("/topography", response_model=TopographyResponse, tags=["topography"])
async def get_topography(
    latitude: float = Query(ge=-90, le=90),
    longitude: float = Query(ge=-180, le=180),
) -> TopographyResponse:
    try:
        point = await clients.opentopography_elevation(latitude, longitude)
    except clients.OpenTopographyConfigError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(
            status_code=502, detail=clients.redact_secret(f"Topography provider error: {exc}")
        ) from exc
    return TopographyResponse(
        latitude=latitude,
        longitude=longitude,
        elevation_m=float(point["elevation_m"]),
        dataset=str(point["dataset"]),
        vertical_datum_epsg=str(point["vertical_datum_epsg"]),
    )


@router.post("/routes", response_model=RoutePlanResponse, tags=["routing"])
async def plan_route(data: RoutePlanRequest) -> RoutePlanResponse:
    """Order delivery stops with Kardinal. The API key stays on the server."""
    stop_ids = [stop.id for stop in data.stops]
    if len(stop_ids) != len(set(stop_ids)):
        raise HTTPException(status_code=422, detail="Stop ids must be unique")
    if data.origin.id in stop_ids:
        raise HTTPException(status_code=422, detail="Origin cannot also be a delivery stop")
    try:
        return await kardinal.plan_route(data)
    except kardinal.KardinalConfigError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except (kardinal.KardinalRequestError, httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=502, detail=clients.redact_secret(str(exc))) from exc


@router.get("/forecast", response_model=ForecastResponse, tags=["forecast"])
async def get_forecast(
    latitude: float = Query(ge=-90, le=90),
    longitude: float = Query(ge=-180, le=180),
) -> ForecastResponse:
    try:
        weather, discharge = await asyncio.gather(
            clients.open_meteo_forecast(latitude, longitude),
            clients.glofas_discharge_forecast(latitude, longitude),
        )
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=502, detail=f"Forecast provider error: {exc}") from exc
    discharge_by_day = {
        point.timestamp.date(): point.discharge_m3_s
        for point in discharge
        if point.discharge_m3_s is not None
    }
    for point in weather:
        point.discharge_m3_s = discharge_by_day.get(point.timestamp.date())
    return ForecastResponse(latitude=latitude, longitude=longitude, points=weather)


@router.get("/census", response_model=CensusResponse, tags=["historical"])
def get_census() -> CensusResponse:
    """2024 census population, age groups, and household situation for Bago."""
    try:
        return census.load_census()
    except census.CensusUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get("/bago-areas", response_model=BagoAreasResponse, tags=["geography"])
def get_bago_areas(session: Session = Depends(get_db)) -> BagoAreasResponse:
    """Versioned Bago hierarchy and boundary polygons from licensed OCHA COD-AB."""
    try:
        payload = admin_areas.bago_areas(session)
    except admin_areas.GeographyUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=500, detail=f"Imported geography is invalid: {exc}") from exc
    return BagoAreasResponse.model_validate(payload)


@router.get("/townships", response_model=list[TownshipResponse], tags=["historical"])
def get_townships() -> list[TownshipResponse]:
    try:
        rows = flood_history.list_townships()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail="Township catalog is unavailable") from exc
    return [
        TownshipResponse(township_id=item[0], township=item[1], latitude=item[2], longitude=item[3])
        for item in rows
    ]


@router.get("/alerts", response_model=list[AlertResponse], tags=["alerts"])
def get_alerts(
    location_id: int | None = Query(default=None, gt=0),
    level: Literal["low", "moderate", "high", "severe"] | None = None,
    session: Session = Depends(get_db),
) -> list[AlertResponse]:
    return [AlertResponse.model_validate(item) for item in persistence.list_alerts(session, location_id, level)]


def _history_day_blank(point: object) -> bool:
    return (
        getattr(point, "precipitation_mm", None) is None
        and getattr(point, "temperature_c", None) is None
        and getattr(point, "relative_humidity_pct", None) is None
    )


async def _fill_blank_history_days(latitude: float, longitude: float, points: list):
    """NASA POWER often publishes the latest day as missing. Fill those days from Open-Meteo."""
    if not any(_history_day_blank(point) for point in points):
        return points
    try:
        weather = await clients.open_meteo_daily_weather(
            latitude, longitude, past_days=8, forecast_days=1
        )
    except (httpx.HTTPError, ValueError):
        return points
    by_date = {item["date"]: item for item in weather}
    filled = []
    for point in points:
        extra = by_date.get(point.date)
        if extra is None or not _history_day_blank(point):
            filled.append(point)
            continue
        filled.append(
            point.model_copy(
                update={
                    "precipitation_mm": extra.get("rainfall_mm"),
                    "temperature_c": extra.get("temperature_c"),
                    "relative_humidity_pct": extra.get("relative_humidity_pct"),
                    "wind_speed_m_s": extra.get("wind_speed_m_s"),
                }
            )
        )
    return filled


@router.get("/historical", response_model=HistoricalResponse, tags=["historical"])
async def get_historical(
    latitude: float = Query(ge=-90, le=90),
    longitude: float = Query(ge=-180, le=180),
    start: date = Query(),
    end: date = Query(),
    township_id: str | None = Query(default=None, min_length=1, max_length=80),
    session: Session = Depends(get_db),
) -> HistoricalResponse:
    if start > end:
        raise HTTPException(status_code=422, detail="start must be on or before end")
    location_key = township_id or f"{latitude:.4f},{longitude:.4f}"
    try:
        points = await _fill_blank_history_days(
            latitude, longitude, await clients.nasa_power_history(latitude, longitude, start, end)
        )
    except (httpx.HTTPError, ValueError) as exc:
        stored = persistence.list_historical_days(session, location_key, start, end)
        if not stored:
            raise HTTPException(status_code=502, detail=f"Historical provider error: {exc}") from exc
        return HistoricalResponse(latitude=latitude, longitude=longitude, points=stored)
    persistence.upsert_historical_days(session, location_key, latitude, longitude, points)
    stored = persistence.list_historical_days(session, location_key, start, end)
    return HistoricalResponse(latitude=latitude, longitude=longitude, points=stored)


@router.get("/flood-history", response_model=FloodHistoryResponse, tags=["historical"])
def get_flood_history(
    township_id: str | None = Query(default=None, min_length=1, max_length=80),
    start: date | None = None,
    end: date | None = None,
    limit: int = Query(default=20, ge=1, le=200),
    session: Session = Depends(get_db),
) -> FloodHistoryResponse:
    if start and end and start > end:
        raise HTTPException(status_code=422, detail="start must be on or before end")
    try:
        relief_id = (
            admin_areas.relief_slug_for_area(session, township_id) or township_id
            if township_id
            else None
        )
        matched, records = flood_history.recorded_floods(relief_id, start, end, limit)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail="Validated flood history is unavailable") from exc
    return FloodHistoryResponse(matched_records=matched, records=records)
