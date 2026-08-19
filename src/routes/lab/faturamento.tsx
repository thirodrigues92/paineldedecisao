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
import { DatePickerWithRange } from "@/components/ui/date-picker-with-range";
import { Progress } from "@/components/ui/progress";
import { Check, X, Play, Square, TestTube2 } from "lucide-react";

export const Route = createFileRoute("/lab/faturamento")({
  component: LabFaturamento,
});

function LabFaturamento() {
  const [tab, setTab] = useState("sincronizacao");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [sequenceResults, setSequenceResults] = useState<any[]>([]);
  
  // Estados para o novo controle de sincronização
  const [syncConfig, setSyncConfig] = useState({
    tipo: 'C',
    janela: 3,
    dryRun: false,
    limparAntes: false
  });
  const [syncStatus, setSyncStatus] = useState<{
    isRunning: boolean;
    currentWindow: number;
    totalWindows: number;
    successCount: number;
    errorCount: number;
    logs: any[];
    summary: {
      total_contas: number;
      total_itens: number;
      total_pagamentos: number;
      soma_faturada: number;
      soma_recebida: number;
      com_agendamento: number;
      com_procedimento: number;
      cancelados: number;
      divergencias: number;
    } | null;
  }>({
    isRunning: false,
    currentWindow: 0,
    totalWindows: 0,
    successCount: 0,
    errorCount: 0,
    logs: [],
    summary: null
  });

  const [dateRange, setDateRange] = useState<{ start: Date; end: Date }>({ 
    start: new Date(new Date().setDate(new Date().getDate() - 7)),
    end: new Date()
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
      const { data } = await supabase.from('lab_sync_log').select('*').order('executado_em', { ascending: false }).limit(20);
      return data || [];
    }
  });

  const syncMutation = useMutation({
    mutationFn: async ({ 
      type, 
      tipoTransacao, 
      start, 
      end 
    }: { 
      type: 'particular' | 'convenio', 
      tipoTransacao?: string,
      start?: string,
      end?: string
    }) => {
      const dataInicio = start || dateRange.start.toISOString().split('T')[0];
      const dataFim = end || dateRange.end.toISOString().split('T')[0];
      
      if (type === 'particular') {
        return labSyncParticular({ 
          data: { 
            data_inicio: dataInicio, 
            data_fim: dataFim, 
            tipo_transacao: tipoTransacao,
            dry_run: syncConfig.dryRun,
            limpar_antes: syncConfig.limparAntes,
            tamanho_janela: syncConfig.janela
          } 
        });
      }
      return labSyncConvenio();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lab-stats'] });
      queryClient.invalidateQueries({ queryKey: ['lab-logs'] });
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

  const [manualRequest, setManualRequest] = useState({
    method: 'GET' as 'GET' | 'POST',
    endpoint: 'financial/list-invoice',
    data_start: new Date(),
    data_end: new Date(),
    tipo_transacao: 'C',
    unidade_id: '0',
    extra_params: 'start=0&offset=5'
  });
  const [requestHistory, setRequestHistory] = useState<any[]>([]);
  
  const toFeegowDate = (iso: string) => {
    const d = new Date(iso);
    const dd = String(d.getUTCDate()).padStart(2, "0");
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    return `${dd}-${mm}-${d.getUTCFullYear()}`;
  };

  const formatFeegowDate = (date: Date) => {
    const dd = String(date.getDate()).padStart(2, "0");
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    return `${dd}-${mm}-${date.getFullYear()}`;
  };

  const mountedUrl = useMemo(() => {
    try {
      const url = new URL("https://api.feegow.com/v1/api/" + manualRequest.endpoint.replace(/^\//, ''));
      url.searchParams.set("data_start", formatFeegowDate(manualRequest.data_start));
      url.searchParams.set("data_end", formatFeegowDate(manualRequest.data_end));
      url.searchParams.set("tipo_transacao", manualRequest.tipo_transacao);
      url.searchParams.set("unidade_id", manualRequest.unidade_id);
      
      if (manualRequest.extra_params) {
        const extra = new URLSearchParams(manualRequest.extra_params);
        extra.forEach((v, k) => url.searchParams.set(k, v));
      }
      return url.toString();
    } catch (e) {
      return "URL Inválida";
    }
  }, [manualRequest]);

  const testEndpoint = async (endpoint: string, params: Record<string, string> = {}, method: "GET" | "POST" = "GET", body?: any) => {
    setLoading(true);
    setSequenceResults([]);
    try {
      const res = await labDebugFeegow({ data: { endpoint, params, method, body } });
      setResult(res);
      
      // Adicionar ao histórico se for a requisição manual
      if (endpoint === manualRequest.endpoint) {
        setRequestHistory(prev => [{
          timestamp: new Date().toISOString(),
          method,
          endpoint,
          params,
          status: res.http_status,
          success: res.api_success
        }, ...prev].slice(0, 10));
      }
    } finally {
      setLoading(false);
    }
  };

  const sendManualRequest = () => {
    const params: Record<string, string> = {
      data_start: formatFeegowDate(manualRequest.data_start),
      data_end: formatFeegowDate(manualRequest.data_end),
      tipo_transacao: manualRequest.tipo_transacao,
      unidade_id: manualRequest.unidade_id,
    };
    
    if (manualRequest.extra_params) {
      const extra = new URLSearchParams(manualRequest.extra_params);
      extra.forEach((v, k) => params[k] = v);
    }

    testEndpoint(manualRequest.endpoint, params, manualRequest.method);
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
      { m: "GET", p: { data_start: "01-01-2026", data_end: "31-12-2026", tipo_transacao: "D", unidade_id: "0", start: "0", offset: "50" }, desc: "D (Débito)" },
      { m: "GET", p: { data_start: "01-01-2026", data_end: "31-12-2026", tipo_transacao: "C", unidade_id: "0", start: "0", offset: "50" }, desc: "C (Crédito)" },
      { m: "GET", p: { data_start: "01-01-2026", data_end: "31-12-2026", tipo_transacao: "R", unidade_id: "0", start: "0", offset: "50" }, desc: "R (Receita)" },
      { m: "GET", p: { data_start: "01-01-2026", data_end: "31-12-2026", unidade_id: "0", start: "0", offset: "50" }, desc: "Sem tipo" },
      { m: "GET", p: { data_start: "01-01-2019", data_end: "31-12-2019", tipo_transacao: "D", unidade_id: "0", start: "0", offset: "50" }, desc: "2019 D" },
      { m: "GET", p: { start: "0", offset: "50" }, desc: "Sem params" },
    ];

    const results = [];
    for (const [i, s] of steps.entries()) {
      const res = await labDebugFeegow({ 
        data: { 
          endpoint: "financial/list-invoice", 
          method: s.m as any, 
          params: s.p as Record<string, string>,
          body: null
        } 
      });
      results.push({ 
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
      });
    }
    setSequenceResults(results);
    setLoading(false);
  };

  const runControlledSync = async () => {
    if (syncStatus.isRunning) return;
    
    setSyncStatus(prev => ({ 
      ...prev, 
      isRunning: true, 
      currentWindow: 0, 
      successCount: 0, 
      errorCount: 0, 
      logs: [],
      summary: null
    }));

    const start = new Date(dateRange.start);
    const end = new Date(dateRange.end);
    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const windowSize = syncConfig.janela;
    const totalSteps = Math.ceil(days / windowSize);

    setSyncStatus(prev => ({ ...prev, totalWindows: totalSteps }));

    for (let i = 0; i < totalSteps; i++) {
      const currentStart = new Date(start);
      currentStart.setDate(start.getDate() + (i * windowSize));
      
      const currentEnd = new Date(currentStart);
      currentEnd.setDate(currentStart.getDate() + windowSize - 1);
      if (currentEnd > end) currentEnd.setTime(end.getTime());

      const startStr = currentStart.toISOString().split('T')[0];
      const endStr = currentEnd.toISOString().split('T')[0];

      setSyncStatus(prev => ({ ...prev, currentWindow: i + 1 }));

      try {
        // 4. Front — nunca ficar preso em "Parar" (30s timeout)
        const syncPromise = syncMutation.mutateAsync({
          type: 'particular',
          tipoTransacao: syncConfig.tipo,
          start: startStr,
          end: endStr
        });

        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error("Erro: sem resposta (timeout 30s)")), 30000)
        );

        const res: any = await Promise.race([syncPromise, timeoutPromise]);
        
        // Procurar qualquer janela de sucesso no resumo, pois ds pode ter mudado em caso de split
        const windowRes = res.resumo?.janelas?.find((j: any) => j.status === 'success');

        
        setSyncStatus(prev => ({
          ...prev,
          successCount: prev.successCount + 1,
          logs: [{
            periodo: `${startStr} a ${endStr}`,
            status: 'success',
            msg: syncConfig.dryRun ? 'Simulado' : 'Sincronizado',
            data: windowRes
          }, ...prev.logs],
          summary: (i === totalSteps - 1 && res.resumo) ? res.resumo : prev.summary
        }));

        // 5. Log geral sempre visível (atualizar após cada janela)
        queryClient.invalidateQueries({ queryKey: ['lab-logs'] });
      } catch (err: any) {
        setSyncStatus(prev => ({
          ...prev,
          errorCount: prev.errorCount + 1,
          logs: [{
            periodo: `${startStr} a ${endStr}`,
            status: 'error',
            msg: String(err.message || err)
          }, ...prev.logs]
        }));
        
        // Se houver erro, também invalidar logs para mostrar o log de erro do servidor
        queryClient.invalidateQueries({ queryKey: ['lab-logs'] });
      }
      
      // Delay pequeno entre janelas
      await new Promise(r => setTimeout(r, 500));
    }

    setSyncStatus(prev => ({ ...prev, isRunning: false }));
    toast.success("Processo finalizado");
  };

  const setDatePreset = (days: number | 'month') => {
    const end = new Date();
    const start = new Date();
    if (days === 'month') {
      start.setDate(1);
    } else {
      start.setDate(end.getDate() - days);
    }
    setDateRange({ start, end });
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
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
              Total Faturado
              {syncConfig.dryRun && <Badge className="bg-amber-500 text-[9px] h-4">SIMULADO</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              R$ {(syncConfig.dryRun && syncStatus.summary ? syncStatus.summary.soma_faturada : totals.faturado).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
              Total Recebido
              {syncConfig.dryRun && <Badge className="bg-amber-500 text-[9px] h-4">SIMULADO</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">
              R$ {(syncConfig.dryRun && syncStatus.summary ? syncStatus.summary.soma_recebida : totals.recebido).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
              Diferença (Pendente)
              {syncConfig.dryRun && <Badge className="bg-amber-500 text-[9px] h-4">SIMULADO</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">
              R$ {(syncConfig.dryRun && syncStatus.summary ? (syncStatus.summary.soma_faturada - syncStatus.summary.soma_recebida) : totals.diff).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <div className="flex border-b overflow-x-auto">
          <button onClick={() => setTab("faturamento")} className={`px-4 py-2 whitespace-nowrap cursor-pointer ${tab === "faturamento" ? "border-b-2 border-primary font-bold" : ""}`}>Faturado x Recebido</button>
          <button onClick={() => setTab("sincronizacao")} className={`px-4 py-2 whitespace-nowrap cursor-pointer ${tab === "sincronizacao" ? "border-b-2 border-primary font-bold" : ""}`}>Sincronização</button>
          <button onClick={() => setTab("auditoria")} className={`px-4 py-2 whitespace-nowrap cursor-pointer ${tab === "auditoria" ? "border-b-2 border-primary font-bold" : ""}`}>Auditoria</button>
          <button onClick={() => setTab("diagnostico")} className={`px-4 py-2 whitespace-nowrap cursor-pointer ${tab === "diagnostico" ? "border-b-2 border-primary font-bold" : ""}`}>Debug API</button>
          <button onClick={() => window.location.href = '/lab/relatorio'} className="px-4 py-2 whitespace-nowrap cursor-pointer text-indigo-600 hover:font-bold">📋 Relatório Comparativo</button>
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
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Painel Esquerdo: Config */}
                <div className="lg:col-span-1 space-y-4 border-r pr-6">
                  <h3 className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-2">
                    <RefreshCw className="w-3 h-3" /> Configuração
                  </h3>
                  
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase">Tipo de Transação</label>
                      <select 
                        className="w-full bg-background border rounded px-2 py-1 text-sm"
                        value={syncConfig.tipo}
                        onChange={e => setSyncConfig(prev => ({ ...prev, tipo: e.target.value }))}
                      >
                        <option value="C">Receitas (C)</option>
                        <option value="D">Despesas (D)</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase">Janela (Dias)</label>
                      <select 
                        className="w-full bg-background border rounded px-2 py-1 text-sm"
                        value={syncConfig.janela}
                        onChange={e => setSyncConfig(prev => ({ ...prev, janela: Number(e.target.value) }))}
                      >
                        <option value={1}>1 dia (Mais lento/seguro)</option>
                        <option value={3}>3 dias (Recomendado)</option>
                        <option value={7}>7 dias (Rápido)</option>
                      </select>
                      <p className="text-[10px] text-muted-foreground leading-tight">
                        O endpoint <code>financial/list-invoice</code> ignora <code>start</code>/<code>offset</code> e sempre devolve o período inteiro numa resposta só. O controle de volume é feito aqui pelo tamanho da janela.
                      </p>
                    </div>


                    <div className="space-y-3 pt-2">
                      <div className="flex items-center gap-2 cursor-pointer" onClick={() => setSyncConfig(prev => ({ ...prev, dryRun: !prev.dryRun }))}>
                        <div className={`w-8 h-4 rounded-full relative transition-colors ${syncConfig.dryRun ? 'bg-amber-500' : 'bg-slate-200'}`}>
                          <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${syncConfig.dryRun ? 'right-0.5' : 'left-0.5'}`} />
                        </div>
                        <span className="text-xs font-medium">Modo Simulação (Dry-run)</span>
                      </div>

                      <div className="flex items-center gap-2 cursor-pointer" onClick={() => setSyncConfig(prev => ({ ...prev, limparAntes: !prev.limparAntes }))}>
                        <div className={`w-8 h-4 rounded-full relative transition-colors ${syncConfig.limparAntes ? 'bg-indigo-500' : 'bg-slate-200'}`}>
                          <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${syncConfig.limparAntes ? 'right-0.5' : 'left-0.5'}`} />
                        </div>
                        <span className="text-xs font-medium">Limpar período antes</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Painel Central: Datas e Ações */}
                <div className="lg:col-span-3 space-y-6">
                  <div className="flex flex-wrap gap-4 items-end bg-muted/30 p-4 rounded-lg">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase text-muted-foreground">Período de Sincronização</label>
                      <DatePickerWithRange 
                        from={dateRange.start} 
                        to={dateRange.end} 
                        onRangeChange={(from, to) => setDateRange({ start: from, end: to })} 
                      />
                    </div>
                    
                    <div className="flex gap-1">
                      <Button variant="outline" size="sm" className="h-9 px-2 text-[10px]" onClick={() => setDatePreset(0)}>Hoje</Button>
                      <Button variant="outline" size="sm" className="h-9 px-2 text-[10px]" onClick={() => setDatePreset(1)}>Ontem</Button>
                      <Button variant="outline" size="sm" className="h-9 px-2 text-[10px]" onClick={() => setDatePreset(7)}>7d</Button>
                      <Button variant="outline" size="sm" className="h-9 px-2 text-[10px]" onClick={() => setDatePreset('month')}>Mês</Button>
                    </div>

                    <div className="flex gap-2 ml-auto">
                      <Button 
                        variant="secondary" 
                        size="sm" 
                        className="h-9"
                        onClick={() => {
                          setSyncConfig(prev => ({ ...prev, dryRun: true, janela: 1 }));
                          runControlledSync();
                        }}
                        disabled={syncStatus.isRunning}
                      >
                        <TestTube2 className="w-4 h-4 mr-2" /> 🔬 Testar 1 dia
                      </Button>
                      <Button 
                        variant={syncStatus.isRunning ? "destructive" : "default"}
                        size="sm"
                        className="h-9 min-w-[140px]"
                        onClick={() => {
                          if (!syncConfig.dryRun) {
                            if (!confirm("Os dados serão gravados em lab_faturamento e lab_recebimento. Continuar?")) return;
                          }
                          runControlledSync();
                        }}
                      >
                        {syncStatus.isRunning ? (
                          <><Square className="w-4 h-4 mr-2" /> Parar</>
                        ) : (
                          <><Play className="w-4 h-4 mr-2" /> Sincronizar</>
                        )}
                      </Button>
                    </div>
                  </div>

                  {syncStatus.isRunning || syncStatus.logs.length > 0 ? (
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-4">
                          <span className="text-xs font-bold uppercase text-muted-foreground">Progresso</span>
                          <span className="text-sm font-bold">Janela {syncStatus.currentWindow} de {syncStatus.totalWindows}</span>
                        </div>
                        <div className="flex gap-4 text-xs">
                          <span className="text-emerald-600 font-bold">{syncStatus.successCount} Sucessos</span>
                          <span className="text-destructive font-bold">{syncStatus.errorCount} Erros</span>
                        </div>
                      </div>
                      <Progress value={(syncStatus.currentWindow / syncStatus.totalWindows) * 100} className="h-2" />
                      
                      <div className="max-h-[300px] overflow-auto border rounded divide-y bg-muted/10">
                        {syncStatus.logs.map((log, idx) => (
                          <div key={idx} className="p-3 flex flex-col gap-2 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-muted-foreground font-bold">{log.periodo}</span>
                              <div className="flex items-center gap-2">
                                <span className={log.status === 'success' ? 'text-emerald-600' : 'text-destructive font-bold'}>
                                  {log.msg}
                                </span>
                                {log.status === 'success' ? (
                                  log.data?.contas > 0 ? <Check className="w-3 h-3 text-emerald-500" /> : <div className="w-3 h-3 rounded-full bg-slate-300" />
                                ) : <X className="w-3 h-3 text-destructive" />}
                              </div>
                            </div>
                            
                            {log.data && (
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
                                {log.data.contas > 0 ? (
                                  <>
                                    <span>{log.data.contas} contas</span>
                                    <span>{log.data.itens} itens</span>
                                    <span>{log.data.pagamentos} pagtos</span>
                                    <span className="text-emerald-600">R$ {log.data.valor_faturado.toLocaleString('pt-BR')} fat</span>
                                    <span className="text-indigo-600">R$ {log.data.valor_recebido.toLocaleString('pt-BR')} rec</span>
                                    {log.data.amostra?.length > 0 && (
                                      <Button 
                                        variant="link" 
                                        className="h-auto p-0 text-[10px] text-indigo-500 hover:text-indigo-700"
                                        onClick={() => setResult(log.data.amostra)}
                                      >
                                        Ver amostra (2)
                                      </Button>
                                    )}
                                  </>
                                ) : (
                                  <span className="text-slate-400">0 registros no período</span>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      {syncStatus.summary && (
                        <Card className="border-amber-200 bg-amber-50/20">
                          <CardHeader className="py-2">
                            <CardTitle className="text-xs font-bold text-amber-800">Resumo da Execução {syncConfig.dryRun ? '(SIMULAÇÃO)' : ''}</CardTitle>
                          </CardHeader>
                          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 py-3">
                            <div className="space-y-1">
                              <div className="text-[10px] uppercase text-muted-foreground">Volume Total</div>
                              <div className="text-sm font-bold">
                                {syncStatus.summary.total_contas} contas | {syncStatus.summary.total_itens} itens
                              </div>
                              <div className="text-[10px] text-muted-foreground">{syncStatus.summary.total_pagamentos} pagamentos</div>
                            </div>
                            <div className="space-y-1">
                              <div className="text-[10px] uppercase text-muted-foreground">Valores Totais</div>
                              <div className="text-sm font-bold text-emerald-700">Fat: R$ {syncStatus.summary.soma_faturada.toLocaleString('pt-BR')}</div>
                              <div className="text-sm font-bold text-indigo-700">Rec: R$ {syncStatus.summary.soma_recebida.toLocaleString('pt-BR')}</div>
                            </div>
                            <div className="space-y-1">
                              <div className="text-[10px] uppercase text-muted-foreground">Cobertura</div>
                              <div className="text-[10px]">Agendamentos: <span className="font-bold">{syncStatus.summary.com_agendamento}</span></div>
                              <div className="text-[10px]">Procedimentos: <span className="font-bold">{syncStatus.summary.com_procedimento}</span></div>
                            </div>
                            <div className="space-y-1">
                              <div className="text-[10px] uppercase text-muted-foreground">Divergências/Cancelados</div>
                              <div className="text-[10px] text-destructive font-bold">Divergências: {syncStatus.summary.divergencias}</div>
                              <div className="text-[10px] text-amber-600 font-bold">Cancelados: {syncStatus.summary.cancelados}</div>
                            </div>
                          </CardContent>
                        </Card>
                      )}
                    </div>
                  ) : (
                    <div className="h-[120px] flex items-center justify-center border-2 border-dashed rounded text-muted-foreground text-sm italic">
                      Configure o período e clique em Sincronizar para iniciar.
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-6 border-t space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-bold uppercase text-muted-foreground">Log Geral de Execuções</h3>
                  <Button variant="ghost" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ['lab-logs'] })}>
                    <RefreshCw className="w-3 h-3 mr-2" /> Atualizar Histórico
                  </Button>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Data/Hora</TableHead>
                      <TableHead>Endpoint</TableHead>
                      <TableHead>Parâmetros</TableHead>
                      <TableHead>Erro/Obs</TableHead>
                      <TableHead className="text-center">Registros</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs?.map((l: any) => (
                      <TableRow key={l.id} className="text-xs">
                        <TableCell className="whitespace-nowrap">{new Date(l.executado_em || l.criado_em).toLocaleString('pt-BR')}</TableCell>
                        <TableCell className="font-mono opacity-70">{l.endpoint}</TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            {Object.entries(l.parametros || {}).map(([k, v]) => (
                              <Badge key={k} variant="outline" className="text-[9px] font-mono px-1 h-4">{k}:{String(v)}</Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[150px] truncate" title={l.erro}>
                          {l.erro}
                        </TableCell>
                        <TableCell className="text-center font-bold">{l.registros || 0}</TableCell>
                        <TableCell className="text-center">
                          {l.api_success ? (
                            <div className="flex items-center justify-center text-emerald-500 font-bold"><Check className="w-3 h-3 mr-1" /> OK</div>
                          ) : (
                            <div className="flex items-center justify-center text-destructive font-bold">
                              {l.erro === 'iniciado' ? <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> : <X className="w-3 h-3 mr-1" />}
                              {l.erro === 'iniciado' ? 'Pendente' : 'Falha'}
                            </div>
                          )}
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
           <div className="space-y-6">
             <Card className="border-indigo-200 bg-indigo-50/30">
               <CardHeader className="pb-2">
                 <CardTitle className="text-sm font-bold text-indigo-700 flex items-center gap-2">
                   🔬 Requisição Manual
                 </CardTitle>
               </CardHeader>
               <CardContent className="space-y-4">
                 <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                    <div className="space-y-1 md:col-span-1">
                      <label className="text-[10px] font-bold uppercase">Método</label>
                      <select 
                        className="w-full bg-background border rounded px-2 py-1.5 text-sm"
                        value={manualRequest.method}
                        onChange={e => setManualRequest(prev => ({ ...prev, method: e.target.value as any }))}
                      >
                        <option value="GET">GET</option>
                        <option value="POST">POST</option>
                      </select>
                    </div>
                    <div className="space-y-1 md:col-span-5">
                      <label className="text-[10px] font-bold uppercase">Endpoint</label>
                      <Input 
                        value={manualRequest.endpoint}
                        onChange={e => setManualRequest(prev => ({ ...prev, endpoint: e.target.value }))}
                        placeholder="financial/list-invoice"
                        className="h-8"
                      />
                    </div>
                 </div>

                 <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase">Data Início</label>
                      <Input 
                        type="date"
                        className="h-8"
                        value={manualRequest.data_start.toISOString().split('T')[0]}
                        onChange={e => setManualRequest(prev => ({ ...prev, data_start: new Date(e.target.value + 'T12:00:00') }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase">Data Fim</label>
                      <Input 
                        type="date"
                        className="h-8"
                        value={manualRequest.data_end.toISOString().split('T')[0]}
                        onChange={e => setManualRequest(prev => ({ ...prev, data_end: new Date(e.target.value + 'T12:00:00') }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase">Tipo Transação</label>
                      <select 
                        className="w-full bg-background border rounded px-2 py-1.5 text-sm"
                        value={manualRequest.tipo_transacao}
                        onChange={e => setManualRequest(prev => ({ ...prev, tipo_transacao: e.target.value }))}
                      >
                        <option value="C">C (Crédito)</option>
                        <option value="D">D (Débito)</option>
                        <option value="T">T (Transferência)</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase">Unidade ID</label>
                      <Input 
                        type="number"
                        className="h-8"
                        value={manualRequest.unidade_id}
                        onChange={e => setManualRequest(prev => ({ ...prev, unidade_id: e.target.value }))}
                      />
                    </div>
                 </div>

                 <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase">Parâmetros Extras</label>
                    <Input 
                      className="h-8"
                      value={manualRequest.extra_params}
                      onChange={e => setManualRequest(prev => ({ ...prev, extra_params: e.target.value }))}
                      placeholder="Ex: start=0&offset=5"
                    />
                 </div>

                 <div className="p-2 bg-slate-900 rounded text-[10px] font-mono text-indigo-300 break-all border border-slate-800">
                    <span className="text-slate-500 mr-2 uppercase">{manualRequest.method}</span>
                    {mountedUrl}
                 </div>

                 <div className="flex justify-between items-center gap-4">
                    <div className="flex gap-2">
                       {requestHistory.length > 0 && (
                          <div className="flex gap-1 overflow-x-auto max-w-[400px] p-1">
                             {requestHistory.map((h, i) => (
                               <Button 
                                 key={i} 
                                 variant="ghost" 
                                 size="sm" 
                                 className="h-7 text-[9px] px-2 bg-slate-100"
                                 onClick={() => {
                                    setManualRequest(prev => ({
                                      ...prev,
                                      method: h.method,
                                      endpoint: h.endpoint,
                                    }));
                                    testEndpoint(h.endpoint, h.params, h.method);
                                 }}
                               >
                                 #{requestHistory.length - i} {h.success ? '✅' : '❌'}
                               </Button>
                             ))}
                          </div>
                       )}
                    </div>
                    <Button 
                      className="bg-indigo-600 hover:bg-indigo-700 h-9 px-8" 
                      onClick={sendManualRequest}
                      disabled={loading}
                    >
                      {loading ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                      ENVIAR REQUISIÇÃO
                    </Button>
                 </div>
               </CardContent>
             </Card>

             <Card>
               <CardHeader>
                 <CardTitle className="text-sm font-bold flex items-center justify-between">
                    <span>Ações Fixas de Varredura</span>
                    <Badge variant="outline">Transparência Total</Badge>
                 </CardTitle>
               </CardHeader>
               <CardContent>
                 <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => testEndpoint("insurance/list")} disabled={loading}>/insurance/list</Button>
                    <Button variant="outline" size="sm" onClick={() => testEndpoint("core/financial/base/financial-category", {}, "POST")} disabled={loading}>POST financial-category</Button>
                    <Button variant="outline" size="sm" onClick={() => testEndpoint("financial/list-transfers", { data_start: "01-08-2026", data_end: "31-08-2026" })} disabled={loading}>list-transfers (Ago/26)</Button>
                    <Button variant="outline" size="sm" onClick={() => testBillingDateFilter()} disabled={loading} className="border-amber-500 text-amber-600">
                      <TestTube2 className="w-4 h-4 mr-2" /> Testar Filtro Data Billing
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => scanListInvoice()} disabled={loading} className="border-indigo-500 text-indigo-600">
                      <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Varredura list-invoice
                    </Button>
                 </div>
               </CardContent>
             </Card>

             {sequenceResults.length > 0 && (
               <Card>
                 <CardHeader>
                   <CardTitle className="text-sm font-bold">Resultados da Varredura</CardTitle>
                 </CardHeader>
                 <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10">#</TableHead>
                          <TableHead>Método</TableHead>
                          <TableHead>Filtro/Tipo</TableHead>
                          <TableHead>Período</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Registros</TableHead>
                          <TableHead className="w-10"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sequenceResults.map((r: any) => (
                          <TableRow key={r.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setResult(r.raw)}>
                            <TableCell className="text-xs font-mono">{r.id}</TableCell>
                            <TableCell><Badge variant="outline">{r.method}</Badge></TableCell>
                            <TableCell className="text-xs font-medium">{r.label} ({r.tipo_transacao})</TableCell>
                            <TableCell className="text-[10px] text-muted-foreground">{r.periodo}</TableCell>
                            <TableCell>
                               {r.success ? <Check className="w-4 h-4 text-emerald-500" /> : <X className="w-4 h-4 text-destructive" />}
                               <span className="ml-1 text-[10px]">{r.status}</span>
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs">{r.total}</TableCell>
                            <TableCell><Play className="w-3 h-3 text-muted-foreground" /></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                 </CardContent>
               </Card>
             )}

             {result && (
                <div className="grid grid-cols-1 gap-6">
                  {(() => {
                     // Caso seja a amostra (array)
                     if (Array.isArray(result)) {
                       return (
                         <div className="space-y-4">
                           <h3 className="text-sm font-bold uppercase text-muted-foreground">Amostra da Janela (2 Primeiras Contas)</h3>
                           {result.map((item, idx) => (
                             <Card key={idx} className="border-indigo-200 bg-indigo-50/10">
                               <CardHeader className="py-2">
                                 <CardTitle className="text-[10px] font-bold">Conta ID: {item.invoice_id}</CardTitle>
                               </CardHeader>
                               <CardContent className="grid grid-cols-3 gap-2 py-2">
                                 <pre className="text-[8px] bg-white p-2 border rounded overflow-auto max-h-[150px]">
                                   {JSON.stringify(item.detalhes, null, 2)}
                                 </pre>
                                 <pre className="text-[8px] bg-white p-2 border rounded overflow-auto max-h-[150px]">
                                   {JSON.stringify(item.itens, null, 2)}
                                 </pre>
                                 <pre className="text-[8px] bg-white p-2 border rounded overflow-auto max-h-[150px]">
                                   {JSON.stringify(item.pagamentos, null, 2)}
                                 </pre>
                               </CardContent>
                             </Card>
                           ))}
                           <Button variant="outline" size="sm" onClick={() => setResult(null)}>Fechar Amostra</Button>
                         </div>
                       );
                     }

                     const firstItem = result.raw?.content?.list?.[0] || result.raw?.content?.[0];
                    if (!firstItem) return null;
                    return (
                      <Card className="border-emerald-200 bg-emerald-50/20">
                        <CardHeader className="py-3">
                          <CardTitle className="text-xs font-bold text-emerald-700 flex items-center gap-2">
                             💎 PRIMEIRA CONTA DETALHADA (content[0])
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
                           <div className="space-y-2">
                              <h4 className="text-[10px] font-bold uppercase text-emerald-600">Detalhes ({firstItem.detalhes?.length || 0})</h4>
                              <pre className="text-[9px] bg-white p-2 border rounded max-h-[200px] overflow-auto">
                                {JSON.stringify(firstItem.detalhes, null, 2)}
                              </pre>
                           </div>
                           <div className="space-y-2">
                              <h4 className="text-[10px] font-bold uppercase text-emerald-600">Pagamentos ({firstItem.pagamentos?.length || 0})</h4>
                              <pre className="text-[9px] bg-white p-2 border rounded max-h-[200px] overflow-auto">
                                {JSON.stringify(firstItem.pagamentos, null, 2)}
                              </pre>
                           </div>
                           <div className="space-y-2">
                              <h4 className="text-[10px] font-bold uppercase text-emerald-600">Itens ({firstItem.itens?.length || 0})</h4>
                              <pre className="text-[9px] bg-white p-2 border rounded max-h-[200px] overflow-auto">
                                {JSON.stringify(firstItem.itens, null, 2)}
                              </pre>
                           </div>
                        </CardContent>
                      </Card>
                    );
                 })()}

                 <Card>
                   <CardHeader className="flex flex-row items-center justify-between pb-2">
                     <CardTitle className="text-sm font-bold">Corpo Cru da Resposta</CardTitle>
                     <div className="flex items-center gap-3">
                        <div className="flex gap-4 text-[10px] font-mono">
                           <span className={result.http_status === 200 ? 'text-emerald-600' : 'text-destructive'}>Status: {result.http_status}</span>
                           <span className={result.api_success ? 'text-emerald-600' : 'text-destructive'}>Success: {result.api_success ? 'TRUE' : 'FALSE'}</span>
                           <span className="text-slate-500">Total: {result.total_registros}</span>
                        </div>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="h-7 text-xs" 
                          onClick={() => {
                            navigator.clipboard.writeText(JSON.stringify(result.raw, null, 2));
                            toast.success("JSON copiado!");
                          }}
                        >
                          Copiar JSON
                        </Button>
                     </div>
                   </CardHeader>
                   <CardContent>
                     <pre className="p-4 bg-slate-900 text-slate-100 rounded-md overflow-auto max-h-[600px] text-xs font-mono">
                       {JSON.stringify(result.raw, null, 2)}
                     </pre>
                   </CardContent>
                 </Card>
               </div>
             )}
            {tab === "diagnostico" && (
              <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs">
                  <h4 className="font-bold mb-1 flex items-center"><AlertCircle className="w-3 h-3 mr-1" /> Nota sobre Categoria</h4>
                  categoria_id e centro_custo_id vêm zerados do Feegow. Categorização baseada em grupo de procedimento via lab_dim_procedimento.
                </div>
                <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-lg text-indigo-800 text-xs">
                  <h4 className="font-bold mb-1 flex items-center"><AlertCircle className="w-3 h-3 mr-1" /> Nota sobre Desconto</h4>
                  Campo 'desconto' representa diferença do preço de tabela, não desconto comercial. Interpretar com cuidado.
                </div>
              </div>
            )}
            </div>
          )}
       </div>
    </div>
  );
}
