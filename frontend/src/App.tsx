import { FormEvent, useEffect, useMemo, useState } from "react";
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import { api } from "./api";
import HumanitarianDashboard from "./HumanitarianDashboard";
import type {
  AdminDistrict,
  Alert,
  BagoAreasResponse,
  FloodHistoryResponse,
  ForecastResponse,
  HealthResponse,
  HistoricalResponse,
  LoadState,
  OutlookResponse,
  RoutePlanResponse,
  TopographyResponse,
} from "./types";

const DISTRICT_COLOR: Record<string, string> = {
  MMR007D001: "#0b5873",
  nyaunglebin: "#2d9c6c",
  MMR007D002: "#16827d",
  MMR008D002: "#d86a1a",
  nattalin: "#7a4ea3",
  MMR008D001: "#c49212",
};

function districtColor(id: string): string {
  return DISTRICT_COLOR[id] ?? "#5d727c";
}

function preferredTownshipId(districts: AdminDistrict[]): string {
  const bagoDistrict = districts.find((district) => district.name_en === "Bago");
  const bagoTownship = bagoDistrict?.townships.find((township) => township.name_en === "Bago");
  return bagoTownship?.id ?? districts[0]?.townships[0]?.id ?? "";
}

function FitPoints({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length > 0) map.fitBounds(points, { padding: [24, 24] });
  }, [map, points]);
  return null;
}

interface Resource<T> {
  state: LoadState;
  data?: T;
  error?: string;
}

const loading = <T,>(): Resource<T> => ({ state: "loading" });
const errorText = (reason: unknown) =>
  reason instanceof Error ? reason.message : "Unexpected request failure";
const formatDateTime = (value: string | Date) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
const valueOrDash = (value: number | null | undefined, suffix: string) =>
  value == null ? "—" : `${value.toLocaleString()} ${suffix}`;

function initialStartDate(): string {
  const day = new Date();
  day.setUTCDate(day.getUTCDate() - 7);
  return day.toISOString().slice(0, 10);
}

function ElevationNote({ resource }: { resource: Resource<TopographyResponse> }) {
  if (resource.state === "loading") return <p className="hint">Loading Copernicus elevation…</p>;
  if (resource.state === "error") return <p className="hint">Elevation unavailable: {resource.error}</p>;
  if (resource.state !== "ready" || resource.data == null) return null;
  const point = resource.data;
  return (
    <p className="hint">
      Centroid surface elevation {point.elevation_m.toLocaleString()} m from {point.source} (
      {point.vertical_datum}). {point.note}
    </p>
  );
}

function StateMessage({ resource, empty }: { resource: Resource<unknown>; empty: string }) {
  if (resource.state === "loading") return <p className="state">Loading…</p>;
  if (resource.state === "error")
    return <p className="state error">Unavailable: {resource.error}</p>;
  if (resource.state === "empty") return <p className="state">{empty}</p>;
  return null;
}

function App() {
  const [health, setHealth] = useState<Resource<HealthResponse>>(loading);
  const [forecast, setForecast] = useState<Resource<ForecastResponse>>(loading);
  const [alerts, setAlerts] = useState<Resource<Alert[]>>(loading);
  const [historical, setHistorical] = useState<Resource<HistoricalResponse>>(loading);
  const [topography, setTopography] = useState<Resource<TopographyResponse>>(loading);
  const [floodHistory, setFloodHistory] = useState<Resource<FloodHistoryResponse>>(loading);
  const [areas, setAreas] = useState<Resource<BagoAreasResponse>>(loading);
  const [selectedTownship, setSelectedTownship] = useState("");
  const [districtFilter, setDistrictFilter] = useState("all");
  const [startDate, setStartDate] = useState(initialStartDate);
  const [outlook, setOutlook] = useState<Resource<OutlookResponse>>({ state: "empty" });
  const [routeStops, setRouteStops] = useState<string[]>([]);
  const [vehicleProfile, setVehicleProfile] = useState<"car" | "truck" | "fly">("car");
  const [serviceMinutes, setServiceMinutes] = useState(15);
  const [returnToOrigin, setReturnToOrigin] = useState(true);
  const [route, setRoute] = useState<Resource<RoutePlanResponse>>({ state: "empty" });
  const [updatedAt, setUpdatedAt] = useState<Date>();
  const [sector, setSector] = useState<"research" | "humanitarian">("research");

  useEffect(() => {
    let active = true;
    const load = async () => {
      const results = await Promise.allSettled([
        api.health(),
        api.alerts(),
        api.floodHistory(),
        api.bagoAreas(),
      ]);
      if (!active) return;

      const [healthResult, alertsResult, floodHistoryResult, areasResult] = results;
      setHealth(
        healthResult.status === "fulfilled"
          ? { state: "ready", data: healthResult.value }
          : { state: "error", error: errorText(healthResult.reason) },
      );
      setAlerts(
        alertsResult.status === "fulfilled"
          ? {
              state: alertsResult.value.length ? "ready" : "empty",
              data: alertsResult.value,
            }
          : { state: "error", error: errorText(alertsResult.reason) },
      );
      setFloodHistory(
        floodHistoryResult.status === "fulfilled"
          ? {
              state: floodHistoryResult.value.records.length ? "ready" : "empty",
              data: floodHistoryResult.value,
            }
          : { state: "error", error: errorText(floodHistoryResult.reason) },
      );
      if (areasResult.status === "fulfilled") {
        setAreas({ state: "ready", data: areasResult.value });
        setSelectedTownship((current) => current || preferredTownshipId(areasResult.value.districts));
      } else {
        setAreas({ state: "error", error: errorText(areasResult.reason) });
        setForecast({ state: "empty" });
        setHistorical({ state: "empty" });
      }
      setUpdatedAt(new Date());
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  const selectedPlace = useMemo(() => {
    for (const district of areas.data?.districts ?? []) {
      const township = district.townships.find((item) => item.id === selectedTownship);
      if (township) return { district, township };
    }
    return undefined;
  }, [areas.data, selectedTownship]);

  useEffect(() => {
    if (!selectedPlace) return;
    let active = true;
    const { latitude, longitude } = selectedPlace.township;
    setForecast(loading);
    setHistorical(loading);
    setTopography(loading);
    void Promise.allSettled([
      api.forecast(latitude, longitude),
      api.historical(latitude, longitude),
      api.topography(latitude, longitude),
    ]).then(([forecastResult, historicalResult, topographyResult]) => {
        if (!active) return;
        setForecast(
          forecastResult.status === "fulfilled"
            ? {
                state: forecastResult.value.points.length ? "ready" : "empty",
                data: forecastResult.value,
              }
            : { state: "error", error: errorText(forecastResult.reason) },
        );
        setHistorical(
          historicalResult.status === "fulfilled"
            ? {
                state: historicalResult.value.points.length ? "ready" : "empty",
                data: historicalResult.value,
              }
            : { state: "error", error: errorText(historicalResult.reason) },
        );
        setTopography(
          topographyResult.status === "fulfilled"
            ? { state: "ready", data: topographyResult.value }
            : { state: "error", error: errorText(topographyResult.reason) },
        );
        setUpdatedAt(new Date());
      },
    );
    return () => {
      active = false;
    };
  }, [selectedPlace]);

  const submitOutlook = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedPlace) {
      setOutlook({ state: "error", error: "Bago township list is unavailable" });
      return;
    }
    const { township } = selectedPlace;
    setOutlook(loading);
    try {
      const result = await api.outlook({
        date: startDate,
        township_id: township.id,
        latitude: township.latitude,
        longitude: township.longitude,
      });
      setOutlook({ state: result.days.length ? "ready" : "empty", data: result });
      if (result.days.some((day) => day.alert_recorded)) {
        const nextAlerts = await api.alerts();
        setAlerts({ state: nextAlerts.length ? "ready" : "empty", data: nextAlerts });
      }
      setUpdatedAt(new Date());
    } catch (reason) {
      setOutlook({ state: "error", error: errorText(reason) });
    }
  };

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

  const mapPoints = useMemo<[number, number][]>(() => {
    const routePath = route.data?.path.map(
      (point) => [point.latitude, point.longitude] as [number, number],
    );
    if (routePath && routePath.length > 1) return routePath;
    return visibleTownships.map((township) => [township.latitude, township.longitude]);
  }, [route.data, visibleTownships]);

  const catalog = useMemo(
    () =>
      (areas.data?.districts ?? []).flatMap((district) =>
        district.townships.map((township) => ({ ...township, districtName: district.name_en })),
      ),
    [areas.data],
  );

  const toggleRouteStop = (id: string) => {
    setRoute({ state: "empty" });
    setRouteStops((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  const submitRoute = async (event: FormEvent) => {
    event.preventDefault();
    const origin = catalog.find((township) => township.id === selectedTownship);
    const stops = routeStops
      .filter((id) => id !== selectedTownship)
      .map((id) => catalog.find((township) => township.id === id))
      .filter((township) => township != null);
    if (!origin || stops.length === 0) {
      setRoute({ state: "error", error: "Choose an origin and at least one delivery township." });
      return;
    }
    setRoute(loading);
    try {
      const result = await api.planRoute({
        origin: {
          id: origin.id,
          name: origin.name_en,
          latitude: origin.latitude,
          longitude: origin.longitude,
        },
        stops: stops.map((township) => ({
          id: township.id,
          name: township.name_en,
          latitude: township.latitude,
          longitude: township.longitude,
        })),
        vehicle_profile: vehicleProfile,
        service_minutes: serviceMinutes,
        return_to_origin: returnToOrigin,
      });
      setRoute({ state: "ready", data: result });
      setUpdatedAt(new Date());
    } catch (reason) {
      setRoute({ state: "error", error: errorText(reason) });
    }
  };

  const chooseTownship = (id: string) => {
    setSelectedTownship(id);
    const district = areas.data?.districts.find((item) =>
      item.townships.some((township) => township.id === id),
    );
    if (district) setDistrictFilter(district.id);
  };

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">Bago, Myanmar · Academic prototype</p>
          <h1>HydroFlow</h1>
          <p>Flood-risk research dashboard</p>
        </div>
        <div className={`status ${health.data?.status === "ok" ? "online" : ""}`}>
          <span aria-hidden="true" />
          API {health.state === "loading" ? "checking" : health.data?.status ?? "unavailable"}
          {health.data && <small>{health.data.service} v{health.data.version}</small>}
        </div>
      </header>

      <div className="warning" role="alert">
        <strong>Academic prototype — not an operational warning.</strong>
        <span> Do not use this dashboard for emergency, public-safety, or humanitarian response decisions.</span>
      </div>

      <nav className="sector-nav" aria-label="Dashboard sector">
        <button
          type="button"
          className={sector === "research" ? "active" : ""}
          aria-pressed={sector === "research"}
          onClick={() => setSector("research")}
        >
          Flood research
        </button>
        <button
          type="button"
          className={sector === "humanitarian" ? "active" : ""}
          aria-pressed={sector === "humanitarian"}
          onClick={() => setSector("humanitarian")}
        >
          Humanitarian assistance
        </button>
      </nav>

      {sector === "humanitarian" && (
        <HumanitarianDashboard
          areas={areas}
          selectedTownship={selectedTownship}
          onTownshipChange={chooseTownship}
          startDate={startDate}
          onStartDate={setStartDate}
          topography={topography}
        />
      )}

      {sector === "research" && (
      <main>
        <section className="hero-grid">
          <article className="panel map-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Bago Region only</p>
                <h2>Districts and townships</h2>
              </div>
              <span className="source">Source: 2022 Bago districts</span>
            </div>
            <p className="hint">
              Townships follow the 2022 six-district Bago Region list. Markers are centroids. Click one to predict at that location. They are not a live forecast.
            </p>
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
                  onClick={() => setDistrictFilter(district.id)}
                >
                  {district.name_en}
                </button>
              ))}
            </div>
            <StateMessage resource={areas} empty="No Bago districts returned." />
            <MapContainer
              center={[18.2638, 96.0673]}
              zoom={8}
              scrollWheelZoom={false}
              aria-label="Map of Bago Region districts and townships"
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://openadmindata.org/api/mm/">Open Admin Data</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <FitPoints points={mapPoints} />
              {route.data && route.data.path.length > 1 && (
                <Polyline
                  positions={route.data.path.map(
                    (point) => [point.latitude, point.longitude] as [number, number],
                  )}
                  pathOptions={{ color: "#0b5873", weight: 4 }}
                />
              )}
              {visibleTownships.map((township) => (
                <CircleMarker
                  key={township.id}
                  center={[township.latitude, township.longitude]}
                  radius={township.id === selectedTownship ? 11 : 7}
                  pathOptions={{
                    color: township.id === selectedTownship ? "#083c5d" : township.color,
                    fillColor: township.color,
                    fillOpacity: 0.9,
                    weight: township.id === selectedTownship ? 3 : 1,
                  }}
                  eventHandlers={{ click: () => setSelectedTownship(township.id) }}
                >
                  <Popup>
                    <strong>{township.name_en}</strong>
                    <br />
                    {township.name_local}
                    <br />
                    {township.districtName} District
                    <br />
                    {township.latitude.toFixed(4)}, {township.longitude.toFixed(4)}
                  </Popup>
                </CircleMarker>
              ))}
            </MapContainer>
            <div className="legend">
              {areas.data?.districts.map((district) => (
                <span key={district.id}>
                  <i style={{ background: districtColor(district.id) }} />
                  {district.name_en} · {district.townships.length}{" "}
                  {district.townships.length === 1 ? "township" : "townships"}
                </span>
              ))}
            </div>
          </article>

          <article className="panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Model request</p>
                <h2>Prediction</h2>
              </div>
              <span className="source">Source: /outlook</span>
            </div>
            <p className="hint">Forecast rainfall comes from Open-Meteo and discharge from GloFAS. Nothing is typed in by hand.</p>
            <form onSubmit={submitOutlook}>
              <div className="form-grid">
                <label>Start date<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} required /></label>
                <label>Township
                  <select
                    value={selectedTownship}
                    onChange={(event) => chooseTownship(event.target.value)}
                    required
                    disabled={!selectedPlace}
                  >
                    {!selectedPlace && <option value="">Loading Bago townships…</option>}
                    {areas.data?.districts.map((district) => (
                      <optgroup key={district.id} label={`${district.name_en} District`}>
                        {district.townships.map((township) => (
                          <option key={township.id} value={township.id}>{township.name_en}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>
              </div>
              <button type="submit" disabled={outlook.state === "loading" || !selectedPlace}>
                {outlook.state === "loading" ? "Loading API days…" : "Load API outlook"}
              </button>
            </form>
            {selectedPlace && (
              <p className="place-note">
                {selectedPlace.township.name_en}, {selectedPlace.district.name_en} District ·{" "}
                {selectedPlace.township.latitude.toFixed(4)}, {selectedPlace.township.longitude.toFixed(4)}
              </p>
            )}
            <ElevationNote resource={topography} />
            <StateMessage resource={outlook} empty="Choose a start date to load the API outlook." />
            {outlook.state === "ready" && (
              <div className="history-table" role="table" aria-label="API outlook">
                <div className="history-row outlook header" role="row"><span>Date</span><span>Rain</span><span>Discharge</span><span>Probability</span><span>Risk</span></div>
                {outlook.data?.days.map((day) => (
                  <div className="history-row outlook" role="row" key={day.date}>
                    <strong>{day.date}</strong>
                    <span>{valueOrDash(day.precipitation_mm, "mm")}</span>
                    <span>{valueOrDash(day.discharge_m3_s, "m³/s")}</span>
                    <span>{(day.flood_probability * 100).toFixed(1)}%</span>
                    <span className={`risk-pill risk-${day.risk_level}`}>{day.risk_level}</span>
                  </div>
                ))}
              </div>
            )}
          </article>
        </section>

        <section className="panel route-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Kardinal</p>
              <h2>Relief route</h2>
            </div>
            <span className="source">Source: /routes</span>
          </div>
          <p className="hint">
            Plans one delivery round from the selected township. Stops use Open Admin Data
            administrative centroids, not road addresses, so the order and distance are a research
            illustration. A production key spends one Kardinal credit per stop.
          </p>
          <form onSubmit={submitRoute}>
            <fieldset className="stop-picker">
              <legend>Delivery townships</legend>
              {catalog
                .filter((township) => township.id !== selectedTownship)
                .map((township) => (
                  <label key={township.id}>
                    <input
                      type="checkbox"
                      checked={routeStops.includes(township.id)}
                      onChange={() => toggleRouteStop(township.id)}
                    />
                    {township.name_en}
                    <small>{township.districtName}</small>
                  </label>
                ))}
            </fieldset>
            <div className="route-options">
              <label>
                Vehicle
                <select
                  value={vehicleProfile}
                  onChange={(event) => setVehicleProfile(event.target.value as "car" | "truck" | "fly")}
                >
                  <option value="car">Car, road network</option>
                  <option value="truck">Truck, road network</option>
                  <option value="fly">Straight line</option>
                </select>
              </label>
              <label>
                Minutes at each stop
                <input
                  type="number"
                  min={0}
                  max={180}
                  value={serviceMinutes}
                  onChange={(event) => setServiceMinutes(Number(event.target.value))}
                />
              </label>
              <label className="check-line">
                <input
                  type="checkbox"
                  checked={returnToOrigin}
                  onChange={(event) => setReturnToOrigin(event.target.checked)}
                />
                Return to the origin
              </label>
            </div>
            <button type="submit" disabled={route.state === "loading" || routeStops.length === 0}>
              {route.state === "loading" ? "Planning route…" : "Plan relief route"}
            </button>
          </form>
          <StateMessage resource={route} empty="Choose delivery townships to plan a route." />
          {route.state === "ready" && route.data && (
            <>
              <p className="place-note">
                {route.data.distance_km == null ? "Distance unavailable" : `${route.data.distance_km.toLocaleString()} km`}
                {route.data.duration_minutes == null
                  ? ""
                  : ` · ${Math.round(route.data.duration_minutes).toLocaleString()} min`}
                {" · "}
                {route.data.state}
                {route.data.agency_id ? ` · ${route.data.agency_id}` : ""}
              </p>
              {route.data.waypoints.length === 0 ? (
                <p className="hint">Kardinal returned no planned stops.</p>
              ) : (
                <ol className="assumption-list">
                  {route.data.waypoints.map((point, index) => (
                    <li key={point.stop_id}>
                      {index + 1}. {point.name}
                      {point.arrival_time ? ` · ${formatDateTime(point.arrival_time)}` : ""}
                    </li>
                  ))}
                </ol>
              )}
              <p className="hint">{route.data.disclaimer}</p>
              <ul className="assumption-list">
                {route.data.assumptions.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
              {route.data.unaffected_stop_ids.length > 0 && (
                <p className="hint">Unplanned stops: {route.data.unaffected_stop_ids.join(", ")}</p>
              )}
            </>
          )}
        </section>

        <section className="data-grid">
          <article className="panel">
            <div className="section-heading"><div><p className="eyebrow">Expected conditions</p><h2>Forecast</h2></div><span className="source">Source: /forecast</span></div>
            <StateMessage resource={forecast} empty="No forecast points returned." />
            {forecast.state === "ready" && (
              <div className="list">
                {forecast.data?.points.slice(0, 5).map((point) => (
                  <div className="row" key={point.timestamp}>
                    <strong>{formatDateTime(point.timestamp)}</strong>
                    <span>{valueOrDash(point.precipitation_mm, "mm rain")}</span>
                    <span>{valueOrDash(point.discharge_m3_s, "m³/s")}</span>
                  </div>
                ))}
              </div>
            )}
          </article>

          <article className="panel">
            <div className="section-heading"><div><p className="eyebrow">Prototype notices</p><h2>Alerts</h2></div><span className="source">Source: /alerts</span></div>
            <StateMessage resource={alerts} empty="No prototype alerts returned." />
            {alerts.state === "ready" && (
              <div className="list">
                {alerts.data?.map((alert) => (
                  <div className="alert-row" key={alert.id}>
                    <span className={`risk-pill risk-${alert.level}`}>{alert.level}</span>
                    <div><strong>{alert.message}</strong><small>{formatDateTime(alert.issued_at)} · Source: {alert.source}</small></div>
                  </div>
                ))}
              </div>
            )}
          </article>
        </section>

        <section className="panel historical">
          <div className="section-heading"><div><p className="eyebrow">Relief records</p><h2>Recorded flood days</h2></div><span className="source">Source: /flood-history</span></div>
          <p className="hint">These are recorded Bago relief impacts, not model predictions.</p>
          <StateMessage resource={floodHistory} empty="No recorded flood days returned." />
          {floodHistory.state === "ready" && (
            <div className="history-table" role="table" aria-label="Recorded Bago flood days">
              <div className="history-row records header" role="row"><span>Date</span><span>Township</span><span>Households</span><span>People</span><span>Impact</span></div>
              {floodHistory.data?.records.map((record) => (
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

        <section className="panel historical">
          <div className="section-heading"><div><p className="eyebrow">Observed archive</p><h2>Historical data</h2></div><span className="source">Source: /historical</span></div>
          <StateMessage resource={historical} empty="No historical observations returned." />
          {historical.state === "ready" && (
            <div className="history-table" role="table" aria-label="Historical weather observations">
              <div className="history-row header" role="row"><span>Date</span><span>Rainfall</span><span>Temperature</span><span>Humidity</span></div>
              {historical.data?.points.slice(0, 8).map((point) => (
                <div className="history-row" role="row" key={point.date}>
                  <strong>{point.date}</strong>
                  <span>{valueOrDash(point.precipitation_mm, "mm")}</span>
                  <span>{valueOrDash(point.temperature_c, "°C")}</span>
                  <span>{valueOrDash(point.relative_humidity_pct, "%")}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
      )}

      <footer>
        <span>HydroFlow V1 · Research use only</span>
        <span>Dashboard fetched: {updatedAt ? formatDateTime(updatedAt) : "pending"}</span>
      </footer>
    </>
  );
}

export default App;
