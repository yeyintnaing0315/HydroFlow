import type { BagoAreasResponse, HealthResponse, JobRun, LoadState, PageId } from "./types";

interface Resource<T> {
  state: LoadState;
  data?: T;
  error?: string;
}

interface DashboardHomeProps {
  health: Resource<HealthResponse>;
  areas: Resource<BagoAreasResponse>;
  runs: Resource<JobRun[]>;
  townshipCount: number;
  onOpen: (page: PageId) => void;
}

export default function DashboardHome({
  health,
  areas,
  runs,
  townshipCount,
  onOpen,
}: DashboardHomeProps) {
  const districts = areas.data?.districts?.length ?? 0;
  const lastRun = runs.data?.find((run) => run.status === "succeeded");

  return (
    <main className="home-board">
      <section className="panel home-hero">
        <div>
          <p className="eyebrow">System flow</p>
          <h2>Flood prediction to relief dispatch</h2>
          <p>
            HydroFlow follows one path: score flood risk in Bago townships, pass high-risk places into
            resource allocation, then check warehouse stock before a coordinator confirms dispatch.
          </p>
        </div>
        <ol className="flow-steps" aria-label="HydroFlow system flow">
          <li>
            <b>1</b>
            <div>
              <strong>Flood Prediction</strong>
              <span>Join rainfall, weather, discharge, and the saved flood model.</span>
            </div>
          </li>
          <li>
            <b>2</b>
            <div>
              <strong>High-risk warning</strong>
              <span>If risk is high, warn and send the township to allocation.</span>
            </div>
          </li>
          <li>
            <b>3</b>
            <div>
              <strong>Resource Allocation</strong>
              <span>Estimate need, rank townships, and plan a warehouse route.</span>
            </div>
          </li>
          <li>
            <b>4</b>
            <div>
              <strong>Inventory</strong>
              <span>Scan or add stock, raise shortage alerts, and return counts.</span>
            </div>
          </li>
        </ol>
      </section>

      <section className="home-kpis" aria-label="Dashboard summary">
        <article className="stat-card tone-total">
          <span>Districts in view</span>
          <strong>{districts || "—"}</strong>
          <small>{townshipCount ? `${townshipCount} townships` : "Bago Region"}</small>
        </article>
        <article className="stat-card tone-foods">
          <span>Flood model</span>
          <strong>{health.data?.models?.flood ? "Ready" : "Checking"}</strong>
          <small>{health.data?.service ?? "API"}</small>
        </article>
        <article className="stat-card tone-tents">
          <span>Last successful run</span>
          <strong>{lastRun ? "Recorded" : "None"}</strong>
          <small>{lastRun?.finished_at?.slice(0, 16) ?? "No job stored yet"}</small>
        </article>
        <article className="stat-card tone-utensils">
          <span>API</span>
          <strong>{health.data?.status ?? health.state}</strong>
          <small>v{health.data?.version ?? "—"}</small>
        </article>
      </section>

      <section className="home-modules">
        <article className="panel module-card">
          <p className="eyebrow">1 · Flood Prediction</p>
          <h2>Township flood chance and risk</h2>
          <p>
            One joined outlook: rain, temperature, humidity, wind, modeled discharge, the flood-in-next-3-days
            score, and a separate heuristic risk.
          </p>
          <button type="button" onClick={() => onOpen("prediction")}>
            Open flood prediction
          </button>
        </article>
        <article className="panel module-card">
          <p className="eyebrow">2 · Resource Allocation</p>
          <h2>Need, stock, and route</h2>
          <p>Rank affected townships, compare warehouse stock, and generate an allocation plan.</p>
          <button type="button" onClick={() => onOpen("allocation")}>
            Open resource allocation
          </button>
        </article>
        <article className="panel module-card">
          <p className="eyebrow">3 · Inventory Management</p>
          <h2>Warehouse stock and alerts</h2>
          <p>Scan or enter relief items, watch low-stock alerts, and keep allocation counts current.</p>
          <button type="button" onClick={() => onOpen("inventory")}>
            Open inventory
          </button>
        </article>
      </section>
    </main>
  );
}
