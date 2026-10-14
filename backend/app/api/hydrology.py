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
    if level not in {"high", "severe"}:
        return False
    location = persistence.get_or_create_location(
        session, data.township_id, data.latitude, data.longitude
    )
    persistence.add_alert(
        session,
        AlertCreate(
            location_id=location.id,
            issued_at=datetime.combine(day, time.min, tzinfo=timezone.utc),
            level=level,
            message=(
                f"Academic prototype only: {data.township_id} on {day.isoformat()} "
                f"is {level} using Open-Meteo and GloFAS. Not an operational warning."
            ),
        ),
    )
    return True


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
    try:
        probability, predicted_flood, threshold, version = prediction.predict(
            {key: value for key, value in row.items() if key != "date"}
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    _score, level = academic_risk_score(
        float(row["rainfall_mm"]), float(row["river_discharge_m3s"]), probability
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
    version = ""
    for row in await _api_feature_rows(data):
        try:
            probability, predicted_flood, _threshold, version = prediction.predict(
                {key: value for key, value in row.items() if key != "date"}
            )
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        score, level = academic_risk_score(
            float(row["rainfall_mm"]), float(row["river_discharge_m3s"]), probability
        )
        day = row["date"]
        days.append(
            {
                "date": day,
                "precipitation_mm": row["rainfall_mm"],
                "discharge_m3_s": row["river_discharge_m3s"],
                "flood_probability": probability,
                "predicted_flood": bool(predicted_flood),
                "risk_score": score,
                "risk_level": level,
                "alert_recorded": _record_alert(session, data, day, level),
            }
        )
    return OutlookResponse(township_id=data.township_id, model_version=version, days=days)


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
    return ForecastResponse(latitude=latitude, longitude=longitude, points=weather + discharge)


@router.get("/census", response_model=CensusResponse, tags=["historical"])
def get_census() -> CensusResponse:
    """2024 census population, age groups, and household situation for Bago."""
    try:
        return census.load_census()
    except census.CensusUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get("/bago-areas", response_model=BagoAreasResponse, tags=["historical"])
async def get_bago_areas() -> BagoAreasResponse:
    """Bago Region districts and township centroids from Open Admin Data."""
    try:
        payload = await admin_areas.bago_areas()
    except (httpx.HTTPError, KeyError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=502, detail=f"Admin area provider error: {exc}") from exc
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


@router.get("/historical", response_model=HistoricalResponse, tags=["historical"])
async def get_historical(
    latitude: float = Query(ge=-90, le=90),
    longitude: float = Query(ge=-180, le=180),
    start: date = Query(),
    end: date = Query(),
) -> HistoricalResponse:
    if start > end:
        raise HTTPException(status_code=422, detail="start must be on or before end")
    try:
        points = await clients.nasa_power_history(latitude, longitude, start, end)
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=502, detail=f"Historical provider error: {exc}") from exc
    return HistoricalResponse(latitude=latitude, longitude=longitude, points=points)


@router.get("/flood-history", response_model=FloodHistoryResponse, tags=["historical"])
def get_flood_history(
    township_id: str | None = Query(default=None, min_length=1, max_length=80),
    start: date | None = None,
    end: date | None = None,
    limit: int = Query(default=20, ge=1, le=200),
) -> FloodHistoryResponse:
    if start and end and start > end:
        raise HTTPException(status_code=422, detail="start must be on or before end")
    try:
        matched, records = flood_history.recorded_floods(township_id, start, end, limit)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail="Validated flood history is unavailable") from exc
    return FloodHistoryResponse(matched_records=matched, records=records)
