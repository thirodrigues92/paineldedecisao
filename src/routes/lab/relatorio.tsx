import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useState, useMemo } from "react";
import { FileText, Search, Filter, ArrowUpDown, Download, RefreshCw, Play, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePickerWithRange } from "@/components/ui/date-picker-with-range";
import { labSyncParticular } from "@/lib/lab-faturamento.functions";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { useMutation, useQueryClient } from "@tanstack/react-query";

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
          tamanho_janela: 3
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


  const { data: reportData, isLoading } = useQuery({
    queryKey: ['lab-relatorio-comparativo'],
    queryFn: async () => {
      // Buscamos dados do lab_faturamento enriquecidos com nomes de pacientes e procedimentos
      // Nota: Como lab_faturamento armazena apenas IDs, fazemos joins com as dimensões do Lab
      const { data, error } = await supabase
        .from('lab_faturamento')
        .select(`
          *,
          paciente:pacientes(nome),
          procedimento:lab_dim_procedimento(nome),
          profissional:profissionais(nome),
          convenio:convenios(nome)
        `)
        .order('data_competencia', { ascending: false });

      if (error) throw error;
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
          <Button variant="ghost" onClick={() => window.location.href = '/lab/faturamento'}>
            Voltar ao Lab
          </Button>
        </div>
      </div>

      {showSyncPanel && (
        <Card className="border-indigo-200 bg-indigo-50/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Settings className="w-4 h-4" /> Configurar Sincronização Rápida
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
              <Button 
                className="bg-indigo-600 hover:bg-indigo-700" 
                onClick={runSync}
                disabled={isSyncing}
              >
                {isSyncing ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                Iniciar Sincronização
              </Button>
              <div className="text-[10px] text-muted-foreground max-w-xs">
                A sincronização trará lançamentos do tipo <b>Receita (C)</b> para o período selecionado. 
                Para configurações avançadas (dry-run, despesas), use a aba principal do Lab.
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
          </CardContent>
        </Card>
      )}


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
                  <TableHead className="cursor-pointer hover:text-primary" onClick={() => handleSort('data_competencia')}>
                    Data <ArrowUpDown className="inline w-3 h-3 ml-1" />
                  </TableHead>
                  <TableHead>Doc/ID</TableHead>
                  <TableHead className="cursor-pointer hover:text-primary" onClick={() => handleSort('paciente_id')}>
                    Paciente <ArrowUpDown className="inline w-3 h-3 ml-1" />
                  </TableHead>
                  <TableHead>Procedimento</TableHead>
                  <TableHead>Grupo</TableHead>
                  <TableHead className="text-right">Faturado</TableHead>
                  <TableHead className="text-center">Origem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center">Carregando dados da auditoria...</TableCell>
                  </TableRow>
                ) : filteredData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">Nenhum registro encontrado para comparação.</TableCell>
                  </TableRow>
                ) : (
                  filteredData.map((item: any) => (
                    <TableRow key={item.id} className={item.is_cancelado ? "opacity-50 bg-slate-50" : ""}>
                      <TableCell className="text-xs font-mono">
                        {item.data_competencia ? new Date(item.data_competencia).toLocaleDateString('pt-BR') : '-'}
                      </TableCell>
                      <TableCell className="text-xs">
                        <span className="font-bold">{item.documento_id}</span>
                        {item.item_id && <span className="text-[10px] text-muted-foreground block">Item: {item.item_id}</span>}
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        {item.paciente?.nome || `ID: ${item.paciente_id}`}
                      </TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate" title={item.procedimento?.nome}>
                        {item.procedimento?.nome || 'N/A'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[9px] uppercase">{item.grupo_nome || 'Outros'}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        R$ {Number(item.valor_faturado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={item.origem === 'particular' ? 'secondary' : 'default'} className="text-[9px] uppercase">
                          {item.origem}
                        </Badge>
                      </TableCell>
                    </TableRow>
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
    </div>
  );
}
