"""Count inventory items in a photo with one YOLO model per class.

Clothes, foods, and utility each have their own weights file. Fund has no
photos and is not detected. Stock is unchanged here; the page saves a count
through the existing region entry route.
"""

from __future__ import annotations

import os
import tempfile
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

from app.services.inventory import ITEM_TYPES

CONFIDENCE_MIN = 0.35
MAX_IMAGE_BYTES = 12_000_000
MAX_VIDEO_BYTES = 200_000_000
MAX_VIDEO_FRAMES = 900
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


def _decode_image(image: bytes):
    """Decode an uploaded image into the ndarray Ultralytics expects."""
    try:
        import cv2
        import numpy as np

        decoded = cv2.imdecode(np.frombuffer(image, dtype=np.uint8), cv2.IMREAD_COLOR)
    except ImportError as exc:
        raise ObjectDetectError("The detection runtime is not installed.", status_code=503) from exc
    if decoded is None:
        raise ObjectDetectError("That photo could not be read.")
    return decoded


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
        results = model.predict(source=_decode_image(image), conf=CONFIDENCE_MIN, verbose=False)
    except ObjectDetectError:
        raise
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


# Cache models, but reload automatically when a promoted best.pt changes.
_MODELS: dict[str, tuple[int, object]] = {}


def _load_model(weights: Path) -> object:
    key = str(weights.resolve())
    modified_at = weights.stat().st_mtime_ns
    cached = _MODELS.get(key)
    if cached is None or cached[0] != modified_at:
        from ultralytics import YOLO

        model = YOLO(key)
        _MODELS[key] = (modified_at, model)
        return model
    return cached[1]


def detect_image(image: bytes, category_code: str) -> dict[str, object]:
    category_code = category_code.strip().lower()
    if category_code not in DETECTABLE:
        raise ObjectDetectError("Choose clothes, foods, or utility.")
    if not image:
        raise ObjectDetectError("Choose a photo.")
    if len(image) > MAX_IMAGE_BYTES:
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


def detect_video(video: bytes, category_code: str) -> dict[str, object]:
    """Track items across a short video and count each track only once.

    The returned count is a review aid, never a stock update. The caller must
    explicitly confirm the result through the normal inventory entry route.
    """
    category_code = category_code.strip().lower()
    if category_code not in DETECTABLE:
        raise ObjectDetectError("Choose clothes, foods, or utility.")
    if not video:
        raise ObjectDetectError("Choose a video.")
    if len(video) > MAX_VIDEO_BYTES:
        raise ObjectDetectError("That video is too large. Maximum size is 200 MB.")
    try:
        import cv2
    except ImportError as exc:
        raise ObjectDetectError("The video detection runtime is not installed.", status_code=503) from exc

    weights = weights_root() / category_code / "best.pt"
    if not weights.is_file():
        raise ObjectDetectError("The detection model for this class is not installed.", status_code=503)

    temp_name = ""
    try:
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as source:
            source.write(video)
            temp_name = source.name
        capture = cv2.VideoCapture(temp_name)
        if not capture.isOpened():
            raise ObjectDetectError("That video could not be read.")
        model = _load_model(weights)
        tracks: dict[str, dict[int, list[float]]] = defaultdict(lambda: defaultdict(list))
        frames = 0
        while frames < MAX_VIDEO_FRAMES:
            ok, frame = capture.read()
            if not ok:
                break
            frames += 1
            results = model.track(
                source=frame,
                conf=CONFIDENCE_MIN,
                persist=True,
                tracker="bytetrack.yaml",
                verbose=False,
            )
            if not results:
                continue
            boxes = getattr(results[0], "boxes", None)
            if boxes is None or boxes.id is None or boxes.cls is None:
                continue
            names = results[0].names or {}
            for class_id, confidence, track_id in zip(
                boxes.cls.tolist(), boxes.conf.tolist(), boxes.id.tolist(), strict=True
            ):
                label = str(names.get(int(class_id), ""))
                if label:
                    tracks[label][int(track_id)].append(float(confidence))
        capture.release()
    except ObjectDetectError:
        raise
    except Exception as exc:
        raise ObjectDetectError("That video could not be processed.") from exc
    finally:
        if temp_name:
            Path(temp_name).unlink(missing_ok=True)

    if not frames:
        raise ObjectDetectError("That video has no readable frames.")
    known = {code for code, *_rest in ITEM_TYPES[category_code]}
    items = [
        {
            "item_code": label,
            "quantity": len(track_scores),
            "confidence": round(sum(sum(scores) / len(scores) for scores in track_scores.values()) / len(track_scores), 4),
        }
        for label, track_scores in sorted(tracks.items())
        if label in known and track_scores
    ]
    if not items:
        raise ObjectDetectError("No inventory item was found in this video.")
    return {"category_code": category_code, "frames_processed": frames, "items": items}
