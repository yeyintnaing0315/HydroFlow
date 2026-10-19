"""Bago East / Bago West stock tables (same classes, separate balances)."""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import BagoEastBalance, BagoEastMovement, BagoWestBalance, BagoWestMovement

CATEGORIES: tuple[dict[str, object], ...] = (
    {"code": "clothes", "name": "Clothes", "entry_mode": "scan_or_manual", "sort_order": 1},
    {"code": "foods", "name": "Foods", "entry_mode": "scan_or_manual", "sort_order": 2},
    {"code": "utility", "name": "Utility", "entry_mode": "scan_or_manual", "sort_order": 3},
    {"code": "fund", "name": "Fund", "entry_mode": "manual_only", "sort_order": 4},
)

ITEM_TYPES: dict[str, tuple[tuple[str, str, str, int], ...]] = {
    "clothes": (
        ("tshirt", "T-shirt", "piece", 1),
        ("m_cloth", "Men cloth", "piece", 2),
        ("f_cloth", "Women cloth", "piece", 3),
    ),
    "foods": (
        ("rice", "Rice", "bag", 1),
        ("oil", "Oil", "bottle", 2),
        ("can", "Can", "can", 3),
    ),
    "utility": (
        ("blanket", "Blanket", "piece", 1),
        ("soap", "Soap", "pack", 2),
        ("cup", "Cup", "piece", 3),
        ("spoon", "Spoon", "piece", 4),
        ("mug", "Mug", "piece", 5),
        ("box", "Box", "piece", 6),
        ("towel", "Towel", "piece", 7),
        ("plate", "Plate", "piece", 8),
        ("netbed", "Net bed", "piece", 9),
        ("knife", "Knife", "piece", 10),
        ("bowl", "Bowl", "piece", 11),
        ("pot", "Pot", "piece", 12),
    ),
}


class InventoryError(ValueError):
    """A stock change that breaks the class rules."""


REGIONS = {
    "east": {
        "location": "Bago East",
        "balance": BagoEastBalance,
        "movement": BagoEastMovement,
    },
    "west": {
        "location": "Bago West",
        "balance": BagoWestBalance,
        "movement": BagoWestMovement,
    },
}


def seed_regions(session: Session) -> None:
    """Ensure Bago East and Bago West rows exist for every class/subclass."""
    for spec in REGIONS.values():
        balance_model = spec["balance"]
        for category_code, types in ITEM_TYPES.items():
            for code, _name, unit, _order in types:
                existing = session.scalar(
                    select(balance_model).where(
                        balance_model.category_code == category_code,
                        balance_model.item_code == code,
                    )
                )
                if existing is None:
                    session.add(
                        balance_model(
                            category_code=category_code,
                            item_code=code,
                            quantity=Decimal("0"),
                            unit=unit,
                        )
                    )
        fund = session.scalar(
            select(balance_model).where(
                balance_model.category_code == "fund",
                balance_model.item_code.is_(None),
            )
        )
        if fund is None:
            session.add(
                balance_model(
                    category_code="fund",
                    item_code=None,
                    quantity=Decimal("0"),
                    unit="mmk",
                )
            )
    session.flush()


def _class_name(category_code: str) -> str:
    for spec in CATEGORIES:
        if spec["code"] == category_code:
            return str(spec["name"])
    return category_code


def _item_name(category_code: str, item_code: str | None) -> str:
    if item_code is None:
        return _class_name(category_code)
    for code, name, _unit, _order in ITEM_TYPES.get(category_code, ()):
        if code == item_code:
            return name
    return item_code or category_code


def region_snapshot(session: Session, region: str) -> dict[str, object]:
    spec = REGIONS.get(region)
    if spec is None:
        raise InventoryError("Region must be east or west")
    seed_regions(session)
    balance_model = spec["balance"]
    movement_model = spec["movement"]
    balances = list(session.scalars(select(balance_model)))
    classes = []
    for category in CATEGORIES:
        code = str(category["code"])
        rows = [row for row in balances if row.category_code == code]
        items = [
            {
                "code": row.item_code,
                "name": _item_name(code, row.item_code),
                "quantity": float(row.quantity),
                "unit": row.unit,
            }
            for row in sorted(rows, key=lambda row: row.item_code or "")
        ]
        classes.append(
            {
                "code": code,
                "name": str(category["name"]),
                "entry_mode": str(category["entry_mode"]),
                "quantity": sum(item["quantity"] for item in items),
                "items": items,
            }
        )
    movements = list(
        session.scalars(
            select(movement_model).order_by(movement_model.created_at.desc()).limit(20)
        )
    )
    return {
        "region": region,
        "location": spec["location"],
        "classes": classes,
        "movements": [
            {
                "id": row.id,
                "category_code": row.category_code,
                "item_code": row.item_code,
                "name": _item_name(row.category_code, row.item_code),
                "class_name": _class_name(row.category_code),
                "direction": row.direction,
                "entry_mode": row.entry_mode,
                "quantity": float(row.quantity),
                "unit": next(
                    (
                        item["unit"]
                        for class_row in classes
                        if class_row["code"] == row.category_code
                        for item in class_row["items"]
                        if item["code"] == row.item_code
                    ),
                    "mmk" if row.category_code == "fund" else "piece",
                ),
                "created_at": row.created_at.isoformat(),
            }
            for row in movements
        ],
    }


def add_region_stock(
    session: Session,
    *,
    region: str,
    category_code: str,
    quantity: Decimal | int | str,
    entry_mode: str,
    direction: str = "in",
    item_code: str | None = None,
    note: str | None = None,
) -> dict[str, object]:
    spec = REGIONS.get(region)
    if spec is None:
        raise InventoryError("Region must be east or west")
    amount = Decimal(quantity)
    if amount <= 0:
        raise InventoryError("Quantity must be greater than zero")
    if entry_mode not in {"manual", "scan"}:
        raise InventoryError("Entry mode must be manual or scan")
    if direction not in {"in", "out"}:
        raise InventoryError("Direction must be in or out")
    seed_regions(session)
    category = next((item for item in CATEGORIES if item["code"] == category_code), None)
    if category is None:
        raise InventoryError(f"Unknown class: {category_code}")
    if category["entry_mode"] == "manual_only" and entry_mode != "manual":
        raise InventoryError("Fund can only be added manually")
    if category_code == "fund":
        if item_code:
            raise InventoryError("Fund has no subclass")
        item_code = None
    elif not item_code or item_code not in {code for code, *_rest in ITEM_TYPES[category_code]}:
        raise InventoryError("Choose a subclass of this class")

    balance_model = spec["balance"]
    statement = select(balance_model).where(balance_model.category_code == category_code)
    if item_code is None:
        statement = statement.where(balance_model.item_code.is_(None))
    else:
        statement = statement.where(balance_model.item_code == item_code)
    balance = session.scalar(statement)
    if balance is None:
        raise InventoryError("Stock row is missing for this class")
    current = Decimal(balance.quantity)
    updated = current + amount if direction == "in" else current - amount
    if updated < 0:
        raise InventoryError("Allocation is larger than the stock on hand")
    balance.quantity = updated
    session.add(
        spec["movement"](
            category_code=category_code,
            item_code=item_code,
            direction=direction,
            entry_mode=entry_mode,
            quantity=amount,
            note=note,
            created_at=datetime.now(timezone.utc),
        )
    )
    session.flush()
    return region_snapshot(session, region)
