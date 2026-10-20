"""Resource allocation planning: flood-help demand, warehouse stock, routes."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date
from typing import Any, Literal

import httpx
from sqlalchemy.orm import Session

from app.schemas.api import (
    AllocationLineItem,
    AllocationPlanRequest,
    AllocationPlanResponse,
    AllocationRouteSummary,
    AllocationShortage,
    AllocationTotals,
    AllocationTownshipRow,
    AllocationWarehouse,
    AssistancePriorityLevel,
)
from app.services import admin_areas, help_prediction, live_features, osrm
from app.services.geography import GeographyUnavailableError
from app.services.inventory import region_snapshot
from app.services.prediction import ModelUnavailableError

PRIORITY_WEIGHT: dict[str, int] = {
    "none": 0,
    "low": 1,
    "moderate": 2,
    "high": 3,
    "severe": 4,
}

ROUTE_LABELS = ("Route A", "Route B", "Route C")

WAREHOUSES: dict[str, AllocationWarehouse] = {
    "east": AllocationWarehouse(
        id="depot-bago",
        name="Bago depot (east)",
        region="east",
        latitude=17.335,
        longitude=96.481,
    ),
    "west": AllocationWarehouse(
        id="depot-pyay",
        name="Pyay depot (west)",
        region="west",
        latitude=18.817,
        longitude=95.217,
    ),
}


@dataclass(frozen=True)
class TownshipCatalog:
    id: str
    name_en: str
    latitude: float
    longitude: float


def _count(value: float) -> int:
    return int(max(0, round(float(value))))


def _meets_min_priority(priority: str, minimum: AssistancePriorityLevel) -> bool:
    return PRIORITY_WEIGHT.get(priority, 0) >= PRIORITY_WEIGHT[minimum]


def _line_items_from_help(scored: dict[str, Any]) -> list[AllocationLineItem]:
    people = int(scored["expected_affected_people"])
    households = int(scored["expected_households"])
    food = int(scored["food_rations_3d"])
    shelter = int(scored["shelter_kits"])
    water_l = int(scored["drinking_water_liters_3d"])

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


def _stock_key(category_code: str, item_code: str | None) -> tuple[str, str | None]:
    return category_code, item_code


def _available_stock(snapshot: dict[str, object]) -> dict[tuple[str, str | None], tuple[float, str, str]]:
    stock: dict[tuple[str, str | None], tuple[float, str, str]] = {}
    for klass in snapshot.get("classes", []):
        code = str(klass["code"])
        for item in klass.get("items", []):
            key = _stock_key(code, item.get("code"))
            stock[key] = (
                float(item["quantity"]),
                str(item["name"]),
                str(item["unit"]),
            )
    return stock


def _total_stock_units(stock: dict[tuple[str, str | None], tuple[float, str, str]]) -> float:
    return sum(row[0] for row in stock.values())


def _labels_from_items(items: list[AllocationLineItem]) -> tuple[str, str]:
    names = [item.name for item in items if item.requested > 0]
    qtys = [
        f"{_count(item.allocated)} {item.unit}"
        for item in items
        if item.allocated > 0
    ]
    return ", ".join(names) or "—", ", ".join(qtys) or "—"


async def _help_for_township(
    township: TownshipCatalog,
    planning_date: date,
) -> dict[str, Any] | None:
    try:
        observations = await live_features.load_observations(township.latitude, township.longitude)
        rows = live_features.features_on_or_after(
            observations,
            planning_date,
            township.id,
            township.latitude,
            township.longitude,
        )
    except (httpx.HTTPError, ValueError):
        return None
    if not rows:
        return None
    match = next((row for row in rows if row["date"] == planning_date), None)
    if match is None:
        match = max(
            rows,
            key=lambda row: float(row.get("rainfall_mm") or 0) + float(row.get("river_discharge_m3s") or 0),
        )
    try:
        scored = help_prediction.predict_help(
            {key: value for key, value in match.items() if key != "date"}
        )
    except ValueError:
        return None
    return scored


def _nearest_depot(latitude: float, longitude: float) -> Literal["east", "west"]:
    east = WAREHOUSES["east"]
    west = WAREHOUSES["west"]
    east_dist = (latitude - east.latitude) ** 2 + (longitude - east.longitude) ** 2
    west_dist = (latitude - west.latitude) ** 2 + (longitude - west.longitude) ** 2
    return "east" if east_dist <= west_dist else "west"


def _iter_townships(session: Session, township_ids: list[str] | None) -> list[TownshipCatalog]:
    try:
        payload = admin_areas.bago_areas(session)
    except GeographyUnavailableError as exc:
        raise GeographyUnavailableError(str(exc)) from exc
    catalog: list[TownshipCatalog] = []
    allowed = set(township_ids) if township_ids else None
    for district in payload["districts"]:
        for township in district["townships"]:
            if allowed is not None and township["id"] not in allowed:
                continue
            catalog.append(
                TownshipCatalog(
                    id=str(township["id"]),
                    name_en=str(township["name_en"]),
                    latitude=float(township["latitude"]),
                    longitude=float(township["longitude"]),
                )
            )
    return catalog


def _partition_routes(rows: list[AllocationTownshipRow]) -> list[tuple[str, list[AllocationTownshipRow]]]:
    if not rows:
        return []
    groups: list[list[AllocationTownshipRow]] = [[], [], []]
    for index, row in enumerate(rows):
        groups[index % 3].append(row)
    labeled: list[tuple[str, list[AllocationTownshipRow]]] = []
    for label, group in zip(ROUTE_LABELS, groups, strict=False):
        if group:
            labeled.append((label, group))
    return labeled


def _fallback_path(
    warehouse: AllocationWarehouse,
    stops: list[AllocationTownshipRow],
) -> list[dict[str, float]]:
    path = [{"latitude": warehouse.latitude, "longitude": warehouse.longitude}]
    path.extend({"latitude": row.latitude, "longitude": row.longitude} for row in stops)
    path.append({"latitude": warehouse.latitude, "longitude": warehouse.longitude})
    return path


async def _route_for_group(
    warehouse: AllocationWarehouse,
    route_id: str,
    stops: list[AllocationTownshipRow],
    depot_region: Literal["east", "west"],
) -> AllocationRouteSummary:
    if not stops:
        return AllocationRouteSummary(
            route_id=route_id, stop_count=0, path=[], depot_region=depot_region, plan=None
        )
    waypoints = [(warehouse.latitude, warehouse.longitude)]
    waypoints.extend((row.latitude, row.longitude) for row in stops)
    waypoints.append((warehouse.latitude, warehouse.longitude))
    path = await osrm.driving_path(waypoints)
    if path is None:
        path = _fallback_path(warehouse, stops)
    return AllocationRouteSummary(
        route_id=route_id,
        stop_count=len(stops),
        path=path,
        depot_region=depot_region,
        plan=None,
    )


def _allocate_from_stock(
    candidates: list[tuple[TownshipCatalog, dict[str, Any], list[AllocationLineItem], Literal["east", "west"]]],
    stock: dict[tuple[str, str | None], tuple[float, str, str]],
    remaining: dict[tuple[str, str | None], float],
) -> tuple[list[AllocationTownshipRow], float, dict[tuple[str, str | None], float]]:
    rows: list[AllocationTownshipRow] = []
    needed_units = 0.0
    for township, scored, items, depot_region in candidates:
        people = int(scored["expected_affected_people"])
        priority = str(scored["assistance_priority"])
        row_has_shortage = False
        for item in items:
            needed_units += item.requested
            key = _stock_key(item.category_code, item.item_code)
            available = remaining.get(key, 0.0)
            take = min(item.requested, available)
            item.allocated = take
            remaining[key] = available - take
            if take < item.requested:
                row_has_shortage = True
        resources_label, quantities_label = _labels_from_items(items)
        rows.append(
            AllocationTownshipRow(
                township_id=township.id,
                township_name=township.name_en,
                latitude=township.latitude,
                longitude=township.longitude,
                population=people,
                priority=priority,  # type: ignore[arg-type]
                resources_label=resources_label,
                quantities_label=quantities_label,
                line_items=items,
                route_id="",
                depot_region=depot_region,
                has_shortage=row_has_shortage,
            )
        )
    return rows, needed_units, remaining


def _shortages_for_depot(
    requested_totals: dict[tuple[str, str | None], float],
    stock: dict[tuple[str, str | None], tuple[float, str, str]],
    depot_region: Literal["east", "west"],
) -> list[AllocationShortage]:
    shortages: list[AllocationShortage] = []
    for key, requested in sorted(requested_totals.items()):
        available = stock.get(key, (0.0, key[0], "piece"))[0]
        unmet = max(0.0, requested - available)
        if unmet <= 0:
            continue
        name, unit = stock.get(key, (0.0, key[0], "piece"))[1], stock.get(key, (0.0, key[0], "piece"))[2]
        shortages.append(
            AllocationShortage(
                category_code=key[0],
                item_code=key[1],
                name=name,
                unit=unit,
                requested=requested,
                available=available,
                unmet=unmet,
                depot_region=depot_region,
            )
        )
    return shortages


async def build_allocation_plan(
    geo_session: Session,
    inventory_session: Session,
    request: AllocationPlanRequest,
) -> AllocationPlanResponse:
    try:
        help_prediction.load_help_model()
    except ModelUnavailableError as exc:
        raise ModelUnavailableError(str(exc)) from exc

    auto_depots = request.warehouse_region == "auto"
    depot_regions: tuple[Literal["east", "west"], ...]
    if auto_depots:
        depot_regions = ("east", "west")
    else:
        depot_regions = (request.warehouse_region,)

    stock_by_region: dict[str, dict[tuple[str, str | None], tuple[float, str, str]]] = {}
    remaining_by_region: dict[str, dict[tuple[str, str | None], float]] = {}
    for region in depot_regions:
        snapshot = region_snapshot(inventory_session, region)
        stock_by_region[region] = _available_stock(snapshot)
        remaining_by_region[region] = {key: value[0] for key, value in stock_by_region[region].items()}

    catalog = _iter_townships(geo_session, request.township_ids)
    scored_candidates: list[tuple[TownshipCatalog, dict[str, Any], list[AllocationLineItem]]] = []
    for township in catalog:
        scored = await _help_for_township(township, request.date)
        if scored is None:
            continue
        priority = str(scored["assistance_priority"])
        people = int(scored["expected_affected_people"])
        if not _meets_min_priority(priority, request.min_priority):
            continue
        if people <= 0 and not bool(scored.get("predicted_help")):
            continue
        items = _line_items_from_help(scored)
        if not items:
            continue
        scored_candidates.append((township, scored, items))

    scored_candidates.sort(
        key=lambda row: (
            -PRIORITY_WEIGHT.get(str(row[1]["assistance_priority"]), 0),
            -int(row[1]["expected_affected_people"]),
        )
    )

    by_depot: dict[str, list[tuple[TownshipCatalog, dict[str, Any], list[AllocationLineItem], Literal["east", "west"]]]] = {
        "east": [],
        "west": [],
    }
    for township, scored, items in scored_candidates:
        if auto_depots:
            depot = _nearest_depot(township.latitude, township.longitude)
        else:
            depot = request.warehouse_region  # type: ignore[assignment]
        by_depot[depot].append((township, scored, items, depot))

    allocated_rows: list[AllocationTownshipRow] = []
    affected = 0
    needed_units = 0.0
    shortages: list[AllocationShortage] = []

    for region in depot_regions:
        depot_candidates = by_depot[region]
        requested_totals: dict[tuple[str, str | None], float] = {}
        for _township, _scored, items, _depot in depot_candidates:
            for item in items:
                key = _stock_key(item.category_code, item.item_code)
                requested_totals[key] = requested_totals.get(key, 0.0) + item.requested

        rows, region_needed, remaining_by_region[region] = _allocate_from_stock(
            depot_candidates,
            stock_by_region[region],
            remaining_by_region[region],
        )
        for _township, scored, _items, _depot in depot_candidates:
            affected += int(scored["expected_affected_people"])
        needed_units += region_needed
        allocated_rows.extend(rows)
        shortages.extend(
            _shortages_for_depot(requested_totals, stock_by_region[region], region)
        )

    allocated_rows.sort(
        key=lambda row: (
            -PRIORITY_WEIGHT.get(str(row.priority), 0),
            -row.population,
        )
    )

    routes: list[AllocationRouteSummary] = []
    for region in depot_regions:
        warehouse = WAREHOUSES[region]
        region_rows = [row for row in allocated_rows if row.depot_region == region]
        route_groups = _partition_routes(region_rows)
        route_map = {row.township_id: label for label, group in route_groups for row in group}
        for row in region_rows:
            row.route_id = route_map.get(row.township_id, f"{region.title()} Route A")
        for label, group in route_groups:
            routes.append(await _route_for_group(warehouse, label, group, region))

    available_stock = sum(
        _total_stock_units(stock_by_region[region]) for region in depot_regions
    )
    warehouse = WAREHOUSES["east"] if auto_depots else WAREHOUSES[request.warehouse_region]
    warehouses = [WAREHOUSES[region] for region in depot_regions]

    model_version = "flood-help-v2"
    if scored_candidates:
        model_version = str(scored_candidates[0][1].get("model_version", model_version))

    return AllocationPlanResponse(
        plan_id=str(uuid.uuid4()),
        planning_date=request.date,
        warehouse=warehouse,
        warehouses=warehouses,
        totals=AllocationTotals(
            affected_population=affected,
            available_stock_units=available_stock,
            resources_needed_units=needed_units,
        ),
        rows=allocated_rows,
        shortages=shortages,
        routes=routes,
        model_version=model_version,
    )
