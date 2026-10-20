import { useEffect } from "react";
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import type { Coordinates } from "../types";

export interface MapStop {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  kind: "depot-east" | "depot-west" | "township";
}

export interface MapRoutePath {
  path: Coordinates[];
  depotRegion: "east" | "west";
}

interface RouteMapProps {
  center: [number, number];
  stops: MapStop[];
  paths: MapRoutePath[];
}

const DEPOT_COLORS = {
  east: { stroke: "#17324a", fill: "#f4b942" },
  west: { stroke: "#4a1730", fill: "#e07a2f" },
} as const;

const ROUTE_COLORS = {
  east: "#0b5873",
  west: "#c45a1a",
} as const;

function FitRoute({ stops, paths }: { stops: MapStop[]; paths: MapRoutePath[] }) {
  const map = useMap();
  useEffect(() => {
    const points: [number, number][] = stops.map((stop) => [stop.latitude, stop.longitude]);
    for (const route of paths) {
      for (const point of route.path) {
        points.push([point.latitude, point.longitude]);
      }
    }
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 8);
      return;
    }
    map.fitBounds(points, { padding: [28, 28] });
  }, [map, stops, paths]);
  return null;
}

function depotStyle(kind: MapStop["kind"]) {
  if (kind === "depot-west") {
    return { ...DEPOT_COLORS.west, radius: 12, weight: 3 };
  }
  if (kind === "depot-east") {
    return { ...DEPOT_COLORS.east, radius: 12, weight: 3 };
  }
  return { color: "#2f6fed", fillColor: "#ffffff", fillOpacity: 0.95, radius: 8, weight: 2 };
}

export default function RouteMap({ center, stops, paths }: RouteMapProps) {
  return (
    <div className="allocation-map-frame">
      <MapContainer center={center} zoom={8} scrollWheelZoom={false} className="allocation-map">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitRoute stops={stops} paths={paths} />
        {paths.map((route, index) =>
          route.path.length > 1 ? (
            <Polyline
              key={`route-${index}`}
              positions={route.path.map((point) => [point.latitude, point.longitude] as [number, number])}
              pathOptions={{
                color: ROUTE_COLORS[route.depotRegion],
                weight: 4,
                opacity: 0.85,
              }}
            />
          ) : null,
        )}
        {stops.map((stop) => {
          const style = depotStyle(stop.kind);
          return (
            <CircleMarker
              key={stop.id}
              center={[stop.latitude, stop.longitude]}
              radius={style.radius}
              pathOptions={{
                color: style.color ?? style.stroke,
                fillColor: style.fillColor ?? style.fill,
                fillOpacity: style.fillOpacity ?? 0.95,
                weight: style.weight,
              }}
            >
              <Popup>
                <strong>{stop.name}</strong>
                <br />
                {stop.kind === "township" ? "Delivery stop" : "Depot"}
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
