from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import DataSource, InundationProduct, JobRun, OfficialWarning, RiskResult
from app.schemas.api import (
    AdminHierarchyResponse,
    JobRunResponse,
    OfficialWarningResponse,
    SourceStatusResponse,
)
from app.security import require_admin_key
from app.services import geography, ingestion, scheduler, sources

router = APIRouter()


@router.get("/sources", response_model=list[SourceStatusResponse], tags=["provenance"])
def get_sources(session: Session = Depends(get_db)):
    return sources.source_status(session)


@router.get("/admin-areas", response_model=AdminHierarchyResponse, tags=["geography"])
def get_admin_areas(
    max_level: int = Query(default=5, ge=1, le=5),
    search: str | None = Query(default=None, max_length=120),
    session: Session = Depends(get_db),
):
    return geography.hierarchy(session, max_level=max_level, query=search)


@router.get("/official-warnings", response_model=list[OfficialWarningResponse], tags=["warnings"])
def get_official_warnings(
    limit: int = Query(default=50, ge=1, le=200),
    session: Session = Depends(get_db),
):
    rows = session.execute(
        select(OfficialWarning, DataSource)
        .join(DataSource, OfficialWarning.source_id == DataSource.id)
        .order_by(desc(OfficialWarning.issued_at))
        .limit(limit)
    ).all()
    return [
        {
            "id": warning.id,
            "source": source.name,
            "external_id": warning.external_id,
            "issued_at": warning.issued_at,
            "effective_at": warning.effective_at,
            "expires_at": warning.expires_at,
            "severity": warning.severity,
            "status": warning.status,
            "message": warning.message,
            "source_url": warning.source_url,
            "coverage": warning.coverage_json,
        }
        for warning, source in rows
    ]


@router.post(
    "/official-warnings/import",
    response_model=OfficialWarningResponse,
    tags=["warnings"],
    dependencies=[Depends(require_admin_key)],
)
def create_official_warning(payload: dict, session: Session = Depends(get_db)):
    row = ingestion.import_official_warning(session, payload)
    return {
        "id": row.id,
        "source": "Myanmar Department of Meteorology and Hydrology",
        "external_id": row.external_id,
        "issued_at": row.issued_at,
        "effective_at": row.effective_at,
        "expires_at": row.expires_at,
        "severity": row.severity,
        "status": row.status,
        "message": row.message,
        "source_url": row.source_url,
        "coverage": row.coverage_json,
    }


@router.get("/inundation-products", tags=["inundation"])
def get_inundation_products(
    limit: int = Query(default=20, ge=1, le=100),
    session: Session = Depends(get_db),
):
    rows = session.scalars(
        select(InundationProduct).order_by(desc(InundationProduct.observed_at)).limit(limit)
    ).all()
    return [
        {
            "id": row.id,
            "evidence_type": "observed_inundation",
            "observed_at": row.observed_at,
            "retrieved_at": row.retrieved_at,
            "geometry": row.geometry_json,
            "quality": row.quality,
            "affected_population": row.affected_population,
            "population_source": row.population_source,
            "metadata": row.metadata_json,
        }
        for row in rows
    ]


@router.get("/risk-results", tags=["prediction"])
def get_risk_results(
    limit: int = Query(default=200, ge=1, le=1000),
    session: Session = Depends(get_db),
):
    rows = session.scalars(
        select(RiskResult).order_by(desc(RiskResult.valid_at), desc(RiskResult.id)).limit(limit)
    ).all()
    return [
        {
            "id": row.id,
            "admin_area_id": row.admin_area_id,
            "valid_at": row.valid_at,
            "forecast_horizon_hours": row.forecast_horizon_hours,
            "evidence_type": row.evidence_type,
            "risk_level": row.risk_level,
            "risk_score": row.risk_score,
            "probability": row.probability,
            "input_freshness": row.input_freshness_json,
            "supporting_evidence": row.supporting_evidence_json,
            "uncertainty": row.uncertainty_json,
        }
        for row in rows
    ]


@router.get("/runs", response_model=list[JobRunResponse], tags=["operations"])
def get_runs(
    limit: int = Query(default=20, ge=1, le=200),
    session: Session = Depends(get_db),
):
    rows = session.scalars(select(JobRun).order_by(desc(JobRun.started_at)).limit(limit)).all()
    return [scheduler.serialize_run(row) for row in rows]


@router.post(
    "/runs/prediction",
    response_model=JobRunResponse,
    tags=["operations"],
    dependencies=[Depends(require_admin_key)],
)
async def create_prediction_run(session: Session = Depends(get_db)):
    now = datetime.now(timezone.utc).replace(second=0, microsecond=0)
    row = await scheduler.execute_prediction_run(session, now, manual=True)
    if row is None:
        row = session.scalar(
            select(JobRun).where(JobRun.idempotency_key == f"prediction:{now.isoformat(timespec='minutes')}")
        )
    return scheduler.serialize_run(row)
