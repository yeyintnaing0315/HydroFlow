"""Read locally downloaded hydrology (Open-Meteo, NASA POWER, GloFAS) for timeline replay."""

from __future__ import annotations

from datetime import date
from pathlib import Path
from typing import Any

import pandas as pd

from app.services.hydro_sources import (
    GLOFAS_DISCHARGE_DIR,
    HYDRO_MERGED_DIR,
    NASA_POWER_HYDRO_DIR,
    OPEN_METEO_ARCHIVE_DIR,
)


def _read_csv_range(path: Path, start: date, end: date) -> pd.DataFrame:
    if not path.is_file():
        return pd.DataFrame()
    frame = pd.read_csv(path, parse_dates=["date"])
    mask = (frame["date"].dt.date >= start) & (frame["date"].dt.date <= end)
    return frame.loc[mask].copy()


def _merged_path(township_id: str) -> Path:
    return HYDRO_MERGED_DIR / f"{township_id}.csv"


def _merge_sources(township_id: str, start: date, end: date) -> list[dict[str, Any]]:
    merged_path = _merged_path(township_id)
    if merged_path.is_file():
        frame = _read_csv_range(merged_path, start, end)
    else:
        meteo = _read_csv_range(OPEN_METEO_ARCHIVE_DIR / f"{township_id}.csv", start, end)
        glofas = _read_csv_range(GLOFAS_DISCHARGE_DIR / f"{township_id}.csv", start, end)
        nasa = _read_csv_range(NASA_POWER_HYDRO_DIR / f"{township_id}.csv", start, end)
        if meteo.empty and glofas.empty and nasa.empty:
            return []
        frame = meteo
        if not glofas.empty:
            frame = frame.merge(glofas, on="date", how="outer") if not frame.empty else glofas
        if not nasa.empty:
            frame = frame.merge(nasa, on="date", how="outer", suffixes=("", "_nasa")) if not frame.empty else nasa
        if frame.empty:
            return []

        for column in ("precipitation_mm", "temperature_c", "relative_humidity_pct", "wind_speed_m_s"):
            nasa_col = f"{column}_nasa"
            if column in frame.columns and nasa_col in frame.columns:
                frame[column] = frame[column].fillna(frame[nasa_col])
                frame = frame.drop(columns=[nasa_col])
            elif nasa_col in frame.columns:
                frame[column] = frame[nasa_col]
                frame = frame.drop(columns=[nasa_col])
        if "precipitation_mm" in frame.columns and "rainfall_mm" not in frame.columns:
            frame["rainfall_mm"] = frame["precipitation_mm"]

    observations: list[dict[str, Any]] = []
    for record in frame.itertuples(index=False):
        day = record.date.date() if hasattr(record.date, "date") else record.date
        rain = getattr(record, "rainfall_mm", None)
        if rain is None and hasattr(record, "precipitation_mm"):
            rain = record.precipitation_mm
        discharge = getattr(record, "river_discharge_m3s", None)
        if pd.isna(rain) or pd.isna(discharge):
            continue
        observations.append(
            {
                "date": day,
                "rainfall_mm": float(rain),
                "river_discharge_m3s": float(discharge),
                "temperature_c": None
                if not hasattr(record, "temperature_c") or pd.isna(record.temperature_c)
                else float(record.temperature_c),
                "relative_humidity_pct": None
                if not hasattr(record, "relative_humidity_pct") or pd.isna(record.relative_humidity_pct)
                else float(record.relative_humidity_pct),
                "wind_speed_m_s": None
                if not hasattr(record, "wind_speed_m_s") or pd.isna(record.wind_speed_m_s)
                else float(record.wind_speed_m_s),
                "rainfall_source": "local open_meteo_archive_daily",
                "meteorology_source": "local nasa_power_hydro + open_meteo_archive",
                "discharge_source": "local glofas_discharge",
            }
        )
    return observations


def local_observations_for_range(
    township_id: str, start: date, end: date
) -> list[dict[str, Any]]:
    """Return merged local daily rows with both rainfall and discharge, if cached."""
    if not HYDRO_MERGED_DIR.is_dir() and not OPEN_METEO_ARCHIVE_DIR.is_dir():
        return []
    return _merge_sources(township_id, start, end)


def has_local_series(township_id: str) -> bool:
    return _merged_path(township_id).is_file() or (
        (OPEN_METEO_ARCHIVE_DIR / f"{township_id}.csv").is_file()
        and (GLOFAS_DISCHARGE_DIR / f"{township_id}.csv").is_file()
    )
