// Edge Function: geocode-pacientes (Fase 2 preparação)
// Converte CEPs pendentes em latitude/longitude usando ViaCEP + Nominatim/OSM.
// Rate limit: 1 req/s (política do Nominatim). Cache em ceps_geocodificados.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function geocodeCep(cep: string): Promise<{ latitude: number; longitude: number; bairro?: string; cidade?: string; estado?: string } | null> {
  const clean = cep.replace(/\D/g, "");
  if (clean.length !== 8) return null;

  // 1) ViaCEP para descobrir endereço
  const via = await fetch(`https://viacep.com.br/ws/${clean}/json/`).then((r) => r.json()).catch(() => null);
  if (!via || via.erro) return null;

  // 2) Nominatim para coordenadas
  const q = encodeURIComponent(`${via.logradouro ?? ""}, ${via.bairro ?? ""}, ${via.localidade ?? ""}, ${via.uf ?? ""}, Brazil`);
  const nom = await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`, {
    headers: { "User-Agent": "painel-clinica-lovable/1.0" },
  }).then((r) => r.json()).catch(() => null);
  if (!Array.isArray(nom) || !nom.length) return null;
  return {
    latitude: Number(nom[0].lat),
    longitude: Number(nom[0].lon),
    bairro: via.bairro,
    cidade: via.localidade,
    estado: via.uf,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  // CEPs distintos de pacientes ainda não geocodificados
  const { data: pending } = await supabase
    .from("pacientes")
    .select("cep")
    .not("cep", "is", null)
    .is("latitude", null)
    .limit(50);

  const processed: string[] = [];
  for (const row of pending ?? []) {
    const cep = String(row.cep);
    // Cache
    const { data: cached } = await supabase.from("ceps_geocodificados").select("*").eq("cep", cep).maybeSingle();
    let geo = cached;
    if (!geo) {
      const g = await geocodeCep(cep);
      if (g) {
        await supabase.from("ceps_geocodificados").insert({ cep, ...g });
        geo = { cep, ...g } as any;
      }
      await sleep(1100); // 1 req/s
    }
    if (geo) {
      await supabase.from("pacientes")
        .update({ latitude: geo.latitude, longitude: geo.longitude })
        .eq("cep", cep);
      processed.push(cep);
    }
  }

  return new Response(JSON.stringify({ ok: true, processed: processed.length }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
