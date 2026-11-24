import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useFilters } from "@/lib/filters-context";
import { dashboardQueryKey, fetchDashboardAppointments } from "@/lib/dashboard-data";
import {
  fetchPacientesGeo, fetchUnidadesGeo, distanceKm, idadeDe, imcDe, normalizarCidade,
  fetchMapProduction, type PacienteGeo,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, MapPinned, Lightbulb, Search, Download } from "lucide-react";
import type { BairroPoint, UnidadePoint } from "@/components/PatientMap";

import {locationKey,locationName,mapPeriodTotals,validCityCoordinate} from "@/lib/patient-map-rules";
import {Dialog,DialogContent,DialogHeader,DialogTitle} from "@/components/ui/dialog";

const PatientMap = lazy(() => import("@/components/PatientMap"));

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function RankRow({ pos, bairro, valor, onClick, ativo }: { pos?: number; bairro: string; valor: string; onClick: () => void; ativo: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left transition-colors ${
        ativo ? "border border-primary/40 bg-primary/15" : "border border-transparent hover:bg-muted/50"
      }`}
    >
      {pos != null && <span className="w-4 text-xs text-muted-foreground">{pos}</span>}
      <span className="flex-1 truncate text-sm font-medium">{bairro}</span>
      <Badge variant="secondary">{valor}</Badge>
    </button>
  );
}

export function MapaPacientes({ showUploader = true }: { showUploader?: boolean }) {
  const f = useFilters();
  const [mode, setMode] = useState<"heat" | "bubbles">("heat");
  const [metric, setMetric] = useState<"pacientes" | "faturamento">("pacientes");
  const [especialidade, setEspecialidade] = useState<string>("__all__");
  const [faixa, setFaixa] = useState<[number, number]>([0, 100]);
  const [convenio, setConvenio] = useState<"todos" | "convenio" | "particular">("todos");
  const [cidadeFoco, setCidadeFoco] = useState<string>("Rio Verde");
  const [categoria, setCategoria] = useState<string>("__all__");
  const [aba, setAba] = useState<"mapa" | "bairros" | "categoria">("mapa");
  const [showUnits, setShowUnits] = useState(true);
  const [somenteObesos, setSomenteObesos] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [pendingOpen,setPendingOpen] = useState(false);
  const [pendingSearch,setPendingSearch] = useState("");
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const ags = useQuery({
    queryKey: dashboardQueryKey("mapa-ags", f),
    queryFn: () => fetchDashboardAppointments(f, 30_000),
  });
  const producao = useQuery({ queryKey: dashboardQueryKey("mapa-producao", f), queryFn: () => fetchMapProduction(f) });
  const pacientes = useQuery({ queryKey: ["mapa-pacientes"], queryFn: () => fetchPacientesGeo(), refetchInterval:60_000 });
  const cities = useQuery({queryKey:["mapa-city-centers"],queryFn:async()=>{const {data,error}=await supabase.from("lab_geo_cidades").select("*");if(error)throw error;return data??[];},refetchInterval:60_000});
  const unidades = useQuery({ queryKey: ["mapa-unidades"], queryFn: fetchUnidadesGeo });

  const loading = ags.isLoading || pacientes.isLoading || producao.isLoading;

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

  const especialidadesDisponiveis = useMemo(() => [...new Set((producao.data??[]).map(r=>r.grupo_nome||"Não classificado"))].sort(),[producao.data]);
  const categoriasDisponiveis = especialidadesDisponiveis;
  const {bairros,semGeo,totalPacientes,coverage,pendencias} = useMemo(()=>{
    const pacMap=new Map((pacientes.data??[]).map(p=>[p.paciente_id,p]));
    const centerMap=new Map((cities.data??[]).map(c=>[c.chave,c.latitude==null?null:{latitude:Number(c.latitude),longitude:Number(c.longitude)}]));
    const pointFor=(p:PacienteGeo)=>{
      if(p.latitude==null || p.longitude==null || !p.cidade || !p.estado)return null;
      const uf=locationKey(p.estado)==="goias"?"GO":p.estado.toUpperCase();
      const center=centerMap.get(`${locationKey(normalizarCidade(p.cidade))}|${uf}`)??null;
      const point={latitude:Number(p.latitude),longitude:Number(p.longitude)};
      return validCityCoordinate(point,center)?point:null;
    };
    const base=producao.data??[];
    const totals=mapPeriodTotals(base);
    const byPatient=new Map<number,{nome:string;prontuario:string}>();
    for(const r of base)if(r.paciente_id!=null && r.paciente_id>0)byPatient.set(r.paciente_id,{nome:r.paciente_nome??"",prontuario:r.prontuario??""});
    let mapped=0,missing=0,address=0;
    const pending:Array<{paciente_id:number;nome:string;prontuario:string;cidade:string;motivo:string}>=[];
    for(const [id,info] of byPatient) {
      const p=pacMap.get(id);
      if(p && pointFor(p)) {mapped++;continue;}
      if(!p)missing++;else address++;
      pending.push({paciente_id:id,nome:p?.nome||info.nome||`Paciente ${id}`,prontuario:p?.prontuario||info.prontuario||"—",cidade:p?.cidade||"—",motivo:!p?"Sem cadastro":!p.cidade||!p.estado||(!p.cep&&!p.bairro)?"Sem endereço":"Endereço sem coordenada validada"});
    }
    type Acc={bairro:string;cidade:string;lat:number;lng:number;patients:Set<number>;visits:Set<number>;value:number;cats:Map<string,number>;specialties:Map<string,Set<number>>;noShow:number;scheduled:number};
    const acc=new Map<string,Acc>();
    for(const r of base) {
      if(especialidade!=="__all__" && r.grupo_nome!==especialidade)continue;
      if(categoria!=="__all__" && r.grupo_nome!==categoria)continue;
      const pid=r.paciente_id;if(pid==null)continue;const p=pacMap.get(pid);if(!p)continue;
      const age=idadeDe(p.ano_nascimento);
      if(age!=null && (age<faixa[0]||age>faixa[1]))continue;
      if(convenio==="convenio" && (!r.convenio_id || locationKey(r.convenio_nome)==="nao faturado" || locationKey(r.convenio_nome)==="particular"))continue;
      if(convenio==="particular" && r.convenio_id && locationKey(r.convenio_nome)!=="particular")continue;
      if(somenteObesos && (imcDe(p.metricas)??0)<30)continue;
      const point=pointFor(p);if(!point)continue;
      const cidade=normalizarCidade(p.cidade),bairro=locationName(p.bairro),key=`${locationKey(bairro)}|${locationKey(cidade)}|${locationKey(p.estado)}`;
      let a=acc.get(key);
      if(!a){a={bairro,cidade,lat:0,lng:0,patients:new Set(),visits:new Set(),value:0,cats:new Map(),specialties:new Map(),noShow:0,scheduled:0};acc.set(key,a);}
      if(!a.patients.has(pid)){a.lat+=point.latitude;a.lng+=point.longitude;a.patients.add(pid);}
      a.visits.add(r.agendamento_id);a.value+=Number(r.valor??0);
      const cat=r.grupo_nome||"Não classificado";a.cats.set(cat,(a.cats.get(cat)??0)+Number(r.valor??0));
      const visits=a.specialties.get(cat)??new Set<number>();visits.add(r.agendamento_id);a.specialties.set(cat,visits);
    }
    // No-show comes exclusively from appointments and is never added to production visits.
    for(const a of ags.data??[]) {
      if(a.paciente_id==null)continue;const p=pacMap.get(a.paciente_id);if(!p)continue;
      const b=acc.get(`${locationKey(locationName(p.bairro))}|${locationKey(normalizarCidade(p.cidade))}|${locationKey(p.estado)}`);
      if(!b || !b.patients.has(a.paciente_id))continue;
      b.scheduled++;if(a.status_agendamento?.categoria==="no_show")b.noShow++;
    }
    const list=[...acc.entries()].map(([key,a])=>{
      const lat=a.lat/a.patients.size,lng=a.lng/a.patients.size;
      return {key,bairro:a.bairro,cidade:a.cidade,lat,lng,pacientes:a.patients.size,demanda:a.visits.size,faturamento:a.value,topEspecialidade:[...a.specialties].sort((x,y)=>y[1].size-x[1].size)[0]?.[0]??"—",distanciaKm:unidadePoints.length?Math.min(...unidadePoints.map(u=>distanceKm(lat,lng,u.lat,u.lng))):null,noShowPct:a.scheduled?100*a.noShow/a.scheduled:0,categorias:[...a.cats].sort((x,y)=>y[1]-x[1])};
    }).sort((a,b)=>metric==="faturamento"?b.faturamento-a.faturamento:b.pacientes-a.pacientes);
    return {bairros:list,semGeo:address,totalPacientes:totals.pacientes,coverage:{...totals,mapped,missing,address,pct:totals.pacientes?100*mapped/totals.pacientes:0},pendencias:pending};
  },[producao.data,pacientes.data,cities.data,ags.data,especialidade,categoria,faixa,convenio,somenteObesos,unidadePoints,metric]);
  const visiblePending=pendencias.filter(p=>locationKey(`${p.nome} ${p.prontuario} ${p.cidade} ${p.motivo}`).includes(locationKey(pendingSearch)));
  const exportPending=async()=>{
    const XLSX=await import("xlsx");const book=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book,XLSX.utils.json_to_sheet(visiblePending),"Pendências");
    XLSX.writeFile(book,`mapa-pendencias-${f.from.toISOString().slice(0,10)}.xlsx`);
  };

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
    if (esp && info) out.push(`${esp} tem maior demanda em ${info.bairro} (${info.demanda} atendimentos) — considere ampliar a oferta na região.`);
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
    if (distantes) out.push(`${distantes.bairro} está a ${distantes.distanciaKm?.toFixed(1)} km da unidade e ainda gera ${distantes.demanda} atendimentos — potencial para telemedicina ou ponto avançado.`);
    return out;
  }, [bairros]);

  const cidadesDisponiveis = useMemo(() => {
    const set = new Set(bairros.map((b) => b.cidade));
    set.add("Rio Verde");
    return [...set].sort((a, b) => (a === "Rio Verde" ? -1 : b === "Rio Verde" ? 1 : a.localeCompare(b)));
  }, [bairros]);

  const bairrosView = useMemo(
    () => (cidadeFoco === "__all__" ? bairros : bairros.filter((b) => b.cidade === cidadeFoco)),
    [bairros, cidadeFoco],
  );

  const rankingBairros = useMemo(
    () =>
      bairrosView
        .slice()
        .sort((a, b) => (metric === "faturamento" ? b.faturamento - a.faturamento : b.pacientes - a.pacientes)),
    [bairrosView, metric],
  );

  const detalhe = bairros.find((b) => b.key === selected) ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Mapa de Pacientes</h1>
        <p className="text-sm text-muted-foreground">
          Distribuição geográfica por cidade e bairro, com faturamento real do período selecionado.
         </p>
      </div>

      <section className="border-y border-border py-4 space-y-3" aria-label="Cobertura do mapa">
        {loading ? <Skeleton className="h-8 w-full"/> : <p className="font-medium">Período: {coverage.atendimentos.toLocaleString("pt-BR")} atendimentos de {coverage.pacientes.toLocaleString("pt-BR")} pacientes · no mapa: {coverage.mapped.toLocaleString("pt-BR")} ({coverage.pct.toFixed(1)}%) · sem cadastro: {coverage.missing.toLocaleString("pt-BR")} · sem endereço: {coverage.address.toLocaleString("pt-BR")}</p>}
        <div className="flex flex-wrap gap-3 items-center"><Button variant="outline" onClick={()=>setPendingOpen(true)}><Search className="size-4"/>Ver pendências</Button><span className="text-sm text-muted-foreground">Produção no período: {brl(coverage.valor)}</span></div>
        {(producao.error||pacientes.error||cities.error||ags.error) && <p role="alert" className="text-destructive">Falha ao consultar a cobertura; os números podem estar incompletos.</p>}
      </section>
      <Dialog open={pendingOpen} onOpenChange={setPendingOpen}><DialogContent className="sm:max-w-3xl max-h-[85dvh] z-[1100] overflow-hidden flex flex-col"><DialogHeader><DialogTitle>Pendências do mapa · {pendencias.length} pacientes</DialogTitle></DialogHeader><div className="flex gap-2"><Input aria-label="Pesquisar pendências" placeholder="Paciente, prontuário, cidade ou motivo" value={pendingSearch} onChange={e=>setPendingSearch(e.target.value)}/><Button variant="outline" onClick={exportPending}><Download className="size-4"/>Excel</Button></div><div className="min-h-0 overflow-auto"><table className="w-full text-sm"><thead><tr className="text-left border-b border-border"><th className="p-2">Paciente</th><th className="p-2">Prontuário</th><th className="p-2">Cidade</th><th className="p-2">Motivo</th></tr></thead><tbody>{visiblePending.map(p=><tr key={p.paciente_id} className="border-b border-border"><td className="p-2">{p.nome}</td><td className="p-2">{p.prontuario}</td><td className="p-2">{p.cidade}</td><td className="p-2">{p.motivo}</td></tr>)}{!visiblePending.length && <tr><td colSpan={4} className="p-4">Nenhuma pendência encontrada.</td></tr>}</tbody></table></div></DialogContent></Dialog>
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 p-4">
          <div className="flex items-center gap-2">
            <Label htmlFor="modo" className="text-xs text-muted-foreground">Bolhas</Label>
            <Switch id="modo" checked={mode === "heat"} onCheckedChange={(v) => setMode(v ? "heat" : "bubbles")} />
            <Label htmlFor="modo" className="text-xs text-muted-foreground">Heatmap</Label>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="metrica" className="text-xs text-muted-foreground">Métrica</Label>
            <Select value={metric} onValueChange={(v) => setMetric(v as typeof metric)}>
              <SelectTrigger id="metrica" className="h-9 w-[190px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pacientes">Por quantidade de pacientes</SelectItem>
                <SelectItem value="faturamento">Por faturamento</SelectItem>
              </SelectContent>
            </Select>
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

          <div className="w-[200px]">
            <Label className="text-xs text-muted-foreground">Cidade em foco</Label>
            <Select value={cidadeFoco} onValueChange={setCidadeFoco}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-72">
                {cidadesDisponiveis.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                <SelectItem value="__all__">Todas as cidades</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="w-[230px]">
            <Label className="text-xs text-muted-foreground">Calor por categoria de faturamento</Label>
            <Select value={categoria} onValueChange={setCategoria}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="__all__">Todas as categorias</SelectItem>
                {categoriasDisponiveis.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="ml-auto text-xs text-muted-foreground">
            {totalPacientes} pacientes no filtro · {bairrosView.length} bairros
            {cidadeFoco !== "__all__" && <> em {cidadeFoco}</>}
            {semGeo > 0 && <> · {semGeo} sem coordenada</>}
          </div>
        </CardContent>
      </Card>

      <Tabs value={aba} onValueChange={(v) => setAba(v as typeof aba)} className="space-y-4">
        <TabsList>
          <TabsTrigger value="mapa">Mapa de calor</TabsTrigger>
          <TabsTrigger value="bairros">Por bairro</TabsTrigger>
          <TabsTrigger value="categoria">Faturamento por categoria</TabsTrigger>
        </TabsList>

        <TabsContent value="mapa" className="mt-0">
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-4">
        <Card>
          <CardContent className="p-3">
            {loading || !mounted ? (
              <Skeleton className="h-[520px] w-full" />
            ) : bairrosView.length === 0 ? (
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
                   bairros={bairrosView}
                   metric={metric}
                  unidades={unidadePoints}
                  showUnits={showUnits}
                  selectedKey={selected}
                  onSelect={setSelected}
                  focusCity={cidadeFoco === "__all__" ? "Rio Verde" : cidadeFoco}
                />
              </Suspense>
            )}
          </CardContent>
        </Card>

        <Card className="max-h-[560px] overflow-auto">
          <CardHeader><CardTitle className="text-base">{cidadeFoco === "__all__" ? "Todas as cidades" : cidadeFoco} — bairros por {metric === "faturamento" ? "faturamento" : "pacientes"}</CardTitle></CardHeader>
          <CardContent className="space-y-1 p-3">
            {loading ? <Skeleton className="h-64 w-full" /> : bairrosView.slice().sort((a, b) => (metric === "faturamento" ? b.faturamento - a.faturamento : b.pacientes - a.pacientes)).slice(0, 10).map((b, i) => (
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
                   <Badge variant="secondary">{metric === "faturamento" ? `R$ ${b.faturamento.toFixed(2)}` : b.pacientes}</Badge>
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
            <Card className="mt-4">
              <CardHeader><CardTitle className="text-base">{detalhe.bairro} — {detalhe.cidade}</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <Metric label="Pacientes" value={String(detalhe.pacientes)} />
                <Metric label="Atendimentos" value={String(detalhe.demanda)} />
                <Metric label="Especialidade líder" value={detalhe.topEspecialidade} />
                <Metric label="Distância da unidade" value={detalhe.distanciaKm != null ? `${detalhe.distanciaKm.toFixed(1)} km` : "—"} />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ---------- Janela: Por bairro ---------- */}
        <TabsContent value="bairros" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Bairros de {cidadeFoco === "__all__" ? "todas as cidades" : cidadeFoco}
                {categoria !== "__all__" && <> · categoria {categoria}</>}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? <Skeleton className="m-4 h-64" /> : (
                <div className="max-h-[600px] overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted/60 backdrop-blur">
                      <tr className="text-left">
                        <th className="px-3 py-2">#</th>
                        <th className="px-3 py-2">Bairro</th>
                        <th className="px-3 py-2">Cidade</th>
                        <th className="px-3 py-2 text-right">Pacientes</th>
                        <th className="px-3 py-2 text-right">Atendimentos</th>
                        <th className="px-3 py-2 text-right">Faturamento</th>
                        <th className="px-3 py-2">Especialidade líder</th>
                        <th className="px-3 py-2 text-right">Distância</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rankingBairros.map((b, i) => (
                        <tr
                          key={b.key}
                          onClick={() => { setSelected(b.key); setAba("mapa"); }}
                          className="cursor-pointer border-t border-border hover:bg-muted/40"
                        >
                          <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                          <td className="px-3 py-2 font-medium">{b.bairro}</td>
                          <td className="px-3 py-2 text-muted-foreground">{b.cidade}</td>
                          <td className="px-3 py-2 text-right">{b.pacientes}</td>
                          <td className="px-3 py-2 text-right">{b.demanda}</td>
                          <td className="px-3 py-2 text-right">{brl(b.faturamento)}</td>
                          <td className="px-3 py-2 text-muted-foreground">{b.topEspecialidade}</td>
                          <td className="px-3 py-2 text-right text-muted-foreground">
                            {b.distanciaKm != null ? `${b.distanciaKm.toFixed(1)} km` : "—"}
                          </td>
                        </tr>
                      ))}
                      {!rankingBairros.length && (
                        <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">Sem dados.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------- Janela: Faturamento por categoria ---------- */}
        <TabsContent value="categoria" className="mt-0 space-y-4">
          <Card>
            <CardContent className="flex flex-wrap items-end gap-4 p-4">
              <div className="w-[260px]">
                <Label className="text-xs text-muted-foreground">Categoria de faturamento</Label>
                <Select value={categoria} onValueChange={setCategoria}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value="__all__">Todas as categorias</SelectItem>
                    {categoriasDisponiveis.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground max-w-md">
                Escolha uma categoria (ex.: Cardiologia) para ver o mapa de calor e os bairros com mais e com
                menos pacientes dessa categoria.
              </p>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-4">
            <Card>
              <CardContent className="p-3">
                {loading || !mounted ? (
                  <Skeleton className="h-[520px] w-full" />
                ) : rankingBairros.length === 0 ? (
                  <div className="h-[520px] grid place-items-center text-sm text-muted-foreground">
                    Nenhum paciente dessa categoria com endereço geocodificado no período.
                  </div>
                ) : (
                  <Suspense fallback={<Skeleton className="h-[520px] w-full" />}>
                    <PatientMap
                      mode="heat"
                      bairros={rankingBairros}
                      metric={metric}
                      unidades={unidadePoints}
                      showUnits={showUnits}
                      selectedKey={selected}
                      onSelect={setSelected}
                      focusCity={cidadeFoco === "__all__" ? "Rio Verde" : cidadeFoco}
                    />
                  </Suspense>
                )}
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader><CardTitle className="text-base">Onde há mais</CardTitle></CardHeader>
                <CardContent className="space-y-1 p-3">
                  {rankingBairros.slice(0, 8).map((b, i) => (
                    <RankRow key={b.key} pos={i + 1} bairro={b.bairro} valor={metric === "faturamento" ? brl(b.faturamento) : `${b.pacientes} pac.`} onClick={() => setSelected(b.key)} ativo={selected === b.key} />
                  ))}
                  {!rankingBairros.length && <p className="text-sm text-muted-foreground">Sem dados.</p>}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-base">Onde há menos</CardTitle></CardHeader>
                <CardContent className="space-y-1 p-3">
                  {rankingBairros.slice(-5).reverse().map((b) => (
                    <RankRow key={b.key} bairro={b.bairro} valor={metric === "faturamento" ? brl(b.faturamento) : `${b.pacientes} pac.`} onClick={() => setSelected(b.key)} ativo={selected === b.key} />
                  ))}
                  {!rankingBairros.length && <p className="text-sm text-muted-foreground">Sem dados.</p>}
                </CardContent>
              </Card>
            </div>
          </div>

          {detalhe && (
            <Card>
              <CardHeader><CardTitle className="text-base">{detalhe.bairro} — categorias faturadas</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                {(detalhe.categorias ?? []).slice(0, 10).map(([c, v]) => (
                  <div key={c} className="flex justify-between rounded-md border border-border bg-muted/30 px-3 py-2">
                    <span className="truncate">{c}</span>
                    <strong>{brl(v)}</strong>
                  </div>
                ))}
                {!(detalhe.categorias ?? []).length && <p className="text-muted-foreground">Sem faturamento registrado.</p>}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>


      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Lightbulb className="h-4 w-4 text-warning" /> Insights automáticos</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {insights.length ? insights.map((t) => (
            <div key={t} className="rounded-md border border-border bg-muted/30 p-3 text-sm">{t}</div>
          )) : <p className="text-sm text-muted-foreground">Sem dados suficientes para gerar insights.</p>}
        </CardContent>
      </Card>

      {showUploader && <MetricasUploader onDone={() => pacientes.refetch()} />}
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
        const metricas: Record<string, string | number> = {};
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
