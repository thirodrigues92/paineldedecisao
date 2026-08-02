import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useFilters } from "@/lib/filters-context";
import { dashboardQueryKey, fetchDashboardAppointments } from "@/lib/dashboard-data";
import {
  fetchPacientesGeo, fetchUnidadesGeo, distanceKm, idadeDe, imcDe,
  type PacienteGeo,
} from "@/lib/geo-data";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Upload, MapPinned, Lightbulb } from "lucide-react";
import type { BairroPoint, UnidadePoint } from "@/components/PatientMap";

const PatientMap = lazy(() => import("@/components/PatientMap"));

export const Route = createFileRoute("/_authenticated/mapa")({
  head: () => ({
    meta: [
      { title: "Mapa de Pacientes — Painel de Decisão Clínica" },
      { name: "description", content: "Mapa de calor geográfico da demanda de pacientes por bairro, especialidade e perfil." },
    ],
  }),
  component: MapaPage,
});

function MapaPage() {
  const f = useFilters();
  const [mode, setMode] = useState<"heat" | "bubbles">("heat");
  const [especialidade, setEspecialidade] = useState<string>("__all__");
  const [faixa, setFaixa] = useState<[number, number]>([0, 100]);
  const [convenio, setConvenio] = useState<"todos" | "convenio" | "particular">("todos");
  const [showUnits, setShowUnits] = useState(true);
  const [somenteObesos, setSomenteObesos] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const ags = useQuery({
    queryKey: dashboardQueryKey("mapa-ags", f),
    queryFn: () => fetchDashboardAppointments(f, 30_000),
  });
  const pacientes = useQuery({ queryKey: ["mapa-pacientes"], queryFn: () => fetchPacientesGeo() });
  const unidades = useQuery({ queryKey: ["mapa-unidades"], queryFn: fetchUnidadesGeo });

  const loading = ags.isLoading || pacientes.isLoading;

  const temMetricas = useMemo(
    () => (pacientes.data ?? []).some((p) => imcDe(p.metricas) != null),
    [pacientes.data],
  );

  const unidadePoints: UnidadePoint[] = useMemo(
    () => (unidades.data ?? [])
      .filter((u) => u.latitude != null && u.longitude != null)
      .map((u) => ({ nome: u.nome_fantasia, lat: Number(u.latitude), lng: Number(u.longitude) })),
    [unidades.data],
  );

  const especialidadesDisponiveis = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of ags.data ?? []) {
      const nome = a.especialidades?.nome;
      if (nome) m.set(nome, nome);
    }
    return [...m.keys()].sort();
  }, [ags.data]);

  const { bairros, semGeo, totalPacientes } = useMemo(() => {
    const pacMap = new Map<number, PacienteGeo>();
    for (const p of pacientes.data ?? []) pacMap.set(p.paciente_id, p);

    const passaPerfil = (p: PacienteGeo) => {
      const idade = idadeDe(p.ano_nascimento);
      if (idade != null && (idade < faixa[0] || idade > faixa[1])) return false;
      if (convenio === "convenio" && !p.convenio_id) return false;
      if (convenio === "particular" && p.convenio_id) return false;
      if (somenteObesos) { const imc = imcDe(p.metricas); if (imc == null || imc < 30) return false; }
      return true;
    };

    type Acc = {
      bairro: string; cidade: string; lat: number; lng: number;
      pacientes: Set<number>; demanda: number; noShow: number;
      esp: Map<string, number>;
    };
    const acc = new Map<string, Acc>();
    let semCoord = 0;
    const contados = new Set<number>();

    for (const a of ags.data ?? []) {
      if (especialidade !== "__all__" && a.especialidades?.nome !== especialidade) continue;
      const pid = (a as any).paciente_id as number | null;
      if (!pid) continue;
      const p = pacMap.get(pid);
      if (!p || !p.bairro || !p.cidade || !passaPerfil(p)) continue;
      contados.add(pid);
      if (p.latitude == null || p.longitude == null) { semCoord++; continue; }
      const key = `${p.bairro}|${p.cidade}`;
      let e = acc.get(key);
      if (!e) {
        e = {
          bairro: p.bairro, cidade: p.cidade,
          lat: Number(p.latitude), lng: Number(p.longitude),
          pacientes: new Set(), demanda: 0, noShow: 0, esp: new Map(),
        };
        acc.set(key, e);
      }
      e.pacientes.add(pid);
      e.demanda += 1;
      if (a.status_agendamento?.categoria === "no_show") e.noShow += 1;
      const nome = a.especialidades?.nome ?? "Sem especialidade";
      e.esp.set(nome, (e.esp.get(nome) ?? 0) + 1);
    }

    const list: (BairroPoint & { noShowPct: number })[] = [...acc.entries()].map(([key, e]) => {
      const top = [...e.esp.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
      const dist = unidadePoints.length
        ? Math.min(...unidadePoints.map((u) => distanceKm(e.lat, e.lng, u.lat, u.lng)))
        : null;
      return {
        key, bairro: e.bairro, cidade: e.cidade, lat: e.lat, lng: e.lng,
        pacientes: e.pacientes.size, demanda: e.demanda,
        topEspecialidade: top, distanciaKm: dist,
        noShowPct: e.demanda ? (e.noShow / e.demanda) * 100 : 0,
      };
    }).sort((a, b) => b.pacientes - a.pacientes);

    return { bairros: list, semGeo: semCoord, totalPacientes: contados.size };
  }, [ags.data, pacientes.data, especialidade, faixa, convenio, somenteObesos, unidadePoints]);

  const insights = useMemo(() => {
    const out: string[] = [];
    if (!bairros.length) return out;
    const top = bairros[0];
    out.push(
      `${top.bairro} concentra ${top.pacientes} pacientes do perfil selecionado${
        top.distanciaKm != null ? ` e fica a ${top.distanciaKm.toFixed(1)} km da unidade mais próxima` : ""
      } — candidato a campanha regional.`,
    );
    const porEsp = new Map<string, { bairro: string; demanda: number }>();
    for (const b of bairros) {
      const cur = porEsp.get(b.topEspecialidade);
      if (!cur || b.demanda > cur.demanda) porEsp.set(b.topEspecialidade, { bairro: b.bairro, demanda: b.demanda });
    }
    const [esp, info] = [...porEsp.entries()].sort((a, b) => b[1].demanda - a[1].demanda)[0] ?? [];
    if (esp && info) out.push(`${esp} tem maior demanda em ${info.bairro} (${info.demanda} agendamentos) — considere ampliar a oferta na região.`);
    const relevantes = bairros.filter((b) => b.demanda >= 10);
    const pior = [...relevantes].sort((a, b) => b.noShowPct - a.noShowPct)[0];
    if (pior && pior.noShowPct > 0) {
      out.push(
        `No-show mais alto em ${pior.bairro}: ${pior.noShowPct.toFixed(1)}%${
          pior.distanciaKm != null ? ` (${pior.distanciaKm.toFixed(1)} km da unidade)` : ""
        } — verificar acesso/distância e reforçar confirmação.`,
      );
    }
    const distantes = bairros.filter((b) => (b.distanciaKm ?? 0) > 15).slice(0, 1)[0];
    if (distantes) out.push(`${distantes.bairro} está a ${distantes.distanciaKm!.toFixed(1)} km da unidade e ainda gera ${distantes.demanda} agendamentos — potencial para telemedicina ou ponto avançado.`);
    return out;
  }, [bairros]);

  const detalhe = bairros.find((b) => b.key === selected) ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Mapa de Pacientes</h1>
        <p className="text-sm text-muted-foreground">
          Distribuição geográfica da demanda — apenas dados agregados por bairro (sem identificação de pacientes).
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 p-4">
          <div className="flex items-center gap-2">
            <Label htmlFor="modo" className="text-xs text-muted-foreground">Bolhas por bairro</Label>
            <Switch id="modo" checked={mode === "heat"} onCheckedChange={(v) => setMode(v ? "heat" : "bubbles")} />
            <Label htmlFor="modo" className="text-xs text-muted-foreground">Heatmap</Label>
          </div>

          <div className="w-[220px]">
            <Label className="text-xs text-muted-foreground">Especialidade</Label>
            <Select value={especialidade} onValueChange={setEspecialidade}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="__all__">Todas</SelectItem>
                {especialidadesDisponiveis.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="w-[220px]">
            <Label className="text-xs text-muted-foreground">Faixa etária: {faixa[0]}–{faixa[1]} anos</Label>
            <Slider
              className="mt-3"
              min={0} max={100} step={1} value={faixa}
              onValueChange={(v) => setFaixa([v[0], v[1]] as [number, number])}
            />
          </div>

          <div className="w-[170px]">
            <Label className="text-xs text-muted-foreground">Cobertura</Label>
            <Select value={convenio} onValueChange={(v) => setConvenio(v as typeof convenio)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="convenio">Convênio</SelectItem>
                <SelectItem value="particular">Particular</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Switch id="units" checked={showUnits} onCheckedChange={setShowUnits} />
            <Label htmlFor="units" className="text-xs text-muted-foreground">Mostrar unidades</Label>
          </div>

          <div className="flex items-center gap-2">
            <Switch id="imc" checked={somenteObesos} onCheckedChange={setSomenteObesos} disabled={!temMetricas} />
            <Label htmlFor="imc" className="text-xs text-muted-foreground">
              Somente IMC ≥ 30 {temMetricas ? "" : "(sem dados)"}
            </Label>
          </div>

          <div className="ml-auto text-xs text-muted-foreground">
            {totalPacientes} pacientes no filtro · {bairros.length} bairros
            {semGeo > 0 && <> · {semGeo} sem coordenada</>}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-4">
        <Card>
          <CardContent className="p-3">
            {loading || !mounted ? (
              <Skeleton className="h-[520px] w-full" />
            ) : bairros.length === 0 ? (
              <div className="h-[520px] grid place-items-center text-center gap-2">
                <MapPinned className="h-8 w-8 text-primary" />
                <p className="text-sm text-muted-foreground max-w-sm">
                  Nenhum paciente geocodificado para os filtros atuais. Rode a sincronização de pacientes
                  e a geocodificação em Configurações.
                </p>
              </div>
            ) : (
              <Suspense fallback={<Skeleton className="h-[520px] w-full" />}>
                <PatientMap
                  mode={mode}
                  bairros={bairros}
                  unidades={unidadePoints}
                  showUnits={showUnits}
                  selectedKey={selected}
                  onSelect={setSelected}
                />
              </Suspense>
            )}
          </CardContent>
        </Card>

        <Card className="max-h-[560px] overflow-auto">
          <CardHeader><CardTitle className="text-base">Top 10 bairros</CardTitle></CardHeader>
          <CardContent className="space-y-1 p-3">
            {loading ? <Skeleton className="h-64 w-full" /> : bairros.slice(0, 10).map((b, i) => (
              <button
                key={b.key}
                onClick={() => setSelected(b.key)}
                className={`w-full text-left rounded-md px-3 py-2 transition-colors ${
                  selected === b.key ? "bg-primary/15 border border-primary/40" : "hover:bg-muted/50 border border-transparent"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-4">{i + 1}</span>
                  <span className="text-sm font-medium flex-1 truncate">{b.bairro}</span>
                  <Badge variant="secondary">{b.pacientes}</Badge>
                </div>
                <div className="pl-6 text-xs text-muted-foreground truncate">
                  {b.topEspecialidade}
                  {b.distanciaKm != null && <> · {b.distanciaKm.toFixed(1)} km</>}
                </div>
              </button>
            ))}
            {!loading && !bairros.length && <p className="text-sm text-muted-foreground">Sem dados.</p>}
          </CardContent>
        </Card>
      </div>

      {detalhe && (
        <Card>
          <CardHeader><CardTitle className="text-base">{detalhe.bairro} — {detalhe.cidade}</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <Metric label="Pacientes" value={String(detalhe.pacientes)} />
            <Metric label="Agendamentos" value={String(detalhe.demanda)} />
            <Metric label="Especialidade líder" value={detalhe.topEspecialidade} />
            <Metric label="Distância da unidade" value={detalhe.distanciaKm != null ? `${detalhe.distanciaKm.toFixed(1)} km` : "—"} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Lightbulb className="h-4 w-4 text-warning" /> Insights automáticos</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {insights.length ? insights.map((t) => (
            <div key={t} className="rounded-md border border-border bg-muted/30 p-3 text-sm">{t}</div>
          )) : <p className="text-sm text-muted-foreground">Sem dados suficientes para gerar insights.</p>}
        </CardContent>
      </Card>

      <MetricasUploader onDone={() => pacientes.refetch()} />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

function MetricasUploader({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setBusy(true);
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) throw new Error("CSV vazio");
      const sep = lines[0].includes(";") ? ";" : ",";
      const header = lines[0].split(sep).map((h) => h.trim().toLowerCase());
      const idIdx = header.indexOf("paciente_id");
      if (idIdx < 0) throw new Error("Coluna paciente_id não encontrada");

      let ok = 0;
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(sep);
        const pid = Number(cols[idIdx]);
        if (!Number.isFinite(pid)) continue;
        const metricas: Record<string, unknown> = {};
        header.forEach((h, idx) => {
          if (idx === idIdx) return;
          const raw = (cols[idx] ?? "").trim();
          if (!raw) return;
          const num = Number(raw.replace(",", "."));
          metricas[h] = Number.isFinite(num) ? num : raw;
        });
        if (!Object.keys(metricas).length) continue;
        const { error } = await supabase.from("pacientes").update({ metricas }).eq("paciente_id", pid);
        if (!error) ok++;
      }
      toast.success(`${ok} pacientes atualizados com métricas clínicas.`);
      onDone();
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao processar o CSV");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <Card>
      <CardHeader className="cursor-pointer" onClick={() => setOpen((v) => !v)}>
        <CardTitle className="text-base flex items-center gap-2">
          <Upload className="h-4 w-4" /> Métricas clínicas (CSV) {open ? "▾" : "▸"}
        </CardTitle>
      </CardHeader>
      {open && (
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Colunas aceitas: <code>paciente_id, imc, peso, altura, ...</code>. Os valores são gravados no campo
            de métricas do paciente e liberam o filtro “Somente IMC ≥ 30”. Apenas admins/gestores podem enviar.
          </p>
          <Input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            disabled={busy}
            onChange={(e) => { const file = e.target.files?.[0]; if (file) handleFile(file); }}
          />
          {busy && <Button disabled variant="secondary">Processando…</Button>}
        </CardContent>
      )}
    </Card>
  );
}
