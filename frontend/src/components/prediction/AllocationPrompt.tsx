import type { PredictionTimelineDay } from "../../types";
import { needsResourceAllocation } from "../../lib/allocationFocus";
import { riskLabel } from "./mapUtils";

interface AllocationPromptProps {
  day: PredictionTimelineDay | undefined;
  townshipName: string;
  onPlanResources: () => void;
}

export default function AllocationPrompt({ day, townshipName, onPlanResources }: AllocationPromptProps) {
  if (!day) return null;

  const level = day.probability_risk_level ?? "unknown";
  if (needsResourceAllocation(level)) {
    return (
      <div className="allocation-prompt allocate">
        <p>
          <strong>{townshipName}</strong> — {riskLabel(level)} flood risk on {day.date}. Humanitarian supplies may
          be needed.
        </p>
        <button type="button" className="allocation-action primary" onClick={onPlanResources}>
          Plan resource allocation
        </button>
      </div>
    );
  }

  return (
    <div className="allocation-prompt calm" role="status">
      <p>
        <strong>No allocation needed.</strong> {townshipName} is {riskLabel(level)} risk on {day.date}; continue
        monitoring only.
      </p>
    </div>
  );
}
