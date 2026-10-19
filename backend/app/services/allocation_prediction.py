"""Learned SKU demand from flood-help outputs."""

from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd

from app.schemas.api import AllocationLineItem
from app.services.prediction import ModelUnavailableError

PRIORITY_WEIGHT = {"none": 0, "low": 1, "moderate": 2, "high": 3, "severe": 4}

INPUT_FEATURES = (
    "help_probability",
    "expected_affected_people",
    "expected_households",
    "priority_weight",
    "food_rations_3d",
    "shelter_kits",
    "drinking_water_liters_3d",
)

SKU_CATALOG: tuple[tuple[str, str | None, str, str], ...] = (
    ("foods", "rice", "Rice", "bag"),
    ("foods", "can", "Can", "can"),
    ("utility", "blanket", "Blanket", "piece"),
    ("utility", "cup", "Cup", "piece"),
    ("foods", "oil", "Oil", "bottle"),
    ("clothes", "tshirt", "T-shirt", "piece"),
    ("clothes", "m_cloth", "Men cloth", "piece"),
    ("clothes", "f_cloth", "Women cloth", "piece"),
    ("fund", None, "Fund", "mmk"),
)

LOG_CAP = float(np.log1p(1_000_000))


def allocation_model_path() -> Path:
    default = Path(__file__).resolve().parents[3] / "artifacts" / "allocation_pipeline.joblib"
    return Path(os.getenv("ALLOCATION_MODEL_PATH", default))


def allocation_metadata_path() -> Path:
    default = Path(__file__).resolve().parents[3] / "artifacts" / "allocation_model_metadata.json"
    return Path(os.getenv("ALLOCATION_METADATA_PATH", default))


@lru_cache(maxsize=1)
def load_allocation_model() -> tuple[Any, dict[str, Any]]:
    path = allocation_model_path()
    metadata_path = allocation_metadata_path()
    if not path.is_file() or not metadata_path.is_file():
        raise ModelUnavailableError("Allocation model artifact or metadata not found")
    try:
        pipeline = joblib.load(path)
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise ModelUnavailableError("Allocation model artifact could not be loaded") from exc
    if "sku_columns" not in metadata:
        raise ModelUnavailableError("Allocation metadata is missing sku_columns")
    return pipeline, metadata


def allocation_model_available() -> bool:
    try:
        load_allocation_model()
    except ModelUnavailableError:
        return False
    return True


def _help_input_row(scored: dict[str, Any]) -> pd.DataFrame:
    priority = str(scored.get("assistance_priority", "none"))
    return pd.DataFrame(
        [
            {
                "help_probability": float(scored["help_probability"]),
                "expected_affected_people": int(scored["expected_affected_people"]),
                "expected_households": int(scored["expected_households"]),
                "priority_weight": PRIORITY_WEIGHT.get(priority, 0),
                "food_rations_3d": int(scored.get("food_rations_3d", 0)),
                "shelter_kits": int(scored.get("shelter_kits", 0)),
                "drinking_water_liters_3d": int(scored.get("drinking_water_liters_3d", 0)),
            }
        ]
    )


def predict_sku_demand(scored: dict[str, Any]) -> tuple[list[AllocationLineItem], str]:
    """Return line items and model version string."""
    try:
        pipeline, metadata = load_allocation_model()
    except ModelUnavailableError:
        from app.services.allocation import line_items_from_help_rules

        return line_items_from_help_rules(scored), "allocation-rules-fallback"

    row = _help_input_row(scored)
    raw = pipeline.predict(row.loc[:, list(INPUT_FEATURES)])
    raw = np.clip(raw, 0.0, LOG_CAP)
    quantities = np.rint(np.expm1(raw)).astype(float).reshape(-1)

    items: list[AllocationLineItem] = []
    for index, (category_code, item_code, name, unit) in enumerate(SKU_CATALOG):
        qty = float(quantities[index])
        if qty <= 0:
            continue
        items.append(
            AllocationLineItem(
                category_code=category_code,
                item_code=item_code,
                name=name,
                unit=unit,
                requested=qty,
                allocated=0.0,
            )
        )
    version = str(metadata.get("version", "allocation-v1"))
    return items, version
