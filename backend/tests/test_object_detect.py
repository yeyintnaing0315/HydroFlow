from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.object_detect import (
    Detection,
    ObjectDetectError,
    choose_detection,
    detect_image,
    detect_video,
)


def test_the_largest_group_wins_and_ties_use_mean_confidence() -> None:
    crowded = choose_detection(
        [
            Detection("cup", 0.4),
            Detection("cup", 0.5),
            Detection("bowl", 0.99),
            Detection("spoon", 0.1),
        ]
    )
    assert crowded == ("cup", 2, pytest.approx(0.45))

    tied = choose_detection(
        [
            Detection("cup", 0.4),
            Detection("cup", 0.5),
            Detection("bowl", 0.8),
            Detection("bowl", 0.9),
        ]
    )
    assert tied[0] == "bowl"
    assert tied[1] == 2
    assert tied[2] == pytest.approx(0.85)


def test_a_photo_with_no_confident_box_is_rejected() -> None:
    with pytest.raises(ObjectDetectError, match="No inventory item"):
        choose_detection([Detection("cup", 0.2)])
    with pytest.raises(ObjectDetectError, match="No inventory item"):
        choose_detection([])


def test_detect_image_counts_boxes_for_the_selected_class(monkeypatch, tmp_path: Path) -> None:
    weights = tmp_path / "utility" / "best.pt"
    weights.parent.mkdir()
    weights.write_bytes(b"stub")
    monkeypatch.setenv("OBJECT_DETECT_WEIGHTS", str(tmp_path))
    monkeypatch.setattr(
        "app.services.object_detect.predict_boxes",
        lambda path, image: [
            Detection("cup", 0.8),
            Detection("cup", 0.6),
            Detection("bowl", 0.95),
        ],
    )

    assert detect_image(b"jpeg-bytes", "utility") == {
        "category_code": "utility",
        "item_code": "cup",
        "quantity": 2,
        "confidence": 0.7,
    }


def test_missing_weights_and_unknown_classes_do_not_guess(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setenv("OBJECT_DETECT_WEIGHTS", str(tmp_path))
    with pytest.raises(ObjectDetectError, match="not installed") as missing:
        detect_image(b"jpeg-bytes", "clothes")
    assert missing.value.status_code == 503
    with pytest.raises(ObjectDetectError, match="Choose clothes"):
        detect_image(b"jpeg-bytes", "fund")
    with pytest.raises(ObjectDetectError, match="Choose a photo"):
        detect_image(b"", "foods")


def test_detect_route_returns_the_counted_item(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.api.inventory.detect_image",
        lambda image, category_code: {
            "category_code": category_code,
            "item_code": "rice",
            "quantity": 3,
            "confidence": 0.81,
        },
    )
    client = TestClient(app)
    response = client.post(
        "/inventory/detect",
        data={"category_code": "foods"},
        files={"image": ("frame.jpg", b"\xff\xd8\xff\xd9", "image/jpeg")},
    )
    assert response.status_code == 200
    assert response.json() == {
        "category_code": "foods",
        "item_code": "rice",
        "quantity": 3,
        "confidence": 0.81,
    }


def test_detect_route_rejects_an_empty_photo() -> None:
    client = TestClient(app)
    response = client.post(
        "/inventory/detect",
        data={"category_code": "clothes"},
        files={"image": ("frame.jpg", b"", "image/jpeg")},
    )
    assert response.status_code == 422
    assert response.json()["detail"] == "Choose a photo."


def test_video_detect_route_returns_tracks(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.api.inventory.detect_video",
        lambda video, category_code: {
            "category_code": category_code,
            "frames_processed": 32,
            "items": [{"item_code": "cup", "quantity": 2, "confidence": 0.78}],
        },
    )
    client = TestClient(app)
    response = client.post(
        "/inventory/detect/video",
        data={"category_code": "utility"},
        files={"video": ("scan.mp4", b"video-bytes", "video/mp4")},
    )
    assert response.status_code == 200
    assert response.json()["items"][0]["item_code"] == "cup"


def test_video_detection_rejects_unknown_class_and_empty_payload() -> None:
    with pytest.raises(ObjectDetectError, match="Choose clothes"):
        detect_video(b"video", "fund")
    with pytest.raises(ObjectDetectError, match="Choose a video"):
        detect_video(b"", "foods")
