import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const isoDate = (v: unknown) => {
  const s = String(v ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error("Data inválida (use AAAA-MM-DD)");
  return s;
};

export const getSyncStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: locks } = await supabaseAdmin.from("lab_sync_lock").select("*");
    const { data: batches } = await supabaseAdmin
      .from("lab_backfill_jobs")
      .select("batch_id, status, registros, data_inicio, data_fim, erro, tentativas")
      .order("data_inicio", { ascending: false })
      .limit(400);

    const porStatus: Record<string, number> = {};
    for (const j of (batches ?? []) as any[]) porStatus[j.status] = (porStatus[j.status] ?? 0) + 1;

    return {
      locks: (locks ?? []) as any[],
      blocos: (batches ?? []) as any[],
      porStatus,
      totalBlocos: (batches ?? []).length,
    };
  });

export const runSyncNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { dias?: number }) => ({ dias: Math.min(Math.max(Number(d?.dias ?? 3), 1), 14) }))
  .handler(async ({ data }) => {
    const core = await import("@/lib/lab-sync-core.server");
    return await core.runIncrementalSync(data.dias);
  });

export const runBackfillLote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { blocos?: number }) => ({ blocos: Math.min(Math.max(Number(d?.blocos ?? 3), 1), 5) }))
  .handler(async ({ data }) => {
    const core = await import("@/lib/lab-sync-core.server");
    return await core.processBackfillQueue(data.blocos);
  });

export const runRepasseSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { inicio: string; fim: string }) => ({ inicio: isoDate(d?.inicio), fim: isoDate(d?.fim) }))
  .handler(async ({ data }) => {
    if (data.fim < data.inicio) throw new Error("Data final anterior à inicial");
    const core = await import("@/lib/lab-sync-core.server");
    return await core.syncRepasseRange(data.inicio, data.fim);
  });

export const criarBackfillJob = createServerFn({ method: "POST" })

  .middleware([requireSupabaseAuth])
  .inputValidator((d: { inicio: string; fim: string }) => ({ inicio: isoDate(d?.inicio), fim: isoDate(d?.fim) }))
  .handler(async ({ data }) => {
    if (data.fim < data.inicio) throw new Error("Data final anterior à inicial");
    const core = await import("@/lib/lab-sync-core.server");
    return await core.criarBackfill(data.inicio, data.fim, 7);
  });

export const resetSyncJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: d?.id === "backfill" ? "backfill" : "auto_sync" }))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("lab_sync_lock")
      .update({ paused: false, pause_reason: null, consecutive_failures: 0, running: false, lease_until: null } as any)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reprocessarBlocosComErro = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error, count } = await supabaseAdmin
      .from("lab_backfill_jobs")
      .update({ status: "pendente", tentativas: 0, erro: null } as any, { count: "exact" })
      .eq("status", "erro");
    if (error) throw new Error(error.message);
    return { reenfileirados: count ?? 0 };
  });
