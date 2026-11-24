import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const completeProductionGroups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: admin, error: roleError } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (roleError) throw roleError;
    if (!admin) throw new Error("Somente administradores podem completar classificações.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [byId, byName] = await Promise.all([
      supabaseAdmin.from("lab_vw_grupo_por_id").select("*"),
      supabaseAdmin.from("lab_vw_grupo_por_nome").select("*"),
    ]);
    if (byId.error) throw byId.error;
    if (byName.error) throw byName.error;
    const ids = new Map(byId.data.map(row => [row.procedimento_id, row.grupo_nome]));
    const names = new Map(byName.data.map(row => [row.procedimento_chave, row.grupo_nome]));
    const groups = new Map<string, string[]>();
    for (let from = 0; ; from += 1000) {
      const { data: rows, error } = await supabaseAdmin.from("lab_producao_feegow").select("id,procedimento_id,procedimento_nome")
        .or("grupo_nome.is.null,grupo_nome.eq.,grupo_nome.eq.Não informado,grupo_nome.eq.Não classificado,grupo_nome.eq.Sem grupo")
        .order("id").range(from, from + 999);
      if (error) throw error;
      for (const row of rows ?? []) {
        const normalized = (row.procedimento_nome ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLowerCase();
        const group = ids.get(row.procedimento_id) ?? names.get(normalized);
        if (!group) continue;
        const key = `${ids.has(row.procedimento_id) ? "catalogo_id" : "catalogo_nome"}|${group}`;
        const list = groups.get(key) ?? []; list.push(row.id); groups.set(key, list);
      }
      if (!rows || rows.length < 1000) break;
    }
    let completed = 0;
    for (const [key, rows] of groups) {
      const divider = key.indexOf("|");
      const { data, error } = await supabaseAdmin.from("lab_producao_feegow")
        .update({ grupo_nome: key.slice(divider + 1), grupo_fonte: key.slice(0, divider) }).in("id", rows)
        .or("grupo_nome.is.null,grupo_nome.eq.,grupo_nome.eq.Não informado,grupo_nome.eq.Não classificado,grupo_nome.eq.Sem grupo").select("id");
      if (error) throw error;
      completed += data?.length ?? 0;
    }
    return { completed };
  });