import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";

vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="map">{children}</div>,
  TileLayer: () => null,
  CircleMarker: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Popup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Polyline: () => null,
  useMap: () => ({ fitBounds: () => undefined }),
}));

vi.mock("./api", () => ({
  api: {
    health: vi.fn().mockResolvedValue({ status: "ok", service: "hydroflow-api", version: "0.1.0" }),
    forecast: vi.fn().mockResolvedValue({ latitude: 17.336, longitude: 96.481, points: [] }),
    alerts: vi.fn().mockResolvedValue([]),
    topography: vi.fn().mockResolvedValue({
      latitude: 17.3358,
      longitude: 96.4839,
      elevation_m: 18.4,
      dataset: "COP30",
      vertical_datum: "EGM2008",
      vertical_datum_epsg: "3855",
      unit: "Meters",
      source: "OpenTopography Copernicus GLO-30",
      note: "Surface elevation at the requested point. The flood model does not use this value.",
    }),
    historical: vi.fn().mockResolvedValue({
      latitude: 17.336,
      longitude: 96.481,
      points: [
        {
          date: "2026-01-01",
          precipitation_mm: 4,
          temperature_c: 23.5,
          relative_humidity_pct: 80,
        },
      ],
    }),
    floodHistory: vi.fn().mockResolvedValue({
      source: "Bago relief records",
      disclaimer: "Recorded impacts, not model predictions.",
      matched_records: 1,
      records: [
        {
          date: "2025-10-02",
          township_id: "pyay",
          township: "Pyay",
          latitude: 18.817,
          longitude: 95.217,
          households: 22,
          affected_people: 72,
          impact_severity: "low",
        },
      ],
    }),
    townships: vi.fn().mockResolvedValue([
      { township_id: "bago", township: "Bago", latitude: 17.335, longitude: 96.481 },
    ]),
    bagoAreas: vi.fn().mockResolvedValue({
      source: "Open Admin Data",
      region_id: "MMR007",
      region_name_en: "Bago",
      region_name_local: "ပဲခူးတိုင်းဒေသကြီး",
      latitude: 18.2638,
      longitude: 96.0673,
      districts: [
        {
          id: "MMR007D001",
          slug: "bago-MMR007D001",
          name_en: "Bago",
          name_local: "ပဲခူးခရိုင်",
          latitude: 17.6768,
          longitude: 96.6216,
          townships: [
            {
              id: "MMR007001701",
              slug: "bago-MMR007001701",
              name_en: "Bago",
              name_local: "ပဲခူး",
              latitude: 17.3358,
              longitude: 96.4839,
            },
          ],
        },
        {
          id: "MMR008D001",
          slug: "pyay-MMR008D001",
          name_en: "Pyay",
          name_local: "ပြည်ခရိုင်",
          latitude: 18.696,
          longitude: 95.3295,
          townships: [
            {
              id: "MMR008001",
              slug: "pyay-MMR008001",
              name_en: "Pyay",
              name_local: "ပြည်",
              latitude: 18.817,
              longitude: 95.217,
            },
          ],
        },
      ],
    }),
    outlook: vi.fn(),
    census: vi.fn().mockResolvedValue({
      source: "2024 Population and Housing Census, Bago Region tables",
      source_file: "data/2024_census_bago_report (update).xlsx",
      census_year: 2024,
      region_name_en: "Bago",
      region_name_local: "ပဲခူးတိုင်းဒေသကြီး",
      notes: ["Age groups are not published for individual townships."],
      dwelling_types: [{ key: "wooden", name_local: "သစ်သားအိမ်", name_en: "Wooden house" }],
      population: {
        total: { total: 4453687, male: 2078567, female: 2375120 },
        urban: { total: 1128732, male: 512226, female: 616506 },
        rural: { total: 3324955, male: 1566341, female: 1758614 },
      },
      age_groups: [],
      households: {
        total: 1029962,
        by_size: [{ size: "4", households: 231119 }],
        by_dwelling: {
          total: 1029962,
          apartment: 0,
          brick: 0,
          semi_brick: 0,
          wooden: 1029962,
          bamboo: 0,
          hut: 0,
          other: 0,
        },
        urban_dwellings: {
          total: 266225,
          apartment: 0,
          brick: 0,
          semi_brick: 0,
          wooden: 266225,
          bamboo: 0,
          hut: 0,
          other: 0,
        },
        rural_dwellings: {
          total: 763737,
          apartment: 0,
          brick: 0,
          semi_brick: 0,
          wooden: 763737,
          bamboo: 0,
          hut: 0,
          other: 0,
        },
      },
      districts: [
        {
          name_en: "Bago",
          name_local: "ပဲခူးခရိုင်",
          population: { total: 927389, male: 429760, female: 497629 },
          age_groups: [
            {
              label: "0-4",
              min_age: 0,
              max_age: 4,
              total: { total: 64676, male: 32937, female: 31739 },
              urban: { total: 19338, male: 9780, female: 9558 },
              rural: { total: 45338, male: 23157, female: 22181 },
            },
          ],
          households: {
            total: 224609,
            by_size: [],
            by_dwelling: {
              total: 224609,
              apartment: 0,
              brick: 0,
              semi_brick: 0,
              wooden: 224609,
              bamboo: 0,
              hut: 0,
              other: 0,
            },
          },
          townships: [
            {
              name_en: "Bago",
              name_local: "ပဲခူးမြို့နယ်",
              population: { total: 484994, male: 224660, female: 260334 },
              households: {
                total: 111465,
                by_size: [{ size: "4", households: 25426 }],
                by_dwelling: {
                  total: 111465,
                  apartment: 0,
                  brick: 0,
                  semi_brick: 0,
                  wooden: 48806,
                  bamboo: 0,
                  hut: 0,
                  other: 0,
                },
              },
            },
          ],
        },
      ],
    }),
    helpBrief: vi.fn().mockResolvedValue({
      source: "Bago relief records",
      disclaimer: "Recorded impacts, not flood-help model predictions.",
      recorded_flood_days: 12,
      recorded_households: 40,
      recorded_affected_people: 90,
      townships_with_impact: 3,
      highest_impacts: [
        {
          date: "2024-09-12",
          township_id: "bago",
          township: "Bago",
          latitude: 17.336,
          longitude: 96.481,
          households: 40,
          affected_people: 90,
          impact_severity: "moderate",
        },
      ],
    }),
    help: vi.fn().mockResolvedValue({
      township_id: "bago",
      source: "Open-Meteo rainfall and GloFAS discharge",
      model_version: "flood-help-v2",
      disclaimer: "Academic planning aid. Not an operational humanitarian response plan.",
      days: [
        {
          date: "2026-10-01",
          help_probability: 0.42,
          predicted_help: true,
          expected_affected_people: 4,
          expected_households: 2,
          assistance_priority: "low",
          shelter_kits: 2,
          food_rations_3d: 12,
          drinking_water_liters_3d: 180,
        },
      ],
    }),
  },
}));

afterEach(() => {
  cleanup();
});

describe("dashboard", () => {
  it("labels demo data and warns against operational use", async () => {
    render(<App />);

    expect(screen.getByRole("alert")).toHaveTextContent("not an operational warning");
    expect(screen.getByText(/Open-Meteo/)).toBeInTheDocument();
    expect(screen.getByText(/GloFAS/i)).toBeInTheDocument();
    expect(await screen.findByText("API ok", {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByTestId("map")).toBeInTheDocument();
    expect(await screen.findByText(/2022 Bago districts/)).toBeInTheDocument();
    expect(screen.getByText(/six-district Bago Region list/)).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Bago" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Pyay" })).toBeInTheDocument();
    expect(screen.getAllByText(/Bago District/).length).toBeGreaterThan(0);
    expect(screen.getByText("2025-10-02")).toBeInTheDocument();
    expect(screen.getByText(/not a live forecast/i)).toBeInTheDocument();
    expect(await screen.findByText(/18\.4 m from OpenTopography/)).toBeInTheDocument();
    expect(screen.getByText(/The flood model does not use this value/)).toBeInTheDocument();
    expect(await screen.findByText("Humidity")).toBeInTheDocument();
    expect(screen.getByText(/80\s*%/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Humanitarian assistance" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Plan relief route" })).toBeDisabled();
    expect(screen.getByText(/administrative centroids/)).toBeInTheDocument();
  }, 20000);

  it("opens the humanitarian assistance sector", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Humanitarian assistance" }));

    expect(await screen.findByRole("heading", { name: "Flood help planning" })).toBeInTheDocument();
    expect(await screen.findByText("4,453,687")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Bago population" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Bago District age groups" })).toBeInTheDocument();
    expect(await screen.findByText("12")).toBeInTheDocument();
    expect(screen.getByText(/Recorded impacts, not flood-help model predictions/)).toBeInTheDocument();
    expect(await screen.findByRole("option", { name: "Bago" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Estimate flood help" }));
    expect(await screen.findByText("42.0%")).toBeInTheDocument();
    expect(screen.getByText("180 L")).toBeInTheDocument();
    expect(screen.getByText(/Keep a small relief watch/)).toBeInTheDocument();
  });
});
