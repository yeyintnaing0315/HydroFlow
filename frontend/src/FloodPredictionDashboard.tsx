import { useEffect, useMemo, useState } from "react";
import { CircleMarker, GeoJSON, MapContainer, Pane, Popup, TileLayer, useMap } from "react-leaflet";
import type { GeoJsonObject } from "geojson";
import DailyDetailPanel from "./components/prediction/DailyDetailPanel";
import { districtColor, formatPercent, riskColor, riskLabel } from "./components/prediction/mapUtils";
import { usePredictionTimeline } from "./hooks/usePredictionTimeline";
import type {
  BagoAreasResponse,
  HealthResponse,
  InundationProduct,
  JobRun,
  LoadState,
  PredictionTimelineDay,
  SettlementPoint,
  TownshipMapScore,
} from "./types";

interface Resource<T> {
  state: LoadState;
  data?: T;
  error?: string;
}

function preferredTownshipId(districts: BagoAreasResponse["districts"]): string {
  const bagoDistrict = districts.find((district) => district.name_en === "Bago");
  const bagoTownship = bagoDistrict?.townships.find((township) => township.name_en === "Bago");
  return bagoTownship?.id ?? districts[0]?.townships[0]?.id ?? "";
}

function FitPoints({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0 || typeof map.getContainer !== "function") return;
    const container = map.getContainer();
    const fit = () => {
      try {
        map.invalidateSize();
        map.fitBounds(points, { padding: [18, 18], maxZoom: 9 });
      } catch {
        // Leaflet can throw if the map is torn down during a reload.
      }
    };
    const frame = requestAnimationFrame(fit);
    if (typeof ResizeObserver === "undefined") {
      return () => cancelAnimationFrame(frame);
    }
    const observer = new ResizeObserver(() => {
      const size = map.getSize();
      const box = container.getBoundingClientRect();
      if (Math.abs(size.x - box.width) > 2 || Math.abs(size.y - box.height) > 2) fit();
    });
    observer.observe(container);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [map, points]);
  return null;
}

function TownshipPopup({
  name,
  probability,
  level,
}: {
  name: string;
  probability: number | null | undefined;
  level: TownshipMapScore["probability_risk_level"];
}) {
  return (
    <Popup>
      <strong>{name}</strong>
      <br />
      {formatPercent(probability)} · {riskLabel(level)}
    </Popup>
  );
}

function DayGroup({
  title,
  source,
  days,
  selectedDate,
  showEmpty,
  empty,
  onSelect,
}: {
  title: string;
  source?: string;
  days: PredictionTimelineDay[];
  selectedDate: string;
  showEmpty: boolean;
  empty: string;
  onSelect: (date: string) => void;
}) {
  return (
    <section className="history-group">
      <div className="section-heading">
        <h2>{title}</h2>
        {source ? <span className="source">{source}</span> : null}
      </div>
      <div className="history-table" role="table" aria-label={title}>
        <div className="history-row region header" role="row">
          <span>Date</span>
          <span>Rainfall</span>
          <span>Flood chance</span>
          <span>Risk</span>
        </div>
        {days.map((day) => (
          <button
            type="button"
            key={day.date}
            className={`history-row region selectable ${selectedDate === day.date ? "selected" : ""}`}
            onClick={() => onSelect(day.date)}
          >
            <strong>{day.date}</strong>
            <span>{day.rainfall_mm == null ? "—" : `${day.rainfall_mm.toFixed(1)} mm`}</span>
            <span>{formatPercent(day.flood_probability)}</span>
            <span className={`risk-pill risk-${day.probability_risk_level ?? "none"}`}>
              {riskLabel(day.probability_risk_level)}
            </span>
          </button>
        ))}
        {showEmpty && days.length === 0 && <p className="hint">{empty}</p>}
      </div>
    </section>
  );
}

interface FloodPredictionDashboardProps {
  areas: Resource<BagoAreasResponse>;
  health: Resource<HealthResponse>;
  runs: Resource<JobRun[]>;
  inundation: Resource<InundationProduct[]>;
  settlements: Resource<SettlementPoint[]>;
  onPlanResources?: () => void;
}

export default function FloodPredictionDashboard({
  areas,
  inundation,
  settlements,
}: FloodPredictionDashboardProps) {
  const [selectedTownship, setSelectedTownship] = useState("");
  const [districtFilter, setDistrictFilter] = useState("all");

  useEffect(() => {
    if (areas.data && !selectedTownship) {
      setSelectedTownship(preferredTownshipId(areas.data.districts));
    }
  }, [areas.data, selectedTownship]);

  const {
    asOf,
    selectedDate,
    setSelectedDate,
    timeline,
    selectedDay,
    scoresByTownship,
  } = usePredictionTimeline(areas.data, selectedTownship, districtFilter);
  const inTrainingSet = Boolean(timeline.data?.in_training_set);

  const visibleTownships = useMemo(() => {
    const districts = areas.data?.districts ?? [];
    const shown =
      districtFilter === "all" ? districts : districts.filter((district) => district.id === districtFilter);
    return shown.flatMap((district) =>
      district.townships.map((township) => ({
        ...township,
        districtId: district.id,
        districtName: district.name_en,
        color: districtColor(district.id),
      })),
    );
  }, [areas.data, districtFilter]);

  const mapPoints = useMemo<[number, number][]>(
    () => visibleTownships.map((township) => [township.latitude, township.longitude]),
    [visibleTownships],
  );

  const selectableDistricts =
    districtFilter === "all"
      ? (areas.data?.districts ?? [])
      : (areas.data?.districts ?? []).filter((district) => district.id === districtFilter);

  const chooseTownship = (id: string) => {
    setSelectedTownship(id);
    const district = areas.data?.districts.find((item) => item.townships.some((township) => township.id === id));
    if (district) setDistrictFilter(district.id);
  };

  const timelineDays = timeline.data?.days ?? [];
  const pastDays = timelineDays.filter((day) => day.period_type === "historical");
  const forecastDays = timelineDays.filter((day) => day.period_type === "forecast");
  const timelineReady = timeline.state === "ready";

  return (
    <main className="predict-board">
      <div className="predict-split">
        <article className="panel map-panel">
          <div className="section-heading">
            <h2>Districts</h2>
          </div>
          <div className="chip-row" role="group" aria-label="Bago districts">
            <button
              type="button"
              className={districtFilter === "all" ? "active" : ""}
              onClick={() => setDistrictFilter("all")}
            >
              All districts
            </button>
            {areas.data?.districts.map((district) => (
              <button
                key={district.id}
                type="button"
                className={districtFilter === district.id ? "active" : ""}
                onClick={() => {
                  setDistrictFilter(district.id);
                  if (!district.townships.some((township) => township.id === selectedTownship)) {
                    const first = district.townships[0];
                    if (first) chooseTownship(first.id);
                  }
                }}
              >
                {district.name_en}
              </button>
            ))}
          </div>
          {areas.state === "error" && <p className="state error">Unavailable: {areas.error}</p>}
          <div className="map-frame">
            <MapContainer center={[18.26, 96.07]} zoom={8} scrollWheelZoom={false} aria-label="Bago flood risk map">
              <TileLayer
                attribution="© OpenStreetMap contributors"
                url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <FitPoints points={mapPoints} />
              {inundation.data?.map((product) => (
                <GeoJSON
                  key={`inundation-${product.id}`}
                  data={product.geometry as GeoJsonObject}
                  style={{ color: "#2457a6", fillColor: "#3b82d0", fillOpacity: 0.28, weight: 1 }}
                />
              ))}
              {visibleTownships.map((township) => {
                if (!township.geometry) return null;
                const score = scoresByTownship.get(township.id);
                const selected = township.id === selectedTownship;
                const fill = score ? riskColor(score.probability_risk_level ?? "unknown") : township.color;
                return (
                  <GeoJSON
                    key={`${township.id}:${selected ? "on" : "off"}:${score?.probability_risk_level ?? "tint"}`}
                    data={township.geometry as GeoJsonObject}
                    style={{
                      color: selected ? "#f4fbff" : township.color,
                      weight: selected ? 3.5 : 1.5,
                      fillColor: fill,
                      fillOpacity: score ? 0.62 : 0.2,
                    }}
                    eventHandlers={{ click: () => chooseTownship(township.id) }}
                  >
                    <TownshipPopup
                      name={township.name_en}
                      probability={score?.flood_probability}
                      level={score?.probability_risk_level ?? null}
                    />
                  </GeoJSON>
                );
              })}
              <Pane name="district-outlines" style={{ zIndex: 450, pointerEvents: "none" }}>
                {areas.data?.districts.map(
                  (district) =>
                    district.geometry && (
                      <GeoJSON
                        key={`district-${district.id}-${districtFilter}`}
                        data={district.geometry as GeoJsonObject}
                        interactive={false}
                        style={{
                          color: districtColor(district.id),
                          weight: districtFilter === district.id ? 3 : 2,
                          fill: false,
                          fillOpacity: 0,
                        }}
                      />
                    ),
                )}
              </Pane>
              {visibleTownships.map((township) => {
                if (township.geometry) return null;
                const score = scoresByTownship.get(township.id);
                const selected = township.id === selectedTownship;
                const fill = score ? riskColor(score.probability_risk_level ?? "unknown") : township.color;
                return (
                  <CircleMarker
                    key={township.id}
                    center={[township.latitude, township.longitude]}
                    radius={selected ? 7 : 5}
                    pathOptions={{
                      color: selected ? "#f4fbff" : township.color,
                      fillColor: fill,
                      fillOpacity: score ? 0.9 : 0.45,
                      weight: selected ? 3 : 1.5,
                    }}
                    eventHandlers={{ click: () => chooseTownship(township.id) }}
                  >
                    <TownshipPopup
                      name={township.name_en}
                      probability={score?.flood_probability}
                      level={score?.probability_risk_level ?? null}
                    />
                  </CircleMarker>
                );
              })}
              {settlements.data?.map((settlement) => (
                <CircleMarker
                  key={`settlement-${settlement.id}`}
                  center={[settlement.latitude, settlement.longitude]}
                  radius={3}
                  pathOptions={{ color: "#3f5965", fillColor: "#ffffff", fillOpacity: 0.9, weight: 1 }}
                />
              ))}
            </MapContainer>
          </div>
          <ul className="district-legend">
            {(areas.data?.districts ?? []).map((district) => (
              <li key={district.id}>
                <i style={{ background: districtColor(district.id) }} />
                {district.name_en} · {district.townships.length} townships
              </li>
            ))}
          </ul>
        </article>

        <aside className="predict-rail">
          <article className="panel flood-now">
            <div className="flood-now-head">
              <div>
                <p className="eyebrow">{selectedDate || asOf}</p>
                <h2>Flood prediction</h2>
              </div>
              <label className="township-side">
                Township
                <select
                  value={selectedTownship}
                  onChange={(event) => chooseTownship(event.target.value)}
                  disabled={!areas.data}
                >
                  {!areas.data && <option value="">Loading townships…</option>}
                  {selectableDistricts.map((district) => (
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
            <DailyDetailPanel day={selectedDay} inTrainingSet={inTrainingSet} />
            {timeline.state === "loading" && <p className="hint">Loading joined outlook…</p>}
            {timeline.state === "error" && <p className="state error">Unavailable: {timeline.error}</p>}
          </article>

          <article className="panel history-panel">
            <div className="history-scroll">
              <DayGroup
                title="Previous 7 days"
                source={asOf}
                days={pastDays}
                selectedDate={selectedDate}
                showEmpty={timelineReady}
                empty="No previous-day scores for this township."
                onSelect={setSelectedDate}
              />
              <DayGroup
                title="Next 7 days"
                days={forecastDays}
                selectedDate={selectedDate}
                showEmpty={timelineReady}
                empty="No forecast scores for this township."
                onSelect={setSelectedDate}
              />
            </div>
          </article>
        </aside>
      </div>
    </main>
  );
}
