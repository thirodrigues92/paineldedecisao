import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { toast } from "sonner";
import { LastSyncCard } from "@/components/LastSyncCard";

export const Route = createFileRoute("/_authenticated/config")({
  head: () => ({ meta: [{ title: "Configurações" }] }),
  component: ConfigPage,
});

function ConfigPage() {
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (mode: "today" | "historical" | "support") => {
    setBusy(mode);
    try {
      const { error } = await supabase.functions.invoke("sync-feegow", { body: { mode } });
      if (error) throw error;
      toast.success(`Sincronização (${mode}) disparada.`);
    } catch (err: any) {
      toast.error(err.message ?? "Falha ao disparar sincronização");
    } finally { setBusy(null); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Configurações</h1>
        <p className="text-sm text-muted-foreground">Sincronização com Feegow e status do sistema.</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Sincronização manual</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 gap-2">
              <Button onClick={() => run("today")} disabled={busy !== null}>
                {busy === "today" ? "Executando..." : "Sincronizar hoje"}
              </Button>
              <Button variant="secondary" onClick={() => run("historical")} disabled={busy !== null}>
                {busy === "historical" ? "Executando..." : "Carga histórica (12 meses)"}
              </Button>
              <Button variant="outline" onClick={() => run("support")} disabled={busy !== null}>
                {busy === "support" ? "Executando..." : "Atualizar tabelas de apoio"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              A sincronização automática ocorre a cada 30 minutos.
            </p>
          </CardContent>
        </Card>
        <LastSyncCard />
      </div>
    </div>
  );
}
