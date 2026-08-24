import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { format, subDays, startOfMonth, endOfMonth, startOfYear, endOfYear, startOfWeek, endOfWeek, subMonths, subWeeks, parseISO, isValid } from "date-fns";

export type PresetPeriod = 
  | "today" 
  | "yesterday"
  | "7d" 
  | "14d"
  | "30d" 
  | "this_week"
  | "last_week"
  | "month" 
  | "last_month"
  | "year" 
  | "custom";

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
  const now = new Date();
  const to = new Date(); to.setHours(23, 59, 59, 999);
  const from = new Date(); from.setHours(0, 0, 0, 0);

  switch (preset) {
    case "today": 
      return { from, to };
    case "yesterday": {
      const f = subDays(from, 1);
      const t = subDays(to, 1);
      return { from: f, to: t };
    }
    case "7d": 
      return { from: subDays(from, 6), to };
    case "14d": 
      return { from: subDays(from, 13), to };
    case "30d": 
      return { from: subDays(from, 29), to };
    case "this_week":
      return { from: startOfWeek(from, { weekStartsOn: 0 }), to };
    case "last_week": {
      const lastWeek = subWeeks(from, 1);
      return { from: startOfWeek(lastWeek, { weekStartsOn: 0 }), to: endOfWeek(lastWeek, { weekStartsOn: 0 }) };
    }
    case "month": 
      return { from: startOfMonth(from), to };
    case "last_month": {
      const lastMonth = subMonths(from, 1);
      return { from: startOfMonth(lastMonth), to: endOfMonth(lastMonth) };
    }
    case "year": 
      return { from: startOfYear(from), to };
    default: 
      return { from, to };
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
  // Try to get from URL
  const getUrlParams = () => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    const startStr = params.get("inicio");
    const endStr = params.get("fim");
    const presetParam = params.get("periodo") as PresetPeriod;

    if (startStr && endStr) {
      const f = parseISO(startStr);
      const t = parseISO(endStr);
      if (isValid(f) && isValid(t)) {
        return { from: f, to: t, preset: presetParam || "custom" as PresetPeriod };
      }
    } else if (presetParam) {
      const range = computeRange(presetParam);
      return { ...range, preset: presetParam };
    }
    return null;
  };

  const urlData = getUrlParams();
  const initial = urlData || { ...computeRange("30d"), preset: "30d" as PresetPeriod };

  const [preset, setPresetState] = useState<PresetPeriod>(initial.preset);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [unidadeIds, setUnidades] = useState<number[]>([]);
  const [profissionalIds, setProfissionais] = useState<number[]>([]);
  const [especialidadeIds, setEspecialidades] = useState<number[]>([]);
  const [convenioTipo, setConvenioTipo] = useState<DashboardFilters["convenioTipo"]>("todos");

  // Sync to URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set("inicio", format(from, "yyyy-MM-dd"));
    params.set("fim", format(to, "yyyy-MM-dd"));
    params.set("periodo", preset);
    
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, "", newUrl);
  }, [from, to, preset]);

  const setPreset = (p: PresetPeriod) => {
    setPresetState(p);
    if (p !== "custom") { 
      const r = computeRange(p); 
      setFrom(r.from); 
      setTo(r.to); 
    }
  };

  const setRange = (f: Date, t: Date) => {
    setPresetState("custom");
    // Ensure chronological order
    if (f > t) {
      setFrom(t);
      setTo(f);
    } else {
      setFrom(f);
      setTo(t);
    }
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
