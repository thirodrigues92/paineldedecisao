import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.heat";
import { MapContainer, TileLayer, CircleMarker, Marker, Tooltip, useMap } from "react-leaflet";

export type BairroPoint = {
  key: string;
  bairro: string;
  cidade: string;
  lat: number;
  lng: number;
  pacientes: number;
  demanda: number;
  topEspecialidade: string;
  distanciaKm: number | null;
};

export type UnidadePoint = { nome: string; lat: number; lng: number };

function HeatLayer({ points }: { points: Array<[number, number, number]> }) {
  const map = useMap();
  const layerRef = useRef<any>(null);
  useEffect(() => {
    const heat = (L as any).heatLayer(points, {
      radius: 28,
      blur: 22,
      maxZoom: 15,
      gradient: { 0.2: "#1e3a8a", 0.4: "#0891b2", 0.6: "#22d3ee", 0.8: "#f59e0b", 1: "#ef4444" },
    });
    heat.addTo(map);
    layerRef.current = heat;
    return () => { map.removeLayer(heat); };
  }, [map, points]);
  return null;
}

function FitBounds({ points }: { points: Array<[number, number]> }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    map.fitBounds(L.latLngBounds(points), { padding: [30, 30], maxZoom: 13 });
  }, [map, points]);
  return null;
}

const unitIcon = L.divIcon({
  className: "",
  html: `<div style="width:18px;height:18px;border-radius:50%;background:#f59e0b;border:3px solid #0b1220;box-shadow:0 0 0 2px #f59e0b"></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

export default function PatientMap({
  mode,
  bairros,
  unidades,
  showUnits,
  selectedKey,
  onSelect,
}: {
  mode: "heat" | "bubbles";
  bairros: BairroPoint[];
  unidades: UnidadePoint[];
  showUnits: boolean;
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  const heatPoints = useMemo<Array<[number, number, number]>>(() => {
    const max = Math.max(1, ...bairros.map((b) => b.pacientes));
    return bairros.map((b) => [b.lat, b.lng, b.pacientes / max]);
  }, [bairros]);

  const maxPac = Math.max(1, ...bairros.map((b) => b.pacientes));
  const center: [number, number] = bairros.length
    ? [bairros[0].lat, bairros[0].lng]
    : unidades.length ? [unidades[0].lat, unidades[0].lng] : [-17.79, -50.92];

  const fitPoints = useMemo<Array<[number, number]>>(
    () => bairros.map((b) => [b.lat, b.lng] as [number, number]),
    [bairros],
  );

  return (
    <MapContainer center={center} zoom={12} className="h-[520px] w-full rounded-md z-0" scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />
      <FitBounds points={fitPoints} />
      {mode === "heat" && heatPoints.length > 0 && <HeatLayer points={heatPoints} />}
      {mode === "bubbles" && bairros.map((b) => (
        <CircleMarker
          key={b.key}
          center={[b.lat, b.lng]}
          radius={6 + Math.sqrt(b.pacientes / maxPac) * 24}
          pathOptions={{
            color: selectedKey === b.key ? "#f59e0b" : "#22d3ee",
            weight: selectedKey === b.key ? 3 : 1,
            fillColor: "#22d3ee",
            fillOpacity: 0.35,
          }}
          eventHandlers={{ click: () => onSelect(b.key) }}
        >
          <Tooltip direction="top" opacity={1}>
            <div className="text-xs">
              <div className="font-semibold">{b.bairro}</div>
              <div>{b.pacientes} pacientes · {b.demanda} agendamentos</div>
              <div>Top: {b.topEspecialidade}</div>
              {b.distanciaKm != null && <div>{b.distanciaKm.toFixed(1)} km da unidade</div>}
            </div>
          </Tooltip>
        </CircleMarker>
      ))}
      {showUnits && unidades.map((u) => (
        <Marker key={u.nome} position={[u.lat, u.lng]} icon={unitIcon}>
          <Tooltip direction="top" opacity={1}><span className="text-xs font-semibold">{u.nome}</span></Tooltip>
        </Marker>
      ))}
    </MapContainer>
  );
}
