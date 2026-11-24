import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { prepararProducao } from "./lab-producao";

/** All production writers share this batch path; the database enforces the same rule for older deployed writers. */
export async function gravarProducao(rows: Parameters<typeof prepararProducao>[0]) {
  const preparados = prepararProducao(rows);
  let gravados = 0;
  const erros: string[] = [];
  for (let i = 0; i < preparados.length; i += 50) {
    const bloco = preparados.slice(i, i + 50).map(row => Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key, typeof value === "bigint" ? value.toString() : value]),
    ));
    const { data, error } = await supabaseAdmin.from("lab_producao_feegow")
      .upsert(bloco as any, { onConflict: "id_transacao,n_guia_prestador,procedimento_id,agendamento_id" }).select("id");
    if (error) erros.push(error.message);
    else gravados += data?.length ?? 0;
  }
  return { gravados, ignorados: rows.length - preparados.length, erros };
}