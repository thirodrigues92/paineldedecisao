import { useEffect, useState } from "react";
import { useFilters, type PresetPeriod } from "@/lib/filters-context";
import { supabase } from "@/integrations/supabase/client";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, X } from "lucide-react";

const presets: { value: PresetPeriod; label: string }[] = [
  { value: "today", label: "Hoje" },
  { value: "7d", label: "7 dias" },
  { value: "30d", label: "30 dias" },
  { value: "month", label: "Mês atual" },
  { value: "year", label: "Ano atual" },
];

export function GlobalFilters() {
  const f = useFilters();
  const [unidades, setUnidadesList] = useState<{ id: number; nome: string }[]>([]);
  const [especialidades, setEspecialidadesList] = useState<{ id: number; nome: string }[]>([]);
  const [profissionais, setProfissionaisList] = useState<{ id: number; nome: string }[]>([]);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    (async () => {
      const [u, e, p] = await Promise.all([
        supabase.from("unidades").select("unidade_id, nome_fantasia").order("nome_fantasia"),
        supabase.from("especialidades").select("especialidade_id, nome").order("nome"),
        supabase.from("profissionais").select("profissional_id, nome").eq("ativo", true).order("nome"),
      ]);
      setUnidadesList((u.data ?? []).map((r) => ({ id: r.unidade_id, nome: r.nome_fantasia })));
      setEspecialidadesList((e.data ?? []).map((r) => ({ id: r.especialidade_id, nome: r.nome })));
      setProfissionaisList((p.data ?? []).map((r) => ({ id: r.profissional_id, nome: r.nome })));
    })();
  }, []);

  const syncNow = async () => {
    setSyncing(true);
    try {
      await supabase.functions.invoke("sync-feegow", { body: { mode: "today" } });
    } finally { setSyncing(false); window.location.reload(); }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card/40 px-4 py-3">
      <Select value={f.preset} onValueChange={(v) => f.setPreset(v as PresetPeriod)}>
        <SelectTrigger className="w-[140px] h-9"><SelectValue /></SelectTrigger>
        <SelectContent>
          {presets.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
        </SelectContent>
      </Select>

      <MultiPicker
        label="Unidade" all={unidades} selected={f.unidadeIds} onChange={f.setUnidades}
      />
      <MultiPicker
        label="Especialidade" all={especialidades} selected={f.especialidadeIds} onChange={f.setEspecialidades}
      />
      <MultiPicker
        label="Profissional" all={profissionais} selected={f.profissionalIds} onChange={f.setProfissionais}
      />

      <Select value={f.convenioTipo} onValueChange={(v) => f.setConvenioTipo(v as "todos" | "particular" | "convenio")}>
        <SelectTrigger className="w-[140px] h-9"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="todos">Todos</SelectItem>
          <SelectItem value="particular">Particular</SelectItem>
          <SelectItem value="convenio">Convênio</SelectItem>
        </SelectContent>
      </Select>

      <div className="ml-auto flex items-center gap-2">
        <Button size="sm" variant="secondary" onClick={syncNow} disabled={syncing}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Sincronizando..." : "Sincronizar agora"}
        </Button>
      </div>
    </div>
  );
}

function MultiPicker({
  label, all, selected, onChange,
}: {
  label: string;
  all: { id: number; nome: string }[];
  selected: number[];
  onChange: (ids: number[]) => void;
}) {
  const value = selected.length === 0 ? "__all__" : String(selected[0]);
  const displayValue = selected.length === 0
    ? `Todas as ${label.toLowerCase()}s`
    : selected.length === 1
      ? all.find((a) => a.id === selected[0])?.nome ?? label
      : `${selected.length} ${label.toLowerCase()}s`;

  return (
    <div className="flex items-center gap-1">
      <Select
        value={value}
        onValueChange={(v) => onChange(v === "__all__" ? [] : [Number(v)])}
      >
        <SelectTrigger className="w-[180px] h-9">
          <span className="truncate text-sm">{displayValue}</span>
        </SelectTrigger>
        <SelectContent className="max-h-72">
          <SelectItem value="__all__">Todas</SelectItem>
          {all.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.nome}</SelectItem>)}
        </SelectContent>
      </Select>
      {selected.length > 0 && (
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onChange([])}>
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
      {selected.length > 1 && <Badge variant="secondary">{selected.length}</Badge>}
    </div>
  );
}
