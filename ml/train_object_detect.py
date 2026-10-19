"""Train one YOLO detector per inventory class and copy the best weights.

The page loads ml/models/object_detect/<class>/best.pt. Datasets are the YOLO
splits already built under data/processed/object_detect.
"""

from __future__ import annotations

import shutil
from pathlib import Path

from ultralytics import YOLO

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "processed" / "object_detect"
RUNS = ROOT / "ml" / "runs" / "object_detect"
SERVED = ROOT / "ml" / "models" / "object_detect"
CLASSES = ("clothes", "foods", "utility")


def train_one(name: str) -> Path:
    data = DATA / name / "data.yaml"
    if not data.is_file():
        raise SystemExit(f"Missing dataset: {data}")
    model = YOLO("yolov8s.pt")
    model.train(
        data=str(data),
        epochs=150,
        imgsz=640,
        batch=2,
        patience=40,
        device="cpu",
        amp=False,
        project=str(RUNS),
        name=name,
        exist_ok=True,
        pretrained=True,
        optimizer="AdamW",
        lr0=0.001,
        lrf=0.01,
        cos_lr=True,
        warmup_epochs=3,
        close_mosaic=15,
        seed=42,
        workers=0,
        cache=False,
        plots=False,
        val=True,
        save=True,
    )
    best = RUNS / name / "weights" / "best.pt"
    if not best.is_file():
        raise SystemExit(f"Training finished without weights: {best}")
    destination = SERVED / name
    destination.mkdir(parents=True, exist_ok=True)
    shutil.copy2(best, destination / "best.pt")
    return destination / "best.pt"


def main() -> None:
    for name in CLASSES:
        saved = train_one(name)
        print(f"served {name}: {saved}")


if __name__ == "__main__":
    main()
