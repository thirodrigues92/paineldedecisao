import { createContext, useContext, useState, type ReactNode } from "react";

export type PresetPeriod = "today" | "7d" | "30d" | "month" | "year" | "custom";

export interface DashboardFilters {
  preset: PresetPeriod;
  from: Date;
  to: Date;
  unidadeIds: number[];
  profissionalIds: number[];
  especialidadeIds: number[];
  convenioTipo: "todos" | "particular" | "convenio";
}

function computeRange(preset: PresetPeriod): { from: Date; to: Date } {
  const to = new Date(); to.setHours(23, 59, 59, 999);
  const from = new Date(); from.setHours(0, 0, 0, 0);
  switch (preset) {
    case "today": return { from, to };
    case "7d": { const f = new Date(from); f.setDate(f.getDate() - 6); return { from: f, to }; }
    case "30d": { const f = new Date(from); f.setDate(f.getDate() - 29); return { from: f, to }; }
    case "month": { const f = new Date(to.getFullYear(), to.getMonth(), 1); return { from: f, to }; }
    case "year": { const f = new Date(to.getFullYear(), 0, 1); return { from: f, to }; }
    default: return { from, to };
  }
}

interface Ctx extends DashboardFilters {
  setPreset: (p: PresetPeriod) => void;
  setUnidades: (ids: number[]) => void;
  setProfissionais: (ids: number[]) => void;
  setEspecialidades: (ids: number[]) => void;
  setConvenioTipo: (v: DashboardFilters["convenioTipo"]) => void;
  setRange: (from: Date, to: Date) => void;
}

const FiltersContext = createContext<Ctx | null>(null);

export function FiltersProvider({ children }: { children: ReactNode }) {
  const initial = computeRange("30d");
  const [preset, setPresetState] = useState<PresetPeriod>("30d");
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [unidadeIds, setUnidades] = useState<number[]>([]);
  const [profissionalIds, setProfissionais] = useState<number[]>([]);
  const [especialidadeIds, setEspecialidades] = useState<number[]>([]);
  const [convenioTipo, setConvenioTipo] = useState<DashboardFilters["convenioTipo"]>("todos");

  const setPreset = (p: PresetPeriod) => {
    setPresetState(p);
    if (p !== "custom") { const r = computeRange(p); setFrom(r.from); setTo(r.to); }
  };

  const setRange = (f: Date, t: Date) => {
    setPresetState("custom");
    setFrom(f);
    setTo(t);
  };

  return (
    <FiltersContext.Provider value={{
      preset, from, to, unidadeIds, profissionalIds, especialidadeIds, convenioTipo,
      setPreset, setUnidades, setProfissionais, setEspecialidades, setConvenioTipo,
      setRange,
    }}>
      {children}
    </FiltersContext.Provider>
  );
}

export function useFilters(): Ctx {
  const ctx = useContext(FiltersContext);
  if (!ctx) throw new Error("useFilters must be used inside FiltersProvider");
  return ctx;
}
