from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class Coordinates(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class PredictRequest(Coordinates):
    date: date
    township_id: str = Field(min_length=1, max_length=80)


class PredictResponse(BaseModel):
    flood_probability: float = Field(ge=0, le=1)
    predicted_flood: bool
    threshold: float = Field(ge=0, le=1)
    model_version: str
    alert_recorded: bool


class RiskResponse(BaseModel):
    score: float
    level: Literal["low", "moderate", "high", "severe"]
    label: Literal["academic prototype; not an operational warning"] = (
        "academic prototype; not an operational warning"
    )


class ForecastPoint(BaseModel):
    timestamp: datetime
    precipitation_mm: float | None = None
    temperature_c: float | None = None
    discharge_m3_s: float | None = None


class ForecastResponse(Coordinates):
    points: list[ForecastPoint]


class AlertCreate(BaseModel):
    location_id: int
    issued_at: datetime
    level: Literal["low", "moderate", "high", "severe"]
    message: str = Field(min_length=1, max_length=500)


class AlertResponse(AlertCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    source: str


class HistoricalPoint(BaseModel):
    date: date
    precipitation_mm: float | None = None
    temperature_c: float | None = None
    relative_humidity_pct: float | None = None


class HistoricalResponse(Coordinates):
    points: list[HistoricalPoint]


class FloodHistoryRecord(BaseModel):
    date: date
    township_id: str
    township: str
    latitude: float
    longitude: float
    households: int | None = None
    affected_people: int | None = None
    impact_severity: Literal["none", "low", "moderate", "high", "severe"]


class OutlookDay(BaseModel):
    date: date
    precipitation_mm: float
    discharge_m3_s: float
    flood_probability: float = Field(ge=0, le=1)
    predicted_flood: bool
    risk_score: float
    risk_level: Literal["low", "moderate", "high", "severe"]
    alert_recorded: bool


class OutlookResponse(BaseModel):
    township_id: str
    source: Literal["Open-Meteo rainfall and GloFAS discharge"] = (
        "Open-Meteo rainfall and GloFAS discharge"
    )
    model_version: str
    days: list[OutlookDay]


class TownshipResponse(BaseModel):
    township_id: str
    township: str
    latitude: float
    longitude: float


class AdminTownship(BaseModel):
    id: str
    slug: str
    name_en: str
    name_local: str
    latitude: float
    longitude: float


class AdminDistrict(AdminTownship):
    townships: list[AdminTownship]


class BagoAreasResponse(BaseModel):
    source: Literal["Open Admin Data"] = "Open Admin Data"
    region_id: Literal["MMR007"] = "MMR007"
    region_name_en: Literal["Bago"] = "Bago"
    region_name_local: str
    latitude: float
    longitude: float
    districts: list[AdminDistrict]


class FloodHistoryResponse(BaseModel):
    source: Literal["Bago relief records"] = "Bago relief records"
    disclaimer: Literal["Recorded impacts, not model predictions."] = (
        "Recorded impacts, not model predictions."
    )
    matched_records: int
    records: list[FloodHistoryRecord]


class HelpDay(BaseModel):
    date: date
    help_probability: float = Field(ge=0, le=1)
    predicted_help: bool
    expected_affected_people: int = Field(ge=0)
    expected_households: int = Field(ge=0)
    assistance_priority: Literal["none", "low", "moderate", "high", "severe"]
    shelter_kits: int = Field(ge=0)
    food_rations_3d: int = Field(ge=0)
    drinking_water_liters_3d: int = Field(ge=0)


class HelpResponse(BaseModel):
    township_id: str
    source: Literal["Open-Meteo rainfall and GloFAS discharge"] = (
        "Open-Meteo rainfall and GloFAS discharge"
    )
    model_version: str
    disclaimer: Literal[
        "Academic planning aid. Not an operational humanitarian response plan."
    ] = "Academic planning aid. Not an operational humanitarian response plan."
    days: list[HelpDay]


class TopographyResponse(BaseModel):
    latitude: float
    longitude: float
    elevation_m: float
    dataset: str
    vertical_datum: Literal["EGM2008"] = "EGM2008"
    vertical_datum_epsg: str
    unit: Literal["Meters"] = "Meters"
    source: Literal["OpenTopography Copernicus GLO-30"] = "OpenTopography Copernicus GLO-30"
    note: Literal[
        "Surface elevation at the requested point. The flood model does not use this value."
    ] = "Surface elevation at the requested point. The flood model does not use this value."


class RouteStop(BaseModel):
    id: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=120)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class RoutePlanRequest(BaseModel):
    origin: RouteStop
    stops: list[RouteStop] = Field(min_length=1, max_length=12)
    vehicle_profile: Literal["car", "truck", "fly"] = "car"
    service_minutes: int = Field(default=15, ge=0, le=180)
    return_to_origin: bool = True


class RouteWaypoint(BaseModel):
    stop_id: str
    name: str
    latitude: float
    longitude: float
    arrival_time: datetime | None = None
    kind: str


class RoutePlanResponse(BaseModel):
    plan_id: str
    agency_id: str | None = None
    state: str
    vehicle_profile: Literal["car", "truck", "fly"]
    distance_km: float | None = None
    duration: str | None = None
    duration_minutes: float | None = None
    waypoints: list[RouteWaypoint]
    path: list[Coordinates]
    unaffected_stop_ids: list[str]
    disclaimer: Literal[
        "Academic route illustration from Kardinal. Not an operational dispatch plan."
    ] = "Academic route illustration from Kardinal. Not an operational dispatch plan."
    assumptions: list[str]


class SexCount(BaseModel):
    total: int = Field(ge=0)
    male: int = Field(ge=0)
    female: int = Field(ge=0)


class ResidencePopulation(BaseModel):
    total: SexCount
    urban: SexCount
    rural: SexCount


class AgeGroup(BaseModel):
    label: str
    min_age: int = Field(ge=0)
    max_age: int | None = None
    total: SexCount
    urban: SexCount
    rural: SexCount


class HouseholdSizeBucket(BaseModel):
    size: str
    households: int = Field(ge=0)


class DwellingCount(BaseModel):
    total: int = Field(ge=0)
    apartment: int = Field(ge=0)
    brick: int = Field(ge=0)
    semi_brick: int = Field(ge=0)
    wooden: int = Field(ge=0)
    bamboo: int = Field(ge=0)
    hut: int = Field(ge=0)
    other: int = Field(ge=0)


class HouseholdSituation(BaseModel):
    total: int = Field(ge=0)
    by_size: list[HouseholdSizeBucket]
    by_dwelling: DwellingCount


class DwellingType(BaseModel):
    key: str
    name_local: str
    name_en: str


class TownshipCensus(BaseModel):
    name_en: str
    name_local: str
    population: SexCount
    households: HouseholdSituation


class DistrictCensus(BaseModel):
    name_en: str
    name_local: str
    population: SexCount
    age_groups: list[AgeGroup]
    households: HouseholdSituation
    townships: list[TownshipCensus]


class RegionHouseholds(HouseholdSituation):
    urban_dwellings: DwellingCount
    rural_dwellings: DwellingCount


class CensusResponse(BaseModel):
    source: Literal["2024 Population and Housing Census, Bago Region tables"] = (
        "2024 Population and Housing Census, Bago Region tables"
    )
    source_file: str
    census_year: Literal[2024] = 2024
    region_name_en: Literal["Bago"] = "Bago"
    region_name_local: str
    notes: list[str]
    dwelling_types: list[DwellingType]
    population: ResidencePopulation
    age_groups: list[AgeGroup]
    households: RegionHouseholds
    districts: list[DistrictCensus]


class HelpBriefResponse(BaseModel):
    source: Literal["Bago relief records"] = "Bago relief records"
    disclaimer: Literal["Recorded impacts, not flood-help model predictions."] = (
        "Recorded impacts, not flood-help model predictions."
    )
    recorded_flood_days: int
    recorded_households: int
    recorded_affected_people: int
    townships_with_impact: int
    highest_impacts: list[FloodHistoryRecord]
