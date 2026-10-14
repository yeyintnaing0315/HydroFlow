import math
from datetime import date

from app.services import clients

DailyObservation = tuple[date, float, float]


async def load_observations(latitude: float, longitude: float) -> list[DailyObservation]:
    """Join Open-Meteo rainfall with GloFAS discharge. Days missing either value are omitted."""
    rainfall, discharge = await _fetch_pair(latitude, longitude)
    discharge_by_day = {day: value for day, value in discharge if value is not None}
    observations = [
        (day, rain, discharge_by_day[day])
        for day, rain in rainfall
        if rain is not None and day in discharge_by_day
    ]
    if not observations:
        raise ValueError("Weather APIs returned no complete rainfall and discharge days")
    return sorted(observations)


async def _fetch_pair(latitude: float, longitude: float):
    import asyncio

    return await asyncio.gather(
        clients.open_meteo_daily_precipitation(latitude, longitude),
        clients.glofas_daily_discharge(latitude, longitude),
    )


def features_on_or_after(
    observations: list[DailyObservation],
    start: date,
    township_id: str,
    latitude: float,
    longitude: float,
) -> list[dict[str, float | str | date]]:
    """Build model rows for the start date and every later API day. Earlier days are context only."""
    ordered = sorted(observations)
    rows: list[dict[str, float | str | date]] = []
    for index, (day, rain, discharge) in enumerate(ordered):
        if day < start:
            continue
        rain_window = [item[1] for item in ordered[max(0, index - 6) : index + 1]]
        discharge_window = [item[2] for item in ordered[max(0, index - 2) : index + 1]]
        previous_rain = ordered[index - 1][1] if index else 0.0
        previous_discharge = ordered[index - 1][2] if index else 0.0
        day_number = day.timetuple().tm_yday
        rows.append(
            {
                "date": day,
                "rainfall_mm": rain,
                "river_discharge_m3s": discharge,
                "rainfall_3d_mm": sum(rain_window[-3:]),
                "rainfall_7d_mm": sum(rain_window),
                "rainfall_lag_1d_mm": previous_rain,
                "discharge_lag_1d_m3s": previous_discharge,
                "discharge_delta_1d_m3s": discharge - previous_discharge,
                "discharge_3d_mean_m3s": sum(discharge_window) / len(discharge_window),
                "day_of_year_sin": math.sin(2 * math.pi * day_number / 365.25),
                "day_of_year_cos": math.cos(2 * math.pi * day_number / 365.25),
                "lat": latitude,
                "lng": longitude,
                "township_id": township_id,
            }
        )
    if not rows:
        raise ValueError("Selected date is outside the API forecast window")
    return rows
