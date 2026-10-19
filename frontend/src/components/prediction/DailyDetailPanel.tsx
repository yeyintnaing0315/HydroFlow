import type { PredictionTimelineDay } from "../../types";
import { formatPercent, riskLabel } from "./mapUtils";

interface DailyDetailPanelProps {
  day: PredictionTimelineDay | undefined;
  inTrainingSet?: boolean;
}

export default function DailyDetailPanel({ day, inTrainingSet }: DailyDetailPanelProps) {
  if (!day) {
    return <p className="state">Select a date to view the joined outlook.</p>;
  }
  const tiles: [string, string][] = [
    ["Flood chance", formatPercent(day.flood_probability)],
    ["Risk", riskLabel(day.probability_risk_level)],
    ["Rainfall", day.rainfall_mm == null ? "—" : `${day.rainfall_mm.toFixed(1)} mm`],
    ["Discharge", day.discharge_m3_s == null ? "—" : `${day.discharge_m3_s.toFixed(1)} m³/s`],
    ["Humidity", day.relative_humidity_pct == null ? "—" : `${Math.round(day.relative_humidity_pct)} %`],
  ];
  return (
    <>
      <div className="flood-now-grid" role="table" aria-label="Joined flood outlook">
        {tiles.map(([label, value]) => (
          <div key={label} role="row">
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <p className="hint">
        {inTrainingSet
          ? "Academic score, not an official warning."
          : "Out-of-sample estimate, not an official warning."}
      </p>
    </>
  );
}
