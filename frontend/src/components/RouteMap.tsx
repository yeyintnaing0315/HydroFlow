import { useEffect } from "react";
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import type { Coordinates } from "../types";

interface MapStop {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  kind: "warehouse" | "township";
}

interface RouteMapProps {
  center: [number, number];
  stops: MapStop[];
  paths: Coordinates[][];
}

function FitRoute({ stops, paths }: { stops: MapStop[]; paths: Coordinates[][] }) {
  const map = useMap();
  useEffect(() => {
    const points: [number, number][] = stops.map((stop) => [stop.latitude, stop.longitude]);
    for (const path of paths) {
      for (const point of path) {
        points.push([point.latitude, point.longitude]);
      }
    }
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 9);
      return;
    }
    map.fitBounds(points, { padding: [28, 28] });
  }, [map, stops, paths]);
  return null;
}

export default function RouteMap({ center, stops, paths }: RouteMapProps) {
  return (
    <div className="allocation-map-frame">
      <MapContainer center={center} zoom={9} scrollWheelZoom={false} className="allocation-map">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitRoute stops={stops} paths={paths} />
        {paths.map((path, index) =>
          path.length > 1 ? (
            <Polyline
              key={`route-${index}`}
              positions={path.map((point) => [point.latitude, point.longitude] as [number, number])}
              pathOptions={{ color: index === 0 ? "#0b5873" : "#2f6fed", weight: 4, opacity: 0.85 }}
            />
          ) : null,
        )}
        {stops.map((stop) => (
          <CircleMarker
            key={stop.id}
            center={[stop.latitude, stop.longitude]}
            radius={stop.kind === "warehouse" ? 12 : 8}
            pathOptions={{
              color: stop.kind === "warehouse" ? "#17324a" : "#2f6fed",
              fillColor: stop.kind === "warehouse" ? "#f4b942" : "#ffffff",
              fillOpacity: 0.95,
              weight: stop.kind === "warehouse" ? 3 : 2,
            }}
          >
            <Popup>
              <strong>{stop.name}</strong>
              <br />
              {stop.kind === "warehouse" ? "Warehouse origin" : "Delivery stop"}
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
