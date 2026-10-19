import os
import json
from functools import lru_cache
from pathlib import Path
from typing import Any

import joblib
import pandas as pd

from app.services.live_features import NEW_MODEL_FEATURES, row_has_model_features


class ModelUnavailableError(RuntimeError):
    pass


def model_path() -> Path:
    default = Path(__file__).resolve().parents[3] / "ml" / "models" / "bago_flood_model.joblib"
    return Path(os.getenv("MODEL_PATH", default))


def metadata_path() -> Path:
    default = Path(__file__).resolve().parents[3] / "ml" / "models" / "bago_flood_model_metadata.json"
    return Path(os.getenv("MODEL_METADATA_PATH", default))


def feature_names(metadata: dict[str, Any] | None = None) -> list[str]:
    payload = metadata if metadata is not None else load_model()[1]
    listed = payload.get("features") or payload.get("model_features")
    if listed:
        return [str(name) for name in listed]
    if payload.get("selected_model") or payload.get("version"):
        return list(NEW_MODEL_FEATURES)
    return []


def decision_threshold(metadata: dict[str, Any]) -> float:
    return float(metadata.get("decision_threshold", metadata.get("threshold", 0.5)))


def model_version_name(metadata: dict[str, Any]) -> str:
    return str(metadata.get("selected_model") or metadata.get("version") or "baseline-logistic-v2")


@lru_cache(maxsize=1)
def load_model() -> tuple[Any, dict[str, Any]]:
    path = model_path()
    metadata = metadata_path()
    if not path.is_file() or not metadata.is_file():
        raise ModelUnavailableError("Persisted model artifact or metadata not found")
    try:
        model = joblib.load(path)
        model_metadata = json.loads(metadata.read_text(encoding="utf-8"))
    except Exception as exc:
        raise ModelUnavailableError("Persisted model artifact could not be loaded") from exc
    if not callable(getattr(model, "predict_proba", None)):
        raise ModelUnavailableError("Persisted artifact does not expose predict_proba()")
    return model, model_metadata


def predict(features: dict[str, float | str]) -> tuple[float, int, float, str]:
    model, metadata = load_model()
    names = feature_names(metadata)
    if names and not row_has_model_features(features, names):
        raise ValueError("Model rejected prediction features")
    try:
        frame = pd.DataFrame([{name: features[name] for name in names}]) if names else pd.DataFrame([features])
        probability = float(model.predict_proba(frame)[:, 1][0])
        threshold = decision_threshold(metadata)
    except Exception as exc:
        raise ValueError("Model rejected prediction features") from exc
    return (
        probability,
        int(probability >= threshold),
        threshold,
        model_version_name(metadata),
    )
