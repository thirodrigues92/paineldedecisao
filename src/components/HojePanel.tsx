import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchHojeSnapshot, hojeISO, type HojeRow } from "@/lib/hoje-data";
import { num } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Clock } from "lucide-react";

const CARDS: Array<{ key: string; label: string; categorias: string[] | null; tone: string }> = [
  { key: "total", label: "Total de agendamentos", categorias: null, tone: "text-foreground" },
  { key: "realizado", label: "Realizados", categorias: ["realizado"], tone: "text-emerald-600" },
  { key: "em_atendimento", label: "Em andamento", categorias: ["em_atendimento"], tone: "text-sky-600" },
  { key: "agendado", label: "Aguardando", categorias: ["agendado", "triagem"], tone: "text-amber-600" },
  { key: "no_show", label: "No-show", categorias: ["no_show"], tone: "text-rose-600" },
  { key: "cancelado", label: "Cancelado", categorias: ["cancelado"], tone: "text-muted-foreground" },
];

type Drill = { titulo: string; descricao: string; rows: HojeRow[] } | null;

function formatDataBR(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function HojePanel() {
  const { data, isLoading } = useQuery({
    queryKey: ["hoje-snapshot", hojeISO()],
    queryFn: fetchHojeSnapshot,
    staleTime: 60_000,
  });

  const [drill, setDrill] = useState<Drill>(null);
  const [verTodosProcs, setVerTodosProcs] = useState(false);

  const rows = data?.rows ?? [];

  const procedimentos = useMemo(() => {
    const map = new Map<string, HojeRow[]>();
    for (const r of rows) {
      const arr = map.get(r.procedimentoNome) ?? [];
      arr.push(r);
      map.set(r.procedimentoNome, arr);
    }
    return [...map.entries()]
      .map(([nome, itens]) => ({ nome, qtd: itens.length, itens }))
      .sort((a, b) => b.qtd - a.qtd);
  }, [rows]);

  const profissionais = useMemo(() => {
    const map = new Map<string, HojeRow[]>();
    for (const r of rows) {
      const arr = map.get(r.profissionalNome) ?? [];
      arr.push(r);
      map.set(r.profissionalNome, arr);
    }
    return [...map.entries()]
      .map(([nome, itens]) => ({
        nome,
        total: itens.length,
        realizados: itens.filter((i) => i.categoria === "realizado").length,
        restantes: itens.filter((i) => i.categoria === "agendado" || i.categoria === "em_atendimento" || i.categoria === "triagem").length,
        itens,
      }))
      .sort((a, b) => b.total - a.total);
  }, [rows]);

  const tempo = useMemo(() => {
    const reais = rows.map((r) => r.tempo_permanencia_min ?? 0).filter((t) => t > 0);
    const agendados = rows.map((r) => r.duracao_min ?? 0).filter((t) => t > 0);
    const media = (arr: number[]) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0);
    return { real: media(reais), realQtd: reais.length, agendado: media(agendados) };
  }, [rows]);

  const abrir = (titulo: string, itens: HojeRow[]) =>
    setDrill({
      titulo,
      descricao: `${itens.length} agendamento(s) em ${formatDataBR(data?.data ?? hojeISO())}`,
      rows: [...itens].sort((a, b) => (a.horario ?? "").localeCompare(b.horario ?? "")),
    });

  const procsVisiveis = verTodosProcs ? procedimentos : procedimentos.slice(0, 10);

  return (
    <section className="space-y-4">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <h2 className="text-lg font-semibold">Hoje — {formatDataBR(data?.data ?? hojeISO())}</h2>
        <p className="text-xs text-muted-foreground">
          Dados exclusivos do dia atual — este bloco não segue o filtro de período do restante do painel.
        </p>
      </div>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <>
          <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
            {CARDS.map((c) => {
              const itens = c.categorias ? rows.filter((r) => c.categorias!.includes(r.categoria)) : rows;
              return (
                <Card
                  key={c.key}
                  role="button"
                  tabIndex={0}
                  onClick={() => abrir(c.label, itens)}
                  onKeyDown={(e) => e.key === "Enter" && abrir(c.label, itens)}
                  className="cursor-pointer transition-colors hover:bg-accent/50"
                >
                  <CardHeader className="pb-1">
                    <CardTitle className="text-xs font-medium text-muted-foreground">{c.label}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className={cn("text-2xl font-semibold", c.tone)}>{num(itens.length)}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Clock className="h-4 w-4" />
                {tempo.realQtd > 0 ? "Tempo médio de atendimento (real)" : "Tempo médio agendado"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {tempo.realQtd > 0 ? (
                <>
                  <p className="text-2xl font-semibold">{tempo.real.toFixed(0)} min</p>
                  <p className="text-xs text-muted-foreground">
                    Baseado em {num(tempo.realQtd)} atendimentos com chegada/saída sincronizadas. Tempo médio agendado: {tempo.agendado.toFixed(0)} min.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-2xl font-semibold">{tempo.agendado.toFixed(0)} min</p>
                  <p className="text-xs text-muted-foreground">
                    Tempo reservado na agenda, não o realizado. A Feegow ainda não enviou horário de chegada/saída para estes agendamentos.
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Procedimentos de hoje</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {procsVisiveis.map((p) => (
                  <button
                    key={p.nome}
                    onClick={() => abrir(p.nome, p.itens)}
                    className="w-full flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                  >
                    <span className="truncate">{p.nome}</span>
                    <span className="font-semibold tabular-nums">{num(p.qtd)}</span>
                  </button>
                ))}
                {!procedimentos.length && <p className="text-sm text-muted-foreground">Sem procedimentos hoje.</p>}
                {procedimentos.length > 10 && (
                  <button
                    onClick={() => setVerTodosProcs((v) => !v)}
                    className="mt-1 text-xs text-primary hover:underline"
                  >
                    {verTodosProcs ? "Ver menos" : `Ver todos (${procedimentos.length})`}
                  </button>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Profissionais atendendo hoje</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 text-xs text-muted-foreground pb-1">
                  <span>Profissional</span>
                  <span className="text-right">Agend.</span>
                  <span className="text-right">Feitos</span>
                  <span className="text-right">Restam</span>
                </div>
                <div className="space-y-1">
                  {profissionais.map((p) => (
                    <button
                      key={p.nome}
                      onClick={() => abrir(p.nome, p.itens)}
                      className="w-full grid grid-cols-[1fr_auto_auto_auto] gap-x-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                    >
                      <span className="truncate">{p.nome}</span>
                      <span className="text-right tabular-nums">{num(p.total)}</span>
                      <span className="text-right tabular-nums text-emerald-600">{num(p.realizados)}</span>
                      <span className="text-right tabular-nums text-amber-600">{num(p.restantes)}</span>
                    </button>
                  ))}
                  {!profissionais.length && <p className="text-sm text-muted-foreground">Sem profissionais hoje.</p>}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <Sheet open={drill !== null} onOpenChange={(o) => !o && setDrill(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{drill?.titulo}</SheetTitle>
            <SheetDescription>{drill?.descricao}</SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-2">
            {(drill?.rows ?? []).map((r) => (
              <div key={r.agendamento_id} className="rounded-md border p-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{r.horario?.substring(0, 5) ?? "--:--"} · {r.pacienteNome}</span>
                  <span className="text-xs text-muted-foreground">{r.statusDescricao}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {r.profissionalNome} · {r.procedimentoNome} · {r.convenioNome}
                </p>
              </div>
            ))}
            {drill && !drill.rows.length && <p className="text-sm text-muted-foreground">Nenhum registro.</p>}
          </div>
        </SheetContent>
      </Sheet>
    </section>
  );
}
