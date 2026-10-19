from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db import get_inventory_db
from app.services.inventory import InventoryError, add_region_stock, region_snapshot
from app.services.object_detect import ObjectDetectError, detect_image

router = APIRouter(tags=["inventory"])


class InventoryEntry(BaseModel):
    category_code: str = Field(min_length=1, max_length=40)
    item_code: str | None = Field(default=None, max_length=40)
    quantity: float = Field(gt=0)
    entry_mode: str = Field(pattern="^(manual|scan)$")
    direction: str = Field(default="in", pattern="^(in|out)$")
    note: str | None = Field(default=None, max_length=300)


@router.post("/inventory/detect")
async def detect_inventory_item(
    category_code: str = Form(...),
    image: UploadFile = File(...),
) -> dict:
    payload = await image.read()
    if not payload:
        raise HTTPException(status_code=422, detail="Choose a photo.")
    try:
        return detect_image(payload, category_code)
    except ObjectDetectError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


@router.get("/inventory")
@router.get("/inventory/")
def list_inventory(session: Session = Depends(get_inventory_db)) -> dict:
    try:
        payload = {
            "locations": [
                region_snapshot(session, "east"),
                region_snapshot(session, "west"),
            ]
        }
        session.commit()
    except InventoryError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return payload


@router.get("/inventory/{region}")
def get_region_inventory(region: str, session: Session = Depends(get_inventory_db)) -> dict:
    try:
        payload = region_snapshot(session, region)
        session.commit()
    except InventoryError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return payload


@router.post("/inventory/{region}/entries")
def create_region_entry(
    region: str,
    entry: InventoryEntry,
    session: Session = Depends(get_inventory_db),
) -> dict:
    try:
        payload = add_region_stock(
            session,
            region=region,
            category_code=entry.category_code,
            item_code=entry.item_code,
            quantity=entry.quantity,
            entry_mode=entry.entry_mode,
            direction=entry.direction,
            note=entry.note,
        )
        session.commit()
    except InventoryError as exc:
        session.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return payload
