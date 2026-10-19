import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas.api import (
    PredictionMapScoresResponse,
    PredictionTimelineRequest,
    PredictionTimelineResponse,
)
from app.services import admin_areas, prediction as prediction_service
from app.services.prediction_timeline import build_timeline, local_today, map_scores_for_date

router = APIRouter(tags=["prediction"])


def _ensure_model() -> None:
    try:
        prediction_service.load_model()
    except prediction_service.ModelUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.post("/prediction/timeline", response_model=PredictionTimelineResponse)
async def create_prediction_timeline(
    data: PredictionTimelineRequest,
    session: Session = Depends(get_db),
) -> PredictionTimelineResponse:
    _ensure_model()
    as_of = data.as_of or local_today()
    relief_slug = admin_areas.relief_slug_for_area(session, data.township_id)
    try:
        payload = await build_timeline(
            data.township_id,
            data.latitude,
            data.longitude,
            as_of,
            township_name_en=None,
            relief_slug=relief_slug or data.township_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Forecast provider error: {exc}") from exc

    return PredictionTimelineResponse.model_validate(payload)


@router.get("/prediction/map-scores", response_model=PredictionMapScoresResponse)
async def get_prediction_map_scores(
    date: str = Query(..., description="Calendar date YYYY-MM-DD"),
    district_id: str | None = Query(default=None, min_length=1, max_length=80),
    session: Session = Depends(get_db),
) -> PredictionMapScoresResponse:
    _ensure_model()
    try:
        from datetime import date as date_type

        target = date_type.fromisoformat(date)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="date must be YYYY-MM-DD") from exc
    try:
        payload = await map_scores_for_date(session, target, district_id)
    except prediction_service.ModelUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return PredictionMapScoresResponse.model_validate(payload)
