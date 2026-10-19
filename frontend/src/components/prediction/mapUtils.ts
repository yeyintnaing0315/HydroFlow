import type { RiskLevel } from "../../types";

export const DISTRICT_COLOR: Record<string, string> = {
  MMR007D001: "#0b5873",
  nyaunglebin: "#2d9c6c",
  MMR007D002: "#16827d",
  MMR008D002: "#d86a1a",
  nattalin: "#7a4ea3",
  MMR008D001: "#c49212",
  "MOHA2022-BAGO": "#0b5873",
  "MOHA2022-NYAUNGLEBIN": "#2d9c6c",
  "MOHA2022-TAUNGOO": "#16827d",
  "MOHA2022-THAYARWADY": "#d86a1a",
  "MOHA2022-NATTALIN": "#7a4ea3",
  "MOHA2022-PYAY": "#c49212",
};

export function districtColor(id: string): string {
  return DISTRICT_COLOR[id] ?? "#5d727c";
}

export function riskColor(level: string): string {
  return (
    { low: "#2d9c6c", moderate: "#c49212", high: "#d86a1a", severe: "#a83232", unknown: "#5d727c" }[
      level
    ] ?? "#5d727c"
  );
}

export function riskLabel(level: RiskLevel | "unknown" | null | undefined): string {
  if (!level || level === "unknown") return "Unknown";
  if (level === "moderate") return "Medium";
  return level.charAt(0).toUpperCase() + level.slice(1);
}

export function formatPercent(probability: number | null | undefined): string {
  if (probability == null) return "—";
  return `${Math.round(probability * 100)}%`;
}
