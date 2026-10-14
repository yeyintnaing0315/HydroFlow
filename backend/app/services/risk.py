from typing import Literal

RiskLevel = Literal["low", "moderate", "high", "severe"]


def academic_risk_score(
    precipitation_mm: float, discharge_m3_s: float, predicted_value: float = 0
) -> tuple[float, RiskLevel]:
    """Deterministic academic heuristic, not an operational warning."""
    score = min(
        100.0,
        max(0.0, precipitation_mm) * 1.25
        + max(0.0, discharge_m3_s) * 0.04
        + max(0.0, predicted_value) * 10,
    )
    if score < 25:
        level: RiskLevel = "low"
    elif score < 50:
        level = "moderate"
    elif score < 75:
        level = "high"
    else:
        level = "severe"
    return round(score, 2), level
