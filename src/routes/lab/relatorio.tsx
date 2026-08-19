import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useState, useMemo } from "react";
import { FileText, Search, Filter, ArrowUpDown, Download, RefreshCw, Play, Settings, Calendar, ChevronDown, ChevronRight, Info, Database, BarChart3, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePickerWithRange } from "@/components/ui/date-picker-with-range";
import { labSyncParticular, labSyncProducao } from "@/lib/lab-faturamento.functions";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/lab/relatorio")({
  component: LabRelatorio,
});

function LabRelatorio() {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [dateRange, setDateRange] = useState<{ start: Date; end: Date }>({ 
    start: new Date(new Date().setDate(new Date().getDate() - 7)),
    end: new Date()
  });
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [showSyncPanel, setShowSyncPanel] = useState(false);
  const [syncWindowSize, setSyncWindowSize] = useState(1);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const queryClient = useQueryClient();

  const syncMutation = useMutation({
    mutationFn: async ({ start, end }: { start: string, end: string }) => {
      return labSyncParticular({ 
        data: { 
          data_inicio: start, 
          data_fim: end, 
          tipo_transacao: 'C',
          dry_run: false,
          limpar_antes: false,
          tamanho_janela: syncWindowSize
        } 
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lab-relatorio-comparativo'] });
      toast.success("Sincronização concluída!");
    },
    onError: (e) => toast.error("Erro na sincronização: " + String(e))
  });

  const runSync = async () => {
    setIsSyncing(true);
    setSyncProgress(10);
    
    const startStr = dateRange.start.toISOString().split('T')[0];
    const endStr = dateRange.end.toISOString().split('T')[0];

    try {
      await syncMutation.mutateAsync({ start: startStr, end: endStr });
      setSyncProgress(100);
    } finally {
      setTimeout(() => {
        setIsSyncing(false);
        setSyncProgress(0);
      }, 1000);
    }
  };
  
  const syncYesterday = async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    setDateRange({ start: yesterday, end: yesterday });
    setSyncWindowSize(1);
    setIsSyncing(true);
    setSyncProgress(10);
    
    const dateStr = yesterday.toISOString().split('T')[0];

    try {
      await syncMutation.mutateAsync({ start: dateStr, end: dateStr });
      setSyncProgress(100);
    } finally {
      setTimeout(() => {
        setIsSyncing(false);
        setSyncProgress(0);
      }, 1000);
    }
  };


  const { data: reportData, isLoading } = useQuery({
    queryKey: ['lab-relatorio-comparativo', dateRange.start.toISOString(), dateRange.end.toISOString()],
    queryFn: async () => {
      // Buscamos dados do lab_faturamento enriquecidos
      const { data, error } = await supabase
        .from('lab_faturamento')
        .select(`
          *,
          paciente:pacientes!paciente_id(nome),
          procedimento:lab_dim_procedimento(nome),
          profissional:profissionais!profissional_id(nome),
          convenio:convenios!convenio_id(nome)
        `)
        .gte("data_competencia", dateRange.start.toISOString().split('T')[0])
        .lte("data_competencia", dateRange.end.toISOString().split('T')[0])
        .order('data_competencia', { ascending: false })
        .limit(1000);

      if (error) {
        console.error("Erro ao buscar relatório:", error);
        throw error;
      }
      return data || [];
    }
  });

  const filteredData = useMemo(() => {
    if (!reportData) return [];
    let filtered = reportData.filter((item: any) => {
      const searchStr = `${item.paciente?.nome || ''} ${item.procedimento?.nome || ''} ${item.documento_id} ${item.grupo_nome || ''}`.toLowerCase();
      return searchStr.includes(searchTerm.toLowerCase());
    });

    if (sortConfig) {
      filtered.sort((a: any, b: any) => {
        const aValue = a[sortConfig.key];
        const bValue = b[sortConfig.key];
        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return filtered;
  }, [reportData, searchTerm, sortConfig]);

  const handleSort = (key: string) => {
    setSortConfig(prev => ({
      key,
      direction: prev?.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const exportCSV = () => {
    if (!filteredData.length) return;
    const headers = ["Data", "Documento", "Paciente", "Procedimento", "Origem", "Grupo", "Bruto", "Desconto", "Líquido", "Status"];
    const rows = filteredData.map((item: any) => [
      item.data_competencia || '-',
      item.documento_id,
      item.paciente?.nome || 'N/A',
      item.procedimento?.nome || 'N/A',
      item.origem,
      item.grupo_nome || 'N/A',
      item.valor_bruto,
      item.desconto,
      item.valor_faturado,
      item.is_cancelado ? 'Cancelado' : 'Ativo'
    ]);

    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `relatorio_lab_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <FileText className="w-8 h-8 text-indigo-600" />
            Relatório de Auditoria Lab
          </h1>
          <p className="text-muted-foreground">Comparativo detalhado de consultas e atendimentos sincronizados.</p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant={showSyncPanel ? "secondary" : "outline"} 
            onClick={() => setShowSyncPanel(!showSyncPanel)}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Sincronizando...' : 'Sincronizar Dados'}
          </Button>
          <Button variant="outline" onClick={exportCSV} disabled={filteredData.length === 0 || isSyncing}>
            <Download className="w-4 h-4 mr-2" /> Exportar CSV
          </Button>
          <Link to="/lab/faturamento">
            <Button variant="ghost">Voltar ao Lab</Button>
          </Link>
        </div>
      </div>

      {showSyncPanel && (
        <Card className="border-indigo-200 bg-indigo-50/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Settings className="w-4 h-4" /> Configurar Sincronização
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase text-muted-foreground">Período</label>
                <DatePickerWithRange 
                  from={dateRange.start} 
                  to={dateRange.end} 
                  onRangeChange={(from, to) => setDateRange({ start: from, end: to })} 
                />
              </div>
              <div className="flex gap-2">
                <div className="space-y-2 border-r pr-4">
                  <label className="text-[10px] font-bold uppercase text-amber-600 block">Auditoria Financeira</label>
                  <div className="flex gap-2">
                    <Button 
                      className="bg-amber-600 hover:bg-amber-700 h-9" 
                      onClick={() => runSync('faturamento')}
                      disabled={isSyncing}
                    >
                      <Play className="w-4 h-4 mr-2" />
                      Sync Faturamento
                    </Button>
                    <Button 
                      variant="outline"
                      className="border-amber-600 text-amber-600 hover:bg-amber-50 h-9" 
                      onClick={() => syncYesterday('faturamento')}
                      disabled={isSyncing}
                    >
                      Ontem
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase text-indigo-600 block">Produção (Execução)</label>
                  <div className="flex gap-2">
                    <Button 
                      className="bg-indigo-600 hover:bg-indigo-700 h-9" 
                      onClick={() => runSync('producao')}
                      disabled={isSyncing}
                    >
                      <BarChart3 className="w-4 h-4 mr-2" />
                      Sync Produção
                    </Button>
                    <Button 
                      variant="outline"
                      className="border-indigo-600 text-indigo-600 hover:bg-indigo-50 h-9" 
                      onClick={() => syncYesterday('producao')}
                      disabled={isSyncing}
                    >
                      Ontem
                    </Button>
                  </div>
                </div>
              </div>
            </div>
            {isSyncing && (
              <div className="space-y-2">
                <div className="flex justify-between text-[10px] font-bold uppercase">
                  <span>Processando dados do Feegow...</span>
                  <span>{syncProgress}%</span>
                </div>
                <Progress value={syncProgress} className="h-1" />
              </div>
            )}
            {syncMutation.data && (resumo => (
              <div className="mt-2 p-2 bg-slate-100 rounded text-[10px] font-mono whitespace-pre-wrap max-h-40 overflow-y-auto">
                {(syncMutation.data as any).logs?.join('\n')}
              </div>
            ))(syncMutation.data)}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="faturamento" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 max-w-[400px]">
          <TabsTrigger value="faturamento" className="flex items-center gap-2">
            <Database className="w-4 h-4" /> Financeiro (list-invoice)
          </TabsTrigger>
          <TabsTrigger value="producao" className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4" /> Produção (reports)
          </TabsTrigger>
        </TabsList>

        <TabsContent value="faturamento">


      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por paciente, documento ou procedimento..."
                className="pl-8"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Filter className="w-4 h-4" />
              <span>{filteredData.length} registros encontrados</span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-[40px]"></TableHead>
                  <TableHead className="cursor-pointer hover:text-primary" onClick={() => handleSort('data_competencia')}>
                    Data <ArrowUpDown className="inline w-3 h-3 ml-1" />
                  </TableHead>
                  <TableHead>Doc/ID</TableHead>
                  <TableHead className="cursor-pointer hover:text-primary" onClick={() => handleSort('paciente_id')}>
                    Paciente <ArrowUpDown className="inline w-3 h-3 ml-1" />
                  </TableHead>
                  <TableHead>Procedimento</TableHead>
                  <TableHead className="text-right">Bruto</TableHead>
                  <TableHead className="text-right">Desc/Acr</TableHead>
                  <TableHead className="text-right">Líquido</TableHead>
                  <TableHead className="text-center">Origem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-32 text-center">Carregando dados da auditoria...</TableCell>
                  </TableRow>
                ) : filteredData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-32 text-center text-muted-foreground flex flex-col items-center justify-center gap-4">
                      <span>Nenhum registro encontrado para comparação no período selecionado.</span>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => setShowSyncPanel(true)}>
                          <RefreshCw className="w-3 h-3 mr-2" />
                          Tentar Sincronizar Agora
                        </Button>
                        <Link to="/lab/faturamento">
                          <Button variant="ghost" size="sm">
                            Ver Logs de Sync
                          </Button>
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredData.map((item: any) => (
                    <>
                      <TableRow 
                        key={item.id} 
                        className={`${item.is_cancelado ? "opacity-50 bg-slate-50" : ""} cursor-pointer hover:bg-muted/30 transition-colors`}
                        onClick={() => setExpandedRow(expandedRow === item.id ? null : item.id)}
                      >
                        <TableCell>
                          {expandedRow === item.id ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                        </TableCell>
                        <TableCell className="text-xs font-mono">
                          {item.data_competencia ? new Date(item.data_competencia).toLocaleDateString('pt-BR') : '-'}
                        </TableCell>
                        <TableCell className="text-xs">
                          <span className="font-bold">{item.documento_id}</span>
                          {item.item_id && <span className="text-[10px] text-muted-foreground block">Item: {item.item_id}</span>}
                        </TableCell>
                        <TableCell className="text-sm font-medium">
                          {item.paciente?.nome || item.paciente_nome || `ID: ${item.paciente_id}`}
                        </TableCell>
                        <TableCell className="text-xs max-w-[200px] truncate" title={item.procedimento?.nome}>
                          {item.procedimento?.nome || item.procedimento_nome || 'N/A'}
                          <Badge variant="outline" className="text-[8px] uppercase block w-fit mt-1">{item.grupo_nome || 'Outros'}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs text-muted-foreground">
                          R$ {Number(item.valor_bruto || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs text-amber-600">
                          {item.desconto > 0 && <span>- R$ {Number(item.desconto).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>}
                          {item.acrescimo > 0 && <span className="block text-emerald-600">+ R$ {Number(item.acrescimo).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>}
                          {item.desconto === 0 && item.acrescimo === 0 && <span>—</span>}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm font-bold">
                          R$ {Number(item.valor_faturado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={item.origem === 'particular' ? 'secondary' : 'default'} className="text-[9px] uppercase">
                            {item.origem}
                          </Badge>
                        </TableCell>
                      </TableRow>
                      {expandedRow === item.id && (
                        <TableRow className="bg-slate-50 border-x-2 border-indigo-200">
                          <TableCell colSpan={9} className="p-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <div className="space-y-3">
                                <h4 className="text-xs font-bold uppercase text-indigo-900 flex items-center gap-2">
                                  <Info className="w-3 h-3" /> Detalhes da Operação
                                </h4>
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                  <div className="p-2 bg-white rounded border">
                                    <span className="text-muted-foreground block text-[10px]">Profissional</span>
                                    <span className="font-medium">{item.profissional?.nome || 'N/A'}</span>
                                  </div>
                                  <div className="p-2 bg-white rounded border">
                                    <span className="text-muted-foreground block text-[10px]">Unidade</span>
                                    <span className="font-medium">ID: {item.unidade_id}</span>
                                  </div>
                                  <div className="p-2 bg-white rounded border">
                                    <span className="text-muted-foreground block text-[10px]">Data Atendimento</span>
                                    <span className="font-medium">{item.data_atendimento ? new Date(item.data_atendimento).toLocaleDateString('pt-BR') : 'N/A'}</span>
                                  </div>
                                  <div className="p-2 bg-white rounded border">
                                    <span className="text-muted-foreground block text-[10px]">Convênio</span>
                                    <span className="font-medium">{item.convenio?.nome || 'Particular'}</span>
                                  </div>
                                </div>
                              </div>
                              <div className="space-y-3">
                                <h4 className="text-xs font-bold uppercase text-indigo-900 flex items-center gap-2">
                                  <Database className="w-3 h-3" /> Dados Brutos (API Feegow)
                                </h4>
                                <div className="bg-slate-900 text-slate-100 p-3 rounded-md text-[10px] font-mono overflow-auto max-h-[200px]">
                                  <pre>{JSON.stringify(item.payload_raw, null, 2)}</pre>
                                </div>
                                <p className="text-[9px] text-muted-foreground italic">
                                  Estes dados foram capturados diretamente do endpoint <code>financial/list-invoice</code> para conferência profunda.
                                </p>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      
      <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg flex items-start gap-3">
        <Filter className="w-5 h-5 text-amber-600 mt-0.5" />
        <div className="text-xs text-amber-900 space-y-1">
          <p className="font-bold uppercase">Nota de Auditoria:</p>
          <p>Este relatório utiliza exclusivamente dados da tabela <code>lab_faturamento</code>, que é populada durante a sincronização no Lab. Se os números não baterem com o Feegow, verifique se a janela de sincronização foi executada para o período desejado e se o modo <b>Dry-run</b> estava desativado.</p>
        </div>
      </div>
        </TabsContent>

        <TabsContent value="producao">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-4">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar na produção..."
                    className="pl-8"
                  />
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <BarChart3 className="w-4 h-4" />
                  <span>{producaoData?.length || 0} execuções encontradas</span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Data Exec.</TableHead>
                      <TableHead>Hora</TableHead>
                      <TableHead>Paciente</TableHead>
                      <TableHead>Profissional</TableHead>
                      <TableHead>Procedimento</TableHead>
                      <TableHead>Convênio</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoadingProd ? (
                      <TableRow>
                        <TableCell colSpan={7} className="h-32 text-center">Carregando produção...</TableCell>
                      </TableRow>
                    ) : producaoData?.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                          Nenhum dado de produção para o período.
                        </TableCell>
                      </TableRow>
                    ) : (
                      producaoData?.map((item: any) => (
                        <TableRow key={item.id}>
                          <TableCell className="text-xs font-mono">
                            {item.data_execucao ? new Date(item.data_execucao).toLocaleDateString('pt-BR') : '-'}
                          </TableCell>
                          <TableCell className="text-xs">{item.hora_inicio}</TableCell>
                          <TableCell className="text-sm font-medium">{item.paciente_nome}</TableCell>
                          <TableCell className="text-xs">{item.profissional_nome}</TableCell>
                          <TableCell className="text-xs">{item.procedimento_nome}</TableCell>
                          <TableCell className="text-[10px] uppercase">{item.convenio_nome}</TableCell>
                          <TableCell className="text-right font-mono font-bold">
                            R$ {Number(item.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
