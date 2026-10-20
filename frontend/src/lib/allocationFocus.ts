import type { RiskLevel } from "../types";

export interface AllocationFocus {
  townshipId: string;
  townshipName: string;
  date: string;
  riskLevel: RiskLevel;
  latitude: number;
  longitude: number;
}

export function needsResourceAllocation(level: RiskLevel | "unknown" | null | undefined): boolean {
  return level === "high" || level === "severe";
}
