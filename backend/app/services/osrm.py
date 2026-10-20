"""Driving paths from the public OSRM router (OpenStreetMap road network)."""

from __future__ import annotations

import httpx

OSRM_ROOT = "https://router.project-osrm.org"
TIMEOUT_SECONDS = 25.0


async def driving_path(
    points: list[tuple[float, float]],
) -> list[dict[str, float]] | None:
    """Return lat/lon points along the road from OSRM, or None if routing fails."""
    if len(points) < 2:
        return None
    coordinate_path = ";".join(f"{lon:.6f},{lat:.6f}" for lat, lon in points)
    url = (
        f"{OSRM_ROOT}/route/v1/driving/{coordinate_path}"
        "?overview=full&geometries=geojson&steps=false"
    )
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
            response = await client.get(url)
            response.raise_for_status()
            payload = response.json()
    except (httpx.HTTPError, ValueError, KeyError, TypeError):
        return None
    if payload.get("code") != "Ok":
        return None
    routes = payload.get("routes")
    if not routes:
        return None
    geometry = routes[0].get("geometry")
    if not isinstance(geometry, dict) or geometry.get("type") != "LineString":
        return None
    coords = geometry.get("coordinates")
    if not isinstance(coords, list):
        return None
    path: list[dict[str, float]] = []
    for pair in coords:
        if not isinstance(pair, (list, tuple)) or len(pair) < 2:
            continue
        lon, lat = float(pair[0]), float(pair[1])
        path.append({"latitude": lat, "longitude": lon})
    return path or None
