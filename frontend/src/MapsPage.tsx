import { useEffect, useMemo, useState } from "react";
import { CircleMarker, GeoJSON, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import type { GeoJsonObject } from "geojson";
import { districtColor } from "./components/prediction/mapUtils";
import type { BagoAreasResponse, InundationProduct, LoadState, SettlementPoint } from "./types";

interface Resource<T> {
  state: LoadState;
  data?: T;
  error?: string;
}

interface MapsPageProps {
  areas: Resource<BagoAreasResponse>;
  inundation: Resource<InundationProduct[]>;
  settlements: Resource<SettlementPoint[]>;
}

function FitPoints({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0 || typeof map.getContainer !== "function") return;
    const container = map.getContainer();
    const fit = () => {
      map.invalidateSize();
      map.fitBounds(points, { padding: [18, 18], maxZoom: 9 });
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

export default function MapsPage({ areas, inundation, settlements }: MapsPageProps) {
  const [districtFilter, setDistrictFilter] = useState("all");
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

  return (
    <main className="maps-board">
      <article className="panel map-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Bago Region</p>
            <h2>Operational map</h2>
          </div>
          <span className="source">{areas.data?.source ?? "Map layers"}</span>
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
              onClick={() => setDistrictFilter(district.id)}
            >
              {district.name_en}
            </button>
          ))}
        </div>
        {areas.state === "loading" && <p className="state">Loading map…</p>}
        {areas.state === "error" && <p className="state error">Unavailable: {areas.error}</p>}
        <div className="map-frame map-frame-tall">
          <MapContainer center={[18.26, 96.07]} zoom={8} scrollWheelZoom={false} aria-label="Bago operational map">
            <TileLayer
              attribution="&copy; Esri"
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"
            />
            <FitPoints points={mapPoints} />
            {areas.data?.districts.map(
              (district) =>
                district.geometry && (
                  <GeoJSON
                    key={`district-${district.id}`}
                    data={district.geometry as GeoJsonObject}
                    style={{
                      color: districtColor(district.id),
                      weight: 2,
                      fillOpacity: districtFilter === district.id ? 0.12 : 0.04,
                    }}
                  />
                ),
            )}
            {inundation.data?.map((product) => (
              <GeoJSON
                key={`inundation-${product.id}`}
                data={product.geometry as GeoJsonObject}
                style={{ color: "#2457a6", fillColor: "#3b82d0", fillOpacity: 0.28, weight: 1 }}
              />
            ))}
            {visibleTownships.map((township) => (
              <CircleMarker
                key={township.id}
                center={[township.latitude, township.longitude]}
                radius={8}
                pathOptions={{ color: township.color, fillColor: township.color, fillOpacity: 0.55, weight: 1 }}
              >
                <Popup>
                  <strong>{township.name_en}</strong>
                  <br />
                  {township.districtName} District
                </Popup>
              </CircleMarker>
            ))}
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
        <p className="hint">
          Township markers use the same Bago geography as Flood Prediction. Colors follow district, not live
          risk, on this page.
        </p>
      </article>
    </main>
  );
}
