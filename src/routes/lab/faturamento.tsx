import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { labDebugFeegow, labSyncParticular, labSyncConvenio, clearLabData } from "@/lib/lab-faturamento.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2, RefreshCw, Trash2, Search, BarChart3, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/lab/faturamento")({
  component: LabFaturamento,
});

function LabFaturamento() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
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

  const testEndpoint = async (endpoint: string) => {
    setLoading(true);
    try {
      const res = await labDebugFeegow({ data: { endpoint, params: {} } });
      setResult({ endpoint, ...res });
    } finally {
      setLoading(false);
    }
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

      <Tabs defaultValue="faturamento" className="space-y-4">
        <TabsList>
          <TabsTrigger value="faturamento"><BarChart3 className="w-4 h-4 mr-2" /> Faturado x Recebido</TabsTrigger>
          <TabsTrigger value="sincronizacao"><RefreshCw className="w-4 h-4 mr-2" /> Sincronização</TabsTrigger>
          <TabsTrigger value="auditoria"><ShieldCheck className="w-4 h-4 mr-2" /> Auditoria</TabsTrigger>
          <TabsTrigger value="diagnostico"><Search className="w-4 h-4 mr-2" /> Debug API</TabsTrigger>
        </TabsList>

        <TabsContent value="faturamento">
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
        </TabsContent>

        <TabsContent value="sincronizacao" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Controle de Sincronização</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-4 items-end bg-muted/50 p-4 rounded-lg">
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
                          {l.api_success ? <Badge className="bg-emerald-500">Sucesso</Badge> : <Badge variant="destructive">Erro</Badge>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="auditoria">
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
        </TabsContent>

        <TabsContent value="diagnostico" className="space-y-4">
          <Card>
             <CardHeader>
               <CardTitle>Explorador de Endpoints Feegow</CardTitle>
             </CardHeader>
             <CardContent className="space-y-4">
                <div className="flex gap-2 flex-wrap">
                  {["financial/list-accounts", "billing/insurances-billing", "insurance/list"].map(ep => (
                    <Button key={ep} size="sm" variant="outline" onClick={() => testEndpoint(ep)} disabled={loading}>
                      JSON Bruto: {ep}
                    </Button>
                  ))}
                </div>
                {result && (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs font-mono bg-muted p-2 rounded">
                      <span>{result.endpoint}</span>
                      <span className={result.api_success ? "text-emerald-500" : "text-destructive"}>
                        Status: {result.http_status}
                      </span>
                    </div>
                    <pre className="bg-black text-emerald-400 p-4 rounded-lg overflow-auto text-[10px] max-h-[400px]">
                      {JSON.stringify(result.raw, null, 2)}
                    </pre>
                  </div>
                )}
             </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
