import type {
  Alert,
  BagoAreasResponse,
  CensusResponse,
  FloodHistoryResponse,
  ForecastResponse,
  HealthResponse,
  TopographyResponse,
  HelpBriefResponse,
  HelpResponse,
  HistoricalResponse,
  OutlookResponse,
  PredictInput,
  PredictResponse,
  RoutePlanRequest,
  RoutePlanResponse,
  Township,
} from "./types";

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "/api";

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
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`.trim();
    try {
      const body = (await response.json()) as { detail?: string };
      detail = body.detail ?? detail;
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
  start.setUTCDate(end.getUTCDate() - 7);
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
  help: (input: PredictInput) =>
    request<HelpResponse>("/help", { method: "POST", body: JSON.stringify(input) }),
  helpBrief: () => request<HelpBriefResponse>("/help-brief?limit=5"),
  townships: () => request<Township[]>("/townships"),
  bagoAreas: () => request<BagoAreasResponse>("/bago-areas"),
  census: () => request<CensusResponse>("/census"),
  forecast: (latitude: number, longitude: number) =>
    request<ForecastResponse>(`/forecast?${query(latitude, longitude)}`),
  topography: (latitude: number, longitude: number) =>
    request<TopographyResponse>(`/topography?${query(latitude, longitude)}`),
  alerts: () => request<Alert[]>("/alerts"),
  historical: (latitude: number, longitude: number) =>
    request<HistoricalResponse>(`/historical?${recentHistoryQuery(latitude, longitude)}`),
  floodHistory: () => request<FloodHistoryResponse>("/flood-history?limit=8"),
  planRoute: (input: RoutePlanRequest) =>
    request<RoutePlanResponse>("/routes", { method: "POST", body: JSON.stringify(input) }),
};
