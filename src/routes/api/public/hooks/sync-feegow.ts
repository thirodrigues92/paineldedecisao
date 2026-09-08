import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/sync-feegow")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env['CRON_SYNC_SECRET'];
        const provided = request.headers.get("x-cron-secret");
        if (!secret || !provided || provided !== secret) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        let body: any = {};
        try { body = await request.json(); } catch { body = {}; }
        const job = body?.job === "backfill" ? "backfill" : "incremental";
        const dias = Number.isFinite(Number(body?.dias)) ? Math.min(Math.max(Number(body.dias), 1), 14) : 3;
        const blocos = Number.isFinite(Number(body?.blocos)) ? Math.min(Math.max(Number(body.blocos), 1), 5) : 3;

        const core = await import("@/lib/lab-sync-core.server");

        try {
          const result = job === "backfill"
            ? await core.processBackfillQueue(blocos)
            : await core.runIncrementalSync(dias);
          return Response.json({ ok: true, job, result });
        } catch (e: any) {
          return Response.json({ ok: false, job, error: e?.message ?? "erro" }, { status: 500 });
        }
      },
    },
  },
});
