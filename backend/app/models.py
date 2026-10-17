from datetime import date, datetime

from sqlalchemy import JSON, Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Location(Base):
    __tablename__ = "locations"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True)
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    observations: Mapped[list["Observation"]] = relationship(cascade="all, delete-orphan")
    alerts: Mapped[list["Alert"]] = relationship(cascade="all, delete-orphan")


class HistoricalDay(Base):
    """Daily weather collected from the live history API and kept for the prediction page."""

    __tablename__ = "historical_days"
    __table_args__ = (
        UniqueConstraint("location_key", "observed_on", name="uq_historical_location_day"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    location_key: Mapped[str] = mapped_column(String(160), index=True)
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    observed_on: Mapped[date] = mapped_column(Date, index=True)
    precipitation_mm: Mapped[float | None] = mapped_column(Float, nullable=True)
    temperature_c: Mapped[float | None] = mapped_column(Float, nullable=True)
    relative_humidity_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    wind_speed_m_s: Mapped[float | None] = mapped_column(Float, nullable=True)
    source: Mapped[str] = mapped_column(String(80), default="nasa-power")
    retrieved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Observation(Base):
    __tablename__ = "observations"
    __table_args__ = (
        UniqueConstraint("location_id", "observed_at", "source", name="uq_observation_source_time"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    location_id: Mapped[int] = mapped_column(ForeignKey("locations.id"), index=True)
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    source: Mapped[str] = mapped_column(String(40))
    precipitation_mm: Mapped[float | None] = mapped_column(Float, nullable=True)
    temperature_c: Mapped[float | None] = mapped_column(Float, nullable=True)
    discharge_m3_s: Mapped[float | None] = mapped_column(Float, nullable=True)


class Alert(Base):
    __tablename__ = "alerts"
    __table_args__ = (
        UniqueConstraint("location_id", "issued_at", "level", name="uq_alert_location_time_level"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    location_id: Mapped[int] = mapped_column(ForeignKey("locations.id"), index=True)
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    level: Mapped[str] = mapped_column(String(20))
    message: Mapped[str] = mapped_column(String(500))
    source: Mapped[str] = mapped_column(String(80), default="hydroflow-academic")


class DataSource(Base):
    """A provider or licensed dataset, including currently unavailable sources."""

    __tablename__ = "data_sources"

    id: Mapped[int] = mapped_column(primary_key=True)
    key: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(160))
    kind: Mapped[str] = mapped_column(String(40))
    url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    license_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    license_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    attribution: Mapped[str | None] = mapped_column(String(500), nullable=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    unavailable_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict)


class DatasetVersion(Base):
    __tablename__ = "dataset_versions"
    __table_args__ = (
        UniqueConstraint("source_id", "version", name="uq_dataset_source_version"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    source_id: Mapped[int] = mapped_column(ForeignKey("data_sources.id"), index=True)
    version: Mapped[str] = mapped_column(String(80))
    valid_from: Mapped[date | None] = mapped_column(Date, nullable=True)
    valid_to: Mapped[date | None] = mapped_column(Date, nullable=True)
    retrieved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    checksum: Mapped[str | None] = mapped_column(String(128), nullable=True)
    source_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict)


class AdminArea(Base):
    __tablename__ = "admin_areas"
    __table_args__ = (
        UniqueConstraint("dataset_version_id", "source_code", name="uq_admin_dataset_code"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    dataset_version_id: Mapped[int] = mapped_column(ForeignKey("dataset_versions.id"), index=True)
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("admin_areas.id"), nullable=True, index=True)
    source_code: Mapped[str] = mapped_column(String(80), index=True)
    level: Mapped[int] = mapped_column(Integer, index=True)
    area_type: Mapped[str] = mapped_column(String(40))
    name_en: Mapped[str] = mapped_column(String(160), index=True)
    name_local: Mapped[str | None] = mapped_column(String(200), nullable=True)
    centroid_latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    centroid_longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    geometry_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    area_sq_km: Mapped[float | None] = mapped_column(Float, nullable=True)
    coverage_status: Mapped[str] = mapped_column(String(40), default="complete")
    valid_from: Mapped[date | None] = mapped_column(Date, nullable=True)
    valid_to: Mapped[date | None] = mapped_column(Date, nullable=True)


class AdminAlias(Base):
    __tablename__ = "admin_aliases"
    __table_args__ = (
        UniqueConstraint("namespace", "alias", name="uq_admin_alias_namespace"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    admin_area_id: Mapped[int] = mapped_column(ForeignKey("admin_areas.id"), index=True)
    namespace: Mapped[str] = mapped_column(String(60))
    alias: Mapped[str] = mapped_column(String(160), index=True)


class Settlement(Base):
    __tablename__ = "settlements"
    __table_args__ = (
        UniqueConstraint("dataset_version_id", "source_code", name="uq_settlement_dataset_code"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    dataset_version_id: Mapped[int] = mapped_column(ForeignKey("dataset_versions.id"), index=True)
    admin_area_id: Mapped[int | None] = mapped_column(ForeignKey("admin_areas.id"), nullable=True, index=True)
    source_code: Mapped[str] = mapped_column(String(80), index=True)
    name_en: Mapped[str] = mapped_column(String(160), index=True)
    name_local: Mapped[str | None] = mapped_column(String(200), nullable=True)
    settlement_type: Mapped[str] = mapped_column(String(40))
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    verification_status: Mapped[str] = mapped_column(String(60), default="source_verified")
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict)


class ProviderObservation(Base):
    __tablename__ = "provider_observations"
    __table_args__ = (
        UniqueConstraint(
            "source_id",
            "variable",
            "location_key",
            "valid_at",
            name="uq_provider_observation",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    source_id: Mapped[int] = mapped_column(ForeignKey("data_sources.id"), index=True)
    admin_area_id: Mapped[int | None] = mapped_column(ForeignKey("admin_areas.id"), nullable=True, index=True)
    location_key: Mapped[str] = mapped_column(String(160), index=True)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    variable: Mapped[str] = mapped_column(String(80), index=True)
    value: Mapped[float | None] = mapped_column(Float, nullable=True)
    unit: Mapped[str] = mapped_column(String(40))
    observed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    valid_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    retrieved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    quality: Mapped[str] = mapped_column(String(40), default="unknown")
    missing: Mapped[bool] = mapped_column(Boolean, default=False)
    coverage_json: Mapped[dict] = mapped_column(JSON, default=dict)
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict)


class OfficialWarning(Base):
    __tablename__ = "official_warnings"
    __table_args__ = (
        UniqueConstraint("source_id", "external_id", name="uq_warning_source_external"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    source_id: Mapped[int] = mapped_column(ForeignKey("data_sources.id"), index=True)
    external_id: Mapped[str] = mapped_column(String(160))
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    effective_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    retrieved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    severity: Mapped[str] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(40), default="actual")
    message: Mapped[str] = mapped_column(Text)
    source_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    coverage_json: Mapped[dict] = mapped_column(JSON, default=dict)


class InundationProduct(Base):
    __tablename__ = "inundation_products"
    __table_args__ = (
        UniqueConstraint("source_id", "external_id", name="uq_inundation_source_external"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    source_id: Mapped[int] = mapped_column(ForeignKey("data_sources.id"), index=True)
    external_id: Mapped[str] = mapped_column(String(160))
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    retrieved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    geometry_json: Mapped[dict] = mapped_column(JSON)
    quality: Mapped[str] = mapped_column(String(80), default="unvalidated")
    affected_population: Mapped[int | None] = mapped_column(Integer, nullable=True)
    population_source: Mapped[str | None] = mapped_column(String(120), nullable=True)
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict)


class ExposureSummary(Base):
    __tablename__ = "exposure_summaries"
    __table_args__ = (
        UniqueConstraint(
            "inundation_product_id",
            "admin_area_id",
            "population_source",
            name="uq_exposure_product_area_source",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    inundation_product_id: Mapped[int] = mapped_column(
        ForeignKey("inundation_products.id"), index=True
    )
    admin_area_id: Mapped[int | None] = mapped_column(
        ForeignKey("admin_areas.id"), nullable=True, index=True
    )
    population_source: Mapped[str] = mapped_column(String(160))
    exposed_population: Mapped[int] = mapped_column(Integer)
    calculated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    method: Mapped[str] = mapped_column(Text)
    uncertainty_json: Mapped[dict] = mapped_column(JSON, default=dict)


class ModelVersion(Base):
    __tablename__ = "model_versions"

    id: Mapped[int] = mapped_column(primary_key=True)
    version: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    model_kind: Mapped[str] = mapped_column(String(60))
    artifact_uri: Mapped[str | None] = mapped_column(String(500), nullable=True)
    artifact_checksum: Mapped[str | None] = mapped_column(String(128), nullable=True)
    trained_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    validation_status: Mapped[str] = mapped_column(String(60), default="unvalidated")
    metrics_json: Mapped[dict] = mapped_column(JSON, default=dict)
    feature_schema_json: Mapped[dict] = mapped_column(JSON, default=dict)
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict)


class JobRun(Base):
    __tablename__ = "job_runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    idempotency_key: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    job_name: Mapped[str] = mapped_column(String(100), index=True)
    scheduled_for: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(30), index=True)
    attempt: Mapped[int] = mapped_column(Integer, default=1)
    model_version: Mapped[str | None] = mapped_column(String(120), nullable=True)
    freshness_json: Mapped[dict] = mapped_column(JSON, default=dict)
    coverage_json: Mapped[dict] = mapped_column(JSON, default=dict)
    config_json: Mapped[dict] = mapped_column(JSON, default=dict)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)


class RiskResult(Base):
    __tablename__ = "risk_results"
    __table_args__ = (
        UniqueConstraint(
            "job_run_id",
            "admin_area_id",
            "valid_at",
            "evidence_type",
            name="uq_risk_run_area_valid_evidence",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    job_run_id: Mapped[int] = mapped_column(ForeignKey("job_runs.id"), index=True)
    admin_area_id: Mapped[int | None] = mapped_column(ForeignKey("admin_areas.id"), nullable=True, index=True)
    valid_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    forecast_horizon_hours: Mapped[int] = mapped_column(Integer)
    evidence_type: Mapped[str] = mapped_column(String(40), index=True)
    risk_level: Mapped[str] = mapped_column(String(30))
    risk_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    probability: Mapped[float | None] = mapped_column(Float, nullable=True)
    model_version_id: Mapped[int | None] = mapped_column(ForeignKey("model_versions.id"), nullable=True)
    input_freshness_json: Mapped[dict] = mapped_column(JSON, default=dict)
    supporting_evidence_json: Mapped[dict] = mapped_column(JSON, default=dict)
    uncertainty_json: Mapped[dict] = mapped_column(JSON, default=dict)
