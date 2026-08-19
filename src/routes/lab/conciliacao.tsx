import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useState, useMemo } from "react";
import { 
  FileText, Search, Filter, ArrowUpDown, Download, 
  ChevronRight, Database, AlertCircle, CheckCircle2, 
  ArrowRight, Info, RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePickerWithRange } from "@/components/ui/date-picker-with-range";
import { getLabConciliacao, getLabFaturamentoItems, labSyncParticular } from "@/lib/lab-faturamento.functions";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { brl } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/lab/conciliacao")({
  component: LabConciliacao,
});

function LabConciliacao() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [selectedAgendamento, setSelectedAgendamento] = useState<number | null>(null);
  const [dateRange, setDateRange] = useState<{ start: Date; end: Date }>({ 
    start: new Date(new Date().setDate(new Date().getDate() - 7)),
    end: new Date()
  });

  const startStr = dateRange.start.toISOString().split('T')[0];
  const endStr = dateRange.end.toISOString().split('T')[0];

  const { data: conciliacaoData, isLoading, refetch } = useQuery({
    queryKey: ['lab-conciliacao', startStr, endStr],
    queryFn: () => getLabConciliacao({ data: { data_inicio: startStr, data_fim: endStr } })
  });

  const [isSyncing, setIsSyncing] = useState(false);

  const handleSync = async () => {
    setIsSyncing(true);
    toast.info("Iniciando sincronização do período...");
    try {
      // Sincroniza Convênios (Transação C)
      await labSyncParticular({ 
        data: { 
          data_inicio: startStr, 
          data_fim: endStr, 
          tipo_transacao: 'C',
          tamanho_janela: 1 // Sincroniza dia a dia para maior precisão
        } 
      });
      
      toast.success("Sincronização concluída com sucesso!");
      refetch();
    } catch (error) {
      console.error("Erro no sync:", error);
      toast.error("Falha ao sincronizar dados do Feegow.");
    } finally {
      setIsSyncing(false);
    }
  };

  const { data: detailsData, isLoading: isLoadingDetails } = useQuery({
    queryKey: ['lab-conciliacao-details', selectedAgendamento],
    queryFn: () => selectedAgendamento ? getLabFaturamentoItems({ data: { agendamento_id: selectedAgendamento } }) : Promise.resolve([]),
    enabled: !!selectedAgendamento
  });

  const filteredData = useMemo(() => {
    if (!conciliacaoData) return [];
    return conciliacaoData.filter((item: any) => {
      const searchMatch = `${item.paciente} ${item.procedimento} ${item.profissional} ${item.prontuario}`.toLowerCase().includes(searchTerm.toLowerCase());
      const statusMatch = statusFilter === "ALL" || item.status === statusFilter;
      return searchMatch && statusMatch;
    }).sort((a: any, b: any) => Math.abs(b.diferenca) - Math.abs(a.diferenca));
  }, [conciliacaoData, searchTerm, statusFilter]);

  const stats = useMemo(() => {
    if (!conciliacaoData) return { total: 0, semFatura: 0, divergente: 0 };
    return {
      total: conciliacaoData.length,
      semFatura: conciliacaoData.filter((i: any) => i.status === "SEM_FATURA").length,
      divergente: conciliacaoData.filter((i: any) => i.status === "DIVERGENTE").length,
    };
  }, [conciliacaoData]);

  const exportCSV = () => {
    if (!filteredData.length) return;
    const headers = ["Data", "Prontuário", "Paciente", "Profissional", "Procedimento", "Valor Tabela", "Valor Faturado", "Diferenca", "Status"];
    const rows = filteredData.map((item: any) => [
      item.data,
      item.prontuario,
      item.paciente,
      item.profissional,
      item.procedimento,
      item.valor_tabela,
      item.valor_faturado,
      item.diferenca,
      item.status
    ]);

    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `conciliacao_lab_${startStr}_${endStr}.csv`;
    link.click();
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Database className="w-8 h-8 text-indigo-600" />
            Conciliação Agenda x Financeiro
          </h1>
          <p className="text-muted-foreground">Comparativo entre valores previstos na agenda e faturados no financeiro.</p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="default" 
            className="bg-indigo-600 hover:bg-indigo-700" 
            onClick={handleSync}
            disabled={isSyncing || isLoading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? "Sincronizando..." : "Sincronizar Período"}
          </Button>
          <Button variant="outline" onClick={exportCSV} disabled={filteredData.length === 0}>
            <Download className="w-4 h-4 mr-2" /> Exportar CSV
          </Button>
          <Link to="/lab/relatorio">
            <Button variant="ghost">Relatórios Lab</Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-white border-indigo-100 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase text-muted-foreground">Total Agendamentos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{isLoading ? "..." : stats.total}</div>
          </CardContent>
        </Card>
        <Card className="bg-red-50 border-red-100 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase text-red-600">Sem Faturamento (Crítico)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-700">{isLoading ? "..." : stats.semFatura}</div>
          </CardContent>
        </Card>
        <Card className="bg-amber-50 border-amber-100 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase text-amber-600">Divergência de Valores</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-700">{isLoading ? "..." : stats.divergente}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3 border-b">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase text-muted-foreground">Período da Agenda</label>
              <DatePickerWithRange 
                from={dateRange.start} 
                to={dateRange.end} 
                onRangeChange={(from, to) => setDateRange({ start: from, end: to })} 
              />
            </div>
            <div className="space-y-2 flex-1 max-w-xs">
              <label className="text-[10px] font-bold uppercase text-muted-foreground">Busca Rápida</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Paciente ou procedimento..."
                  className="pl-8"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase text-muted-foreground">Filtrar Status</label>
              <div className="flex gap-1">
                {(["ALL", "SEM_FATURA", "DIVERGENTE", "IGUAL"] as const).map(s => (
                  <Button 
                    key={s}
                    variant={statusFilter === s ? "default" : "outline"} 
                    size="sm" 
                    className="h-9 text-[10px] uppercase font-bold"
                    onClick={() => setStatusFilter(s)}
                  >
                    {s.replace("_", " ")}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead>Data</TableHead>
                <TableHead>Prontuário</TableHead>
                <TableHead>Paciente</TableHead>
                <TableHead>Profissional</TableHead>
                <TableHead>Procedimento</TableHead>
                <TableHead className="text-right">Tabela (Agenda)</TableHead>
                <TableHead className="text-right">Real (Financeiro)</TableHead>
                <TableHead className="text-right">Diferença</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-32 text-center">Calculando conciliação...</TableCell>
                </TableRow>
              ) : filteredData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">Nenhum registro encontrado para os filtros.</TableCell>
                </TableRow>
              ) : (
                filteredData.map((item: any) => (
                  <TableRow 
                    key={item.agendamento_id}
                    className={`
                      cursor-pointer transition-colors
                      ${item.status === 'SEM_FATURA' ? 'bg-red-50/50 hover:bg-red-100/50' : ''}
                      ${item.status === 'DIVERGENTE' ? 'bg-amber-50/50 hover:bg-amber-100/50' : 'hover:bg-muted/30'}
                    `}
                    onClick={() => setSelectedAgendamento(item.agendamento_id)}
                  >
                    <TableCell className="text-xs font-mono">
                      {item.data ? new Date(item.data).toLocaleDateString('pt-BR') : '-'}
                    </TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">{item.prontuario}</TableCell>
                    <TableCell className="text-sm font-medium">{item.paciente}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{item.profissional}</TableCell>
                    <TableCell className="text-xs">{item.procedimento}</TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">
                      {brl(item.valor_tabela)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs font-bold">
                      {brl(item.valor_faturado)}
                    </TableCell>
                    <TableCell className={`text-right font-mono text-sm font-bold ${item.diferenca < 0 ? 'text-red-600' : item.diferenca > 0 ? 'text-emerald-600' : ''}`}>
                      {item.diferenca !== 0 ? brl(item.diferenca) : '—'}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge 
                        variant="outline" 
                        className={`
                          text-[9px] uppercase font-bold
                          ${item.status === 'SEM_FATURA' ? 'bg-red-100 text-red-700 border-red-200' : ''}
                          ${item.status === 'DIVERGENTE' ? 'bg-amber-100 text-amber-700 border-amber-200' : ''}
                          ${item.status === 'IGUAL' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : ''}
                        `}
                      >
                        {item.status.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Sheet open={!!selectedAgendamento} onOpenChange={(open) => !open && setSelectedAgendamento(null)}>
        <SheetContent className="sm:max-w-xl overflow-y-auto">
          <SheetHeader className="pb-4 border-b">
            <SheetTitle className="flex items-center gap-2">
              <Info className="w-5 h-5 text-indigo-600" />
              Detalhes do Agendamento
            </SheetTitle>
            <SheetDescription>
              Auditando faturamentos vinculados ao ID {selectedAgendamento}
            </SheetDescription>
          </SheetHeader>
          
          <div className="py-6 space-y-6">
            {isLoadingDetails ? (
              <div className="flex justify-center p-8"><RefreshCw className="animate-spin text-muted-foreground" /></div>
            ) : detailsData && detailsData.length > 0 ? (
              <div className="space-y-4">
                <div className="bg-muted/30 p-4 rounded-lg border">
                  <h4 className="text-xs font-bold uppercase text-muted-foreground mb-3 flex items-center gap-2">
                    <Database className="w-3 h-3" /> Itens Faturados (Lab Financeiro)
                  </h4>
                  <div className="space-y-2">
                    {detailsData.map((d: any) => (
                      <div key={d.item_id} className="bg-white p-3 rounded border text-xs shadow-sm">
                        <div className="flex justify-between items-start mb-2">
                          <span className="font-bold text-indigo-600">ID: {d.item_id}</span>
                          <span className="font-mono font-bold text-base">{brl(d.valor_faturado)}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
                          <div><span className="text-muted-foreground">Procedimento:</span> {d.procedimento_nome}</div>
                          <div><span className="text-muted-foreground">Data Comp.:</span> {d.data_competencia}</div>
                          <div><span className="text-muted-foreground">Transação:</span> {d.tipo_transacao}</div>
                          <div><span className="text-muted-foreground">Cancelado:</span> {d.is_cancelado ? 'Sim' : 'Não'}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                
                <div className="flex items-center justify-between p-4 bg-indigo-900 text-white rounded-lg shadow-lg">
                  <div className="text-xs font-bold uppercase opacity-80">Soma Total Faturada</div>
                  <div className="text-2xl font-bold">
                    {brl(detailsData.reduce((acc: number, cur: any) => acc + Number(cur.valor_faturado), 0))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-12 text-center space-y-3 bg-red-50 rounded-lg border border-red-100">
                <AlertCircle className="w-12 h-12 text-red-500" />
                <h3 className="font-bold text-red-900">Nenhum faturamento encontrado</h3>
                <p className="text-xs text-red-700">Este agendamento consta na agenda do Feegow, mas não existe nenhum registro correspondente na tabela <code>lab_faturamento</code>.</p>
              </div>
            )}

            <div className="p-4 rounded-lg bg-amber-50 border border-amber-100 space-y-2">
              <h4 className="text-[10px] font-bold uppercase text-amber-800">Dica de Auditoria</h4>
              <p className="text-[10px] text-amber-900 leading-relaxed italic">
                A conciliação depende do campo <code>agendamento_id</code> estar presente nos itens de faturamento. 
                Se você sabe que este item foi faturado mas ele não aparece aqui, verifique no Feegow se o lançamento financeiro está corretamente vinculado ao agendamento.
              </p>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

