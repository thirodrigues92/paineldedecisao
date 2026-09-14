import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.heat";
import { MapContainer, TileLayer, CircleMarker, Marker, Tooltip, Popup, useMap } from "react-leaflet";

export type BairroPoint = {
  key: string;
  bairro: string;
  cidade: string;
  lat: number;
  lng: number;
  pacientes: number;
  demanda: number;
  faturamento: number;
  topEspecialidade: string;
  distanciaKm: number | null;
};

export type CityPoint = BairroPoint;

export type UnidadePoint = { nome: string; lat: number; lng: number };

/** Centro aproximado de Rio Verde - GO */
export const RIO_VERDE_CENTER: [number, number] = [-17.7975, -50.9269];

const YELLOW_GRADIENT: Record<number, string> = {
  0.0: "rgba(255,253,231,0)",
  0.2: "#fff59d",
  0.4: "#ffe082",
  0.6: "#ffc107",
  0.8: "#ff8f00",
  1.0: "#b45309",
};

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function HeatLayer({ points, intensity }: { points: Array<[number, number, number]>; intensity: number }) {
  const map = useMap();
  useEffect(() => {
    const heat = (L as any).heatLayer(points, {
      radius: 34 * intensity,
      blur: 24,
      minOpacity: 0.35,
      maxZoom: 16,
      gradient: YELLOW_GRADIENT,
    });
    heat.addTo(map);
    return () => {
      map.removeLayer(heat);
    };
  }, [map, points, intensity]);
  return null;
}

function FitBounds({ points, fallback }: { points: Array<[number, number]>; fallback: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length > 1) {
      map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 14 });
    } else if (points.length === 1) {
      map.setView(points[0], 14);
    } else {
      map.setView(fallback, 13);
    }
  }, [map, points, fallback]);
  return null;
}

const unitIcon = L.divIcon({
  className: "",
  html: `<div style="width:16px;height:16px;border-radius:50%;background:#22d3ee;border:3px solid #0b1220;box-shadow:0 0 0 2px #22d3ee"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

export default function PatientMap({
  mode,
  bairros,
  metric,
  unidades,
  showUnits,
  selectedKey,
  onSelect,
  focusCity = "Rio Verde",
}: {
  mode: "heat" | "bubbles";
  bairros: BairroPoint[];
  metric: "pacientes" | "faturamento";
  unidades: UnidadePoint[];
  showUnits: boolean;
  selectedKey: string | null;
  onSelect: (key: string) => void;
  focusCity?: string;
}) {
  const [satelite, setSatelite] = useState(true);

  const valorDe = (b: BairroPoint) => (metric === "faturamento" ? b.faturamento : b.pacientes);
  const max = Math.max(1, ...bairros.map(valorDe));

  const heatPoints = useMemo<Array<[number, number, number]>>(
    () => bairros.map((b) => [b.lat, b.lng, Math.max(0.12, valorDe(b) / max)]),
    [bairros, metric, max],
  );

  // O enquadramento prioriza a cidade em foco (Rio Verde)
  const fitPoints = useMemo<Array<[number, number]>>(() => {
    const foco = bairros.filter((b) => b.cidade === focusCity);
    const base = foco.length ? foco : bairros;
    return base.map((b) => [b.lat, b.lng] as [number, number]);
  }, [bairros, focusCity]);

  const corPara = (v: number) => {
    const t = v / max;
    if (t >= 0.8) return "#b45309";
    if (t >= 0.6) return "#ff8f00";
    if (t >= 0.4) return "#ffc107";
    if (t >= 0.2) return "#ffe082";
    return "#fff59d";
  };

  return (
    <div className="relative">
      <MapContainer
        center={RIO_VERDE_CENTER}
        zoom={13}
        className="h-[560px] w-full rounded-md z-0"
        scrollWheelZoom
      >
        {satelite ? (
          <>
            <TileLayer
              attribution="Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics"
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              maxZoom={19}
            />
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png"
              maxZoom={19}
            />
          </>
        ) : (
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            maxZoom={19}
          />
        )}

        <FitBounds points={fitPoints} fallback={RIO_VERDE_CENTER} />

        {mode === "heat" && heatPoints.length > 0 && <HeatLayer points={heatPoints} intensity={1} />}

        {/* Pontos clicáveis sempre presentes — no heatmap são discretos, nas bolhas são proporcionais */}
        {bairros.map((b) => {
          const v = valorDe(b);
          const isSel = selectedKey === b.key;
          const raio = mode === "heat" ? (isSel ? 11 : 7) : 8 + Math.sqrt(v / max) * 26;
          return (
            <CircleMarker
              key={b.key}
              center={[b.lat, b.lng]}
              radius={raio}
              pathOptions={{
                color: isSel ? "#ffffff" : "#7c2d12",
                weight: isSel ? 3 : 1,
                fillColor: corPara(v),
                fillOpacity: mode === "heat" ? 0.9 : 0.65,
              }}
              eventHandlers={{ click: () => onSelect(b.key) }}
            >
              <Tooltip direction="top" opacity={1}>
                <div className="text-xs">
                  <div className="font-semibold">
                    {b.bairro} · {b.cidade}
                  </div>
                  <div>
                    {b.pacientes} pacientes · {b.demanda} atendimentos
                  </div>
                  <div>{brl(b.faturamento)}</div>
                  <div className="opacity-70">Clique para ver os detalhes</div>
                </div>
              </Tooltip>
              <Popup>
                <div className="min-w-[190px] text-xs">
                  <div className="mb-1 text-sm font-semibold">{b.bairro}</div>
                  <div className="mb-2 opacity-70">{b.cidade}</div>
                  <div className="flex justify-between gap-4">
                    <span>Pacientes</span>
                    <strong>{b.pacientes}</strong>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span>Atendimentos</span>
                    <strong>{b.demanda}</strong>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span>Faturamento</span>
                    <strong>{brl(b.faturamento)}</strong>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span>Especialidade</span>
                    <strong>{b.topEspecialidade}</strong>
                  </div>
                  {b.distanciaKm != null && (
                    <div className="flex justify-between gap-4">
                      <span>Distância</span>
                      <strong>{b.distanciaKm.toFixed(1)} km</strong>
                    </div>
                  )}
                </div>
              </Popup>
            </CircleMarker>
          );
        })}

        {showUnits &&
          unidades.map((u) => (
            <Marker key={u.nome} position={[u.lat, u.lng]} icon={unitIcon}>
              <Tooltip direction="top" opacity={1}>
                <span className="text-xs font-semibold">{u.nome}</span>
              </Tooltip>
            </Marker>
          ))}
      </MapContainer>

      {/* Alternador de visual */}
      <button
        type="button"
        onClick={() => setSatelite((s) => !s)}
        className="absolute right-3 top-3 z-[400] rounded-md border border-border bg-background/90 px-3 py-1.5 text-xs font-medium shadow-md backdrop-blur hover:bg-background"
      >
        {satelite ? "Ver mapa de ruas" : "Ver satélite"}
      </button>

      {/* Legenda do calor */}
      <div className="absolute bottom-6 left-3 z-[400] rounded-md border border-border bg-background/90 px-3 py-2 text-xs shadow-md backdrop-blur">
        <div className="mb-1 font-medium">
          {metric === "faturamento" ? "Faturamento" : "Pacientes"} por bairro
        </div>
        <div
          className="h-2 w-40 rounded-full"
          style={{ background: "linear-gradient(90deg,#fff59d,#ffe082,#ffc107,#ff8f00,#b45309)" }}
        />
        <div className="mt-1 flex justify-between opacity-70">
          <span>menor</span>
          <span>maior</span>
        </div>
      </div>
    </div>
  );
}
