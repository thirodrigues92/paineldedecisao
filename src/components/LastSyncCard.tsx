import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";

export function LastSyncCard() {
  const q = useQuery({
    queryKey: ["last-sync"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sync_logs")
        .select("*")
        .order("iniciado_em", { ascending: false })
        .limit(6);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 30_000,
  });

  return (
    <Card>
      <CardHeader><CardTitle>Sincronizações recentes</CardTitle></CardHeader>
      <CardContent className="space-y-2 max-h-80 overflow-auto">
        {q.isLoading && <Skeleton className="h-24 w-full" />}
        {!q.isLoading && (q.data ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma sincronização registrada.</p>
        )}
        {(q.data ?? []).map((l: any) => (
          <div key={l.id} className="flex items-start justify-between rounded-md border border-border p-2 text-xs">
            <div>
              <div className="font-medium">{l.tipo}</div>
              <div className="text-muted-foreground">
                {new Date(l.iniciado_em).toLocaleString("pt-BR")}
              </div>
              {l.mensagem && <div className="text-muted-foreground mt-1">{l.mensagem}</div>}
            </div>
            <Badge variant={l.status === "sucesso" ? "default" : l.status === "erro" ? "destructive" : "secondary"}>
              {l.status}
            </Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
