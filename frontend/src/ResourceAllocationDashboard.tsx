import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import RouteMap from "./components/RouteMap";
import type {
  AllocationPlanResponse,
  AssistancePriority,
  InventorySnapshot,
  LoadState,
} from "./types";

interface ResourceAllocationDashboardProps {
  startDate: string;
  onStartDate: (value: string) => void;
  onOpenInventory?: () => void;
}

interface Resource<T> {
  state: LoadState;
  data?: T;
  error?: string;
}

const loading = <T,>(): Resource<T> => ({ state: "loading" });
const errorText = (reason: unknown) =>
  reason instanceof Error ? reason.message : "Unexpected request failure";

const PRIORITY_OPTIONS: AssistancePriority[] = ["moderate", "high", "severe"];

type RegionCode = "east" | "west";

function stockUnits(snapshot: InventorySnapshot | undefined): number {
  if (!snapshot) return 0;
  return snapshot.classes.reduce((sum, klass) => sum + klass.quantity, 0);
}

function StatCard({
  label,
  value,
  tone,
  children,
}: {
  label: string;
  value: string;
  tone: string;
  children: React.ReactNode;
}) {
  return (
    <article className={`allocation-stat tone-${tone}`}>
      <span className="stat-icon" aria-hidden="true">
        {children}
      </span>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </article>
  );
}

export default function ResourceAllocationDashboard({
  startDate,
  onStartDate,
  onOpenInventory,
}: ResourceAllocationDashboardProps) {
  const [warehouseRegion, setWarehouseRegion] = useState<RegionCode>("east");
  const [minPriority, setMinPriority] = useState<AssistancePriority>("moderate");
  const [inventory, setInventory] = useState<Resource<InventorySnapshot>>(loading);
  const [plan, setPlan] = useState<Resource<AllocationPlanResponse>>({ state: "empty" });
  const [dispatchNote, setDispatchNote] = useState("");

  const refreshInventory = async () => {
    setInventory(loading);
    try {
      const snapshot = await api.inventory(warehouseRegion);
      setInventory({ state: "ready", data: snapshot });
    } catch (reason) {
      setInventory({ state: "error", error: errorText(reason) });
    }
  };

  useEffect(() => {
    void refreshInventory();
  }, [warehouseRegion]);

  const submitPlan = async (event: FormEvent) => {
    event.preventDefault();
    setPlan(loading);
    try {
      const result = await api.allocationPlan({
        date: startDate,
        warehouse_region: warehouseRegion,
        min_priority: minPriority,
        vehicle_profile: "truck",
      });
      setPlan({ state: "ready", data: result });
      setDispatchNote("");
      await refreshInventory();
    } catch (reason) {
      setPlan({ state: "error", error: errorText(reason) });
    }
  };

  const mapStops = useMemo(() => {
    const warehouse = plan.data?.warehouse;
    const rows = plan.data?.rows ?? [];
    const stops = [];
    if (warehouse) {
      stops.push({
        id: warehouse.id,
        name: warehouse.name,
        latitude: warehouse.latitude,
        longitude: warehouse.longitude,
        kind: "warehouse" as const,
      });
    }
    for (const row of rows) {
      stops.push({
        id: row.township_id,
        name: row.township_name,
        latitude: row.latitude,
        longitude: row.longitude,
        kind: "township" as const,
      });
    }
    return stops;
  }, [plan.data]);

  const mapPaths = useMemo(
    () => (plan.data?.routes ?? []).map((route) => route.path),
    [plan.data],
  );

  const mapCenter = useMemo<[number, number]>(() => {
    if (plan.data?.warehouse) {
      return [plan.data.warehouse.latitude, plan.data.warehouse.longitude];
    }
    return [17.336, 96.481];
  }, [plan.data]);

  const affected = plan.data?.totals.affected_population;
  const available =
    plan.data?.totals.available_stock_units ?? stockUnits(inventory.data);
  const needed = plan.data?.totals.resources_needed_units;

  return (
    <main className="allocation-board">
      <section className="panel allocation-route-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Logistics</p>
            <h2>Route</h2>
          </div>
          <span className="source">{plan.data?.warehouse.name ?? "Bago Region"}</span>
        </div>
        <RouteMap center={mapCenter} stops={mapStops} paths={mapPaths} />
        <p className="hint">
          Warehouse origin and delivery stops for the current allocation plan. Routes use Kardinal when
          configured, otherwise a straight-line academic illustration.
        </p>
      </section>

      <section className="allocation-main">
        <div className="allocation-kpis" aria-label="Allocation summary">
          <StatCard
            label="Affected population"
            value={affected != null ? affected.toLocaleString() : "—"}
            tone="people"
          >
            <svg viewBox="0 0 24 24">
              <path d="M8 20v-2.2a3.8 3.8 0 0 1 7.6 0V20" />
              <circle cx="12" cy="8.5" r="3.2" />
              <path d="M4.5 20c1.2-2.8 3.4-4.2 7.5-4.2s6.3 1.4 7.5 4.2" />
            </svg>
          </StatCard>
          <StatCard
            label="Available stock"
            value={available != null ? available.toLocaleString() : "—"}
            tone="stock"
          >
            <svg viewBox="0 0 24 24">
              <path d="M4 8.5 12 4l8 4.5-9 4.5L4 8.5z" />
              <path d="M4 8.5V16.5L12 21l9-4.5V7.5" />
            </svg>
          </StatCard>
          <StatCard
            label="Resources needed"
            value={needed != null ? needed.toLocaleString() : "—"}
            tone="need"
          >
            <svg viewBox="0 0 24 24">
              <path d="M12 3 2.5 20h19L12 3z" />
              <path d="M12 10v4M12 17h.01" />
            </svg>
          </StatCard>
        </div>

        {plan.data?.shortages.length ? (
          <p className="allocation-alert" role="status">
            Stock shortage: {plan.data.shortages.length} item
            {plan.data.shortages.length === 1 ? "" : "s"} cannot be fully covered from{" "}
            {plan.data.warehouse.name}.
          </p>
        ) : null}

        <article className="panel allocation-table-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Township ranking</p>
              <h2>Resource allocation list</h2>
            </div>
            <span className="source">Model: {plan.data?.model_version ?? "flood-help-v2"}</span>
          </div>

          <form className="allocation-controls" onSubmit={submitPlan}>
            <label>
              Planning date
              <input type="date" value={startDate} onChange={(event) => onStartDate(event.target.value)} required />
            </label>
            <label>
              Warehouse
              <select
                value={warehouseRegion}
                onChange={(event) => setWarehouseRegion(event.target.value as RegionCode)}
              >
                <option value="east">Bago East</option>
                <option value="west">Bago West</option>
              </select>
            </label>
            <label>
              Minimum priority
              <select
                value={minPriority}
                onChange={(event) => setMinPriority(event.target.value as AssistancePriority)}
              >
                {PRIORITY_OPTIONS.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </label>
          </form>

          {inventory.state === "error" && (
            <p className="state error">Inventory unavailable: {inventory.error}</p>
          )}
          {plan.state === "error" && <p className="state error">Plan failed: {plan.error}</p>}
          {plan.state === "loading" && <p className="state">Generating allocation plan…</p>}

          <div className="history-table allocation-table" role="table" aria-label="Resource allocation">
            <div className="history-row allocation header" role="row">
              <span>Township</span>
              <span>Population</span>
              <span>Priority</span>
              <span>Resources to allocate</span>
              <span>Quantity</span>
              <span>Route</span>
            </div>
            {plan.state === "ready" && plan.data?.rows.length === 0 && (
              <p className="state">No townships met the priority threshold for this date.</p>
            )}
            {plan.data?.rows.map((row) => (
              <div className="history-row allocation" role="row" key={row.township_id}>
                <strong>
                  {row.township_name}
                  {row.has_shortage ? <small className="shortage-tag">partial</small> : null}
                </strong>
                <span>{row.population.toLocaleString()}</span>
                <span className={`risk-pill risk-${row.priority}`}>{row.priority}</span>
                <span>{row.resources_label}</span>
                <span>{row.quantities_label}</span>
                <span>{row.route_id}</span>
              </div>
            ))}
          </div>

          <div className="allocation-actions">
            <button type="button" className="outline allocation-action" onClick={() => void refreshInventory()}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 7.5h16v11H4z" />
                <path d="M8 7.5V5.5h8v2" />
              </svg>
              Check inventory
            </button>
            <button
              type="button"
              className="allocation-action primary"
              disabled={plan.state === "loading"}
              onClick={(event) => void submitPlan(event as unknown as FormEvent)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M7 4h10v16H7z" />
                <path d="M9.5 8h5M9.5 12h5M9.5 16h3.5" />
              </svg>
              Generate allocation plan
            </button>
            <button
              type="button"
              className="outline allocation-action"
              disabled={plan.state !== "ready"}
              onClick={() => setDispatchNote("Dispatch recorded in this session. Inventory is not changed until a coordinator confirms in operations.")}
            >
              Confirm dispatch
            </button>
            <button
              type="button"
              className="outline allocation-action"
              disabled={plan.state !== "ready"}
              onClick={() => window.print()}
            >
              Print allocation plan
            </button>
            {onOpenInventory ? (
              <button type="button" className="text-link" onClick={onOpenInventory}>
                Open inventory
              </button>
            ) : null}
          </div>
          {dispatchNote ? <p className="hint">{dispatchNote}</p> : null}
          {plan.data?.disclaimer ? <p className="hint">{plan.data.disclaimer}</p> : null}
        </article>
      </section>
    </main>
  );
}
