import { useMemo } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { brl, pct } from "@/lib/format";
import type { LabProducaoRow } from "@/lib/dashboard-data";
import { tooltipProps } from "@/lib/chart-theme";

interface GraficoMedicosPorEspecialidadeProps {
  especialidade: string;
  dados: LabProducaoRow[];
}

export function GraficoMedicosPorEspecialidade({ especialidade, dados }: GraficoMedicosPorEspecialidadeProps) {
  const chartData = useMemo(() => {
    // Filtra os dados de todas as produções apenas pela especialidade aberta no momento
    const filtrados = dados.filter(d => (d.grupo_nome || "Sem especialidade") === especialidade);
    const map = new Map<string, { nome: string; valor: number }>();
    
    let total = 0;
    for (const r of filtrados) {
      const nome = (r.profissional_nome || "Não informado").trim();
      const valor = Number(r.valor || 0);
      const cur = map.get(nome) ?? { nome, valor: 0 };
      
      cur.valor += valor;
      total += valor;
      map.set(nome, cur);
    }
    
    return Array.from(map.values())
      .filter(d => d.valor > 0)
      .sort((a, b) => b.valor - a.valor)
      .map(d => ({
        ...d,
        percentual: total > 0 ? (d.valor / total) * 100 : 0
      }));
  }, [especialidade, dados]);

  if (chartData.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-8 text-center border rounded-md">
        Nenhum profissional com faturamento registrado para esta especialidade no período.
      </div>
    );
  }

  // Altura dinâmica de acordo com a quantidade de médicos apresentados
  const chartHeight = Math.max(250, chartData.length * 45 + 60);

  return (
    <div className="w-full mt-6 space-y-4">
      <h3 className="font-medium text-sm text-foreground mb-4">
        Faturamento de Profissionais — {especialidade}
      </h3>
      <div style={{ height: chartHeight, width: "100%" }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
            barSize={24}
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
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const d = payload[0].payload;
                  return (
                    <div className="rounded-lg border border-border bg-background p-3 shadow-md text-xs space-y-1.5">
                      <div className="font-bold border-b pb-1.5 mb-1.5">{d.nome}</div>
                      <div className="flex justify-between items-center gap-6">
                        <span className="text-muted-foreground">Faturado:</span>
                        <span className="font-semibold text-primary">{brl(d.valor)}</span>
                      </div>
                      <div className="flex justify-between items-center gap-6">
                        <span className="text-muted-foreground">Participação:</span>
                        <span className="font-medium">{pct(d.percentual)}</span>
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Bar 
              dataKey="valor" 
              fill="var(--chart-1)" 
              radius={[0, 4, 4, 0]} 
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
