import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { downloadAllocationPlanPdf } from "./allocationPlanPdf";
import RouteMap, { type MapRoutePath, type MapStop } from "./components/RouteMap";
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

const DEFAULT_DEPOTS: MapStop[] = [
  {
    id: "depot-bago",
    name: "Bago depot (east)",
    latitude: 17.335,
    longitude: 96.481,
    kind: "depot-east",
  },
  {
    id: "depot-pyay",
    name: "Pyay depot (west)",
    latitude: 18.817,
    longitude: 95.217,
    kind: "depot-west",
  },
];

function stockUnits(snapshot: InventorySnapshot | undefined): number {
  if (!snapshot) return 0;
  return snapshot.classes.reduce((sum, klass) => sum + klass.quantity, 0);
}

function depotLabel(region: RegionCode): string {
  return region === "east" ? "Bago (east)" : "Pyay (west)";
}

export default function ResourceAllocationDashboard({
  startDate,
  onStartDate,
  onOpenInventory,
}: ResourceAllocationDashboardProps) {
  const [minPriority, setMinPriority] = useState<AssistancePriority>("moderate");
  const [inventoryEast, setInventoryEast] = useState<Resource<InventorySnapshot>>(loading);
  const [inventoryWest, setInventoryWest] = useState<Resource<InventorySnapshot>>(loading);
  const [plan, setPlan] = useState<Resource<AllocationPlanResponse>>({ state: "empty" });
  const [pdfBusy, setPdfBusy] = useState(false);

  const refreshInventory = async () => {
    setInventoryEast(loading);
    setInventoryWest(loading);
    try {
      const [east, west] = await Promise.all([api.inventory("east"), api.inventory("west")]);
      setInventoryEast({ state: "ready", data: east });
      setInventoryWest({ state: "ready", data: west });
    } catch (reason) {
      const message = errorText(reason);
      setInventoryEast({ state: "error", error: message });
      setInventoryWest({ state: "error", error: message });
    }
  };

  useEffect(() => {
    void refreshInventory();
  }, []);

  const submitPlan = async (event?: FormEvent) => {
    event?.preventDefault();
    setPlan(loading);
    try {
      const result = await api.allocationPlan({
        date: startDate,
        warehouse_region: "auto",
        min_priority: minPriority,
        vehicle_profile: "truck",
      });
      setPlan({ state: "ready", data: result });
      await refreshInventory();
    } catch (reason) {
      setPlan({ state: "error", error: errorText(reason) });
    }
  };

  const plannedByDepotItem = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of plan.data?.rows ?? []) {
      for (const item of row.line_items) {
        if (item.allocated <= 0) continue;
        const key = `${row.depot_region}:${item.category_code}:${item.item_code ?? "fund"}`;
        totals.set(key, (totals.get(key) ?? 0) + item.allocated);
      }
    }
    return totals;
  }, [plan.data]);

  const mapStops = useMemo((): MapStop[] => {
    const depots =
      plan.data?.warehouses?.length === 2
        ? plan.data.warehouses.map((warehouse) => ({
            id: warehouse.id,
            name: warehouse.name,
            latitude: warehouse.latitude,
            longitude: warehouse.longitude,
            kind: (warehouse.region === "east" ? "depot-east" : "depot-west") as MapStop["kind"],
          }))
        : DEFAULT_DEPOTS;
    const stops: MapStop[] = [...depots];
    for (const row of plan.data?.rows ?? []) {
      stops.push({
        id: row.township_id,
        name: row.township_name,
        latitude: row.latitude,
        longitude: row.longitude,
        kind: "township",
      });
    }
    return stops;
  }, [plan.data]);

  const mapPaths = useMemo((): MapRoutePath[] => {
    return (plan.data?.routes ?? []).map((route) => ({
      path: route.path,
      depotRegion: route.depot_region ?? "east",
    }));
  }, [plan.data]);

  const mapCenter = useMemo<[number, number]>(() => [17.8, 95.95], []);

  const affectedRows = plan.data?.rows ?? [];
  const affectedTotal = plan.data?.totals.affected_population;

  const savePdf = async () => {
    if (!plan.data) return;
    setPdfBusy(true);
    try {
      await downloadAllocationPlanPdf(plan.data);
    } finally {
      setPdfBusy(false);
    }
  };

  const inventoryError =
    inventoryEast.state === "error"
      ? inventoryEast.error
      : inventoryWest.state === "error"
        ? inventoryWest.error
        : undefined;

  return (
    <main className="allocation-board">
      <section className="panel allocation-route-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Logistics</p>
            <h2>Route map</h2>
          </div>
          <span className="source">28 townships · OSM tiles · OSRM roads</span>
        </div>
        <RouteMap center={mapCenter} stops={mapStops} paths={mapPaths} />
        <p className="hint">
          Gold pin: Bago depot (east stock). Orange pin: Pyay depot (west stock). Townships are assigned to the
          nearer depot; routes follow OpenStreetMap driving geometry when OSRM is reachable.
        </p>
      </section>

      <section className="allocation-side">
        <article className="panel allocation-people-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Prediction</p>
              <h2>Affected people</h2>
            </div>
            <strong className="allocation-total-pill">
              {affectedTotal != null ? affectedTotal.toLocaleString() : "—"} total
            </strong>
          </div>
          {plan.state === "loading" && <p className="state">Scoring townships from flood-help…</p>}
          {plan.state === "error" && <p className="state error">Plan failed: {plan.error}</p>}
          <ul className="allocation-people-list">
            {affectedRows.length === 0 && plan.state === "ready" ? (
              <li className="state">No townships met the priority threshold for this date.</li>
            ) : null}
            {affectedRows.map((row) => (
              <li key={row.township_id}>
                <div>
                  <strong>{row.township_name}</strong>
                  <span>{depotLabel(row.depot_region)} depot</span>
                </div>
                <div className="allocation-people-meta">
                  <span>{row.population.toLocaleString()} people</span>
                  <span className={`risk-pill risk-${row.priority}`}>{row.priority}</span>
                </div>
              </li>
            ))}
          </ul>
        </article>

        <article className="panel allocation-stock-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Inventory</p>
              <h2>In stock</h2>
            </div>
          </div>
          {inventoryError ? <p className="state error">Inventory unavailable: {inventoryError}</p> : null}
          <div className="allocation-stock-grid">
            {(["east", "west"] as const).map((region) => {
              const snapshot = region === "east" ? inventoryEast.data : inventoryWest.data;
              return (
                <div key={region} className="allocation-stock-depot">
                  <h3>{depotLabel(region)}</h3>
                  <ul>
                    {(snapshot?.classes ?? []).flatMap((klass) =>
                      klass.items.map((item) => {
                        const key = `${region}:${klass.code}:${item.code ?? "fund"}`;
                        const planned = plannedByDepotItem.get(key) ?? 0;
                        return (
                          <li key={key}>
                            <span>{item.name}</span>
                            <span>
                              {item.quantity.toLocaleString()} {item.unit}
                              {planned > 0 ? ` · plan ${planned.toLocaleString()}` : ""}
                            </span>
                          </li>
                        );
                      }),
                    )}
                    {!snapshot?.classes.length ? <li className="state">No stock rows</li> : null}
                  </ul>
                </div>
              );
            })}
          </div>

          <form className="allocation-controls allocation-controls-compact" onSubmit={submitPlan}>
            <label>
              Planning date
              <input type="date" value={startDate} onChange={(event) => onStartDate(event.target.value)} required />
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
            <button type="submit" className="allocation-action primary" disabled={plan.state === "loading"}>
              Create plan
            </button>
          </form>
        </article>
      </section>

      <article className="panel allocation-table-panel allocation-plan-sheet" id="allocation-plan-sheet">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Dispatch list</p>
            <h2>Allocation plan</h2>
          </div>
          <span className="source">Model: {plan.data?.model_version ?? "flood-help-v2"}</span>
        </div>

        {plan.data?.shortages.length ? (
          <p className="allocation-alert" role="status">
            Stock shortage: {plan.data.shortages.length} line
            {plan.data.shortages.length === 1 ? "" : "s"} cannot be fully covered at the assigned depot.
          </p>
        ) : null}

        <div className="history-table allocation-table allocation-table-wide" role="table" aria-label="Resource allocation">
          <div className="history-row allocation header" role="row">
            <span>Township</span>
            <span>Depot</span>
            <span>Population</span>
            <span>Priority</span>
            <span>Resources</span>
            <span>Quantity</span>
            <span>Route</span>
          </div>
          {plan.data?.rows.map((row) => (
            <div className="history-row allocation" role="row" key={row.township_id}>
              <strong>
                {row.township_name}
                {row.has_shortage ? <small className="shortage-tag">partial</small> : null}
              </strong>
              <span>{depotLabel(row.depot_region)}</span>
              <span>{row.population.toLocaleString()}</span>
              <span className={`risk-pill risk-${row.priority}`}>{row.priority}</span>
              <span>{row.resources_label}</span>
              <span>{row.quantities_label}</span>
              <span>{row.route_id}</span>
            </div>
          ))}
        </div>

        <div className="allocation-actions">
          <button
            type="button"
            className="outline allocation-action"
            disabled={plan.state !== "ready"}
            onClick={() => window.print()}
          >
            Print plan
          </button>
          <button
            type="button"
            className="outline allocation-action"
            disabled={plan.state !== "ready" || pdfBusy}
            onClick={() => void savePdf()}
          >
            {pdfBusy ? "Saving PDF…" : "Save as PDF"}
          </button>
          {onOpenInventory ? (
            <button type="button" className="text-link" onClick={onOpenInventory}>
              Open inventory
            </button>
          ) : null}
        </div>
        {plan.data?.disclaimer ? <p className="hint">{plan.data.disclaimer}</p> : null}
      </article>
    </main>
  );
}
