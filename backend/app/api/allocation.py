from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db, get_inventory_db
from app.schemas.api import (
    AllocationDispatchRequest,
    AllocationPlanRequest,
    AllocationPlanResponse,
)
from app.services.allocation import build_allocation_plan
from app.services.geography import GeographyUnavailableError
from app.services.inventory import InventoryError, add_region_stock, region_snapshot
from app.services.prediction import ModelUnavailableError

router = APIRouter(prefix="/allocation", tags=["allocation"])


@router.post("/plan", response_model=AllocationPlanResponse)
async def create_allocation_plan(
    data: AllocationPlanRequest,
    geo_session: Session = Depends(get_db),
    inventory_session: Session = Depends(get_inventory_db),
) -> AllocationPlanResponse:
    try:
        payload = await build_allocation_plan(geo_session, inventory_session, data)
        inventory_session.commit()
    except GeographyUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ModelUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return payload


@router.post("/dispatch")
def confirm_allocation_dispatch(
    data: AllocationDispatchRequest,
    inventory_session: Session = Depends(get_inventory_db),
) -> dict:
    try:
        for line in data.lines:
            add_region_stock(
                inventory_session,
                region=data.warehouse_region,
                category_code=line.category_code,
                item_code=line.item_code,
                quantity=line.quantity,
                entry_mode="manual",
                direction="out",
                note=data.note or line.destination,
            )
        payload = region_snapshot(inventory_session, data.warehouse_region)
        inventory_session.commit()
    except InventoryError as exc:
        inventory_session.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return payload
