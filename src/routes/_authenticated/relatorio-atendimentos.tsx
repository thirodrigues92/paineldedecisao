import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useFilters } from "@/lib/filters-context";
import {
  dashboardQueryKey,
  fetchDashboardAppointments,
  fetchFaturadoPorAgendamento,
  fetchPacientesContato,
} from "@/lib/dashboard-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { brl, num } from "@/lib/format";
import { ArrowDown, ArrowUp, Download } from "lucide-react";

export const Route = createFileRoute("/_authenticated/relatorio-atendimentos")({
  head: () => ({
    meta: [
      { title: "Relatório de Atendimentos — Painel Clínico" },
      {
        name: "description",
        content:
          "Relatório linha a linha dos atendimentos da Feegow: paciente, celular, data, hora, local, origem, procedimento, status e valor.",
      },
      { property: "og:title", content: "Relatório de Atendimentos — Painel Clínico" },
      {
        property: "og:description",
        content: "Atendimentos detalhados direto da Feegow, com exportação em CSV.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RelatorioAtendimentosPage,
});

type Linha = {
  agendamento_id: number;
  celular: string;
  data: string;
  faturado: number;
  hora: string;
  local: string;
  origem: string;
  paciente: string;
  procedimento: string;
  status: string;
  valor: number;
};

type Coluna = { key: keyof Linha; label: string; align?: "right" };

const COLUNAS: Coluna[] = [
  { key: "celular", label: "Celular" },
  { key: "data", label: "Data" },
  { key: "faturado", label: "Faturado", align: "right" },
  { key: "hora", label: "Hora" },
  { key: "local", label: "Local" },
  { key: "origem", label: "Origem" },
  { key: "paciente", label: "Paciente" },
  { key: "procedimento", label: "Procedimento" },
  { key: "status", label: "Status" },
  { key: "valor", label: "Valor", align: "right" },
];

const fmtData = (d: string) =>
  d ? new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR") : "—";

function RelatorioAtendimentosPage() {
  const f = useFilters();
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<{ key: keyof Linha; dir: "asc" | "desc" }>({
    key: "data",
    dir: "desc",
  });

  const query = useQuery({
    queryKey: dashboardQueryKey("relatorio-atendimentos", f),
    queryFn: async () => {
      const [agendamentos, contatos] = await Promise.all([
        fetchDashboardAppointments(f, 30_000),
        fetchPacientesContato(),
      ]);
      const faturado = await fetchFaturadoPorAgendamento(
        agendamentos.map((a) => Number(a.agendamento_id)).filter(Boolean),
      );

      const linhas: Linha[] = agendamentos.map((a) => {
        const c = a.paciente_id ? contatos.get(Number(a.paciente_id)) : undefined;
        return {
          agendamento_id: Number(a.agendamento_id),
          celular: c?.celular ?? "—",
          data: a.data,
          faturado: faturado.get(Number(a.agendamento_id)) ?? 0,
          hora: (a.horario ?? "").slice(0, 5) || "—",
          local: a.unidades?.nome_fantasia ?? "—",
          origem: c?.origem_id ? `Origem #${c.origem_id}` : "—",
          paciente: c?.nome ?? (a.paciente_id ? `Paciente #${a.paciente_id}` : "—"),
          procedimento: a.procedimentos?.nome ?? "—",
          status: a.status_agendamento?.descricao ?? a.status_agendamento?.categoria ?? "—",
          valor: Number(a.valor_total || 0),
        };
      });
      return linhas;
    },
  });

  const linhas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const base = termo
      ? (query.data ?? []).filter((l) =>
          [l.paciente, l.celular, l.procedimento, l.local, l.status, l.origem]
            .join(" ")
            .toLowerCase()
            .includes(termo),
        )
      : (query.data ?? []);
    const dir = ordem.dir === "asc" ? 1 : -1;
    return [...base].sort((a, b) => {
      const va = a[ordem.key];
      const vb = b[ordem.key];
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb), "pt-BR") * dir;
    });
  }, [query.data, busca, ordem]);

  const totalValor = linhas.reduce((s, l) => s + l.valor, 0);
  const totalFaturado = linhas.reduce((s, l) => s + l.faturado, 0);

  const alternarOrdem = (key: keyof Linha) =>
    setOrdem((o) => (o.key === key ? { key, dir: o.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  const exportarCsv = () => {
    const cab = COLUNAS.map((c) => c.label).join(";");
    const corpo = linhas
      .map((l) =>
        COLUNAS.map((c) => {
          const v = l[c.key];
          if (c.key === "data") return fmtData(l.data);
          if (typeof v === "number") return v.toFixed(2).replace(".", ",");
          return `"${String(v).replace(/"/g, '""')}"`;
        }).join(";"),
      )
      .join("\n");
    const blob = new Blob([`\uFEFF${cab}\n${corpo}`], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `atendimentos-${f.from.toISOString().slice(0, 10)}_${f.to.toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Atendimentos</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{num(linhas.length)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Valor na agenda</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{brl(totalValor)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Já faturado</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{brl(totalFaturado)}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">Relatório de atendimentos (dados brutos da Feegow)</CardTitle>
          <div className="flex items-center gap-2">
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar paciente, celular, procedimento…"
              className="h-9 w-64"
            />
            <Button variant="outline" size="sm" onClick={exportarCsv} disabled={!linhas.length}>
              <Download className="mr-1 h-4 w-4" /> CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {query.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : query.error ? (
            <p className="text-sm text-destructive">Falha ao carregar: {String(query.error)}</p>
          ) : (
            <div className="max-h-[65vh] overflow-auto rounded-md border border-border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted">
                  <tr>
                    {COLUNAS.map((c) => (
                      <th
                        key={c.key}
                        className={`whitespace-nowrap px-3 py-2 font-medium text-muted-foreground ${
                          c.align === "right" ? "text-right" : "text-left"
                        }`}
                      >
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 hover:text-foreground"
                          onClick={() => alternarOrdem(c.key)}
                        >
                          {c.label}
                          {ordem.key === c.key &&
                            (ordem.dir === "asc" ? (
                              <ArrowUp className="h-3 w-3" />
                            ) : (
                              <ArrowDown className="h-3 w-3" />
                            ))}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {linhas.slice(0, 2000).map((l) => (
                    <tr key={l.agendamento_id} className="border-t border-border hover:bg-muted/40">
                      <td className="whitespace-nowrap px-3 py-2">{l.celular}</td>
                      <td className="whitespace-nowrap px-3 py-2">{fmtData(l.data)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        <span className={l.faturado > 0 ? "" : "text-muted-foreground"}>{brl(l.faturado)}</span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">{l.hora}</td>
                      <td className="px-3 py-2">{l.local}</td>
                      <td className="whitespace-nowrap px-3 py-2">{l.origem}</td>
                      <td className="px-3 py-2">{l.paciente}</td>
                      <td className="px-3 py-2">{l.procedimento}</td>
                      <td className="whitespace-nowrap px-3 py-2">{l.status}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">{brl(l.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {linhas.length > 2000 && (
                <p className="px-3 py-2 text-xs text-muted-foreground">
                  Exibindo as 2.000 primeiras linhas de {num(linhas.length)} — use o CSV para a lista completa.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
