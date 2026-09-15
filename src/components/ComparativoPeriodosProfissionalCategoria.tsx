import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useFilters } from "@/lib/filters-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from "recharts";
import { ArrowDownRight, ArrowUpRight, Check, Download, RefreshCw, Search, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

type Dim = "profissional" | "categoria";
type Metrica = "valor_faturado" | "valor_recebido" | "quantidade";

const CORES = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#f97316", "#06b6d4", "#ec4899"];

const MESES_PT = [
  "jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez",
];

function mesLabel(mes: string) {
  const [ano, m] = mes.split("-");
  return `${MESES_PT[Number(m) - 1]}/${ano}`;
}

function ultimosMeses(n: number): string[] {
  const hoje = new Date();
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

function mesesDisponiveis(qtd = 24): string[] {
  const hoje = new Date();
  const out: string[] = [];
  for (let i = 0; i < qtd; i++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

function inicioDoMes(mes: string) {
  return `${mes}-01`;
}
function fimDoMes(mes: string) {
  const [ano, m] = mes.split("-").map(Number);
  const d = new Date(ano, m, 0);
  return `${ano}-${String(m).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

function formatMetrica(metrica: Metrica, v: number) {
  if (metrica === "quantidade") return Math.round(v || 0).toLocaleString("pt-BR");
  return brl(v || 0);
}

type Row = {
  data_execucao: string | null;
  profissional_nome: string | null;
  grupo_nome: string | null;
  procedimento_nome: string | null;
  convenio_nome: string | null;
  paciente_nome: string | null;
  valor: number | null;
  valor_pago: number | null;
};

function MultiSelect({
  label,
  options,
  selected,
  onChange,
  placeholder,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="h-9 min-w-56 justify-between">
            <span className="truncate">
              {selected.length === 0 ? placeholder : `${selected.length} selecionado(s)`}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="start">
          <Command>
            <CommandInput placeholder="Buscar..." />
            <CommandList>
              <CommandEmpty>Nada encontrado.</CommandEmpty>
              <CommandGroup>
                {options.map((o) => (
                  <CommandItem key={o} value={o} onSelect={() => toggle(o)}>
                    <Check className={cn("mr-2 h-4 w-4", selected.includes(o) ? "opacity-100" : "opacity-0")} />
                    <span className="truncate">{o}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function ComparativoPeriodosProfissionalCategoria() {
  const filters = useFilters();
  const [dim, setDim] = useState<Dim>("profissional");
  const [metrica, setMetrica] = useState<Metrica>("valor_faturado");
  const [meses, setMeses] = useState<string[]>(() => ultimosMeses(3));
  const [entidades, setEntidades] = useState<string[]>([]);
  const [detalhe, setDetalhe] = useState<string | null>(null);
  const [busca, setBusca] = useState("");

  const mesesOrdenados = useMemo(() => [...meses].sort(), [meses]);
  const intervalo = useMemo(() => {
    if (mesesOrdenados.length === 0) return null;
    return {
      de: inicioDoMes(mesesOrdenados[0]),
      ate: fimDoMes(mesesOrdenados[mesesOrdenados.length - 1]),
    };
  }, [mesesOrdenados]);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["comparativo-periodos", intervalo?.de, intervalo?.ate, filters.unidadeIds],
    enabled: !!intervalo,
    queryFn: async () => {
      const all: Row[] = [];
      let from = 0;
      const pageSize = 1000;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        let query = supabase
          .from("lab_producao_feegow")
          .select("data_execucao, profissional_nome, grupo_nome, procedimento_nome, convenio_nome, paciente_nome, valor, valor_pago")
          .gte("data_execucao", intervalo!.de)
          .lte("data_execucao", intervalo!.ate);
        if (filters.unidadeIds.length > 0) query = query.in("unidade_id", filters.unidadeIds);
        const { data, error } = await query.range(from, from + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all.push(...(data as Row[]));
        if (data.length < pageSize) break;
        from += pageSize;
      }
      return all;
    },
  });

  const linhas = useMemo(() => (data ?? []).filter((r) => !!r.data_execucao), [data]);

  const chaveDe = (r: Row) =>
    (dim === "profissional" ? r.profissional_nome : r.grupo_nome)?.trim() || "Não informado";
  const mesDe = (r: Row) => (r.data_execucao ?? "").slice(0, 7);
  const valorDe = (r: Row) =>
    metrica === "valor_faturado" ? Number(r.valor ?? 0) : metrica === "valor_recebido" ? Number(r.valor_pago ?? 0) : 1;

  const opcoesEntidades = useMemo(() => {
    const s = new Set<string>();
    linhas.forEach((r) => s.add(chaveDe(r)));
    return Array.from(s).sort((a, b) => a.localeCompare(b, "pt-BR"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linhas, dim]);

  const linhasFiltradas = useMemo(() => {
    const mesesSet = new Set(mesesOrdenados);
    return linhas.filter((r) => {
      if (!mesesSet.has(mesDe(r))) return false;
      if (entidades.length > 0 && !entidades.includes(chaveDe(r))) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linhas, mesesOrdenados, entidades, dim]);

  const agregado = useMemo(() => {
    const mapa = new Map<string, Record<string, number>>();
    linhasFiltradas.forEach((r) => {
      const k = chaveDe(r);
      const m = mesDe(r);
      if (!mapa.has(k)) mapa.set(k, {});
      const obj = mapa.get(k)!;
      obj[m] = (obj[m] ?? 0) + valorDe(r);
    });
    const arr = Array.from(mapa.entries()).map(([nome, porMes]) => {
      const total = mesesOrdenados.reduce((s, m) => s + (porMes[m] ?? 0), 0);
      return { nome, porMes, total };
    });
    arr.sort((a, b) => b.total - a.total);
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linhasFiltradas, mesesOrdenados, dim, metrica]);

  const topParaGrafico = useMemo(() => agregado.slice(0, 12), [agregado]);

  const chartData = useMemo(
    () =>
      topParaGrafico.map((item) => {
        const o: Record<string, string | number> = { nome: item.nome };
        mesesOrdenados.forEach((m) => {
          o[mesLabel(m)] = Number((item.porMes[m] ?? 0).toFixed(2));
        });
        return o;
      }),
    [topParaGrafico, mesesOrdenados],
  );

  const doisMeses = mesesOrdenados.length === 2;

  // ---- detalhamento -------------------------------------------------------
  const detalhamento = useMemo(() => {
    if (!detalhe) return null;
    const porProc = new Map<string, Record<string, number>>();
    const porConvenio = new Map<string, Record<string, number>>();
    const atendimentos: Record<string, number> = {};
    linhasFiltradas
      .filter((r) => chaveDe(r) === detalhe)
      .forEach((r) => {
        const m = mesDe(r);
        const v = valorDe(r);
        atendimentos[m] = (atendimentos[m] ?? 0) + 1;
        const p = (dim === "profissional" ? r.procedimento_nome : r.procedimento_nome) || "Não informado";
        if (!porProc.has(p)) porProc.set(p, {});
        porProc.get(p)![m] = (porProc.get(p)![m] ?? 0) + v;
        const c = r.convenio_nome?.trim() || "Não informado";
        if (!porConvenio.has(c)) porConvenio.set(c, {});
        porConvenio.get(c)![m] = (porConvenio.get(c)![m] ?? 0) + v;
      });

    const primeiro = mesesOrdenados[0];
    const ultimo = mesesOrdenados[mesesOrdenados.length - 1];
    const listar = (mapa: Map<string, Record<string, number>>) =>
      Array.from(mapa.entries())
        .map(([nome, porMes]) => {
          const total = mesesOrdenados.reduce((s, m) => s + (porMes[m] ?? 0), 0);
          const delta = (porMes[ultimo] ?? 0) - (porMes[primeiro] ?? 0);
          return { nome, porMes, total, delta };
        })
        .sort((a, b) => b.total - a.total);

    return {
      procedimentos: listar(porProc),
      convenios: listar(porConvenio),
      atendimentos,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detalhe, linhasFiltradas, mesesOrdenados, dim, metrica]);

  const procedimentosFiltrados = useMemo(() => {
    if (!detalhamento) return [];
    const q = busca.trim().toLowerCase();
    if (!q) return detalhamento.procedimentos;
    return detalhamento.procedimentos.filter((p) => p.nome.toLowerCase().includes(q));
  }, [detalhamento, busca]);

  const exportarCSV = () => {
    const head = [dim === "profissional" ? "Profissional" : "Categoria", ...mesesOrdenados.map(mesLabel), "Total"];
    if (doisMeses) head.push("Variação", "Variação %");
    const linhasCsv = agregado.map((item) => {
      const base: (string | number)[] = [item.nome, ...mesesOrdenados.map((m) => (item.porMes[m] ?? 0).toFixed(2)), item.total.toFixed(2)];
      if (doisMeses) {
        const a = item.porMes[mesesOrdenados[0]] ?? 0;
        const b = item.porMes[mesesOrdenados[1]] ?? 0;
        base.push((b - a).toFixed(2), a === 0 ? "" : (((b - a) / a) * 100).toFixed(1));
      }
      return base;
    });
    const csv = [head, ...linhasCsv].map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `comparativo-${dim}-${mesesOrdenados.join("_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const Variacao = ({ a, b }: { a: number; b: number }) => {
    const delta = b - a;
    const pct = a === 0 ? null : (delta / a) * 100;
    const positivo = delta >= 0;
    return (
      <span className={cn("inline-flex items-center gap-1 font-medium", positivo ? "text-emerald-600" : "text-red-600")}>
        {positivo ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
        {formatMetrica(metrica, Math.abs(delta))}
        {pct !== null && <span className="text-xs">({pct > 0 ? "+" : ""}{pct.toFixed(1)}%)</span>}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" /> Comparativo de períodos
              </CardTitle>
              <CardDescription>
                Compare o mesmo profissional ou categoria entre meses diferentes. Este painel tem período próprio e não
                depende do filtro de datas da página.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
                <RefreshCw className={cn("mr-2 h-4 w-4", isFetching && "animate-spin")} /> Atualizar
              </Button>
              <Button variant="outline" size="sm" onClick={exportarCSV} disabled={agregado.length === 0}>
                <Download className="mr-2 h-4 w-4" /> CSV
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Comparar por</span>
            <Select
              value={dim}
              onValueChange={(v) => {
                setDim(v as Dim);
                setEntidades([]);
                setDetalhe(null);
              }}
            >
              <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="profissional">Profissional</SelectItem>
                <SelectItem value="categoria">Categoria</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <MultiSelect
            label={dim === "profissional" ? "Profissionais" : "Categorias"}
            options={opcoesEntidades}
            selected={entidades}
            onChange={(v) => {
              setEntidades(v);
              setDetalhe(null);
            }}
            placeholder="Todos"
          />

          <MultiSelect
            label="Meses"
            options={mesesDisponiveis()}
            selected={meses}
            onChange={setMeses}
            placeholder="Selecione"
          />

          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Métrica</span>
            <Select value={metrica} onValueChange={(v) => setMetrica(v as Metrica)}>
              <SelectTrigger className="h-9 w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="valor_faturado">Faturado (R$)</SelectItem>
                <SelectItem value="valor_recebido">Recebido (R$)</SelectItem>
                <SelectItem value="quantidade">Qtd. procedimentos</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setMeses(ultimosMeses(3))}>Últimos 3 meses</Button>
            <Button variant="secondary" size="sm" onClick={() => setMeses(ultimosMeses(6))}>Últimos 6 meses</Button>
          </div>

          <div className="flex flex-wrap gap-1">
            {mesesOrdenados.map((m) => (
              <Badge key={m} variant="outline">{mesLabel(m)}</Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Comparação por mês</CardTitle>
          <CardDescription>
            {isLoading ? "Carregando..." : `${agregado.length} ${dim === "profissional" ? "profissionais" : "categorias"} no período selecionado`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Sem dados para os meses selecionados.</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(360, chartData.length * 46)}>
              <BarChart data={chartData} layout="vertical" margin={{ left: 20, right: 30 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tickFormatter={(v) => (metrica === "quantidade" ? String(v) : brl(Number(v)))} />
                <YAxis type="category" dataKey="nome" width={190} tick={{ fontSize: 12 }} />
                <RechartsTooltip formatter={(v: number) => formatMetrica(metrica, Number(v))} />
                <Legend />
                {mesesOrdenados.map((m, i) => (
                  <Bar key={m} dataKey={mesLabel(m)} fill={CORES[i % CORES.length]} radius={[0, 4, 4, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Tabela comparativa</CardTitle>
          <CardDescription>Clique em uma linha para ver o que explica a diferença entre os meses.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{dim === "profissional" ? "Profissional" : "Categoria"}</TableHead>
                {mesesOrdenados.map((m) => (
                  <TableHead key={m} className="text-right">{mesLabel(m)}</TableHead>
                ))}
                <TableHead className="text-right">Total</TableHead>
                {doisMeses && <TableHead className="text-right">Variação</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {agregado.map((item) => (
                <TableRow
                  key={item.nome}
                  className={cn("cursor-pointer", detalhe === item.nome && "bg-muted/60")}
                  onClick={() => setDetalhe(detalhe === item.nome ? null : item.nome)}
                >
                  <TableCell className="font-medium">{item.nome}</TableCell>
                  {mesesOrdenados.map((m) => (
                    <TableCell key={m} className="text-right tabular-nums">
                      {formatMetrica(metrica, item.porMes[m] ?? 0)}
                    </TableCell>
                  ))}
                  <TableCell className="text-right font-semibold tabular-nums">
                    {formatMetrica(metrica, item.total)}
                  </TableCell>
                  {doisMeses && (
                    <TableCell className="text-right">
                      <Variacao a={item.porMes[mesesOrdenados[0]] ?? 0} b={item.porMes[mesesOrdenados[1]] ?? 0} />
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {agregado.length === 0 && (
                <TableRow>
                  <TableCell colSpan={mesesOrdenados.length + 3} className="py-8 text-center text-muted-foreground">
                    Sem dados.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {detalhe && detalhamento && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">O que mudou — {detalhe}</CardTitle>
            <CardDescription>
              Atendimentos por mês:{" "}
              {mesesOrdenados.map((m) => `${mesLabel(m)}: ${detalhamento.atendimentos[m] ?? 0}`).join(" · ")}
            </CardDescription>
            <div className="relative pt-2">
              <Search className="absolute left-2 top-4.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Pesquisar procedimento..."
                className="h-9 pl-8"
              />
            </div>
          </CardHeader>
          <CardContent className="grid gap-6 lg:grid-cols-2">
            <div>
              <h4 className="mb-2 text-sm font-semibold">Procedimentos</h4>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Procedimento</TableHead>
                    {mesesOrdenados.map((m) => (
                      <TableHead key={m} className="text-right">{mesLabel(m)}</TableHead>
                    ))}
                    <TableHead className="text-right">Δ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {procedimentosFiltrados.slice(0, 40).map((p) => (
                    <TableRow key={p.nome}>
                      <TableCell className="max-w-64 truncate">{p.nome}</TableCell>
                      {mesesOrdenados.map((m) => (
                        <TableCell key={m} className="text-right tabular-nums">
                          {formatMetrica(metrica, p.porMes[m] ?? 0)}
                        </TableCell>
                      ))}
                      <TableCell className={cn("text-right tabular-nums", p.delta >= 0 ? "text-emerald-600" : "text-red-600")}>
                        {p.delta >= 0 ? "+" : "-"}{formatMetrica(metrica, Math.abs(p.delta))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div>
              <h4 className="mb-2 text-sm font-semibold">Convênio / Particular</h4>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Origem</TableHead>
                    {mesesOrdenados.map((m) => (
                      <TableHead key={m} className="text-right">{mesLabel(m)}</TableHead>
                    ))}
                    <TableHead className="text-right">Δ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detalhamento.convenios.slice(0, 20).map((c) => (
                    <TableRow key={c.nome}>
                      <TableCell className="max-w-64 truncate">{c.nome}</TableCell>
                      {mesesOrdenados.map((m) => (
                        <TableCell key={m} className="text-right tabular-nums">
                          {formatMetrica(metrica, c.porMes[m] ?? 0)}
                        </TableCell>
                      ))}
                      <TableCell className={cn("text-right tabular-nums", c.delta >= 0 ? "text-emerald-600" : "text-red-600")}>
                        {c.delta >= 0 ? "+" : "-"}{formatMetrica(metrica, Math.abs(c.delta))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
