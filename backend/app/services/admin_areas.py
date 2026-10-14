"""Bago Region districts and townships.

Coordinates come from Open Admin Data. Membership follows the six districts
created for Bago Region on 30 April 2022: Bago, Nyaunglebin, Taungoo,
Thayarwady, Nattalin, and Pyay. Nyaunglebin was split from Bago. Nattalin was
split from Pyay and Thayarwady. Later sub-townships published by Open Admin
Data are left out. Htantabin is not in that API under Bago; its centroid is
the OpenStreetMap boundary for Htantabin Township, Taungoo District
(relation 5996628).
"""

from __future__ import annotations

import asyncio
from typing import Any
from urllib.parse import quote

import httpx

API_ROOT = "https://api.openadmindata.org/api/v1/mm"
BAGO_REGION_ID = "MMR007"
BAGO_REGION_SLUG = "bago-MMR007"
TIMEOUT_SECONDS = 20.0

# name_en, name_local, id used when Open Admin Data has no district, townships.
# Order matches the six-district Bago Region list.
BAGO_DIVISION: tuple[tuple[str, str, str, tuple[str, ...]], ...] = (
    ("Bago", "ပဲခူးခရိုင်", "MMR007D001", ("Bago", "Kawa", "Thanatpin", "Waw")),
    (
        "Nyaunglebin",
        "ညောင်လေးပင်ခရိုင်",
        "nyaunglebin",
        ("Nyaunglebin", "Kyauktaga", "Daik-U", "Shwegyin", "Kyaukkyi"),
    ),
    (
        "Taungoo",
        "တောင်ငူခရိုင်",
        "MMR007D002",
        ("Taungoo", "Oktwin", "Yedashe", "Pyu", "Htantabin"),
    ),
    (
        "Thayarwady",
        "သာယာဝတီခရိုင်",
        "MMR008D002",
        ("Thayarwady", "Letpadan", "Minhla", "Monyo", "Okpo", "Gyobingauk"),
    ),
    ("Nattalin", "နတ်တလင်းခရိုင်", "nattalin", ("Nattalin", "Zigon", "Thegon", "Paungde")),
    ("Pyay", "ပြည်ခရိုင်", "MMR008D001", ("Pyay", "Paukkaung", "Padaung", "Shwedaung")),
)
_NAME_ALIASES = {
    "phyu": "pyu",
    "paukkhaung": "paukkaung",
    "okpho": "okpo",
}
# OpenStreetMap relation 5996628: Htantabin Township, Taungoo District, Bago Region.
HTANTABIN_TOWNSHIP = {
    "id": "htantabin-taungoo",
    "slug": "htantabin-taungoo",
    "name_en": "Htantabin",
    "name_local": "ထန်းတပင်",
    "latitude": 18.736925,
    "longitude": 96.520799,
}

_cache: dict[str, Any] | None = None


def clear_cache() -> None:
    global _cache
    _cache = None


def _point(raw: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(raw["id"]),
        "slug": str(raw["slug"]),
        "name_en": str(raw["name_en"]),
        "name_local": str(raw["name_local"]),
        "latitude": float(raw["lat"]),
        "longitude": float(raw["lon"]),
    }


async def _get(client: httpx.AsyncClient, path: str) -> dict[str, Any]:
    response = await client.get(f"{API_ROOT}/{path}")
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, dict):
        raise ValueError("Invalid Open Admin Data response")
    return payload


def _name_key(name: str) -> str:
    compact = "".join(character for character in name.casefold() if character.isalnum())
    return _NAME_ALIASES.get(compact, compact)


def _district_center(townships: list[dict[str, Any]]) -> tuple[float, float]:
    latitude = sum(item["latitude"] for item in townships) / len(townships)
    longitude = sum(item["longitude"] for item in townships) / len(townships)
    return latitude, longitude


def regroup_bago_districts(api_districts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Place the 28 Bago townships into the 2022 six districts."""
    districts_by_name = {_name_key(item["name_en"]): item for item in api_districts}
    townships_by_name = {
        _name_key(township["name_en"]): township
        for district in api_districts
        for township in district["townships"]
    }
    grouped: list[dict[str, Any]] = []
    for district_name, name_local, fallback_id, township_names in BAGO_DIVISION:
        townships: list[dict[str, Any]] = []
        for township_name in township_names:
            found = townships_by_name.get(_name_key(township_name))
            if found is None and _name_key(township_name) == "htantabin":
                townships.append(dict(HTANTABIN_TOWNSHIP))
                continue
            if found is None:
                raise ValueError(f"Open Admin Data is missing {township_name} Township")
            townships.append({**found, "name_en": township_name})
        source = districts_by_name.get(_name_key(district_name))
        latitude, longitude = _district_center(townships)
        if source is None:
            grouped.append(
                {
                    "id": fallback_id,
                    "slug": fallback_id,
                    "name_en": district_name,
                    "name_local": name_local,
                    "latitude": latitude,
                    "longitude": longitude,
                    "townships": townships,
                }
            )
            continue
        grouped.append(
            {
                **source,
                "name_en": district_name,
                "name_local": name_local,
                "latitude": latitude,
                "longitude": longitude,
                "townships": townships,
            }
        )
    return grouped


async def load_bago_admin(client: httpx.AsyncClient) -> dict[str, Any]:
    region = await _get(client, f"region/{quote(BAGO_REGION_SLUG)}.json")
    entity = region["entity"]
    if entity.get("id") != BAGO_REGION_ID or region.get("children", {}).get("level") != "district":
        raise ValueError("Open Admin Data did not return Bago Region districts")

    district_rows = [
        item
        for item in region["children"]["entities"]
        if item.get("parent_id") == BAGO_REGION_ID
    ]
    details = await asyncio.gather(
        *[_get(client, f"district/{quote(str(item['slug']))}.json") for item in district_rows]
    )

    districts: list[dict[str, Any]] = []
    for detail in details:
        district = detail["entity"]
        children = detail.get("children", {})
        if district.get("parent_id") != BAGO_REGION_ID or children.get("level") != "township":
            raise ValueError("Open Admin Data returned a non-Bago district")
        townships = [
            _point(item)
            for item in children["entities"]
            if item.get("parent_id") == district["id"]
        ]
        districts.append({**_point(district), "townships": townships})

    return {
        "source": "Open Admin Data",
        "region_id": BAGO_REGION_ID,
        "region_name_en": "Bago",
        "region_name_local": str(entity["name_local"]),
        "latitude": float(entity["lat"]),
        "longitude": float(entity["lon"]),
        "districts": regroup_bago_districts(districts),
    }


async def bago_areas() -> dict[str, Any]:
    global _cache
    if _cache is None:
        async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
            _cache = await load_bago_admin(client)
    return _cache
