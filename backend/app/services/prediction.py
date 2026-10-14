import os
import json
from functools import lru_cache
from pathlib import Path
from typing import Any

import joblib
import pandas as pd


class ModelUnavailableError(RuntimeError):
    pass


def model_path() -> Path:
    default = Path(__file__).resolve().parents[3] / "artifacts" / "flood_logistic_pipeline.joblib"
    return Path(os.getenv("MODEL_PATH", default))


def metadata_path() -> Path:
    default = Path(__file__).resolve().parents[3] / "artifacts" / "model_metadata.json"
    return Path(os.getenv("MODEL_METADATA_PATH", default))


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
    try:
        frame = pd.DataFrame([features])
        probability = float(model.predict_proba(frame)[:, 1][0])
        threshold = float(metadata["threshold"])
    except Exception as exc:
        raise ValueError("Model rejected prediction features") from exc
    return (
        probability,
        int(probability >= threshold),
        threshold,
        str(metadata.get("version", "baseline-logistic-v2")),
    )
