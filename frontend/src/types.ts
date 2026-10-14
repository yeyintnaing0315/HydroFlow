export type LoadState = "loading" | "ready" | "empty" | "error";
export type RiskLevel = "low" | "moderate" | "high" | "severe";

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface PredictInput extends Coordinates {
  date: string;
  township_id: string;
}

export interface Township extends Coordinates {
  township_id: string;
  township: string;
}

export interface AdminTownship extends Coordinates {
  id: string;
  slug: string;
  name_en: string;
  name_local: string;
}

export interface AdminDistrict extends AdminTownship {
  townships: AdminTownship[];
}

export interface BagoAreasResponse extends Coordinates {
  source: string;
  region_id: string;
  region_name_en: string;
  region_name_local: string;
  districts: AdminDistrict[];
}

export interface OutlookDay {
  date: string;
  precipitation_mm: number;
  discharge_m3_s: number;
  flood_probability: number;
  predicted_flood: boolean;
  risk_score: number;
  risk_level: RiskLevel;
  alert_recorded: boolean;
}

export interface OutlookResponse {
  township_id: string;
  source: string;
  model_version: string;
  days: OutlookDay[];
}

export interface HealthResponse {
  status: string;
  service: string;
  version: string;
}

export interface PredictResponse {
  flood_probability: number;
  predicted_flood: boolean;
  threshold: number;
  model_version: string;
  alert_recorded: boolean;
}

export interface RiskResponse {
  score: number;
  level: RiskLevel;
  label: string;
}

export interface ForecastPoint {
  timestamp: string;
  precipitation_mm?: number | null;
  temperature_c?: number | null;
  discharge_m3_s?: number | null;
}

export interface ForecastResponse extends Coordinates {
  points: ForecastPoint[];
}

export interface TopographyResponse extends Coordinates {
  elevation_m: number;
  dataset: string;
  vertical_datum: string;
  vertical_datum_epsg: string;
  unit: string;
  source: string;
  note: string;
}

export interface Alert {
  id: number;
  location_id: number;
  issued_at: string;
  level: RiskLevel;
  message: string;
  source: string;
}

export interface HistoricalPoint {
  date: string;
  precipitation_mm?: number | null;
  temperature_c?: number | null;
  relative_humidity_pct?: number | null;
}

export interface HistoricalResponse extends Coordinates {
  points: HistoricalPoint[];
}

export interface FloodHistoryRecord {
  date: string;
  township_id: string;
  township: string;
  latitude: number;
  longitude: number;
  households?: number | null;
  affected_people?: number | null;
  impact_severity: "none" | RiskLevel;
}

export interface FloodHistoryResponse {
  source: string;
  disclaimer: string;
  matched_records: number;
  records: FloodHistoryRecord[];
}

export type AssistancePriority = "none" | RiskLevel;

export interface HelpDay {
  date: string;
  help_probability: number;
  predicted_help: boolean;
  expected_affected_people: number;
  expected_households: number;
  assistance_priority: AssistancePriority;
  shelter_kits: number;
  food_rations_3d: number;
  drinking_water_liters_3d: number;
}

export interface HelpResponse {
  township_id: string;
  source: string;
  model_version: string;
  disclaimer: string;
  days: HelpDay[];
}

export interface RouteStop {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

export interface RoutePlanRequest {
  origin: RouteStop;
  stops: RouteStop[];
  vehicle_profile: "car" | "truck" | "fly";
  service_minutes: number;
  return_to_origin: boolean;
}

export interface RouteWaypoint extends Coordinates {
  stop_id: string;
  name: string;
  arrival_time?: string | null;
  kind: string;
}

export interface RoutePlanResponse {
  plan_id: string;
  agency_id?: string | null;
  state: string;
  vehicle_profile: "car" | "truck" | "fly";
  distance_km?: number | null;
  duration?: string | null;
  duration_minutes?: number | null;
  waypoints: RouteWaypoint[];
  path: Coordinates[];
  unaffected_stop_ids: string[];
  disclaimer: string;
  assumptions: string[];
}

export interface SexCount {
  total: number;
  male: number;
  female: number;
}

export interface CensusAgeGroup {
  label: string;
  min_age: number;
  max_age: number | null;
  total: SexCount;
  urban: SexCount;
  rural: SexCount;
}

export interface HouseholdSizeBucket {
  size: string;
  households: number;
}

export interface DwellingCount {
  total: number;
  apartment: number;
  brick: number;
  semi_brick: number;
  wooden: number;
  bamboo: number;
  hut: number;
  other: number;
}

export interface HouseholdSituation {
  total: number;
  by_size: HouseholdSizeBucket[];
  by_dwelling: DwellingCount;
}

export interface DwellingTypeLabel {
  key: keyof Omit<DwellingCount, "total">;
  name_local: string;
  name_en: string;
}

export interface TownshipCensus {
  name_en: string;
  name_local: string;
  population: SexCount;
  households: HouseholdSituation;
}

export interface DistrictCensus {
  name_en: string;
  name_local: string;
  population: SexCount;
  age_groups: CensusAgeGroup[];
  households: HouseholdSituation;
  townships: TownshipCensus[];
}

export interface CensusResponse {
  source: string;
  source_file: string;
  census_year: number;
  region_name_en: string;
  region_name_local: string;
  notes: string[];
  dwelling_types: DwellingTypeLabel[];
  population: { total: SexCount; urban: SexCount; rural: SexCount };
  age_groups: CensusAgeGroup[];
  households: HouseholdSituation & {
    urban_dwellings: DwellingCount;
    rural_dwellings: DwellingCount;
  };
  districts: DistrictCensus[];
}

export interface HelpBriefResponse {
  source: string;
  disclaimer: string;
  recorded_flood_days: number;
  recorded_households: number;
  recorded_affected_people: number;
  townships_with_impact: number;
  highest_impacts: FloodHistoryRecord[];
}
