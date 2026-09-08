import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { RefreshCw, Play, History, AlertTriangle } from "lucide-react";
import {
  getSyncStatus, runSyncNow, runBackfillLote, criarBackfillJob, resetSyncJob, reprocessarBlocosComErro, runRepasseSync,
} from "@/lib/lab-sync-admin.functions";


const fmtDate = (v?: string | null) => (v ? new Date(v).toLocaleString("pt-BR") : "—");

export function SyncAutomaticaPanel() {
  const qc = useQueryClient();
  const status = useServerFn(getSyncStatus);
  const syncNow = useServerFn(runSyncNow);
  const loteFn = useServerFn(runBackfillLote);
  const criarFn = useServerFn(criarBackfillJob);
  const resetFn = useServerFn(resetSyncJob);
  const retryFn = useServerFn(reprocessarBlocosComErro);
  const repasseFn = useServerFn(runRepasseSync);


  const hoje = new Date().toISOString().slice(0, 10);
  const [inicio, setInicio] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    return d.toISOString().slice(0, 10);
  });
  const [fim, setFim] = useState(hoje);

  const q = useQuery({
    queryKey: ["sync-status"],
    queryFn: () => status({}),
    refetchInterval: 15_000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["sync-status"] });

  const mSync = useMutation({
    mutationFn: () => syncNow({ data: { dias: 3 } }),
    onSuccess: (r: any) => {
      toast.success(r?.skipped ? `Ignorado: ${r.reason}` : `Sincronizado (${r?.producao?.gravados ?? 0} registros)`);
      invalidate();
    },
    onError: (e: any) => toast.error(e.message ?? "Falha na sincronização"),
  });

  const mCriar = useMutation({
    mutationFn: () => criarFn({ data: { inicio, fim } }),
    onSuccess: (r: any) => { toast.success(`Carga criada: ${r.blocos} blocos`); invalidate(); },
    onError: (e: any) => toast.error(e.message ?? "Falha ao criar carga"),
  });

  const mLote = useMutation({
    mutationFn: () => loteFn({ data: { blocos: 3 } }),
    onSuccess: (r: any) => {
      toast.success(r?.skipped ? `Ignorado: ${r.reason}` : `${r.processados} blocos, ${r.registros} registros (restam ${r.restantes})`);
      invalidate();
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao processar"),
  });

  const mReset = useMutation({
    mutationFn: (id: string) => resetFn({ data: { id } }),
    onSuccess: () => { toast.success("Job liberado"); invalidate(); },
  });

  const mRetry = useMutation({
    mutationFn: () => retryFn({}),
    onSuccess: (r: any) => { toast.success(`${r.reenfileirados} blocos reenfileirados`); invalidate(); },
  });

  const mRepasse = useMutation({
    mutationFn: () => repasseFn({ data: { inicio, fim } }),
    onSuccess: (r: any) => {
      toast.success(`Repasse: ${r.gravados} lançamentos gravados${r.erros?.length ? ` (${r.erros.length} falhas)` : ""}`);
      invalidate();
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao sincronizar repasse"),
  });


  const auto = (q.data?.locks ?? []).find((l: any) => l.id === "auto_sync");
  const back = (q.data?.locks ?? []).find((l: any) => l.id === "backfill");
  const porStatus = q.data?.porStatus ?? {};
  const total = q.data?.totalBlocos ?? 0;
  const concluidos = porStatus["concluido"] ?? 0;
  const pct = total > 0 ? Math.round((concluidos / total) * 100) : 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4" /> Atualização automática (a cada 30 min)
          </CardTitle>
          {auto && (
            <Badge variant={auto.paused ? "destructive" : auto.running ? "secondary" : "default"}>
              {auto.paused ? "pausada" : auto.running ? "executando" : "ativa"}
            </Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Info label="Última execução" value={fmtDate(auto?.last_run_at)} />
            <Info label="Último sucesso" value={fmtDate(auto?.last_success_at)} />
            <Info label="Registros" value={String(auto?.last_result?.producao?.gravados ?? 0)} />
            <Info label="Falhas seguidas" value={String(auto?.consecutive_failures ?? 0)} />
          </div>
          {auto?.last_error && (
            <p className="text-xs text-destructive flex items-start gap-1">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5" /> {auto.last_error}
            </p>
          )}
          <div className="flex gap-2">
            <Button size="sm" onClick={() => mSync.mutate()} disabled={mSync.isPending}>
              <Play className="h-3.5 w-3.5 mr-1.5" />
              {mSync.isPending ? "Sincronizando..." : "Sincronizar agora"}
            </Button>
            {(auto?.paused || auto?.running) && (
              <Button size="sm" variant="outline" onClick={() => mReset.mutate("auto_sync")}>
                Liberar / retomar
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            A cada 30 minutos o sistema atualiza os últimos 3 dias automaticamente.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2">
            <History className="h-4 w-4" /> Carga de dados antigos
          </CardTitle>
          {back?.paused && <Badge variant="destructive">pausada</Badge>}
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label htmlFor="bi">De</Label>
              <Input id="bi" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className="w-[170px]" />
            </div>
            <div>
              <Label htmlFor="bf">Até</Label>
              <Input id="bf" type="date" value={fim} onChange={(e) => setFim(e.target.value)} className="w-[170px]" />
            </div>
            <Button onClick={() => mCriar.mutate()} disabled={mCriar.isPending}>
              {mCriar.isPending ? "Criando..." : "Iniciar carga"}
            </Button>
            <Button variant="secondary" onClick={() => mLote.mutate()} disabled={mLote.isPending}>
              {mLote.isPending ? "Processando..." : "Processar próximos blocos"}
            </Button>
            <Button variant="secondary" onClick={() => mRepasse.mutate()} disabled={mRepasse.isPending}>
              {mRepasse.isPending ? "Carregando repasse..." : "Carregar repasse do período"}
            </Button>

            {(porStatus["erro"] ?? 0) > 0 && (
              <Button variant="outline" onClick={() => mRetry.mutate()}>Reprocessar com erro</Button>
            )}
            {(back?.paused || back?.running) && (
              <Button variant="outline" onClick={() => mReset.mutate("backfill")}>Liberar</Button>
            )}
          </div>

          {total > 0 && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{concluidos} de {total} blocos concluídos</span>
                <span>{pct}%</span>
              </div>
              <Progress value={pct} />
              <div className="flex flex-wrap gap-2 text-xs">
                {Object.entries(porStatus).map(([k, v]) => (
                  <Badge key={k} variant={k === "erro" ? "destructive" : "secondary"}>{k}: {v as number}</Badge>
                ))}
              </div>
            </div>
          )}

          <div className="max-h-72 overflow-auto rounded-md border border-border">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 sticky top-0">
                <tr>
                  <th className="text-left p-2">Período</th>
                  <th className="text-left p-2">Situação</th>
                  <th className="text-right p-2">Registros</th>
                  <th className="text-left p-2">Erro</th>
                </tr>
              </thead>
              <tbody>
                {(q.data?.blocos ?? []).map((b: any, i: number) => (
                  <tr key={i} className="border-t border-border">
                    <td className="p-2">
                      {new Date(`${b.data_inicio}T00:00:00`).toLocaleDateString("pt-BR")} – {new Date(`${b.data_fim}T00:00:00`).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="p-2">{b.status}</td>
                    <td className="p-2 text-right">{b.registros}</td>
                    <td className="p-2 text-destructive truncate max-w-[280px]">{b.erro ?? ""}</td>
                  </tr>
                ))}
                {(q.data?.blocos ?? []).length === 0 && (
                  <tr><td className="p-3 text-muted-foreground" colSpan={4}>Nenhuma carga criada ainda.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
