import type {
  AdminHierarchyResponse,
  Alert,
  AllocationPlanRequest,
  AllocationPlanResponse,
  BagoAreasResponse,
  CensusResponse,
  FloodHistoryResponse,
  ForecastResponse,
  HealthResponse,
  HelpBriefResponse,
  HelpResponse,
  HistoricalResponse,
  InundationProduct,
  InventoryDetection,
  InventoryEntry,
  InventorySnapshot,
  JobRun,
  OfficialWarning,
  OutlookResponse,
  PredictionMapScoresResponse,
  PredictionTimelineInput,
  PredictionTimelineResponse,
  PredictInput,
  PredictResponse,
  RiskResult,
  RoutePlanRequest,
  RoutePlanResponse,
  SettlementPoint,
  SourceStatus,
  TopographyResponse,
  Township,
} from "./types";

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "/api";

import { formatApiDetail } from "./lib/formatError";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`.trim();
    try {
      const body = (await response.json()) as { detail?: unknown };
      if (body.detail !== undefined) {
        detail = formatApiDetail(body.detail);
      }
    } catch {
      // Keep the HTTP status when the server does not return JSON.
    }
    throw new ApiError(detail, response.status);
  }
  return response.json() as Promise<T>;
}

function query(latitude: number, longitude: number): string {
  return new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
  }).toString();
}

function recentHistoryQuery(latitude: number, longitude: number): string {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(end.getUTCDate() - 5);
  end.setUTCDate(end.getUTCDate() - 1);
  return new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  }).toString();
}

export const api = {
  health: () => request<HealthResponse>("/health"),
  predict: (input: PredictInput) =>
    request<PredictResponse>("/predict", { method: "POST", body: JSON.stringify(input) }),
  outlook: (input: PredictInput) =>
    request<OutlookResponse>("/outlook", { method: "POST", body: JSON.stringify(input) }),
  predictionTimeline: (input: PredictionTimelineInput) =>
    request<PredictionTimelineResponse>("/prediction/timeline", {
      method: "POST",
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(180_000),
    }),
  predictionCalendarBounds: () =>
    request<{
      history_start: string;
      history_end: string;
      forecast_end: string;
      select_max: string;
    }>("/prediction/calendar-bounds"),
  predictionMapScores: (date: string, districtId?: string) => {
    const params = new URLSearchParams({ date });
    if (districtId) params.set("district_id", districtId);
    return request<PredictionMapScoresResponse>(`/prediction/map-scores?${params}`);
  },
  help: (input: PredictInput) =>
    request<HelpResponse>("/help", { method: "POST", body: JSON.stringify(input) }),
  helpBrief: () => request<HelpBriefResponse>("/help-brief?limit=5"),
  allocationPlan: (input: AllocationPlanRequest) =>
    request<AllocationPlanResponse>("/allocation/plan", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  townships: () => request<Township[]>("/townships"),
  bagoAreas: () => request<BagoAreasResponse>("/bago-areas"),
  census: () => request<CensusResponse>("/census"),
  forecast: (latitude: number, longitude: number) =>
    request<ForecastResponse>(`/forecast?${query(latitude, longitude)}`),
  topography: (latitude: number, longitude: number) =>
    request<TopographyResponse>(`/topography?${query(latitude, longitude)}`),
  alerts: () => request<Alert[]>("/alerts"),
  historical: (
    latitude: number,
    longitude: number,
    start?: string,
    end?: string,
    townshipId?: string,
  ) => {
    const params = new URLSearchParams(
      start && end
        ? {
            latitude: String(latitude),
            longitude: String(longitude),
            start,
            end,
          }
        : Object.fromEntries(new URLSearchParams(recentHistoryQuery(latitude, longitude))),
    );
    if (townshipId) params.set("township_id", townshipId);
    return request<HistoricalResponse>(`/historical?${params}`);
  },
  floodHistory: () => request<FloodHistoryResponse>("/flood-history?limit=8"),
  planRoute: (input: RoutePlanRequest) =>
    request<RoutePlanResponse>("/routes", { method: "POST", body: JSON.stringify(input) }),
  sources: () => request<SourceStatus[]>("/sources"),
  officialWarnings: () => request<OfficialWarning[]>("/official-warnings"),
  runs: () => request<JobRun[]>("/runs"),
  riskResults: () => request<RiskResult[]>("/risk-results"),
  inundationProducts: () => request<InundationProduct[]>("/inundation-products"),
  runPrediction: (adminKey: string) =>
    request<JobRun>("/runs/prediction", {
      method: "POST",
      headers: { "X-Admin-Key": adminKey },
    }),
  adminAreas: (search?: string, includeGeometry = false) => {
    const query = new URLSearchParams({ max_level: "5" });
    if (search) query.set("search", search);
    if (includeGeometry) query.set("include_geometry", "true");
    return request<AdminHierarchyResponse>(`/admin-areas?${query}`);
  },
  inventory: (region: "east" | "west") => request<InventorySnapshot>(`/inventory/${region}`),
  addInventory: (region: "east" | "west", entry: InventoryEntry) =>
    request<InventorySnapshot>(`/inventory/${region}/entries`, {
      method: "POST",
      body: JSON.stringify(entry),
    }),
  detectInventory: (categoryCode: string, image: Blob) => {
    const body = new FormData();
    body.append("category_code", categoryCode);
    body.append("image", image, "capture.jpg");
    return request<InventoryDetection>("/inventory/detect", { method: "POST", body });
  },
  settlements: (adminAreaCode?: string) => {
    const query = new URLSearchParams({ limit: "5000" });
    if (adminAreaCode) query.set("admin_area_code", adminAreaCode);
    return request<SettlementPoint[]>(`/settlements?${query}`);
  },
};
