import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

/**
 * Mostra um aviso quando o período selecionado não possui nenhum registro
 * de produção sincronizado (lab_producao_feegow), evitando gráficos vazios
 * sem explicação.
 */
export function ProducaoGapAlert({ from, to, temDados }: { from: Date; to: Date; temDados: boolean }) {
  const { data: ultimaData } = useQuery({
    queryKey: ["producao-ultima-data"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lab_producao_feegow")
        .select("data_execucao")
        .order("data_execucao", { ascending: false, nullsFirst: false })
        .limit(1);
      if (error) throw error;
      return data?.[0]?.data_execucao ?? null;
    },
    staleTime: 60_000,
    enabled: !temDados,
  });

  if (temDados) return null;

  const periodo = `${format(from, "dd/MM/yyyy")} a ${format(to, "dd/MM/yyyy")}`;
  const ultima = ultimaData
    ? format(new Date(`${ultimaData}T12:00:00`), "dd/MM/yyyy")
    : "nunca";

  return (
    <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
      <div>
        <p className="font-medium text-destructive">
          Sem dados de produção sincronizados neste período ({periodo}).
        </p>
        <p className="text-muted-foreground">
          Os gráficos de faturamento usam a produção da Feegow. Última data com produção
          sincronizada: <span className="font-medium">{ultima}</span>. Rode a sincronização
          de produção em Lab → Relatório para preencher o período.
        </p>
      </div>
    </div>
  );
}
