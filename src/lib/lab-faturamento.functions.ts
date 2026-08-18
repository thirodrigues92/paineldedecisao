import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const labDebugFeegow = createServerFn({ method: "POST" })
  .inputValidator((data: { endpoint: string; params: Record<string, string> }) => data)
  .handler(async ({ data }) => {
    const FEEGOW_BASE = "https://api.feegow.com/v1/api";
    const FEEGOW_TOKEN = process.env.FEEGOW_API_TOKEN ?? "";
    
    const url = new URL(FEEGOW_BASE + (data.endpoint.startsWith("/") ? data.endpoint : "/" + data.endpoint));
    for (const [k, v] of Object.entries(data.params)) {
      url.searchParams.set(k, String(v));
    }

    const res = await fetch(url.toString(), {
      headers: { "x-access-token": FEEGOW_TOKEN }
    });

    const body = await res.json().catch(() => ({}));
    const rows = Array.isArray(body.content) ? body.content : (body.content ? [body.content] : []);

    return {
      ok: true,
      http_status: res.status,
      api_success: body.success === true,
      total_registros: rows.length,
      campos_detectados: rows.length > 0 ? Object.keys(rows[0]) : [],
      raw: { ...body, content: rows.slice(0, 3) }
    };
  });
