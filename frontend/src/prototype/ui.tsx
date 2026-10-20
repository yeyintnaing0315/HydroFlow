import { useEffect, useRef, type ReactNode } from "react";
import {
  DEPOT_LABEL,
  DISTRICTS,
  formatIsoDate,
  LAST_UPDATED,
  RISK_LABEL,
  STATUS_LABEL,
  TOWNSHIPS,
  type DataView,
  type DepotId,
  type RiskLevel,
  type Status,
} from "./data";
import { usePrototype } from "./store";

export function RiskPill({ level }: { level: RiskLevel }) {
  return <span className={`hf-risk hf-risk-${level}`}>{RISK_LABEL[level]}</span>;
}

export function StatusPill({ status }: { status: Status }) {
  return <span className={`hf-status hf-status-${status}`}>{STATUS_LABEL[status]}</span>;
}

export function Tabs<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { id: T; label: string }[];
  onChange: (id: T) => void;
}) {
  return (
    <div className="hf-tabs" role="tablist" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="tab"
          aria-selected={value === option.id}
          className={value === option.id ? "is-active" : ""}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: DepotId;
  onChange: (depot: DepotId) => void;
}) {
  return (
    <div className="hf-toggle" role="group" aria-label={label}>
      {(Object.keys(DEPOT_LABEL) as DepotId[]).map((depot) => (
        <button
          key={depot}
          type="button"
          aria-pressed={value === depot}
          className={value === depot ? "is-active" : ""}
          onClick={() => onChange(depot)}
        >
          {DEPOT_LABEL[depot]}
        </button>
      ))}
    </div>
  );
}

export function DataBlock({
  title,
  eyebrow,
  action,
  testId,
  children,
}: {
  title?: string;
  eyebrow?: string;
  action?: ReactNode;
  testId: string;
  children: ReactNode;
}) {
  const { dataView, retry } = usePrototype();
  const showBody = dataView === "ready" || dataView === "stale";
  return (
    <section className="hf-card" data-testid={testId} aria-busy={dataView === "loading"}>
      {(title || action) && (
        <header className="hf-card-head">
          <div>
            {eyebrow && <p className="hf-eyebrow">{eyebrow}</p>}
            {title && <h2>{title}</h2>}
          </div>
          {action}
        </header>
      )}
      {dataView === "stale" && (
        <p className="hf-stale" role="status">
          Stale data · Last updated {LAST_UPDATED}
        </p>
      )}
      {dataView === "loading" && (
        <div className="hf-loading" role="status">
          <span className="hf-bar" />
          <span className="hf-bar" />
          <span className="hf-bar short" />
          <p>Loading…</p>
        </div>
      )}
      {dataView === "empty" && <p className="hf-empty">No records for this selection.</p>}
      {dataView === "error" && (
        <div className="hf-error" role="alert">
          <p>This block could not be loaded.</p>
          <button type="button" onClick={retry}>
            Retry
          </button>
        </div>
      )}
      {showBody && children}
    </section>
  );
}

export function ContextBar() {
  const {
    selection,
    setTownship,
    setDistrict,
    setDate,
    setDepot,
    dataView,
    setDataView,
    districtName,
  } = usePrototype();
  const districtId = TOWNSHIPS.find((item) => item.id === selection.townshipId)?.districtId ?? "nyaunglebin";

  return (
    <div className="hf-context" aria-label="Shared selection">
      <label>
        Township
        <select aria-label="Township" value={selection.townshipId} onChange={(event) => setTownship(event.target.value)}>
          {DISTRICTS.map((district) => (
            <optgroup key={district.id} label={district.name}>
              {TOWNSHIPS.filter((item) => item.districtId === district.id).map((township) => (
                <option key={township.id} value={township.id}>
                  {township.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <label>
        District
        <select aria-label="District" value={districtId} onChange={(event) => setDistrict(event.target.value)}>
          {DISTRICTS.map((district) => (
            <option key={district.id} value={district.id}>
              {district.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Date
        <input aria-label="Date" type="date" value={selection.date} onChange={(event) => setDate(event.target.value)} />
      </label>
      <label>
        Horizon
        <select aria-label="Horizon" value={selection.horizon} onChange={() => undefined}>
          <option value="1-week">1 week</option>
        </select>
      </label>
      <div className="hf-context-depot">
        <span>Depot</span>
        <Toggle label="Depot" value={selection.depot} onChange={setDepot} />
      </div>
      <label className="hf-state-picker">
        Data state
        <select aria-label="Data state" value={dataView} onChange={(event) => setDataView(event.target.value as DataView)}>
          <option value="ready">Ready</option>
          <option value="loading">Loading</option>
          <option value="empty">Empty</option>
          <option value="error">Error</option>
          <option value="stale">Stale data</option>
        </select>
      </label>
      <p className="hf-context-readout">
        Township: {TOWNSHIPS.find((item) => item.id === selection.townshipId)?.name} · District: {districtName} ·{" "}
        {formatIsoDate(selection.date)} · Horizon: 1 week · Depot: {DEPOT_LABEL[selection.depot]}
      </p>
    </div>
  );
}

export function ConfirmDialog() {
  const { dialogOpen, closeConfirm, canConfirm, confirmAllocation, lines, townshipName, depotLabel, prediction } =
    usePrototype();
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!dialogOpen) return;
    confirmRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeConfirm();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeConfirm, dialogOpen]);

  if (!dialogOpen) return null;
  const planned = lines.filter((line) => line.willAllocate > 0);

  return (
    <div className="hf-modal-back" role="presentation" onMouseDown={closeConfirm}>
      <div
        className="hf-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="confirm-title">Confirm allocation</h2>
        <p>
          {townshipName} · {formatIsoDate(prediction.date)} · Horizon: 1 week · {depotLabel}
        </p>
        <p className="hf-note">A coordinator confirms; nothing is sent automatically.</p>
        {!canConfirm && (
          <p className="hf-warning" role="alert">
            Reduce amounts that are higher than the stock on hand before confirming.
          </p>
        )}
        <ul className="hf-confirm-list">
          {planned.map((line) => (
            <li key={line.item.id}>
              <span>{line.item.name}</span>
              <strong>{line.willAllocate.toLocaleString("en-US")}</strong>
            </li>
          ))}
          {planned.length === 0 && <li>Nothing is queued to allocate.</li>}
        </ul>
        <div className="hf-modal-actions">
          <button type="button" className="hf-btn ghost" onClick={closeConfirm}>
            Back
          </button>
          <button type="button" className="hf-btn" ref={confirmRef} disabled={!canConfirm} onClick={confirmAllocation}>
            Confirm allocation
          </button>
        </div>
      </div>
    </div>
  );
}

export function Toast() {
  const { toastOpen, dismissToast, viewInventoryFromToast } = usePrototype();
  if (!toastOpen) return null;
  return (
    <div className="hf-toast" role="status">
      <strong>Allocation confirmed</strong>
      <button type="button" className="hf-link" onClick={viewInventoryFromToast}>
        View in Inventory
      </button>
      <button type="button" className="hf-toast-close" aria-label="Dismiss notification" onClick={dismissToast}>
        Close
      </button>
    </div>
  );
}
