import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { LastSyncCard } from "@/components/LastSyncCard";
import { useAppSettings, useUpdateSetting } from "@/lib/app-settings";

export const Route = createFileRoute("/_authenticated/config")({
  head: () => ({ meta: [{ title: "Configurações" }] }),
  component: ConfigPage,
});

function ConfigPage() {
  const [busy, setBusy] = useState<string | null>(null);
  const settings = useAppSettings();
  const update = useUpdateSetting();

  const [ocupacao, setOcupacao] = useState<string>("85");
  const [noShow, setNoShow] = useState<string>("10");
  const [cap, setCap] = useState<string>("480");

  useEffect(() => {
    if (settings.data) {
      setOcupacao(String(settings.data.meta_ocupacao_pct));
      setNoShow(String(settings.data.meta_no_show_pct));
      setCap(String(settings.data.capacidade_diaria_min));
    }
  }, [settings.data]);

  const run = async (mode: "today" | "historical" | "support" | "financial" | "full") => {
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

  const saveSetting = async (chave: "meta_ocupacao_pct" | "meta_no_show_pct" | "capacidade_diaria_min", value: string) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) { toast.error("Valor inválido"); return; }
    try {
      await update.mutateAsync({ chave, valor: n });
      toast.success("Salvo.");
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao salvar (apenas admins podem editar)");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Configurações</h1>
        <p className="text-sm text-muted-foreground">Metas do sistema, sincronização e status.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Metas & parâmetros</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
              <div>
                <Label htmlFor="ocupacao">Meta de ocupação (%)</Label>
                <Input id="ocupacao" type="number" value={ocupacao} onChange={(e) => setOcupacao(e.target.value)} />
              </div>
              <Button onClick={() => saveSetting("meta_ocupacao_pct", ocupacao)} disabled={update.isPending}>Salvar</Button>
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
              <div>
                <Label htmlFor="noshow">Meta máx. de no-show (%)</Label>
                <Input id="noshow" type="number" value={noShow} onChange={(e) => setNoShow(e.target.value)} />
              </div>
              <Button onClick={() => saveSetting("meta_no_show_pct", noShow)} disabled={update.isPending}>Salvar</Button>
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
              <div>
                <Label htmlFor="cap">Capacidade diária por profissional (min)</Label>
                <Input id="cap" type="number" value={cap} onChange={(e) => setCap(e.target.value)} />
              </div>
              <Button onClick={() => saveSetting("capacidade_diaria_min", cap)} disabled={update.isPending}>Salvar</Button>
            </div>
            <p className="text-xs text-muted-foreground">Somente usuários com papel <strong>admin</strong> podem alterar estas metas.</p>
          </CardContent>
        </Card>

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
              <Button variant="secondary" onClick={() => run("financial")} disabled={busy !== null}>
                {busy === "financial" ? "Executando financeiro..." : "Sincronizar financeiro"}
              </Button>
              <Button variant="outline" onClick={() => run("support")} disabled={busy !== null}>
                {busy === "support" ? "Executando..." : "Atualizar tabelas de apoio"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <LastSyncCard />
    </div>
  );
}
