import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd

from app.services.flood_history import impact_severity
from app.services.prediction import ModelUnavailableError

LOG_COUNT_CAP = float(np.log1p(1_000_000))


def help_model_path() -> Path:
    default = Path(__file__).resolve().parents[3] / "artifacts" / "flood_help_pipeline.joblib"
    return Path(os.getenv("HELP_MODEL_PATH", default))


def help_metadata_path() -> Path:
    default = Path(__file__).resolve().parents[3] / "artifacts" / "help_model_metadata.json"
    return Path(os.getenv("HELP_MODEL_METADATA_PATH", default))


def _count(value: float) -> int:
    return int(max(0, round(float(value))))


def _magnitude(regressor: Any, frame: pd.DataFrame) -> float:
    raw = float(regressor.predict(frame)[0])
    return max(0.0, float(np.expm1(min(raw, LOG_COUNT_CAP))))


@lru_cache(maxsize=1)
def load_help_model() -> tuple[dict[str, Any], dict[str, Any]]:
    path = help_model_path()
    metadata = help_metadata_path()
    if not path.is_file() or not metadata.is_file():
        raise ModelUnavailableError("Flood-help model artifact or metadata not found")
    try:
        bundle = joblib.load(path)
        model_metadata = json.loads(metadata.read_text(encoding="utf-8"))
    except Exception as exc:
        raise ModelUnavailableError("Flood-help model artifact could not be loaded") from exc
    required = ("classifier", "people_regressor", "households_regressor")
    if any(name not in bundle for name in required):
        raise ModelUnavailableError("Flood-help artifact is missing a model stage")
    if "threshold" not in model_metadata or "planning_ratios" not in model_metadata:
        raise ModelUnavailableError("Flood-help metadata is missing threshold or planning ratios")
    return bundle, model_metadata


def predict_help(features: dict[str, float | str]) -> dict[str, float | int | bool | str]:
    bundle, metadata = load_help_model()
    try:
        frame = pd.DataFrame([features])
        probability = float(bundle["classifier"].predict_proba(frame)[:, 1][0])
        people = _count(probability * _magnitude(bundle["people_regressor"], frame))
        households = _count(probability * _magnitude(bundle["households_regressor"], frame))
        ratios = metadata["planning_ratios"]
        threshold = float(metadata["threshold"])
    except Exception as exc:
        raise ValueError("Flood-help model rejected prediction features") from exc
    return {
        "help_probability": probability,
        "predicted_help": bool(probability >= threshold),
        "expected_affected_people": people,
        "expected_households": households,
        "assistance_priority": impact_severity(households, people),
        "shelter_kits": _count(households * float(ratios["shelter_kits_per_household"])),
        "food_rations_3d": _count(people * float(ratios["food_rations_per_person_3d"])),
        "drinking_water_liters_3d": _count(
            people
            * float(ratios["drinking_water_liters_per_person_day"])
            * float(ratios["planning_days"])
        ),
        "model_version": str(metadata.get("version", "flood-help-v1")),
    }
