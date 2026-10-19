"""Count inventory items in a photo with one YOLO model per class.

Clothes, foods, and utility each have their own weights file. Fund has no
photos and is not detected. Stock is unchanged here; the page saves a count
through the existing region entry route.
"""

from __future__ import annotations

import os
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

from app.services.inventory import ITEM_TYPES

CONFIDENCE_MIN = 0.35
DETECTABLE = tuple(ITEM_TYPES)


class ObjectDetectError(Exception):
    def __init__(self, message: str, status_code: int = 422) -> None:
        super().__init__(message)
        self.status_code = status_code


@dataclass(frozen=True)
class Detection:
    item_code: str
    confidence: float


def weights_root() -> Path:
    override = os.environ.get("OBJECT_DETECT_WEIGHTS")
    if override:
        return Path(override)
    here = Path(__file__).resolve()
    for parent in here.parents:
        candidate = parent / "ml" / "models"
        if candidate.is_dir():
            return candidate / "object_detect"
    return here.parents[3] / "ml" / "models" / "object_detect"


def choose_detection(
    boxes: list[Detection],
    *,
    minimum: float = CONFIDENCE_MIN,
) -> tuple[str, int, float]:
    """Pick the subclass with the most boxes. Ties use the higher mean score."""
    grouped: dict[str, list[float]] = defaultdict(list)
    for box in boxes:
        if box.confidence >= minimum:
            grouped[box.item_code].append(box.confidence)
    if not grouped:
        raise ObjectDetectError("No inventory item was found in this photo.")
    item_code, scores = max(
        grouped.items(),
        key=lambda item: (len(item[1]), sum(item[1]) / len(item[1])),
    )
    return item_code, len(scores), sum(scores) / len(scores)


def predict_boxes(weights: Path, image: bytes) -> list[Detection]:
    """Run one detector. Ultralytics is imported here so other tests stay light."""
    try:
        from ultralytics import YOLO
    except ImportError as exc:
        raise ObjectDetectError(
            "The detection runtime is not installed.",
            status_code=503,
        ) from exc

    model = _load_model(weights)
    try:
        results = model.predict(source=image, conf=CONFIDENCE_MIN, verbose=False)
    except Exception as exc:
        raise ObjectDetectError("That photo could not be read.") from exc
    if not results:
        return []
    result = results[0]
    names = result.names or {}
    found = getattr(result, "boxes", None)
    if found is None or found.cls is None:
        return []
    boxes: list[Detection] = []
    for class_id, confidence in zip(found.cls.tolist(), found.conf.tolist(), strict=True):
        label = names.get(int(class_id), "")
        if label:
            boxes.append(Detection(str(label), float(confidence)))
    return boxes


_MODELS: dict[str, object] = {}


def _load_model(weights: Path) -> object:
    key = str(weights.resolve())
    cached = _MODELS.get(key)
    if cached is None:
        from ultralytics import YOLO

        cached = YOLO(key)
        _MODELS[key] = cached
    return cached


def detect_image(image: bytes, category_code: str) -> dict[str, object]:
    category_code = category_code.strip().lower()
    if category_code not in DETECTABLE:
        raise ObjectDetectError("Choose clothes, foods, or utility.")
    if not image:
        raise ObjectDetectError("Choose a photo.")
    if len(image) > 12_000_000:
        raise ObjectDetectError("That photo is too large.")
    weights = weights_root() / category_code / "best.pt"
    if not weights.is_file():
        raise ObjectDetectError(
            "The detection model for this class is not installed.",
            status_code=503,
        )
    item_code, quantity, confidence = choose_detection(predict_boxes(weights, image))
    known = {code for code, *_rest in ITEM_TYPES[category_code]}
    if item_code not in known:
        raise ObjectDetectError("The model returned an item this class does not stock.")
    return {
        "category_code": category_code,
        "item_code": item_code,
        "quantity": quantity,
        "confidence": round(confidence, 4),
    }
