import type { BagoAreasResponse, HealthResponse, JobRun, LoadState, PageId } from "./types";

interface Resource<T> {
  state: LoadState;
  data?: T;
  error?: string;
}

interface ReportsPageProps {
  health: Resource<HealthResponse>;
  areas: Resource<BagoAreasResponse>;
  runs: Resource<JobRun[]>;
  townshipCount: number;
  lastSuccessfulRun?: JobRun;
  onOpen: (page: PageId) => void;
}

export default function ReportsPage({
  health,
  areas,
  runs,
  townshipCount,
  lastSuccessfulRun,
  onOpen,
}: ReportsPageProps) {
  const rows = runs.data?.slice(0, 8) ?? [];

  return (
    <main className="reports-board">
      <section className="home-kpis" aria-label="Report summary">
        <article className="stat-card tone-total">
          <span>Townships</span>
          <strong>{townshipCount || "—"}</strong>
          <small>{areas.data?.region_name_en ?? "Bago"} Region</small>
        </article>
        <article className="stat-card tone-clothes">
          <span>Flood model</span>
          <strong>{health.data?.models?.flood ? "Loaded" : "Unavailable"}</strong>
          <small>Help model {health.data?.models?.help ? "loaded" : "unavailable"}</small>
        </article>
        <article className="stat-card tone-tents">
          <span>Last successful run</span>
          <strong>{lastSuccessfulRun ? lastSuccessfulRun.status : "None"}</strong>
          <small>{lastSuccessfulRun?.job_name ?? "No stored job"}</small>
        </article>
      </section>

      <article className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Job history</p>
            <h2>Prediction and operations runs</h2>
          </div>
          <button type="button" className="text-link" onClick={() => onOpen("prediction")}>
            Open flood prediction
          </button>
        </div>
        {runs.state === "loading" && <p className="state">Loading runs…</p>}
        {runs.state === "error" && <p className="state error">Unavailable: {runs.error}</p>}
        {runs.state === "empty" && <p className="state">No job runs are stored yet.</p>}
        {rows.length > 0 && (
          <div className="history-table" role="table" aria-label="Recent runs">
            <div className="history-row header" role="row">
              <span>Job</span>
              <span>Status</span>
              <span>Started</span>
              <span>Finished</span>
            </div>
            {rows.map((run) => (
              <div className="history-row" role="row" key={run.id}>
                <strong>{run.job_name}</strong>
                <span>{run.status}</span>
                <span>{run.started_at.slice(0, 16)}</span>
                <span>{(run.finished_at ?? "—").toString().slice(0, 16)}</span>
              </div>
            ))}
          </div>
        )}
      </article>

      <article className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Coverage</p>
            <h2>Districts in the current map pack</h2>
          </div>
        </div>
        <ul className="report-districts">
          {(areas.data?.districts ?? []).map((district) => (
            <li key={district.id}>
              <strong>{district.name_en}</strong>
              <span>{district.townships.length} townships</span>
            </li>
          ))}
        </ul>
      </article>
    </main>
  );
}
