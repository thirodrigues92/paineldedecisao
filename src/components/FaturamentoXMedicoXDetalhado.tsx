import { useState, useMemo } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { brl, pct, num } from "@/lib/format";
import type { LabProducaoRow } from "@/lib/dashboard-data";
import { tooltipProps } from "@/lib/chart-theme";
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

interface FaturamentoXMedicoXDetalhadoProps {
  dados: LabProducaoRow[];
}

function formataDataCurta(isoDate: string | null) {
  if (!isoDate) return "--";
  const parts = isoDate.split("T")[0].split("-");
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}/${parts[0].slice(2)}`;
}

export function FaturamentoXMedicoXDetalhado({ dados }: FaturamentoXMedicoXDetalhadoProps) {
  const [layer, setLayer] = useState<1 | 2 | 3 | 4>(1);
  const [esp, setEsp] = useState<string | null>(null);
  const [med, setMed] = useState<string | null>(null);
  const [proc, setProc] = useState<string | null>(null);

  const resetToLayer = (l: 1 | 2 | 3 | 4) => {
    if (l === 1) {
      setEsp(null); setMed(null); setProc(null); setLayer(1);
    } else if (l === 2) {
      setMed(null); setProc(null); setLayer(2);
    } else if (l === 3) {
      setProc(null); setLayer(3);
    }
  };

  const { chartData, tableData, totalFaturado, currentLabel } = useMemo(() => {
    let filtered = dados;
    
    if (esp) filtered = filtered.filter(d => (d.grupo_nome || "Sem especialidade") === esp);
    if (med) filtered = filtered.filter(d => (d.profissional_nome || "Não informado") === med);
    if (proc) filtered = filtered.filter(d => (d.procedimento_nome || "Sem descrição") === proc);

    const map = new Map<string, { nome: string; valor: number; qtd: number }>();
    let total = 0;
    let tData: any[] = [];

    if (layer < 4) {
      for (const r of filtered) {
        const valor = Number(r.valor || 0);
        total += valor;
        let key = "";
        
        if (layer === 1) key = r.grupo_nome || "Sem especialidade";
        else if (layer === 2) key = r.profissional_nome || "Não informado";
        else if (layer === 3) key = r.procedimento_nome || "Sem descrição";

        const cur = map.get(key) ?? { nome: key, valor: 0, qtd: 0 };
        cur.valor += valor;
        cur.qtd += 1;
        map.set(key, cur);
      }
    } else {
      tData = filtered.map(r => ({
          id: r.id,
          data: r.data_execucao,
          paciente: r.paciente_nome || "Paciente não identificado",
          convenio: r.convenio_nome || "Particular",
          status: r.situacao || "Sem status",
          valor: Number(r.valor || 0)
      })).sort((a, b) => b.valor - a.valor);
      
      total = tData.reduce((s, r) => s + r.valor, 0);
    }

    const cData = Array.from(map.values())
      .filter(d => d.valor > 0)
      .sort((a, b) => b.valor - a.valor)
      .map(d => ({
        ...d,
        ticket: d.valor / (d.qtd || 1)
      }));

    let cLabel = "Faturamento por Especialidade";
    if (layer === 2) cLabel = `Faturamento por Médicos em ${esp}`;
    if (layer === 3) cLabel = `Faturamento por Procedimentos de ${med}`;
    if (layer === 4) cLabel = `Pacientes: ${proc}`;

    return { chartData: cData, tableData: tData, totalFaturado: total, currentLabel: cLabel };
  }, [dados, layer, esp, med, proc]);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload;
      return (
        <div className="rounded-lg border border-border bg-background p-3 shadow-md text-xs space-y-1.5 min-w-[220px]">
          <div className="font-bold border-b pb-1.5 mb-1.5 text-[13px]">{d.nome}</div>
          <div className="flex justify-between items-center gap-6">
            <span className="text-muted-foreground">Faturado:</span>
            <span className="font-semibold text-primary">{brl(d.valor)}</span>
          </div>
          <div className="flex justify-between items-center gap-6">
            <span className="text-muted-foreground">Volume (Qtd):</span>
            <span className="font-medium">{num(d.qtd)}</span>
          </div>
          <div className="flex justify-between items-center gap-6 mt-1 border-t pt-1.5">
            <span className="text-muted-foreground">Ticket Médio:</span>
            <span className="font-medium">{brl(d.ticket)}</span>
          </div>
        </div>
      );
    }
    return null;
  };

  const renderChart = () => {
    const chartHeight = Math.max(280, chartData.length * 45 + 60);
    
    return (
      <div style={{ height: chartHeight, width: "100%" }} className="mt-4 animate-in fade-in duration-500">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
            barSize={24}
            onClick={(e) => {
               if (e?.activePayload?.length) {
                   const nome = e.activePayload[0].payload.nome;
                   if (layer === 1) { setEsp(nome); setLayer(2); }
                   else if (layer === 2) { setMed(nome); setLayer(3); }
                   else if (layer === 3) { setProc(nome); setLayer(4); }
               }
            }}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={false} vertical={true} opacity={0.3} />
            <XAxis type="number" hide />
            <YAxis
              dataKey="nome"
              type="category"
              width={160}
              fontSize={11}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              {...tooltipProps}
              cursor={{ fill: 'var(--muted)', opacity: 0.15 }}
              content={<CustomTooltip />}
            />
            <Bar
              dataKey="valor"
              fill={`var(--chart-${layer})`}
              radius={[0, 4, 4, 0]}
              className="cursor-pointer hover:opacity-85 transition-opacity"
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  };

  const renderTable = () => (
    <div className="rounded-md border bg-card mt-4 animate-in fade-in slide-in-from-right-4 duration-300 w-full">
      <ScrollArea className="h-[400px]">
        <Table>
          <TableHeader className="bg-muted/50 sticky top-0 backdrop-blur-sm z-10">
            <TableRow>
              <TableHead className="w-[80px]">Data</TableHead>
              <TableHead>Paciente</TableHead>
              <TableHead>Convênio</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Valor</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tableData.length === 0 ? (
                <TableRow>
                    <TableCell colSpan={5} className="text-center h-32 text-muted-foreground">
                        Nenhum atendimento associado a este filtro.
                    </TableCell>
                </TableRow>
            ) : (
                tableData.map((p, idx) => (
                  <TableRow key={`${p.id}-${idx}`} className="hover:bg-muted/30">
                    <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                      {formataDataCurta(p.data)}
                    </TableCell>
                    <TableCell className="font-medium text-xs">{p.paciente}</TableCell>
                    <TableCell>
                        <Badge variant="outline" className="text-[10px] bg-background whitespace-nowrap">
                            {p.convenio}
                        </Badge>
                    </TableCell>
                    <TableCell>
                        <Badge variant="secondary" className="text-[10px] bg-muted whitespace-nowrap">
                            {p.status}
                        </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium text-xs">
                        {brl(p.valor)}
                    </TableCell>
                  </TableRow>
                ))
            )}
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
  );

  if (chartData.length === 0 && layer === 1) {
    return (
      <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Nenhum dado financeiro encontrado no período.
          </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader className="pb-4">
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
            <div>
                <CardTitle className="text-lg font-bold">{currentLabel}</CardTitle>
                <CardDescription>Detalhamento em 4 camadas. Clique nas barras para aprofundar.</CardDescription>
            </div>
            <div className="text-right">
                <p className="text-xs text-muted-foreground">Total Faturado no Nível</p>
                <p className="text-xl font-semibold text-primary">{brl(totalFaturado)}</p>
            </div>
        </div>
        
        <div className="flex flex-col gap-4 bg-muted/20 p-3.5 rounded-lg border border-border/60 mt-4">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                {layer > 1 ? (
                  <BreadcrumbLink
                      href="#"
                      onClick={(e) => { e.preventDefault(); resetToLayer(1); }}
                      className="font-medium hover:text-primary transition-colors text-sm"
                  >
                    Geral
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbPage className="font-semibold text-primary text-sm">
                    Geral (Especialidades)
                  </BreadcrumbPage>
                )}
              </BreadcrumbItem>
              
              {layer >= 2 && esp && (
                <>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    {layer > 2 ? (
                        <BreadcrumbLink
                            href="#"
                            onClick={(e) => { e.preventDefault(); resetToLayer(2); }}
                            className="font-medium hover:text-primary transition-colors text-sm"
                        >
                            {esp}
                        </BreadcrumbLink>
                    ) : (
                        <BreadcrumbPage className="font-semibold text-primary text-sm">
                            {esp}
                        </BreadcrumbPage>
                    )}
                  </BreadcrumbItem>
                </>
              )}
              
              {layer >= 3 && med && (
                <>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    {layer > 3 ? (
                        <BreadcrumbLink
                            href="#"
                            onClick={(e) => { e.preventDefault(); resetToLayer(3); }}
                            className="font-medium hover:text-primary transition-colors text-sm"
                        >
                            {med}
                        </BreadcrumbLink>
                    ) : (
                        <BreadcrumbPage className="font-semibold text-primary text-sm">
                            {med}
                        </BreadcrumbPage>
                    )}
                  </BreadcrumbItem>
                </>
              )}

              {layer >= 4 && proc && (
                <>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage className="font-semibold text-primary text-sm">
                        {proc}
                    </BreadcrumbPage>
                  </BreadcrumbItem>
                </>
              )}

            </BreadcrumbList>
          </Breadcrumb>
          {layer < 4 && (
             <p className="text-[11px] text-muted-foreground">
                Clique na barra desejada para carregar a próxima camada de informações.
             </p>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {layer === 4 ? renderTable() : renderChart()}
      </CardContent>
    </Card>
  );
}
