"""Fixed planning ratios for SKU demand (fallback when ML artifact is unavailable)."""

from __future__ import annotations

from typing import Any

from app.schemas.api import AllocationLineItem


def _count(value: float) -> int:
    return int(max(0, round(float(value))))


def line_items_from_help_rules(scored: dict[str, Any]) -> list[AllocationLineItem]:
    people = int(scored["expected_affected_people"])
    households = int(scored["expected_households"])
    food = int(scored.get("food_rations_3d", 0))
    shelter = int(scored.get("shelter_kits", 0))
    water_l = int(scored.get("drinking_water_liters_3d", 0))

    rice_bags = _count(food / 3) if food else 0
    cans = _count(households * 0.5) if households else 0
    blankets = shelter
    cups = _count(water_l / 15) if water_l else 0
    oil = _count(water_l / 40) if water_l else 0
    tshirts = _count(people * 0.4) if people else 0
    male = _count(people * 0.3) if people else 0
    female = _count(people * 0.3) if people else 0
    fuel_mmk = _count(people * 2500) if people else 0

    specs: list[tuple[str, str | None, str, str, int]] = [
        ("foods", "rice", "Rice", "bag", rice_bags),
        ("foods", "can", "Can", "can", cans),
        ("utility", "blanket", "Blanket", "piece", blankets),
        ("utility", "cup", "Cup", "piece", cups),
        ("foods", "oil", "Oil", "bottle", oil),
        ("clothes", "tshirt", "T-shirt", "piece", tshirts),
        ("clothes", "m_cloth", "Men cloth", "piece", male),
        ("clothes", "f_cloth", "Women cloth", "piece", female),
        ("fund", None, "Fund", "mmk", fuel_mmk),
    ]
    items: list[AllocationLineItem] = []
    for category_code, item_code, name, unit, qty in specs:
        if qty <= 0:
            continue
        items.append(
            AllocationLineItem(
                category_code=category_code,
                item_code=item_code,
                name=name,
                unit=unit,
                requested=float(qty),
                allocated=0.0,
            )
        )
    return items
