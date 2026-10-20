import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import type {
  AdminDistrict,
  AssistancePriority,
  BagoAreasResponse,
  HelpBriefResponse,
  HelpDay,
  HelpResponse,
  LoadState,
} from "./types";

interface Resource<T> {
  state: LoadState;
  data?: T;
  error?: string;
}

const loading = <T,>(): Resource<T> => ({ state: "loading" });
const errorText = (reason: unknown) =>
  reason instanceof Error ? reason.message : "Unexpected request failure";

const PRIORITY_ACTION: Record<AssistancePriority, string> = {
  none: "Keep this township on the monitoring list. This outlook does not show an assistance caseload.",
  low: "Keep a small relief watch. The expected caseload is limited.",
  moderate: "Prepare township relief stocks for the expected households and people.",
  high: "Stage shelter kits, 3-day food rations, and drinking water for the expected caseload.",
  severe: "Treat this township as the first assistance priority in the current outlook.",
};

function StateMessage({ resource, empty }: { resource: Resource<unknown>; empty: string }) {
  if (resource.state === "loading") return <p className="state">Loading…</p>;
  if (resource.state === "error") return <p className="state error">Unavailable: {resource.error}</p>;
  if (resource.state === "empty") return <p className="state">{empty}</p>;
  return null;
}

function selectedPlace(districts: AdminDistrict[] | undefined, townshipId: string) {
  for (const district of districts ?? []) {
    const township = district.townships.find((item) => item.id === townshipId);
    if (township) return { district, township };
  }
  return undefined;
}

function peakDay(days: HelpDay[]): HelpDay {
  return days.reduce((best, day) =>
    day.expected_affected_people > best.expected_affected_people ? day : best,
  );
}

interface HumanitarianDashboardProps {
  areas: Resource<BagoAreasResponse>;
  selectedTownship: string;
  onTownshipChange: (townshipId: string) => void;
  startDate: string;
  onStartDate: (value: string) => void;
}

export default function HumanitarianDashboard({
  areas,
  selectedTownship,
  onTownshipChange,
  startDate,
  onStartDate,
}: HumanitarianDashboardProps) {
  const [brief, setBrief] = useState<Resource<HelpBriefResponse>>(loading);
  const [help, setHelp] = useState<Resource<HelpResponse>>({ state: "empty" });
  const place = useMemo(
    () => selectedPlace(areas.data?.districts, selectedTownship),
    [areas.data, selectedTownship],
  );

  useEffect(() => {
    let active = true;
    void api.helpBrief().then(
      (result) => {
        if (active) setBrief({ state: "ready", data: result });
      },
      (reason: unknown) => {
        if (active) setBrief({ state: "error", error: errorText(reason) });
      },
    );
    return () => {
      active = false;
    };
  }, []);

  const submitHelp = async (event: FormEvent) => {
    event.preventDefault();
    if (!place) {
      setHelp({ state: "error", error: "Bago township list is unavailable" });
      return;
    }
    setHelp(loading);
    try {
      const result = await api.help({
        date: startDate,
        township_id: place.township.id,
        latitude: place.township.latitude,
        longitude: place.township.longitude,
      });
      setHelp({ state: result.days.length ? "ready" : "empty", data: result });
    } catch (reason) {
      setHelp({ state: "error", error: errorText(reason) });
    }
  };

  const focus = help.data?.days.length ? peakDay(help.data.days) : undefined;

  return (
    <main>
      <section className="panel humanitarian-intro">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Humanitarian assistance sector</p>
            <h2>Flood help planning</h2>
          </div>
          <span className="source">Model: flood-help-v1</span>
        </div>
        <p className="hint">
          This view estimates who may need help. The flood-help model uses rainfall, modelled discharge, soil wetness, and recent conditions. Recorded household and population counts stay out of the prediction inputs. Shelter, food, and water figures apply fixed planning ratios to the expected counts.
        </p>
      </section>

      <section className="kpi-grid" aria-label="Recorded Bago assistance context">
        <article className="kpi">
          <span>Recorded flood days</span>
          <strong>{brief.data ? brief.data.recorded_flood_days.toLocaleString() : "—"}</strong>
        </article>
        <article className="kpi">
          <span>Recorded households</span>
          <strong>{brief.data ? brief.data.recorded_households.toLocaleString() : "—"}</strong>
        </article>
        <article className="kpi">
          <span>Recorded people</span>
          <strong>{brief.data ? brief.data.recorded_affected_people.toLocaleString() : "—"}</strong>
        </article>
        <article className="kpi">
          <span>Townships with impact</span>
          <strong>{brief.data ? brief.data.townships_with_impact.toLocaleString() : "—"}</strong>
        </article>
      </section>
      <StateMessage resource={brief} empty="No recorded assistance context returned." />
      {brief.state === "ready" && <p className="hint">{brief.data?.disclaimer} Source: /help-brief</p>}

      <section className="hero-grid">
        <article className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Assistance outlook</p>
              <h2>Expected caseload</h2>
            </div>
            <span className="source">Source: /help</span>
          </div>
          <form onSubmit={submitHelp}>
            <div className="form-grid">
              <label>
                Start date
                <input type="date" value={startDate} onChange={(event) => onStartDate(event.target.value)} required />
              </label>
              <label>
                Township
                <select
                  value={selectedTownship}
                  onChange={(event) => onTownshipChange(event.target.value)}
                  required
                  disabled={!place}
                >
                  {!place && <option value="">Loading Bago townships…</option>}
                  {areas.data?.districts.map((district) => (
                    <optgroup key={district.id} label={`${district.name_en} District`}>
                      {district.townships.map((township) => (
                        <option key={township.id} value={township.id}>
                          {township.name_en}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
            </div>
            <button type="submit" disabled={help.state === "loading" || !place}>
              {help.state === "loading" ? "Estimating assistance…" : "Estimate flood help"}
            </button>
          </form>
          {place && (
            <p className="place-note">
              {place.township.name_en}, {place.district.name_en} District
            </p>
          )}
          <StateMessage resource={help} empty="Choose a start date to estimate assistance need." />
          {help.state === "ready" && (
            <div className="history-table" role="table" aria-label="Flood help outlook">
              <div className="history-row help header" role="row">
                <span>Date</span>
                <span>Help chance</span>
                <span>People</span>
                <span>Households</span>
                <span>Priority</span>
              </div>
              {help.data?.days.map((day) => (
                <div className="history-row help" role="row" key={day.date}>
                  <strong>{day.date}</strong>
                  <span>{(day.help_probability * 100).toFixed(1)}%</span>
                  <span>{day.expected_affected_people.toLocaleString()}</span>
                  <span>{day.expected_households.toLocaleString()}</span>
                  <span className={`risk-pill risk-${day.assistance_priority}`}>{day.assistance_priority}</span>
                </div>
              ))}
            </div>
          )}
          {help.state === "ready" && help.data && (
            <p className="hint model-note">
              {help.data.disclaimer} Model {help.data.model_version}.
            </p>
          )}
        </article>

        <article className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Planning ratios</p>
              <h2>3-day package</h2>
            </div>
            <span className="source">Largest expected day</span>
          </div>
          {focus ? (
            <>
              <p className="hint">
                {focus.date} has the largest expected caseload in this outlook: {focus.expected_affected_people.toLocaleString()} people and {focus.expected_households.toLocaleString()} households.
              </p>
              <div className="package-grid">
                <article className="package">
                  <span>Shelter kits</span>
                  <strong>{focus.shelter_kits.toLocaleString()}</strong>
                </article>
                <article className="package">
                  <span>Food rations</span>
                  <strong>{focus.food_rations_3d.toLocaleString()}</strong>
                </article>
                <article className="package">
                  <span>Drinking water</span>
                  <strong>{focus.drinking_water_liters_3d.toLocaleString()} L</strong>
                </article>
              </div>
              <p className="action-note">{PRIORITY_ACTION[focus.assistance_priority]}</p>
            </>
          ) : (
            <p className="state">Load an assistance outlook to see the 3-day package.</p>
          )}
        </article>
      </section>

      <section className="panel historical">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Recorded relief</p>
            <h2>Highest historical impacts</h2>
          </div>
          <span className="source">Source: /help-brief</span>
        </div>
        <StateMessage resource={brief} empty="No recorded impacts returned." />
        {brief.state === "ready" && (
          <div className="history-table" role="table" aria-label="Highest recorded assistance impacts">
            <div className="history-row records header" role="row">
              <span>Date</span>
              <span>Township</span>
              <span>Households</span>
              <span>People</span>
              <span>Impact</span>
            </div>
            {brief.data?.highest_impacts.map((record) => (
              <div className="history-row records" role="row" key={`${record.date}-${record.township_id}`}>
                <strong>{record.date}</strong>
                <span>{record.township}</span>
                <span>{record.households == null ? "—" : record.households.toLocaleString()}</span>
                <span>{record.affected_people == null ? "—" : record.affected_people.toLocaleString()}</span>
                <span className={`risk-pill risk-${record.impact_severity}`}>{record.impact_severity}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
