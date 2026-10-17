import { FormEvent, useEffect, useMemo, useState } from "react";
import { CircleMarker, GeoJSON, MapContainer, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import type { GeoJsonObject } from "geojson";
import { api } from "./api";
import HumanitarianDashboard from "./HumanitarianDashboard";
import type {
  AdminArea,
  AdminHierarchyResponse,
  AdminDistrict,
  Alert,
  BagoAreasResponse,
  FloodHistoryResponse,
  ForecastResponse,
  HealthResponse,
  HistoricalResponse,
  InundationProduct,
  JobRun,
  LoadState,
  OfficialWarning,
  OutlookResponse,
  RiskResult,
  RoutePlanResponse,
  SourceStatus,
  SettlementPoint,
  TopographyResponse,
} from "./types";

const DISTRICT_COLOR: Record<string, string> = {
  MMR007D001: "#0b5873",
  nyaunglebin: "#2d9c6c",
  MMR007D002: "#16827d",
  MMR008D002: "#d86a1a",
  nattalin: "#7a4ea3",
  MMR008D001: "#c49212",
  "MOHA2022-BAGO": "#0b5873",
  "MOHA2022-NYAUNGLEBIN": "#2d9c6c",
  "MOHA2022-TAUNGOO": "#16827d",
  "MOHA2022-THAYARWADY": "#d86a1a",
  "MOHA2022-NATTALIN": "#7a4ea3",
  "MOHA2022-PYAY": "#c49212",
};

function districtColor(id: string): string {
  return DISTRICT_COLOR[id] ?? "#5d727c";
}

function riskColor(level: string): string {
  return { low: "#2d9c6c", moderate: "#c49212", high: "#d86a1a", severe: "#a83232" }[level] ?? "#5d727c";
}

function preferredTownshipId(districts: AdminDistrict[]): string {
  const bagoDistrict = districts.find((district) => district.name_en === "Bago");
  const bagoTownship = bagoDistrict?.townships.find((township) => township.name_en === "Bago");
  return bagoTownship?.id ?? districts[0]?.townships[0]?.id ?? "";
}

function FitPoints({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length > 0) map.fitBounds(points, { padding: [24, 24], maxZoom: 13 });
  }, [map, points]);
  return null;
}

interface Resource<T> {
  state: LoadState;
  data?: T;
  error?: string;
}

const loading = <T,>(): Resource<T> => ({ state: "loading" });
const errorText = (reason: unknown) =>
  reason instanceof Error ? reason.message : "Unexpected request failure";
const formatDateTime = (value: string | Date) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
const valueOrDash = (value: number | null | undefined, suffix: string) =>
  value == null ? "—" : `${value.toLocaleString()} ${suffix}`;

function initialStartDate(): string {
  const day = new Date();
  day.setUTCDate(day.getUTCDate() - 7);
  return day.toISOString().slice(0, 10);
}

function localToday(): string {
  const shifted = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 10);
}

function previousFiveDays(asOf: string): { start: string; end: string } {
  const end = new Date(`${asOf}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(end.getUTCDate() - 4);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

const PREDICTION_SLOTS = ["06:00", "12:00", "18:00"] as const;
type PredictionSlot = (typeof PREDICTION_SLOTS)[number];

function currentPredictionSlot(): PredictionSlot {
  const mmt = new Date(Date.now() + (6 * 60 + 30) * 60_000);
  const hour = mmt.getUTCHours();
  if (hour >= 18) return "18:00";
  if (hour >= 12) return "12:00";
  return "06:00";
}

function StateMessage({ resource, empty }: { resource: Resource<unknown>; empty: string }) {
  if (resource.state === "loading") return <p className="state">Loading…</p>;
  if (resource.state === "error")
    return <p className="state error">Unavailable: {resource.error}</p>;
  if (resource.state === "empty") return <p className="state">{empty}</p>;
  return null;
}

function App() {
  const [health, setHealth] = useState<Resource<HealthResponse>>(loading);
  const [forecast, setForecast] = useState<Resource<ForecastResponse>>(loading);
  const [alerts, setAlerts] = useState<Resource<Alert[]>>(loading);
  const [historical, setHistorical] = useState<Resource<HistoricalResponse>>(loading);
  const [topography, setTopography] = useState<Resource<TopographyResponse>>(loading);
  const [floodHistory, setFloodHistory] = useState<Resource<FloodHistoryResponse>>(loading);
  const [areas, setAreas] = useState<Resource<BagoAreasResponse>>(loading);
  const [hierarchy, setHierarchy] = useState<Resource<AdminHierarchyResponse>>(loading);
  const [sources, setSources] = useState<Resource<SourceStatus[]>>(loading);
  const [officialWarnings, setOfficialWarnings] = useState<Resource<OfficialWarning[]>>(loading);
  const [runs, setRuns] = useState<Resource<JobRun[]>>(loading);
  const [riskResults, setRiskResults] = useState<Resource<RiskResult[]>>(loading);
  const [inundation, setInundation] = useState<Resource<InundationProduct[]>>(loading);
  const [settlements, setSettlements] = useState<Resource<SettlementPoint[]>>(loading);
  const [selectedTownship, setSelectedTownship] = useState("");
  const [districtFilter, setDistrictFilter] = useState("all");
  const [placeSearch, setPlaceSearch] = useState("");
  const [selectedLevel4, setSelectedLevel4] = useState("");
  const [selectedLevel5, setSelectedLevel5] = useState("");
  const [selectedBoundary, setSelectedBoundary] = useState<AdminArea>();
  const [startDate, setStartDate] = useState(initialStartDate);
  const [predictionSlot, setPredictionSlot] = useState<PredictionSlot>(currentPredictionSlot);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [outlook, setOutlook] = useState<Resource<OutlookResponse>>({ state: "empty" });
  const [routeStops, setRouteStops] = useState<string[]>([]);
  const [vehicleProfile, setVehicleProfile] = useState<"car" | "truck" | "fly">("car");
  const [serviceMinutes, setServiceMinutes] = useState(15);
  const [returnToOrigin, setReturnToOrigin] = useState(true);
  const [route, setRoute] = useState<Resource<RoutePlanResponse>>({ state: "empty" });
  const [updatedAt, setUpdatedAt] = useState<Date>();
  const [sector, setSector] = useState<"research" | "humanitarian">("research");
  const [adminKey, setAdminKey] = useState("");
  const [manualRun, setManualRun] = useState<Resource<JobRun>>({ state: "empty" });

  useEffect(() => {
    let active = true;
    const load = async () => {
      const results = await Promise.allSettled([
        api.health(),
        api.alerts(),
        api.floodHistory(),
        api.bagoAreas(),
        api.sources(),
        api.officialWarnings(),
        api.runs(),
        api.riskResults(),
        api.inundationProducts(),
        api.adminAreas(),
        api.settlements(),
      ]);
      if (!active) return;

      const [
        healthResult,
        alertsResult,
        floodHistoryResult,
        areasResult,
        sourcesResult,
        warningsResult,
        runsResult,
        riskResult,
        inundationResult,
        hierarchyResult,
        settlementsResult,
      ] = results;
      setHealth(
        healthResult.status === "fulfilled"
          ? { state: "ready", data: healthResult.value }
          : { state: "error", error: errorText(healthResult.reason) },
      );
      setAlerts(
        alertsResult.status === "fulfilled"
          ? {
              state: alertsResult.value.length ? "ready" : "empty",
              data: alertsResult.value,
            }
          : { state: "error", error: errorText(alertsResult.reason) },
      );
      setFloodHistory(
        floodHistoryResult.status === "fulfilled"
          ? {
              state: floodHistoryResult.value.records.length ? "ready" : "empty",
              data: floodHistoryResult.value,
            }
          : { state: "error", error: errorText(floodHistoryResult.reason) },
      );
      if (areasResult.status === "fulfilled") {
        setAreas({ state: "ready", data: areasResult.value });
        setSelectedTownship((current) => current || preferredTownshipId(areasResult.value.districts));
      } else {
        setAreas({ state: "error", error: errorText(areasResult.reason) });
        setForecast({ state: "empty" });
        setHistorical({ state: "empty" });
      }
      setSources(
        sourcesResult.status === "fulfilled"
          ? { state: sourcesResult.value.length ? "ready" : "empty", data: sourcesResult.value }
          : { state: "error", error: errorText(sourcesResult.reason) },
      );
      setOfficialWarnings(
        warningsResult.status === "fulfilled"
          ? { state: warningsResult.value.length ? "ready" : "empty", data: warningsResult.value }
          : { state: "error", error: errorText(warningsResult.reason) },
      );
      setRuns(
        runsResult.status === "fulfilled"
          ? { state: runsResult.value.length ? "ready" : "empty", data: runsResult.value }
          : { state: "error", error: errorText(runsResult.reason) },
      );
      setRiskResults(
        riskResult.status === "fulfilled"
          ? { state: riskResult.value.length ? "ready" : "empty", data: riskResult.value }
          : { state: "error", error: errorText(riskResult.reason) },
      );
      setInundation(
        inundationResult.status === "fulfilled"
          ? {
              state: inundationResult.value.length ? "ready" : "empty",
              data: inundationResult.value,
            }
          : { state: "error", error: errorText(inundationResult.reason) },
      );
      setHierarchy(
        hierarchyResult.status === "fulfilled"
          ? {
              state: hierarchyResult.value.areas.length ? "ready" : "empty",
              data: hierarchyResult.value,
            }
          : { state: "error", error: errorText(hierarchyResult.reason) },
      );
      setSettlements(
        settlementsResult.status === "fulfilled"
          ? {
              state: settlementsResult.value.length ? "ready" : "empty",
              data: settlementsResult.value,
            }
          : { state: "error", error: errorText(settlementsResult.reason) },
      );
      setUpdatedAt(new Date());
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  const selectedPlace = useMemo(() => {
    for (const district of areas.data?.districts ?? []) {
      const township = district.townships.find((item) => item.id === selectedTownship);
      if (township) return { district, township };
    }
    return undefined;
  }, [areas.data, selectedTownship]);

  const level4Areas = useMemo(
    () => (hierarchy.data?.areas ?? []).filter((area) => area.parent_id === selectedTownship),
    [hierarchy.data, selectedTownship],
  );
  const level5Areas = useMemo(
    () => (hierarchy.data?.areas ?? []).filter((area) => area.parent_id === selectedLevel4),
    [hierarchy.data, selectedLevel4],
  );

  useEffect(() => {
    if (!selectedPlace) return;
    let active = true;
    const { latitude, longitude } = selectedPlace.township;
    setForecast(loading);
    setTopography(loading);
    void Promise.allSettled([
      api.forecast(latitude, longitude),
      api.topography(latitude, longitude),
    ]).then(([forecastResult, topographyResult]) => {
        if (!active) return;
        setForecast(
          forecastResult.status === "fulfilled"
            ? {
                state: forecastResult.value.points.length ? "ready" : "empty",
                data: forecastResult.value,
              }
            : { state: "error", error: errorText(forecastResult.reason) },
        );
        setTopography(
          topographyResult.status === "fulfilled"
            ? { state: "ready", data: topographyResult.value }
            : { state: "error", error: errorText(topographyResult.reason) },
        );
        setUpdatedAt(new Date());
      },
    );
    return () => {
      active = false;
    };
  }, [selectedPlace]);

  useEffect(() => {
    if (!selectedPlace) return;
    let active = true;
    const { latitude, longitude, id } = selectedPlace.township;
    const window = previousFiveDays(localToday());
    setHistorical(loading);
    api
      .historical(latitude, longitude, window.start, window.end, id)
      .then((result) => {
        if (!active) return;
        const points = [...result.points].sort((left, right) => left.date.localeCompare(right.date)).slice(-5);
        setHistorical({
          state: points.length ? "ready" : "empty",
          data: { ...result, points },
        });
        setUpdatedAt(new Date());
      })
      .catch((reason) => {
        if (active) setHistorical({ state: "error", error: errorText(reason) });
      });
    return () => {
      active = false;
    };
  }, [selectedPlace]);

  useEffect(() => {
    if (!selectedPlace) return;
    let active = true;
    const { township } = selectedPlace;
    const today = localToday();
    setOutlook(loading);
    api
      .outlook({
        date: today,
        township_id: township.id,
        latitude: township.latitude,
        longitude: township.longitude,
      })
      .then((result) => {
        if (!active) return;
        const todayDays = result.days.filter((day) => day.date === today);
        setOutlook({
          state: todayDays.length ? "ready" : "empty",
          data: { ...result, days: todayDays },
        });
        setUpdatedAt(new Date());
      })
      .catch((reason) => {
        if (active) setOutlook({ state: "error", error: errorText(reason) });
      });
    return () => {
      active = false;
    };
  }, [selectedPlace]);

  useEffect(() => {
    const code = selectedLevel5 || selectedLevel4;
    if (!code) {
      setSelectedBoundary(undefined);
      return;
    }
    let active = true;
    api
      .adminAreas(code, true)
      .then((response) => {
        if (active) setSelectedBoundary(response.areas.find((area) => area.id === code));
      })
      .catch(() => {
        if (active) setSelectedBoundary(undefined);
      });
    return () => {
      active = false;
    };
  }, [selectedLevel4, selectedLevel5]);

  useEffect(() => {
    const code = selectedLevel5 || selectedLevel4 || selectedTownship;
    if (!code) return;
    let active = true;
    api
      .settlements(code)
      .then((points) => {
        if (active) {
          setSettlements({
            state: points.length ? "ready" : "empty",
            data: points,
          });
        }
      })
      .catch((reason) => {
        if (active) setSettlements({ state: "error", error: errorText(reason) });
      });
    return () => {
      active = false;
    };
  }, [selectedLevel4, selectedLevel5, selectedTownship]);

  const visibleTownships = useMemo(() => {
    const districts = areas.data?.districts ?? [];
    const shown =
      districtFilter === "all" ? districts : districts.filter((district) => district.id === districtFilter);
    const search = placeSearch.trim().toLocaleLowerCase();
    return shown
      .flatMap((district) =>
        district.townships.map((township) => ({
          ...township,
          districtId: district.id,
          districtName: district.name_en,
          color: districtColor(district.id),
        })),
      )
      .filter(
        (township) =>
          !search ||
          township.name_en.toLocaleLowerCase().includes(search) ||
          township.name_local.includes(search) ||
          township.id.toLocaleLowerCase().includes(search),
      );
  }, [areas.data, districtFilter, placeSearch]);

  const mapPoints = useMemo<[number, number][]>(() => {
    const routePath = route.data?.path.map(
      (point) => [point.latitude, point.longitude] as [number, number],
    );
    if (routePath && routePath.length > 1) return routePath;
    if (selectedBoundary?.latitude != null && selectedBoundary.longitude != null) {
      return [[selectedBoundary.latitude, selectedBoundary.longitude]];
    }
    return visibleTownships.map((township) => [township.latitude, township.longitude]);
  }, [route.data, selectedBoundary, visibleTownships]);

  const latestHeuristic = useMemo(() => {
    const seen = new Set<string>();
    const visibleCodes = new Set(visibleTownships.map((township) => township.id));
    return (riskResults.data ?? []).filter((row) => {
      if (
        row.evidence_type !== "heuristic_risk" ||
        !row.admin_area_code ||
        !visibleCodes.has(row.admin_area_code) ||
        row.latitude == null ||
        row.longitude == null ||
        seen.has(row.admin_area_code)
      ) {
        return false;
      }
      seen.add(row.admin_area_code);
      return true;
    });
  }, [riskResults.data, visibleTownships]);

  const latestModelPredictions = useMemo(() => {
    const seen = new Set<string>();
    const visibleCodes = new Set(visibleTownships.map((township) => township.id));
    return (riskResults.data ?? []).filter((row) => {
      if (
        row.evidence_type !== "model_prediction" ||
        !row.admin_area_code ||
        !visibleCodes.has(row.admin_area_code) ||
        row.latitude == null ||
        row.longitude == null ||
        seen.has(row.admin_area_code)
      ) {
        return false;
      }
      seen.add(row.admin_area_code);
      return true;
    });
  }, [riskResults.data, visibleTownships]);

  const catalog = useMemo(
    () =>
      (areas.data?.districts ?? []).flatMap((district) =>
        district.townships.map((township) => ({ ...township, districtName: district.name_en })),
      ),
    [areas.data],
  );

  const toggleRouteStop = (id: string) => {
    setRoute({ state: "empty" });
    setRouteStops((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  const submitRoute = async (event: FormEvent) => {
    event.preventDefault();
    const origin = catalog.find((township) => township.id === selectedTownship);
    const stops = routeStops
      .filter((id) => id !== selectedTownship)
      .map((id) => catalog.find((township) => township.id === id))
      .filter((township) => township != null);
    if (!origin || stops.length === 0) {
      setRoute({ state: "error", error: "Choose an origin and at least one delivery township." });
      return;
    }
    setRoute(loading);
    try {
      const result = await api.planRoute({
        origin: {
          id: origin.id,
          name: origin.name_en,
          latitude: origin.latitude,
          longitude: origin.longitude,
        },
        stops: stops.map((township) => ({
          id: township.id,
          name: township.name_en,
          latitude: township.latitude,
          longitude: township.longitude,
        })),
        vehicle_profile: vehicleProfile,
        service_minutes: serviceMinutes,
        return_to_origin: returnToOrigin,
      });
      setRoute({ state: "ready", data: result });
      setUpdatedAt(new Date());
    } catch (reason) {
      setRoute({ state: "error", error: errorText(reason) });
    }
  };

  const chooseTownship = (id: string) => {
    setSelectedTownship(id);
    setSelectedLevel4("");
    setSelectedLevel5("");
    const district = areas.data?.districts.find((item) =>
      item.townships.some((township) => township.id === id),
    );
    if (district) setDistrictFilter(district.id);
  };

  const submitManualRun = async (event: FormEvent) => {
    event.preventDefault();
    setManualRun(loading);
    try {
      const result = await api.runPrediction(adminKey);
      setManualRun({ state: "ready", data: result });
      const nextRuns = await api.runs();
      setRuns({ state: nextRuns.length ? "ready" : "empty", data: nextRuns });
    } catch (reason) {
      setManualRun({ state: "error", error: errorText(reason) });
    }
  };

  const latestCompletedRun = runs.data?.find(
    (run) => run.status === "succeeded" || run.status === "partial",
  );
  const lastSuccessfulRun = runs.data?.find((run) => run.status === "succeeded");
  const lastRunAgeHours = lastSuccessfulRun
    ? (Date.now() - new Date(lastSuccessfulRun.finished_at ?? lastSuccessfulRun.started_at).getTime()) /
      3_600_000
    : undefined;
  const providerRetrievedAt = lastSuccessfulRun?.freshness.retrieved_at;
  const providerAgeHours =
    typeof providerRetrievedAt === "string"
      ? (Date.now() - new Date(providerRetrievedAt).getTime()) / 3_600_000
      : undefined;
  const stale =
    lastRunAgeHours == null ||
    lastRunAgeHours > 12 ||
    providerAgeHours == null ||
    providerAgeHours > 12;

  const regionDays = (historical.data?.points ?? []).slice(-5);
  const today = localToday();
  const todayOutlook = outlook.data?.days.find((day) => day.date === today);

  const selectableDistricts =
    districtFilter === "all"
      ? (areas.data?.districts ?? [])
      : (areas.data?.districts ?? []).filter((district) => district.id === districtFilter);

  return (
    <div className={sidebarOpen ? "shell" : "shell sidebar-closed"}>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32">
              <path d="M5 20c3.2-4.2 5.2-4.2 8.2 0s5 4.2 8.2 0 5-4.2 8.2 0" />
              <path d="M5 13c3.2-4.2 5.2-4.2 8.2 0s5 4.2 8.2 0" />
            </svg>
          </span>
          <div className="brand-text">
            <strong>HydroFlow <em>V1</em></strong>
            <small>AI Flood Prediction & Early Warning</small>
          </div>
        </div>
        <nav className="sector-nav" aria-label="Dashboard sector">
          <button
            type="button"
            className={sector === "research" ? "active" : ""}
            aria-pressed={sector === "research"}
            onClick={() => setSector("research")}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 16c2.4-5 4-7 8-7s5.6 2 8 7" /><path d="M4 11c2.4-4 4-5 8-5s5.6 1 8 5" /></svg>
            <span>Flood Prediction</span>
          </button>
          <button
            type="button"
            className={sector === "humanitarian" ? "active" : ""}
            aria-pressed={sector === "humanitarian"}
            onClick={() => setSector("humanitarian")}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-4.4 7-10a7 7 0 0 0-14 0c0 5.6 7 10 7 10z" /><circle cx="12" cy="11" r="2.2" /></svg>
            <span>Humanitarian assistance</span>
          </button>
        </nav>
        <div className="sidebar-foot">
          <time dateTime={updatedAt?.toISOString()}>{updatedAt ? formatDateTime(updatedAt) : "Loading time"}</time>
          <div className={`status ${health.data?.status === "ok" ? "online" : ""}`}>
            <span aria-hidden="true" />
            API {health.state === "loading" ? "checking" : health.data?.status ?? "unavailable"}
            {health.data && <small>{health.data.service} v{health.data.version}</small>}
          </div>
          <p className="side-note">
            <strong>Safer communities</strong>
            <span>Bago Region, Myanmar</span>
          </p>
        </div>
      </aside>

      <div className={sector === "research" ? "workspace is-fit" : "workspace"}>
      <header className="topbar">
        <button
          type="button"
          className="sidebar-toggle"
          aria-expanded={sidebarOpen}
          aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
          onClick={() => setSidebarOpen((open) => !open)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
        <div className="region-pill">
          <span aria-hidden="true" />
          Bago Region
        </div>
        <div className="page-head">
          <h1>{sector === "research" ? "Flood Prediction" : "Humanitarian assistance"}</h1>
        </div>
      </header>

      {sector === "humanitarian" && (
        <HumanitarianDashboard
          areas={areas}
          selectedTownship={selectedTownship}
          onTownshipChange={chooseTownship}
          startDate={startDate}
          onStartDate={setStartDate}
          topography={topography}
        />
      )}

      {sector === "research" && (
      <main className="predict-board">
          <article className="panel map-panel">
            <div className="section-heading">
              <div>
                <h2>Districts and townships</h2>
              </div>
              <span className="source">Source: {areas.data?.source ?? "versioned geography"}</span>
            </div>
            <div className="chip-row" role="group" aria-label="Bago districts">
              <button
                type="button"
                className={districtFilter === "all" ? "active" : ""}
                onClick={() => setDistrictFilter("all")}
              >
                All districts
              </button>
              {areas.data?.districts.map((district) => (
                <button
                  key={district.id}
                  type="button"
                  className={districtFilter === district.id ? "active" : ""}
                  onClick={() => {
                  setDistrictFilter(district.id);
                  if (!district.townships.some((township) => township.id === selectedTownship)) {
                    const first = district.townships[0];
                    if (first) chooseTownship(first.id);
                  }
                }}
                >
                  {district.name_en}
                </button>
              ))}
            </div>
            <StateMessage resource={areas} empty="No Bago districts returned." />
            <MapContainer
              center={[18.2638, 96.0673]}
              zoom={8}
              scrollWheelZoom={false}
              aria-label="Map of Bago Region districts and townships"
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · Boundaries: <a href="https://data.humdata.org/dataset/cod-ab-mmr">OCHA FISS / MIMU source</a>, CC BY 3.0 IGO'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <FitPoints points={mapPoints} />
              {areas.data?.districts.map(
                (district) =>
                  district.geometry && (
                    <GeoJSON
                      key={`district-${district.id}`}
                      data={district.geometry as GeoJsonObject}
                      style={{
                        color: districtColor(district.id),
                        weight: 2,
                        fillOpacity: districtFilter === district.id ? 0.16 : 0.05,
                      }}
                    />
                  ),
              )}
              {selectedBoundary?.geometry && (
                <GeoJSON
                  key={`selected-admin-${selectedBoundary.id}`}
                  data={selectedBoundary.geometry as GeoJsonObject}
                  style={{ color: "#6d3fa0", fillColor: "#9a6bc2", fillOpacity: 0.2, weight: 2 }}
                >
                  <Popup>
                    <strong>{selectedBoundary.name_en}</strong><br />
                    {selectedBoundary.area_type} · {selectedBoundary.id}<br />
                    Coverage: {selectedBoundary.coverage_status}
                  </Popup>
                </GeoJSON>
              )}
              {inundation.data?.map((product) => (
                <GeoJSON
                  key={`inundation-${product.id}`}
                  data={product.geometry as GeoJsonObject}
                  style={{ color: "#2457a6", fillColor: "#3b82d0", fillOpacity: 0.38, weight: 1 }}
                >
                  <Popup>
                    <strong>Observed satellite inundation</strong><br />
                    Observed {formatDateTime(product.observed_at)} · {product.quality}<br />
                    {product.affected_population == null
                      ? "No exposure estimate imported."
                      : `${product.affected_population.toLocaleString()} estimated exposed people; not a confirmed affected count.`}
                  </Popup>
                </GeoJSON>
              ))}
              {latestHeuristic.map((result) => (
                <CircleMarker
                  key={`risk-${result.id}`}
                  center={[result.latitude as number, result.longitude as number]}
                  radius={16}
                  pathOptions={{
                    color: riskColor(result.risk_level),
                    fillColor: riskColor(result.risk_level),
                    fillOpacity: 0.2,
                    weight: 2,
                  }}
                >
                  <Popup>
                    <strong>{result.admin_area_name}</strong><br />
                    Heuristic risk: {result.risk_level}<br />
                    Valid {formatDateTime(result.valid_at)} · +{result.forecast_horizon_hours} h<br />
                    Provisional rule, not a probability or official warning.
                  </Popup>
                </CircleMarker>
              ))}
              {latestModelPredictions.map((result) => (
                <CircleMarker
                  key={`model-risk-${result.id}`}
                  center={[result.latitude as number, result.longitude as number]}
                  radius={10}
                  pathOptions={{
                    color: "#6d3fa0",
                    fillColor: "#9a6bc2",
                    fillOpacity: 0.08,
                    weight: 2,
                    dashArray: "4 3",
                  }}
                >
                  <Popup>
                    <strong>{result.admin_area_name}</strong><br />
                    Legacy model score:{" "}
                    {result.probability == null
                      ? "unavailable"
                      : result.probability.toFixed(3)}<br />
                    Valid {formatDateTime(result.valid_at)} · +{result.forecast_horizon_hours} h<br />
                    Uncalibrated academic score, not an official warning.
                  </Popup>
                </CircleMarker>
              ))}
              {settlements.data?.map((settlement) => (
                <CircleMarker
                  key={`settlement-${settlement.id}`}
                  center={[settlement.latitude, settlement.longitude]}
                  radius={3}
                  pathOptions={{ color: "#3f5965", fillColor: "#ffffff", fillOpacity: 0.9, weight: 1 }}
                >
                  <Popup>
                    <strong>{settlement.name_en}</strong><br />
                    {settlement.settlement_type} · {settlement.source_code}<br />
                    {settlement.note}
                  </Popup>
                </CircleMarker>
              ))}
              {route.data && route.data.path.length > 1 && (
                <Polyline
                  positions={route.data.path.map(
                    (point) => [point.latitude, point.longitude] as [number, number],
                  )}
                  pathOptions={{ color: "#0b5873", weight: 4 }}
                />
              )}
              {visibleTownships.map((township) => (
                <CircleMarker
                  key={township.id}
                  center={[township.latitude, township.longitude]}
                  radius={township.id === selectedTownship ? 11 : 7}
                  pathOptions={{
                    color: township.id === selectedTownship ? "#083c5d" : township.color,
                    fillColor: township.color,
                    fillOpacity: 0.9,
                    weight: township.id === selectedTownship ? 3 : 1,
                  }}
                  eventHandlers={{ click: () => chooseTownship(township.id) }}
                >
                  <Popup>
                    <strong>{township.name_en}</strong>
                    <br />
                    {township.name_local}
                    <br />
                    {township.districtName} District
                    <br />
                    {township.latitude.toFixed(4)}, {township.longitude.toFixed(4)}
                  </Popup>
                </CircleMarker>
              ))}
            </MapContainer>
            <div className="legend">
              <span><i style={{ background: "#3b82d0" }} />Observed satellite inundation</span>
              <span><i style={{ background: "#d86a1a" }} />Provisional heuristic ring</span>
              <span><i style={{ background: "#9a6bc2" }} />Uncalibrated flood-model ring</span>
            </div>
          </article>

          <article className="panel form-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">{today}</p>
                <h2>Flood prediction</h2>
              </div>
              <span className="source">{selectedPlace?.township.name_en ?? "Township"}</span>
            </div>
            <label>Township
              <select
                value={selectedTownship}
                onChange={(event) => chooseTownship(event.target.value)}
                required
                disabled={!selectedPlace}
              >
                {!selectedPlace && <option value="">Loading townships…</option>}
                {selectableDistricts.map((district) => (
                  <optgroup key={district.id} label={`${district.name_en} District`}>
                    {district.townships.map((township) => (
                      <option key={township.id} value={township.id}>{township.name_en}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <div className="slot-row" role="tablist" aria-label="Prediction times">
              {PREDICTION_SLOTS.map((slot) => (
                <button
                  key={slot}
                  type="button"
                  role="tab"
                  className={predictionSlot === slot ? "active" : ""}
                  aria-selected={predictionSlot === slot}
                  onClick={() => setPredictionSlot(slot)}
                >
                  {slot}
                </button>
              ))}
            </div>
            <StateMessage resource={outlook} empty="No prediction for the current day." />
            {outlook.state === "ready" && todayOutlook && (
              <div className="slot-page" role="tabpanel" aria-label={`${today} ${predictionSlot}`}>
                <p className="eyebrow">{today} · {predictionSlot} MMT</p>
                <div className="result-grid">
                  <div>
                    <span>Flood chance</span>
                    <strong>{(todayOutlook.flood_probability * 100).toFixed(0)}%</strong>
                  </div>
                  <div>
                    <span>Risk</span>
                    <strong className={`risk-pill risk-${todayOutlook.risk_level}`}>{todayOutlook.risk_level}</strong>
                  </div>
                  <div>
                    <span>Rainfall</span>
                    <strong>{valueOrDash(todayOutlook.precipitation_mm, "mm")}</strong>
                  </div>
                  <div>
                    <span>Discharge</span>
                    <strong>{valueOrDash(todayOutlook.discharge_m3_s, "m³/s")}</strong>
                  </div>
                  <div>
                    <span>Temperature</span>
                    <strong>{valueOrDash(todayOutlook.temperature_c, "°C")}</strong>
                  </div>
                  <div>
                    <span>Humidity</span>
                    <strong>{valueOrDash(todayOutlook.relative_humidity_pct, "%")}</strong>
                  </div>
                </div>
              </div>
            )}
          </article>

          <article className="panel history-panel">
            <div className="section-heading">
              <div>
                <h2>Previous 5 days</h2>
              </div>
            </div>
            <StateMessage resource={historical} empty="No stored days for this township." />
            {historical.state === "ready" && (
              <div className="history-table" role="table" aria-label="Previous five days">
                <div className="history-row region header" role="row">
                  <span>Date</span>
                  <span>Rainfall</span>
                  <span>Temperature</span>
                  <span>Humidity</span>
                </div>
                {regionDays.map((point) => (
                  <div className="history-row region" role="row" key={point.date}>
                    <strong>{point.date}</strong>
                    <span>{valueOrDash(point.precipitation_mm, "mm")}</span>
                    <span>{valueOrDash(point.temperature_c, "°C")}</span>
                    <span>{valueOrDash(point.relative_humidity_pct, "%")}</span>
                  </div>
                ))}
              </div>
            )}
          </article>

      </main>
      )}

      <footer>
        <span>HydroFlow V1 · Research use only</span>
        <span>
          Last successful run:{" "}
          {lastSuccessfulRun
            ? formatDateTime(lastSuccessfulRun.finished_at ?? lastSuccessfulRun.started_at)
            : "never"}{" "}
          · Dashboard fetched: {updatedAt ? formatDateTime(updatedAt) : "pending"}
        </span>
      </footer>
      </div>
    </div>
  );
}

export default App;
