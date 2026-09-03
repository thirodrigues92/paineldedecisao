import { useState, useMemo } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { brl, pct, num } from "@/lib/format";
import type { LabProducaoRow } from "@/lib/dashboard-data";
import { tooltipProps } from "@/lib/chart-theme";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

interface GraficoMedicosPorEspecialidadeProps {
  especialidade: string;
  dados: LabProducaoRow[];
}

function formataDataCurta(isoDate: string | null) {
  if (!isoDate) return "--";
  const parts = isoDate.split("T")[0].split("-");
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}/${parts[0].slice(2)}`;
}

export function GraficoMedicosPorEspecialidade({ especialidade, dados }: GraficoMedicosPorEspecialidadeProps) {
  const [selectedMedico, setSelectedMedico] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const { medicosData, procData, pacientesList } = useMemo(() => {
    const filtradosEsp = dados.filter(d => (d.grupo_nome || "Sem especialidade") === especialidade);

    const mapMedicos = new Map<string, { nome: string; valor: number; qtd: number }>();
    const mapProc = new Map<string, { nome: string; valor: number; qtd: number }>();

    let totalEsp = 0;
    const pacientes = [];

    for (const r of filtradosEsp) {
      const nomeMed = (r.profissional_nome || "Não informado").trim();
      const nomeProc = (r.procedimento_nome || "Sem descrição").trim();
      const valor = Number(r.valor || 0);

      totalEsp += valor;

      const curMed = mapMedicos.get(nomeMed) ?? { nome: nomeMed, valor: 0, qtd: 0 };
      curMed.valor += valor;
      curMed.qtd += 1;
      mapMedicos.set(nomeMed, curMed);

      const curProc = mapProc.get(nomeProc) ?? { nome: nomeProc, valor: 0, qtd: 0 };
      curProc.valor += valor;
      curProc.qtd += 1;
      mapProc.set(nomeProc, curProc);

      if (selectedMedico && nomeMed === selectedMedico) {
        pacientes.push({
          id: r.id,
          data: r.data_execucao,
          paciente: r.paciente_nome || "Paciente não identificado",
          procedimento: nomeProc,
          convenio: r.convenio_nome || "Particular",
          valor: valor,
        });
      }
    }

    const buildChartData = (map: Map<string, any>) => 
      Array.from(map.values())
        .filter(d => d.valor > 0)
        .sort((a, b) => b.valor - a.valor)
        .map(d => ({
          ...d,
          percentual: totalEsp > 0 ? (d.valor / totalEsp) * 100 : 0,
          ticket: d.valor / (d.qtd || 1)
        }));

    const filteredPacientes = pacientes.filter(p =>
        p.paciente.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.procedimento.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.convenio.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return { 
      medicosData: buildChartData(mapMedicos), 
      procData: buildChartData(mapProc), 
      pacientesList: filteredPacientes 
    };
  }, [especialidade, dados, selectedMedico, searchTerm]);

  if (medicosData.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-8 text-center border rounded-md">
        Nenhum dado financeiro registrado para esta especialidade no período.
      </div>
    );
  }

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
          <div className="flex justify-between items-center gap-6">
            <span className="text-muted-foreground">Ticket Médio:</span>
            <span className="font-medium">{brl(d.ticket)}</span>
          </div>
          <div className="flex justify-between items-center gap-6 mt-1 border-t pt-1.5">
            <span className="text-muted-foreground">Participação:</span>
            <span className="font-medium">{pct(d.percentual)}</span>
          </div>
        </div>
      );
    }
    return null;
  };

  const renderChart = (chartData: any[], color: string, isClickable = false) => {
      const chartHeight = Math.max(250, chartData.length * 45 + 60);
      return (
        <div style={{ height: chartHeight, width: "100%" }} className="mt-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
              barSize={24}
              onClick={(e) => {
                 if (isClickable && e?.activePayload?.length) {
                     setSelectedMedico(e.activePayload[0].payload.nome);
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
                fill={color}
                radius={[0, 4, 4, 0]}
                className={isClickable ? "cursor-pointer hover:opacity-85 transition-opacity" : ""}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      );
  };

  return (
    <div className="w-full mt-6 space-y-4">
      <div className="flex flex-col gap-4 bg-muted/20 p-3.5 rounded-lg border border-border/60">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              {selectedMedico ? (
                <BreadcrumbLink
                    href="#"
                    onClick={(e) => { e.preventDefault(); setSelectedMedico(null); setSearchTerm(""); }}
                    className="font-medium hover:text-primary transition-colors text-sm"
                >
                  {especialidade}
                </BreadcrumbLink>
              ) : (
                <BreadcrumbPage className="font-semibold text-primary text-sm">
                  {especialidade}
                </BreadcrumbPage>
              )}
            </BreadcrumbItem>
            {selectedMedico && (
              <>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage className="font-semibold text-sm">
                    {selectedMedico}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </>
            )}
          </BreadcrumbList>
        </Breadcrumb>
        {!selectedMedico && (
          <p className="text-xs text-muted-foreground">
            Navegue pelas abas abaixo ou clique na barra de um médico para ver o detalhamento de seus pacientes.
          </p>
        )}
      </div>

      {!selectedMedico ? (
        <Tabs defaultValue="medicos" className="w-full">
          <TabsList className="grid w-full grid-cols-2 max-w-[400px]">
            <TabsTrigger value="medicos">Por Médicos</TabsTrigger>
            <TabsTrigger value="procedimentos">Por Procedimentos</TabsTrigger>
          </TabsList>
          <TabsContent value="medicos" className="animate-in fade-in-50 duration-500">
            {renderChart(medicosData, "var(--chart-1)", true)}
          </TabsContent>
          <TabsContent value="procedimentos" className="animate-in fade-in-50 duration-500">
            {renderChart(procData, "var(--chart-2)", false)}
          </TabsContent>
        </Tabs>
      ) : (
        <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300 w-full mt-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <h4 className="text-sm font-medium">Pacientes Atendidos — {pacientesList.length} registros</h4>
              <div className="relative w-full max-w-xs">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Filtrar paciente, procedimento ou convênio..."
                  className="pl-9 h-9 text-xs"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
          </div>
          <div className="rounded-md border bg-card">
            <ScrollArea className="h-[400px]">
              <Table>
                <TableHeader className="bg-muted/50 sticky top-0 backdrop-blur-sm z-10">
                  <TableRow>
                    <TableHead className="w-[80px]">Data</TableHead>
                    <TableHead>Paciente</TableHead>
                    <TableHead>Procedimento</TableHead>
                    <TableHead>Convênio</TableHead>
                    <TableHead className="text-right">Faturado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pacientesList.length === 0 ? (
                      <TableRow>
                          <TableCell colSpan={5} className="text-center h-32 text-muted-foreground">
                              Nenhum atendimento associado a este filtro.
                          </TableCell>
                      </TableRow>
                  ) : (
                      pacientesList.map((p, idx) => (
                        <TableRow key={`${p.id}-${idx}`} className="hover:bg-muted/30">
                          <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                            {formataDataCurta(p.data)}
                          </TableCell>
                          <TableCell className="font-medium text-xs">{p.paciente}</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate" title={p.procedimento}>
                              {p.procedimento}
                          </TableCell>
                          <TableCell>
                              <Badge variant="outline" className="text-[10px] bg-background whitespace-nowrap">
                                  {p.convenio}
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
        </div>
      )}
    </div>
  );
}
