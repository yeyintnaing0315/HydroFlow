import type { AllocationPlanResponse } from "./types";

export async function downloadAllocationPlanPdf(plan: AllocationPlanResponse): Promise<void> {
  const [{ jsPDF }, autoTableModule] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = autoTableModule.default;
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const margin = 40;
  doc.setFontSize(14);
  doc.text("HydroFlow resource allocation plan", margin, margin);
  doc.setFontSize(10);
  doc.text(`Plan ${plan.plan_id} · ${plan.planning_date} · ${plan.model_version}`, margin, margin + 18);
  doc.text(
    `Affected population: ${plan.totals.affected_population.toLocaleString()} · Stock on hand: ${plan.totals.available_stock_units.toLocaleString()} · Needed: ${plan.totals.resources_needed_units.toLocaleString()}`,
    margin,
    margin + 32,
  );

  autoTable(doc, {
    startY: margin + 48,
    head: [["Township", "Depot", "People", "Priority", "Resources", "Quantity", "Route"]],
    body: plan.rows.map((row) => [
      row.township_name,
      row.depot_region === "east" ? "Bago" : "Pyay",
      row.population.toLocaleString(),
      row.priority,
      row.resources_label,
      row.quantities_label,
      row.route_id,
    ]),
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [11, 88, 115] },
  });

  doc.save(`allocation-plan-${plan.planning_date}.pdf`);
}
