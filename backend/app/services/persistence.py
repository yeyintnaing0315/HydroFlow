from datetime import date, datetime, time, timezone

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Alert, Location, Observation
from app.schemas.api import AlertCreate


def get_or_create_location(
    session: Session, name: str, latitude: float, longitude: float
) -> Location:
    existing = session.scalar(select(Location).where(Location.name == name))
    if existing is not None:
        return existing
    location = Location(name=name, latitude=latitude, longitude=longitude)
    session.add(location)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        existing = session.scalar(select(Location).where(Location.name == name))
        if existing is None:
            raise
        return existing
    session.refresh(location)
    return location


def add_alert(session: Session, data: AlertCreate) -> Alert:
    alert = Alert(**data.model_dump())
    session.add(alert)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        existing = session.scalar(
            select(Alert).where(
                Alert.location_id == data.location_id,
                Alert.issued_at == data.issued_at,
                Alert.level == data.level,
            )
        )
        if existing is None:
            raise
        return existing
    session.refresh(alert)
    return alert


def list_alerts(
    session: Session, location_id: int | None = None, level: str | None = None
) -> list[Alert]:
    statement = select(Alert).order_by(Alert.issued_at.desc())
    if location_id is not None:
        statement = statement.where(Alert.location_id == location_id)
    if level is not None:
        statement = statement.where(Alert.level == level)
    return list(session.scalars(statement))


def list_observations(
    session: Session, location_id: int, start: date | None = None, end: date | None = None
) -> list[Observation]:
    statement = (
        select(Observation)
        .where(Observation.location_id == location_id)
        .order_by(Observation.observed_at)
    )
    if start:
        statement = statement.where(
            Observation.observed_at >= datetime.combine(start, time.min, timezone.utc)
        )
    if end:
        statement = statement.where(
            Observation.observed_at <= datetime.combine(end, time.max, timezone.utc)
        )
    return list(session.scalars(statement))
