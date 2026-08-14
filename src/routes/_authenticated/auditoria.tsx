import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { brl, num } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/auditoria")({
  head: () => ({
    meta: [
      { title: "Auditoria de Dados | Painel de Decisão" },
      { name: "description", content: "Origem exata de cada número: status de sincronização, qualidade dos dados e rastreamento de receita por convênio." },
      { property: "og:title", content: "Auditoria de Dados" },
      { property: "og:description", content: "Rastreabilidade completa dos dados sincronizados da Feegow." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuditoriaPage,
});

const TABELAS = [
  "agendamentos", "financeiro_lancamentos", "pacientes", "procedimentos",
  "profissionais", "especialidades", "convenios", "unidades", "status_agendamento",
] as const;

type Fin = {
  id: number; tipo: string; valor: number; categoria: string | null;
  convenio_id: number | null; procedimento_id: number | null;
  agendamento_id: number | null; descricao_item: string | null;
  unidade_id: number | null; data_pagamento: string | null; status: string | null;
};

async function fetchAudit() {
  // 1) Contagens brutas por tabela
  const contagens: Record<string, number> = {};
  for (const t of TABELAS) {
    const { count } = await supabase.from(t as any).select("*", { count: "exact", head: true });
    contagens[t] = count ?? 0;
  }

  // 2) Logs de sincronização
  const { data: logs } = await supabase
    .from("sync_logs").select("*").order("iniciado_em", { ascending: false }).limit(30);

  // 3) Financeiro completo (colunas leves) — base do rastreamento de receita
  const fin: Fin[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase
      .from("financeiro_lancamentos")
      .select("id, tipo, valor, categoria, convenio_id, procedimento_id, agendamento_id, descricao_item, unidade_id, data_pagamento, status")
      .range(from, from + 999);
    if (!data?.length) break;
    fin.push(...(data as any));
    if (data.length < 1000) break;
  }

  // 4) Catálogos para checar órfãos e nomes faltando
  const { data: convs } = await supabase.from("convenios").select("convenio_id, nome");
  const { data: procs } = await supabase.from("procedimentos").select("procedimento_id, nome");

  // 5) Nulos críticos na agenda
  const nulosAgenda: Record<string, number> = {};
  for (const col of ["paciente_id", "profissional_id", "procedimento_id", "convenio_id", "unidade_id", "horario", "status_id"]) {
    const { count } = await supabase
      .from("agendamentos").select("*", { count: "exact", head: true }).is(col, null);
    nulosAgenda[col] = count ?? 0;
  }
  const nulosPacientes: Record<string, number> = {};
  for (const col of ["cep", "bairro", "latitude", "sexo", "ano_nascimento"]) {
    const { count } = await supabase
      .from("pacientes").select("*", { count: "exact", head: true }).is(col, null);
    nulosPacientes[col] = count ?? 0;
  }

  return { contagens, logs: logs ?? [], fin, convs: convs ?? [], procs: procs ?? [], nulosAgenda, nulosPacientes };
}

function AuditoriaPage() {
  const q = useQuery({ queryKey: ["auditoria"], queryFn: fetchAudit, staleTime: 60_000 });

  if (q.isLoading || !q.data) {
    return <div className="p-6 space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-64 w-full" /></div>;
  }
  const { contagens, logs, fin, convs, procs, nulosAgenda, nulosPacientes } = q.data;

  const receitas = fin.filter((r) => r.tipo === "receita");
  const receitaTotal = receitas.reduce((s, r) => s + Number(r.valor || 0), 0);
  const nomeConv = new Map(convs.map((c: any) => [Number(c.convenio_id), c.nome as string]));
  const idsProc = new Set(procs.map((p: any) => Number(p.procedimento_id)));

  const porConvenio = new Map<string, { n: number; total: number }>();
  for (const r of receitas) {
    const k = r.convenio_id == null ? "Não identificado" : (nomeConv.get(Number(r.convenio_id)) ?? `Convênio ${r.convenio_id}`);
    const cur = porConvenio.get(k) ?? { n: 0, total: 0 };
    cur.n++; cur.total += Number(r.valor || 0);
    porConvenio.set(k, cur);
  }
  const convLinhas = [...porConvenio.entries()].sort((a, b) => b[1].total - a[1].total);

  const naoIdent = receitas.filter((r) => r.convenio_id == null);
  const bucketsNaoIdent = new Map<string, { n: number; total: number }>();
  for (const r of naoIdent) {
    const k = r.categoria?.trim() || "(sem categoria)";
    const cur = bucketsNaoIdent.get(k) ?? { n: 0, total: 0 };
    cur.n++; cur.total += Number(r.valor || 0);
    bucketsNaoIdent.set(k, cur);
  }
  const bucketLinhas = [...bucketsNaoIdent.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 25);

  const lotes = receitas.filter((r) => (r.descricao_item ?? "").toLowerCase().startsWith("lote"));
  const semAgendamento = receitas.filter((r) => r.agendamento_id == null);
  const procOrfaos = fin.filter((r) => r.procedimento_id != null && !idsProc.has(Number(r.procedimento_id)));
  const convOrfaos = fin.filter((r) => r.convenio_id != null && !nomeConv.has(Number(r.convenio_id)));
  const procSemNome = procs.filter((p: any) => !String(p.nome ?? "").trim() || /^procedimento\s/i.test(String(p.nome)));
  const valorStrings = fin.filter((r) => typeof (r as any).valor === "string").length;

  const json = {
    gerado_em: new Date().toISOString(),
    contagens_por_tabela: contagens,
    receita: {
      total_bruto: receitaTotal,
      identificada_convenio: receitas.filter((r) => r.convenio_id != null).reduce((s, r) => s + Number(r.valor || 0), 0),
      nao_identificada: naoIdent.reduce((s, r) => s + Number(r.valor || 0), 0),
      faturamento_em_lote: { registros: lotes.length, total: lotes.reduce((s, r) => s + Number(r.valor || 0), 0) },
      por_convenio: Object.fromEntries(convLinhas),
    },
    qualidade: {
      nulos_agendamentos: nulosAgenda,
      nulos_pacientes: nulosPacientes,
      receitas_sem_agendamento: semAgendamento.length,
      procedimentos_orfaos: procOrfaos.length,
      convenios_orfaos: convOrfaos.length,
      procedimentos_sem_nome: procSemNome.length,
      valores_em_texto: valorStrings,
    },
    ultima_sync: logs[0] ?? null,
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Auditoria de Dados</h1>
        <p className="text-sm text-muted-foreground">
          Números brutos, direto do banco. Nenhuma estimativa ou interpretação.
        </p>
      </div>

      <Tabs defaultValue="sync">
        <TabsList>
          <TabsTrigger value="sync">Status de Sync</TabsTrigger>
          <TabsTrigger value="qualidade">Qualidade de Dados</TabsTrigger>
          <TabsTrigger value="receita">Rastreamento de Receita</TabsTrigger>
          <TabsTrigger value="tabelas">Log de Todas as Tabelas</TabsTrigger>
          <TabsTrigger value="json">JSON</TabsTrigger>
        </TabsList>

        <TabsContent value="sync" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Últimas execuções</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-muted-foreground">
                  <tr className="text-left">
                    <th className="py-2">Endpoint</th><th>Início</th><th>Fim</th>
                    <th className="text-right">Registros</th><th>Status</th><th>Detalhe</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((l: any) => (
                    <tr key={l.id} className="border-t border-border align-top">
                      <td className="py-2 pr-3 font-mono text-xs">{l.endpoint}</td>
                      <td className="pr-3 text-xs">{new Date(l.iniciado_em).toLocaleString("pt-BR")}</td>
                      <td className="pr-3 text-xs">{l.finalizado_em ? new Date(l.finalizado_em).toLocaleTimeString("pt-BR") : "—"}</td>
                      <td className="pr-3 text-right">{num(l.registros)}</td>
                      <td className="pr-3">
                        <Badge variant={l.sucesso ? "secondary" : "destructive"}>{l.sucesso ? "ok" : "falhou"}</Badge>
                      </td>
                      <td className="text-xs text-muted-foreground max-w-[420px] break-words">{l.erro ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="qualidade" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Campos nulos — agendamentos ({num(contagens.agendamentos)})</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                {Object.entries(nulosAgenda).map(([k, v]) => (
                  <div key={k} className="flex justify-between border-b border-border py-1">
                    <span className="font-mono text-xs">{k}</span>
                    <span>{num(v)} nulos ({((v / (contagens.agendamentos || 1)) * 100).toFixed(1)}%)</span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Campos nulos — pacientes ({num(contagens.pacientes)})</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                {Object.entries(nulosPacientes).map(([k, v]) => (
                  <div key={k} className="flex justify-between border-b border-border py-1">
                    <span className="font-mono text-xs">{k}</span>
                    <span>{num(v)} nulos ({((v / (contagens.pacientes || 1)) * 100).toFixed(1)}%)</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader><CardTitle>Discrepâncias detectadas</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              {[
                ["Receitas sem agendamento vinculado", semAgendamento.length],
                ["Lançamentos com procedimento inexistente no catálogo", procOrfaos.length],
                ["Lançamentos com convênio inexistente no catálogo", convOrfaos.length],
                ["Procedimentos sem nome real", procSemNome.length],
                ["Valores gravados como texto em vez de número", valorStrings],
              ].map(([label, v]) => (
                <div key={String(label)} className="flex justify-between border-b border-border py-1">
                  <span>{label}</span>
                  <span className={Number(v) > 0 ? "text-warning" : ""}>{num(Number(v))}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="receita" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card><CardHeader><CardTitle className="text-sm">Receita total</CardTitle></CardHeader>
              <CardContent className="text-2xl font-semibold">{brl(receitaTotal)}</CardContent></Card>
            <Card><CardHeader><CardTitle className="text-sm">Identificada com convênio</CardTitle></CardHeader>
              <CardContent className="text-2xl font-semibold">
                {brl(receitaTotal - naoIdent.reduce((s, r) => s + Number(r.valor || 0), 0))}
              </CardContent></Card>
            <Card><CardHeader><CardTitle className="text-sm">Faturamento em lote</CardTitle></CardHeader>
              <CardContent className="text-2xl font-semibold">
                {brl(lotes.reduce((s, r) => s + Number(r.valor || 0), 0))}
                <div className="text-xs text-muted-foreground">{num(lotes.length)} lançamentos</div>
              </CardContent></Card>
          </div>
          <Card>
            <CardHeader><CardTitle>Receita por convênio (origem: financeiro_lancamentos.convenio_id)</CardTitle></CardHeader>
            <CardContent className="text-sm">
              {convLinhas.map(([nome, v]) => (
                <div key={nome} className="flex justify-between border-b border-border py-1">
                  <span>{nome}</span>
                  <span>{brl(v.total)} <span className="text-muted-foreground text-xs">({num(v.n)} reg.)</span></span>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Dentro de "Não identificado": categorias brutas da Feegow</CardTitle></CardHeader>
            <CardContent className="text-sm">
              {bucketLinhas.map(([nome, v]) => (
                <div key={nome} className="flex justify-between border-b border-border py-1">
                  <span className="font-mono text-xs">{nome}</span>
                  <span>{brl(v.total)} <span className="text-muted-foreground text-xs">({num(v.n)} reg.)</span></span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tabelas">
          <Card>
            <CardHeader><CardTitle>Total de registros por tabela</CardTitle></CardHeader>
            <CardContent className="text-sm">
              {Object.entries(contagens).map(([t, n]) => {
                const log = logs.find((l: any) => String(l.endpoint).startsWith(t.split("_")[0]));
                return (
                  <div key={t} className="flex justify-between border-b border-border py-1">
                    <span className="font-mono text-xs">{t}</span>
                    <span>
                      {num(n)}
                      <span className="text-muted-foreground text-xs ml-2">
                        última sync: {log ? new Date(log.iniciado_em).toLocaleString("pt-BR") : "—"}
                        {log ? ` · ${num(log.registros)} reg.` : ""}
                      </span>
                    </span>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="json">
          <Card>
            <CardHeader><CardTitle>JSON estruturado</CardTitle></CardHeader>
            <CardContent>
              <pre className="text-xs overflow-auto max-h-[600px] bg-muted p-4 rounded">
                {JSON.stringify(json, null, 2)}
              </pre>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
