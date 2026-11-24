import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { brl, num } from "@/lib/format";
import { missingGroupWarning } from "@/lib/production-metrics";

export function ProducaoDuplicateAlert() {
  const query = useQuery({
    queryKey: ["producao-duplicados"],
    queryFn: async () => {
      const now = new Date();
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      const [duplicates, missing] = await Promise.all([
        supabase.from("vw_producao_duplicados").select("id", { count: "exact", head: true }),
        supabase.from("vw_producao_sem_grupo_mensal").select("qtd,valor").eq("mes", month).maybeSingle(),
      ]);
      if (duplicates.error) throw duplicates.error;
      if (missing.error) throw missing.error;
      return { duplicates: duplicates.count ?? 0, missingValue: Number(missing.data?.valor ?? 0), missingCount: Number(missing.data?.qtd ?? 0) };
    },
    refetchInterval: 30_000,
  });
  if (query.isError) return <p role="alert" className="text-sm text-destructive">Não foi possível verificar a qualidade da produção.</p>;
  if (!query.data || (!query.data.duplicates && !missingGroupWarning(query.data.missingValue))) return null;
  return (
    <div role="alert" className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="space-y-1">
        {query.data.duplicates > 0 && <p>{num(query.data.duplicates)} registros duplicados na produção. Os valores podem estar superestimados.</p>}
        {missingGroupWarning(query.data.missingValue) && <p>{num(query.data.missingCount)} itens sem especialidade no mês atual: {brl(query.data.missingValue)}. Há classificações pendentes na Auditoria.</p>}
      </div>
    </div>
  );
}