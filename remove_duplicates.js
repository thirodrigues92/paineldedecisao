import { supabaseAdmin } from "./src/integrations/supabase/client.server.js";

async function run() {
  const sql = `
DELETE FROM public.lab_faturamento 
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER(PARTITION BY origem, documento_id, item_id ORDER BY synced_at DESC) as rn
    FROM public.lab_faturamento
  ) t WHERE rn > 1
);
`;

  const { error } = await supabaseAdmin.rpc('exec_sql', { sql_query: sql });
  if (error) {
     // Fallback to direct supabaseAdmin call if exec_sql doesn't exist (already saw it failed before)
     console.log("exec_sql failed, trying direct delete via supabaseAdmin.from");
     
     // Finding duplicates first
     const { data: duplicates } = await supabaseAdmin.from('lab_faturamento').select('id, origem, documento_id, item_id, synced_at');
     if (duplicates) {
        const seen = new Set();
        const toDelete = [];
        // Sort by synced_at desc to keep the newest
        duplicates.sort((a, b) => new Date(b.synced_at).getTime() - new Date(a.synced_at).getTime());
        
        for (const d of duplicates) {
          const key = `${d.origem}-${d.documento_id}-${d.item_id}`;
          if (seen.has(key)) {
            toDelete.push(d.id);
          } else {
            seen.add(key);
          }
        }
        
        if (toDelete.length > 0) {
           console.log(`Deleting ${toDelete.length} duplicates...`);
           const { error: delErr } = await supabaseAdmin.from('lab_faturamento').delete().in('id', toDelete);
           if (delErr) console.error("Error deleting:", delErr);
           else console.log("Duplicates deleted successfully.");
        } else {
           console.log("No duplicates found.");
        }
     }
  } else {
    console.log("Duplicates deleted successfully via SQL.");
  }
}

run();
