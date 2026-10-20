import { Component, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "./api";
import DashboardHome from "./DashboardHome";
import FloodPredictionDashboard, { type PredictionMapContext } from "./FloodPredictionDashboard";
import InventoryManagement from "./InventoryManagement";
import MapsPage from "./MapsPage";
import ReportsPage from "./ReportsPage";
import ResourceAllocationDashboard from "./ResourceAllocationDashboard";
import SettingsPage from "./SettingsPage";
import type { AllocationFocus } from "./lib/allocationFocus";
import type {
  BagoAreasResponse,
  HealthResponse,
  InundationProduct,
  JobRun,
  LoadState,
  PageId,
  SettlementPoint,
} from "./types";

interface Resource<T> {
  state: LoadState;
  data?: T;
  error?: string;
}

const loading = <T,>(): Resource<T> => ({ state: "loading" });
const errorText = (reason: unknown) =>
  reason instanceof Error ? reason.message : "Unexpected request failure";

const NAV: { id: PageId; label: string }[] = [
  { id: "home", label: "Dashboard" },
  { id: "prediction", label: "Flood Prediction" },
  { id: "allocation", label: "Resource Allocation" },
  { id: "inventory", label: "Inventory Management" },
  { id: "maps", label: "Maps" },
  { id: "reports", label: "Reports" },
  { id: "settings", label: "Settings" },
];

const PAGE_TITLE: Record<PageId, string> = {
  home: "Dashboard",
  prediction: "Flood Prediction",
  allocation: "Resource Allocation",
  inventory: "Inventory Management",
  maps: "Maps",
  reports: "Reports",
  settings: "Settings",
};

function initialStartDate(): string {
  const day = new Date();
  day.setDate(day.getDate());
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
}

function NavIcon({ page }: { page: PageId }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (page === "home") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path {...common} d="M4 11.5 12 4l8 7.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" />
      </svg>
    );
  }
  if (page === "prediction") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path {...common} d="M4 16c2.5-5 4-7 8-7s5.5 2 8 7" />
        <path {...common} d="M4 12c2.5-4 4-5 8-5s5.5 1 8 5" />
      </svg>
    );
  }
  if (page === "allocation") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path {...common} d="M12 21s7-4.4 7-10a7 7 0 0 0-14 0c0 5.6 7 10 7 10z" />
        <circle cx="12" cy="11" r="2.2" />
      </svg>
    );
  }
  if (page === "inventory") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path {...common} d="M3 7.5 12 3l9 4.5-9 4.5L3 7.5z" />
        <path {...common} d="M3 7.5V16.5L12 21l9-4.5V7.5" />
        <path {...common} d="M12 12v9" />
      </svg>
    );
  }
  if (page === "maps") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path {...common} d="M9 4 3 6.5V20l6-2 6 2 6-2.5V4l-6 2.5L9 4z" />
        <path {...common} d="M9 4v14M15 6.5V20" />
      </svg>
    );
  }
  if (page === "reports") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path {...common} d="M5 19V9M10 19V5M15 19v-7M20 19V8" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path {...common} d="M12 3v2M12 19v2M5 12H3M21 12h-2M6.2 6.2l1.4 1.4M16.4 16.4l1.4 1.4M6.2 17.8l1.4-1.4M16.4 7.6l1.4-1.4" />
    </svg>
  );
}

class DashboardErrorBoundary extends Component<{ children: ReactNode }, { message: string | null }> {
  state = { message: null as string | null };
  static getDerivedStateFromError(error: Error) {
    return { message: error.message };
  }
  render() {
    if (this.state.message) {
      return (
        <main className="panel">
          <h1>Dashboard stopped</h1>
          <p className="hint">{this.state.message}</p>
        </main>
      );
    }
    return this.props.children;
  }
}

function App() {
  const [health, setHealth] = useState<Resource<HealthResponse>>(loading);
  const [areas, setAreas] = useState<Resource<BagoAreasResponse>>(loading);
  const [runs, setRuns] = useState<Resource<JobRun[]>>(loading);
  const [inundation, setInundation] = useState<Resource<InundationProduct[]>>(loading);
  const [settlements, setSettlements] = useState<Resource<SettlementPoint[]>>(loading);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [predictionMapContext, setPredictionMapContext] = useState<PredictionMapContext | null>(null);
  const [startDate, setStartDate] = useState(initialStartDate);
  const [page, setPage] = useState<PageId>("home");
  const [allocationFocus, setAllocationFocus] = useState<AllocationFocus | null>(null);
  const [noticeOpen, setNoticeOpen] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const results = await Promise.allSettled([
        api.health(),
        api.bagoAreas(),
        api.runs(),
        api.inundationProducts(),
        api.settlements(),
      ]);
      if (!active) return;

      const [healthResult, areasResult, runsResult, inundationResult, settlementsResult] = results;
      setHealth(
        healthResult.status === "fulfilled"
          ? { state: "ready", data: healthResult.value }
          : { state: "error", error: errorText(healthResult.reason) },
      );
      setAreas(
        areasResult.status === "fulfilled"
          ? { state: "ready", data: areasResult.value }
          : { state: "error", error: errorText(areasResult.reason) },
      );
      setRuns(
        runsResult.status === "fulfilled"
          ? { state: runsResult.value.length ? "ready" : "empty", data: runsResult.value }
          : { state: "error", error: errorText(runsResult.reason) },
      );
      setInundation(
        inundationResult.status === "fulfilled"
          ? {
              state: inundationResult.value.length ? "ready" : "empty",
              data: inundationResult.value,
            }
          : { state: "error", error: errorText(inundationResult.reason) },
      );
      setSettlements(
        settlementsResult.status === "fulfilled"
          ? {
              state: settlementsResult.value.length ? "ready" : "empty",
              data: settlementsResult.value,
            }
          : { state: "error", error: errorText(settlementsResult.reason) },
      );
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  const lastSuccessfulRun = runs.data?.find((run) => run.status === "succeeded");
  const townshipCount = useMemo(
    () => (areas.data?.districts ?? []).reduce((sum, district) => sum + district.townships.length, 0),
    [areas.data],
  );
  const notices = [
    health.state === "error" ? `API unavailable: ${health.error}` : null,
    health.data && health.data.status !== "ok" ? "API is not reporting a healthy status." : null,
    areas.state === "error" ? "Bago map layers could not be loaded." : null,
  ].filter((item): item is string => Boolean(item));

  return (
    <div className={sidebarOpen ? "shell" : "shell sidebar-closed"}>
      <aside className="sidebar">
        <div className="brand-block">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32">
              <path d="M5 20c3.2-4.2 5.2-4.2 8.2 0s5 4.2 8.2 0 5-4.2 8.2 0" />
              <path d="M5 13c3.2-4.2 5.2-4.2 8.2 0s5 4.2 8.2 0" />
            </svg>
          </span>
          <div className="brand-text">
            <strong>
              HydroFlow <em>V1</em>
            </strong>
          </div>
        </div>

        <nav className="sector-nav" aria-label="Primary">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              className={page === item.id ? "active" : ""}
              aria-current={page === item.id ? "page" : undefined}
              onClick={() => setPage(item.id)}
            >
              <NavIcon page={item.id} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="side-card">
            <strong>Together for a safer Myanmar</strong>
            <span>HydroFlow Myanmar Flood Relief System</span>
          </div>
          <div className={`status ${health.data?.status === "ok" ? "online" : ""}`}>
            <span aria-hidden="true" />
            API {health.state === "loading" ? "checking" : health.data?.status ?? "unavailable"}
            {health.data && (
              <small>
                {health.data.service} v{health.data.version}
              </small>
            )}
          </div>
        </div>
      </aside>

      <div className={`workspace page-${page}`}>
        <header className="topbar">
          <div className="topbar-left">
            <button
              type="button"
              className="icon-btn brand-toggle"
              aria-expanded={sidebarOpen}
              aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
              onClick={() => setSidebarOpen((open) => !open)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </button>
            <label className="region-pill">
              <span aria-hidden="true" />
              <select defaultValue="bago" aria-label="Region">
                <option value="bago">Bago Region</option>
              </select>
            </label>
          </div>

          <div className="page-head">
            <h1>{PAGE_TITLE[page]}</h1>
          </div>

          <div className="top-actions">
            <button
              type="button"
              className="icon-btn notice-btn"
              aria-label="Notifications"
              aria-expanded={noticeOpen}
              onClick={() => setNoticeOpen((open) => !open)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 9a6 6 0 1 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9" />
                <path d="M10 20a2 2 0 0 0 4 0" />
              </svg>
              {notices.length > 0 && <b>{notices.length}</b>}
            </button>
            {noticeOpen && (
              <div className="notice-pop" role="status">
                {notices.length === 0 ? <p>No operational alerts.</p> : notices.map((note) => <p key={note}>{note}</p>)}
              </div>
            )}
          </div>
        </header>

        {page === "home" && (
          <DashboardHome
            health={health}
            areas={areas}
            runs={runs}
            townshipCount={townshipCount}
            onOpen={setPage}
          />
        )}

        {page === "prediction" && (
          <FloodPredictionDashboard
            areas={areas}
            health={health}
            runs={runs}
            inundation={inundation}
            settlements={settlements}
            onMapContextChange={setPredictionMapContext}
            onPlanResources={(focus) => {
              setAllocationFocus(focus);
              setStartDate(focus.date);
              setPage("allocation");
            }}
          />
        )}

        {page === "allocation" && (
          <ResourceAllocationDashboard
            startDate={startDate}
            onStartDate={setStartDate}
            focus={allocationFocus}
            onClearFocus={() => setAllocationFocus(null)}
            onOpenInventory={() => setPage("inventory")}
          />
        )}

        {page === "inventory" && <InventoryManagement />}

        {page === "maps" && (
          <MapsPage areas={areas} inundation={inundation} settlements={settlements} />
        )}

        {page === "reports" && (
          <ReportsPage
            health={health}
            areas={areas}
            runs={runs}
            townshipCount={townshipCount}
            lastSuccessfulRun={lastSuccessfulRun}
            onOpen={setPage}
          />
        )}

        {page === "settings" && <SettingsPage health={health} />}
      </div>
    </div>
  );
}

export default function HydroFlowApp() {
  return (
    <DashboardErrorBoundary>
      <App />
    </DashboardErrorBoundary>
  );
}
