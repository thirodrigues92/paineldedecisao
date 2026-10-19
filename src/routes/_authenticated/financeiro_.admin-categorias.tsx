import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { brl, num } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/financeiro_/admin-categorias")({
  head: () => ({
    meta: [
      { title: "Categorias do DRE — Financeiro" },
      { name: "description", content: "Edite o de-para das categorias financeiras para o DRE." },
      { property: "og:title", content: "Categorias do DRE — Financeiro" },
      { property: "og:description", content: "Edite o de-para das categorias financeiras para o DRE." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminCategorias,
});

const GRUPOS: Record<string, string> = {
  "Repasses médicos": "variavel",
  "Insumos e apoio": "variavel",
  Impostos: "variavel",
  Pessoal: "fixa",
  "Ocupação": "fixa",
  Marketing: "fixa",
  "Pró-labore": "fixa",
  "Administrativo e outras": "fixa",
  Investimento: "fora_operacional",
  "Distribuição a sócios": "fora_operacional",
  Revisar: "pendencia",
  "Não classificado": "pendencia",
};

type CatRow = { categoria_origem: string; grupo_dre: string; tipo: string; qtd: number; total: number };
type DreRow = { mes: string; grupo_dre: string; tipo: string; valor: number };

function AdminCategorias() {
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const cats = useQuery({
    queryKey: ["dre-categorias"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("vw_dre_categorias").select("*").order("total", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CatRow[];
    },
  });
  const dre = useQuery({
    queryKey: ["dre-mensal"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("vw_dre_mensal").select("*").order("mes", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DreRow[];
    },
  });

  const rows = cats.data ?? [];
  const filtradas = useMemo(() => {
    const b = busca.trim().toLowerCase();
    return b ? rows.filter((r) => `${r.categoria_origem} ${r.grupo_dre}`.toLowerCase().includes(b)) : rows;
  }, [rows, busca]);
  const pend = rows.filter((r) => r.tipo === "pendencia");
  const totalPend = pend.reduce((s, r) => s + Number(r.total || 0), 0);

  async function salvar(cat: string, grupo: string) {
    const { error } = await (supabase as any)
      .from("dim_categoria_dre")
      .upsert({ categoria_origem: cat, grupo_dre: grupo, tipo: GRUPOS[grupo] });
    if (error) return toast.error(error.message);
    toast.success(`"${cat}" agora em ${grupo}`);
    qc.invalidateQueries({ queryKey: ["dre-categorias"] });
    qc.invalidateQueries({ queryKey: ["dre-mensal"] });
  }

  const meses = Array.from(new Set((dre.data ?? []).map((r) => r.mes)));
  const ordem = ["Receita", ...Object.keys(GRUPOS), "Margem de contribuição", "Resultado operacional"];
  const grid = new Map<string, number>();
  for (const r of dre.data ?? []) grid.set(`${r.grupo_dre}|${r.mes}`, Number(r.valor || 0));
  const linhas = ordem.filter((g) => meses.some((m) => grid.has(`${g}|${m}`)));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Categorias do DRE</h1>
        <p className="text-sm text-muted-foreground">De-para das categorias de despesa para os grupos do DRE.</p>
      </div>

      <Card className="border-warning/50 bg-warning/10">
        <CardContent className="p-4 text-sm">
          <b>{num(pend.length)}</b> categorias em Revisar/Não classificado, somando <b>{brl(totalPend)}</b> em despesas.
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>Categorias</CardTitle>
          <Input placeholder="Buscar categoria ou grupo..." value={busca} onChange={(e) => setBusca(e.target.value)} className="max-w-xs" />
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr><th className="py-2">Categoria</th><th>Lanç.</th><th className="text-right pr-4">Total</th><th>Grupo DRE</th><th>Tipo</th></tr>
            </thead>
            <tbody>
              {cats.isLoading && <tr><td colSpan={5} className="py-4 text-muted-foreground">Carregando...</td></tr>}
              {filtradas.map((r) => (
                <tr key={r.categoria_origem} className={`border-t border-border ${r.tipo === "pendencia" ? "bg-warning/15" : ""}`}>
                  <td className="py-2">{r.categoria_origem}</td>
                  <td>{num(r.qtd)}</td>
                  <td className="text-right pr-4 tabular-nums">{brl(r.total)}</td>
                  <td>
                    <Select value={r.grupo_dre} onValueChange={(g) => salvar(r.categoria_origem, g)}>
                      <SelectTrigger className="h-8 w-56"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.keys(GRUPOS).map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="text-muted-foreground">{r.tipo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Teste: vw_dre_mensal</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          {dre.isLoading ? <p className="text-sm text-muted-foreground">Carregando...</p> : dre.isError ? (
            <p className="text-sm text-destructive">Erro ao carregar o DRE.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-muted-foreground">
                <tr><th className="text-left py-2">Grupo</th>{meses.map((m) => <th key={m} className="text-right px-2">{m}</th>)}</tr>
              </thead>
              <tbody>
                {linhas.map((g) => (
                  <tr key={g} className={`border-t border-border ${g === "Receita" || g.startsWith("Margem") || g.startsWith("Resultado") ? "font-semibold" : ""}`}>
                    <td className="py-1.5">{g}</td>
                    {meses.map((m) => <td key={m} className="text-right px-2 tabular-nums">{grid.has(`${g}|${m}`) ? brl(grid.get(`${g}|${m}`)) : "—"}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
