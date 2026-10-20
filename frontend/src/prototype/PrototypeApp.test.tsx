import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import PrototypeApp from "./PrototypeApp";

afterEach(() => cleanup());

function renderApp() {
  return render(<PrototypeApp />);
}

describe("HydroFlow prototype", () => {
  it("keeps the shared selection and wires the four pages", () => {
    renderApp();

    expect(screen.getByRole("heading", { name: "Home" })).toBeInTheDocument();
    expect(screen.getByText(/Township: Nyaunglebin · District: Nyaunglebin/)).toBeInTheDocument();
    expect(screen.getByText("DEMO DATA")).toBeInTheDocument();
    expect(screen.getByText("Academic prototype. Not for emergency decisions.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "View flood prediction details" }));
    expect(screen.getByRole("heading", { name: "Flood Prediction" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Bago district, High risk" }));
    const bagoTownships = screen.getByText("Bago townships").parentElement;
    expect(bagoTownships).toBeTruthy();
    const townList = within(bagoTownships as HTMLElement);
    expect(townList.getByRole("button", { name: /Thanatpin/i })).toBeInTheDocument();
    expect(townList.queryByRole("button", { name: /Kyauktaga/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Township: Nyaunglebin · District: Nyaunglebin/)).toBeInTheDocument();

    fireEvent.click(townList.getByRole("button", { name: /Thanatpin/i }));
    expect(screen.getByText(/Township: Thanatpin · District: Bago/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Plan resources for this township" }));
    expect(screen.getByRole("heading", { name: "Resource Allocation" })).toBeInTheDocument();
    expect(screen.getByText("10,300")).toBeInTheDocument();

    const rice = screen.getByLabelText("Will allocate Rice (kg)") as HTMLInputElement;
    expect(rice.value).toBe("1700");
    fireEvent.change(rice, { target: { value: "2501" } });
    expect(screen.getByRole("alert")).toHaveTextContent(/Stock is lower than the amount/);

    fireEvent.change(rice, { target: { value: "1700" } });
    expect(screen.queryByText(/Stock is lower than the amount/)).not.toBeInTheDocument();

    const west = within(screen.getByRole("group", { name: "Allocation depot" })).getByRole("button", {
      name: "Bago (West)",
    });
    fireEvent.click(west);
    expect(screen.getByText(/Depot: Bago \(West\)/)).toBeInTheDocument();
    expect((screen.getByLabelText("Will allocate Rice (kg)") as HTMLInputElement).value).toBe("100");

    fireEvent.click(within(screen.getByRole("group", { name: "Allocation depot" })).getByRole("button", { name: "Bago (East)" }));
    fireEvent.change(screen.getByLabelText("Will allocate Rice (kg)"), { target: { value: "1700" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm allocation" }));
    const dialog = screen.getByRole("dialog", { name: "Confirm allocation" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm allocation" }));

    expect(screen.getByRole("status")).toHaveTextContent("Allocation confirmed");
    fireEvent.click(screen.getByRole("button", { name: "View in Inventory" }));
    expect(screen.getByRole("heading", { name: "Inventory Management" })).toBeInTheDocument();

    const riceRow = screen.getByText("Rice (kg)").closest("tr");
    expect(riceRow).toHaveTextContent("800");
    expect(riceRow).toHaveTextContent("1,700");
    expect(riceRow).toHaveTextContent("Low");

    const needLinks = screen.getAllByRole("button", { name: "Needed by 2 townships" });
    expect(needLinks.length).toBeGreaterThan(0);
    fireEvent.click(needLinks[0]);
    expect(screen.getByRole("heading", { name: "Resource Allocation" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Flood Prediction" }));
    fireEvent.click(screen.getByRole("button", { name: "Load prediction for Bago on 2026-10-09" }));
    expect(screen.getByText(/Township: Bago · District: Bago/)).toBeInTheDocument();
    expect(screen.getByLabelText("Flood probability")).toHaveTextContent("61%");
    expect(screen.getByText(/Loaded from prediction history/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Data state"), { target: { value: "empty" } });
    expect(screen.getAllByText("No records for this selection.").length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText("Data state"), { target: { value: "stale" } });
    expect(screen.getAllByText(/Stale data · Last updated 16 Oct 2026, 06:12 AM/).length).toBeGreaterThan(0);
  });
});
