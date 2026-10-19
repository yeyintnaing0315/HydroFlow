import type { HealthResponse, LoadState } from "./types";

interface Resource<T> {
  state: LoadState;
  data?: T;
  error?: string;
}

interface SettingsPageProps {
  health: Resource<HealthResponse>;
}

export default function SettingsPage({ health }: SettingsPageProps) {
  return (
    <main className="settings-board">
      <article className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Workspace</p>
            <h2>Region</h2>
          </div>
        </div>
        <div className="settings-grid">
          <div>
            <span>Region</span>
            <strong>Bago Region, Myanmar</strong>
          </div>
          <div>
            <span>Timezone</span>
            <strong>{Intl.DateTimeFormat().resolvedOptions().timeZone}</strong>
          </div>
        </div>
      </article>

      <article className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">API</p>
            <h2>Connected services</h2>
          </div>
        </div>
        <div className="settings-grid">
          <div>
            <span>Status</span>
            <strong>{health.data?.status ?? health.state}</strong>
          </div>
          <div>
            <span>Service</span>
            <strong>
              {health.data?.service ?? "hydroflow-api"} v{health.data?.version ?? "—"}
            </strong>
          </div>
          <div>
            <span>Flood model artifact</span>
            <strong>{health.data?.models?.flood ? "Loaded" : "Unavailable"}</strong>
          </div>
          <div>
            <span>Help / allocation models</span>
            <strong>
              Help {health.data?.models?.help ? "loaded" : "unavailable"} · Allocation{" "}
              {health.data?.models?.allocation ? "loaded" : "unavailable"}
            </strong>
          </div>
        </div>
        <p className="hint">
          Academic prototype for Bago Region. Scores and allocation plans are planning aids, not official
          warnings or dispatch orders.
        </p>
      </article>
    </main>
  );
}
