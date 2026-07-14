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

  const run = async (mode: "today" | "historical" | "support" | "full") => {
    setBusy(mode);
    try {
      const { data, error } = await supabase.functions.invoke("sync-feegow", { body: { mode } });
      if (error) throw error;
      if (data && data.ok === false) throw new Error(data.error ?? "Falha na sincronização");
      toast.success(`Sincronização (${mode}) concluída em ${data?.ms ?? "?"}ms.`);
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
              <Button onClick={() => run("full")} disabled={busy !== null}>
                {busy === "full" ? "Executando carga completa..." : "Carga completa (apoio + histórico + hoje)"}
              </Button>
              <Button variant="secondary" onClick={() => run("today")} disabled={busy !== null}>
                {busy === "today" ? "Executando..." : "Sincronizar hoje (+7 dias)"}
              </Button>
              <Button variant="secondary" onClick={() => run("historical")} disabled={busy !== null}>
                {busy === "historical" ? "Executando..." : "Carga histórica (90 dias)"}
              </Button>
              <Button variant="outline" onClick={() => run("support")} disabled={busy !== null}>
                {busy === "support" ? "Executando..." : "Atualizar tabelas de apoio"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Na primeira carga, use <strong>Carga completa</strong> para popular tabelas-pai (unidades, profissionais, especialidades) antes dos agendamentos.
            </p>
          </CardContent>
        </Card>
        <LastSyncCard />
      </div>
    </div>
  );
}
