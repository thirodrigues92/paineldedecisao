import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { labDebugFeegow, labSyncParticular, labSyncConvenio, clearLabData } from "@/lib/lab-faturamento.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/lab/faturamento")({
  component: LabFaturamento,
});

function LabFaturamento() {
  const [tab, setTab] = useState("faturamento");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [sequenceResults, setSequenceResults] = useState<any[]>([]);
  const [dateRange, setDateRange] = useState({ 
    start: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });

  const queryClient = useQueryClient();

  const { data: stats } = useQuery({
    queryKey: ['lab-stats'],
    queryFn: async () => {
      const { data } = await supabase.from('lab_vw_faturado_x_recebido').select('*');
      return data || [];
    }
  });

  const { data: logs } = useQuery({
    queryKey: ['lab-logs'],
    queryFn: async () => {
      const { data } = await supabase.from('lab_sync_log').select('*').order('criado_em', { ascending: false }).limit(20);
      return data || [];
    }
  });

  const syncMutation = useMutation({
    mutationFn: async (type: 'particular' | 'convenio') => {
      if (type === 'particular') return labSyncParticular({ data: { data_inicio: dateRange.start, data_fim: dateRange.end } });
      return labSyncConvenio({ data: { data_inicio: dateRange.start, data_fim: dateRange.end } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lab-stats'] });
      queryClient.invalidateQueries({ queryKey: ['lab-logs'] });
      toast.success("Sincronização concluída!");
    },
    onError: (e) => toast.error("Erro na sincronização: " + String(e))
  });

  const clearMutation = useMutation({
    mutationFn: () => clearLabData(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lab-stats'] });
      queryClient.invalidateQueries({ queryKey: ['lab-logs'] });
      toast.success("Dados limpos!");
    }
  });

  const testEndpoint = async (endpoint: string, params: Record<string, string> = {}, method: "GET" | "POST" = "GET", body?: any) => {
    setLoading(true);
    setSequenceResults([]);
    try {
      const res = await labDebugFeegow({ data: { endpoint, params, method, body } });
      setResult(res);
    } finally {
      setLoading(false);
    }
  };

  const testBillingDateFilter = async () => {
    setLoading(true);
    setResult(null);
    const tests = [
      { label: "Sem parâmetros", params: {} },
      { label: "2026 Full", params: { data_start: "01-01-2026", data_end: "31-12-2026" } },
      { label: "2019 Jan-Fev", params: { data_start: "01-01-2019", data_end: "28-02-2019" } },
    ];
    
    const results = [];
    for (const t of tests) {
      const res = await labDebugFeegow({ 
        data: { 
          endpoint: "billing/insurances-billing", 
          params: { ...t.params, billing_type_id: "1", billing: "1" } as Record<string, string>
        } 
      });
      results.push({ ...t, total: res.raw?.content?.total || res.raw?.total || 0, res });
    }
    setSequenceResults(results);
    setLoading(false);
  };

  const scanListInvoice = async () => {
    setLoading(true);
    setResult(null);
    setSequenceResults([]); // Limpa ANTES de iniciar a varredura
    
    const steps = [
      { m: "GET", p: { data_start: "01-01-2026", data_end: "31-12-2026", tipo_transacao: "C", unidade_id: "0", start: "0", offset: "50" }, desc: "C (Crédito) 2026" },
      { m: "GET", p: { data_start: "01-01-2026", data_end: "31-12-2026", tipo_transacao: "D", unidade_id: "0", start: "0", offset: "50" }, desc: "D (Débito) 2026" },
      { m: "GET", p: { data_start: "01-01-2026", data_end: "31-12-2026", tipo_transacao: "T", unidade_id: "0", start: "0", offset: "50" }, desc: "T (Transferência) 2026" },
    ];

    const results = [];
    let firstSuccess = null;

    for (const [i, s] of steps.entries()) {
      const res = await labDebugFeegow({ 
        data: { 
          endpoint: "financial/list-invoice", 
          method: s.m as any, 
          params: s.p as Record<string, string>,
          body: null
        } 
      });
      const item = { 
        id: i + 1, 
        method: s.m, 
        label: s.desc,
        urlBody: s.desc, 
        status: res.http_status, 
        success: res.api_success, 
        total: res.total_registros,
        tipo_transacao: s.p.tipo_transacao || '-',
        periodo: s.p.data_start ? `${s.p.data_start} a ${s.p.data_end}` : '-',
        raw: res
      };
      results.push(item);
      if (!firstSuccess && res.http_status === 200 && res.api_success && s.p.tipo_transacao === "C") {
        firstSuccess = res;
      }
    }
    setSequenceResults(results);
    if (firstSuccess) setResult(firstSuccess);
    setLoading(false);
  };

  const totals = useMemo(() => {
    if (!stats) return { faturado: 0, recebido: 0, diff: 0 };
    return stats.reduce((acc, curr) => ({
      faturado: acc.faturado + (Number(curr.total_faturado) || 0),
      recebido: acc.recebido + (Number(curr.total_recebido) || 0),
      diff: acc.diff + (Number(curr.saldo_a_receber) || 0)
    }), { faturado: 0, recebido: 0, diff: 0 });
  }, [stats]);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">🧪 Lab — Faturamento</h1>
          <p className="text-muted-foreground">Módulo experimental de auditoria Faturamento x Recebimento.</p>
        </div>
        <div className="flex gap-2">
           <Button variant="outline" size="sm" onClick={() => clearMutation.mutate()} className="text-destructive">
             <Trash2 className="w-4 h-4 mr-2" /> Limpar Lab
           </Button>
           <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries()}>
             <RefreshCw className="w-4 h-4 mr-2" /> Atualizar
           </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Faturado</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">R$ {totals.faturado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Recebido</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">R$ {totals.recebido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Diferença (Pendente)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">R$ {totals.diff.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <div className="flex border-b overflow-x-auto">
          <button onClick={() => setTab("faturamento")} className={`px-4 py-2 whitespace-nowrap ${tab === "faturamento" ? "border-b-2 border-primary font-bold" : ""}`}>Faturado x Recebido</button>
          <button onClick={() => setTab("sincronizacao")} className={`px-4 py-2 whitespace-nowrap ${tab === "sincronizacao" ? "border-b-2 border-primary font-bold" : ""}`}>Sincronização</button>
          <button onClick={() => setTab("auditoria")} className={`px-4 py-2 whitespace-nowrap ${tab === "auditoria" ? "border-b-2 border-primary font-bold" : ""}`}>Auditoria</button>
          <button onClick={() => setTab("diagnostico")} className={`px-4 py-2 whitespace-nowrap ${tab === "diagnostico" ? "border-b-2 border-primary font-bold" : ""}`}>Debug API</button>
        </div>

        {tab === "faturamento" && (
          <Card>
            <CardHeader>
              <CardTitle>Composição por Origem</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Origem</TableHead>
                    <TableHead className="text-right">Faturado</TableHead>
                    <TableHead className="text-right">Recebido</TableHead>
                    <TableHead className="text-right">Diferença</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats?.map((s: any) => (
                    <TableRow key={s.origem + (s.mes || '')}>
                      <TableCell className="font-medium capitalize">{s.origem} {s.mes ? `(${s.mes})` : ''}</TableCell>
                      <TableCell className="text-right">R$ {s.total_faturado?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell className="text-right text-emerald-600">R$ {s.total_recebido?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell className="text-right text-amber-600 font-bold">R$ {s.saldo_a_receber?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell className="text-center">
                        {s.saldo_a_receber === 0 ? <Badge variant="outline" className="text-emerald-500"><CheckCircle2 className="w-3 h-3 mr-1" /> OK</Badge> : <Badge variant="outline" className="text-amber-500">Pendente</Badge>}
                      </TableCell>
                    </TableRow>
                  ))}
                  {(!stats || stats.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhum dado sincronizado no Lab.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
           </Card>
         )}
 
         {tab === "sincronizacao" && (
          <Card>
            <CardHeader>
              <CardTitle>Controle de Sincronização</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg flex items-start gap-3 text-amber-800 text-sm mb-4">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <p>
                  <strong>Aviso Importante:</strong> A base de guias TISS contém apenas 15 registros de 2019 — módulo aparentemente não utilizado. 
                  Os dados de faturamento de convênio devem ser extraídos preferencialmente através do módulo financeiro (Accounts).
                </p>
              </div>
              <div className="flex gap-4 items-end bg-muted/50 p-4 rounded-lg flex-wrap">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase">Início</label>
                  <Input type="date" value={dateRange.start} onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase">Fim</label>
                  <Input type="date" value={dateRange.end} onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))} />
                </div>
                <Button onClick={() => syncMutation.mutate('particular')} disabled={syncMutation.isPending}>
                  Sync Particular (Accounts)
                </Button>
                <Button onClick={() => syncMutation.mutate('convenio')} disabled={syncMutation.isPending}>
                  Sync Convênio (Insurances)
                </Button>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-bold uppercase text-muted-foreground">Log de Execuções Recentes</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data/Hora</TableHead>
                      <TableHead>Endpoint</TableHead>
                      <TableHead>Registros</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs?.map((l: any) => (
                      <TableRow key={l.id}>
                        <TableCell className="text-xs">{new Date(l.criado_em).toLocaleString('pt-BR')}</TableCell>
                        <TableCell className="text-xs font-mono">{l.endpoint}</TableCell>
                        <TableCell>{l.registros || 0}</TableCell>
                        <TableCell>
                          {l.api_success ? <Badge className="bg-emerald-500 hover:bg-emerald-600">Sucesso</Badge> : <Badge variant="destructive">Erro</Badge>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
           </Card>
         )}
 
         {tab === "auditoria" && (
           <Card>
             <CardHeader>
               <CardTitle>Diagnóstico de Integridade</CardTitle>
             </CardHeader>
             <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <h3 className="font-bold flex items-center"><AlertCircle className="w-4 h-4 mr-2 text-amber-500" /> Possíveis Problemas</h3>
                    <ul className="text-sm space-y-2 text-muted-foreground">
                      <li>• Lançamentos em "Accounts" sem vínculo com agendamento.</li>
                      <li>• Guias de convênio com valor pago diferente do informado na fatura.</li>
                      <li>• Lotes de convênio não identificados pela API insurances-billing.</li>
                      <li>• Pagamentos sem data de competência definida.</li>
                    </ul>
                  </div>
                  <div className="bg-muted p-4 rounded-lg">
                    <h3 className="text-xs font-bold uppercase mb-2">Resumo Técnico</h3>
                    <div className="text-xs font-mono space-y-1">
                      <div>Views: lab_vw_faturado_x_recebido</div>
                      <div>Tabelas: lab_faturamento, lab_recebimento</div>
                      <div>Isolamento: Prefixo lab_ (Não afeta dashboard oficial)</div>
                    </div>
                  </div>
                </div>
             </CardContent>
           </Card>
         )}
 
         {tab === "diagnostico" && (
           <Card>
              <CardHeader>
                <CardTitle>Explorador de Endpoints Feegow</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2 flex-wrap pb-4 border-b">
                  <Button size="sm" variant="outline" onClick={() => testEndpoint('financial/list-invoice')} disabled={loading}>
                    financial/list-invoice
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => {
                    toast.info("Endpoint dmed exige CPF e datas. Testando manual...");
                    testEndpoint('financial/dmed', { cpf: '00000000000', dataInicio: '01-01-2026', dataFim: '31-12-2026' });
                  }} disabled={loading}>
                    financial/dmed
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => testEndpoint('core/financial/base/financial-category', {}, 'POST')} disabled={loading}>
                    financial-category
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => {
                     toast.warning("financial/cost-center retornou 403 (Permissão). Verificar token no Feegow.");
                     testEndpoint('financial/cost-center');
                  }} disabled={loading}>
                    financial/cost-center
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => testEndpoint('financial/list-transfers', { data_start: '01-08-2026', data_end: '31-08-2026' })} disabled={loading}>
                    list-transfers
                  </Button>
                  <Button size="sm" variant="secondary" onClick={testBillingDateFilter} disabled={loading}>
                    Testar filtro de data: insurances-billing
                  </Button>
                  <Button size="sm" variant="default" onClick={scanListInvoice} disabled={loading} className="bg-indigo-600 hover:bg-indigo-700">
                    Descobrir parâmetros: list-invoice
                  </Button>
                </div>

                {sequenceResults.length > 0 && !result && (
                  <div className="space-y-4">
                    <h3 className="font-bold text-sm uppercase">Resultados da Varredura (list-invoice)</h3>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>#</TableHead>
                          <TableHead>Tipo</TableHead>
                          <TableHead>Período</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Success</TableHead>
                          <TableHead>Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sequenceResults.map((r, i) => (
                          <TableRow key={i} 
                            className={`cursor-pointer hover:bg-muted/50 ${r.success && r.status === 200 ? "bg-emerald-50/50" : ""}`}
                            onClick={() => setResult(r.raw)}
                          >
                            <TableCell>{r.id}</TableCell>
                            <TableCell className="font-mono">{r.tipo_transacao}</TableCell>
                            <TableCell className="text-xs">{r.periodo}</TableCell>
                            <TableCell>{r.status}</TableCell>
                            <TableCell>{r.success ? "✅" : "❌"}</TableCell>
                            <TableCell className="font-bold">{r.total}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <div className="p-3 bg-muted rounded text-xs text-muted-foreground italic">
                      Dica: Clique em uma linha para ver o JSON completo e descobrir qual tipo_transacao traz as receitas.
                    </div>
                  </div>
                )}

                {result && (
                  <div className="space-y-4">
                    <div className="bg-slate-900 text-slate-200 p-4 rounded-lg space-y-2 text-xs font-mono border-l-4 border-indigo-500">
                      <div className="flex gap-4">
                        <Button variant="ghost" size="sm" className="h-6 px-2 text-indigo-400 hover:bg-slate-800" onClick={() => setResult(null)}>← Voltar</Button>
                        <span className="text-indigo-400 font-bold">{result.method}</span>
                        <span className="text-slate-400 truncate">{result.url}</span>
                      </div>
                      {result.sent_body && (
                        <div className="mt-2 pt-2 border-t border-slate-700">
                          <span className="text-amber-400">Body:</span>
                          <pre className="mt-1 text-slate-300 overflow-x-auto">{JSON.stringify(result.sent_body, null, 2)}</pre>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex justify-between items-center text-xs font-mono bg-muted p-2 rounded">
                      <span>Resultado da API</span>
                      <span className={result.api_success ? "text-emerald-500" : "text-destructive"}>
                        HTTP {result.http_status} | Success: {String(result.api_success)} | Count: {result.total_registros}
                      </span>
                    </div>
                    <pre className="bg-black text-emerald-400 p-4 rounded-lg overflow-auto text-[10px] max-h-[500px]">
                      {JSON.stringify(result.raw, null, 2)}
                    </pre>
                  </div>
                )}
              </CardContent>
            </Card>
         )}
      </div>
    </div>
  );
}
