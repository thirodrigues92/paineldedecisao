import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { num } from "@/lib/format";

export function ProducaoDuplicateAlert() {
  const query = useQuery({
    queryKey: ["producao-duplicados"],
    queryFn: async () => {
      const { count, error } = await supabase.from("vw_producao_duplicados").select("id", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    },
    refetchInterval: 30_000,
  });
  if (query.isError) return <p role="alert" className="text-sm text-destructive">Não foi possível verificar duplicidades da produção.</p>;
  if (!query.data) return null;
  return (
    <div role="alert" className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{num(query.data)} registros duplicados na produção. O faturamento pode estar superestimado.</span>
    </div>
  );
}