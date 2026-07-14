import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AppSettings = {
  meta_ocupacao_pct: number;
  meta_no_show_pct: number;
  capacidade_diaria_min: number;
};

const DEFAULTS: AppSettings = {
  meta_ocupacao_pct: 85,
  meta_no_show_pct: 10,
  capacidade_diaria_min: 480,
};

export function useAppSettings() {
  return useQuery({
    queryKey: ["app_settings"],
    queryFn: async (): Promise<AppSettings> => {
      const { data, error } = await supabase.from("app_settings").select("chave, valor");
      if (error) throw error;
      const out: AppSettings = { ...DEFAULTS };
      for (const row of data ?? []) {
        const v = typeof row.valor === "number" ? row.valor : Number(row.valor);
        if (row.chave in out && Number.isFinite(v)) (out as any)[row.chave] = v;
      }
      return out;
    },
    staleTime: 60_000,
  });
}

export function useUpdateSetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ chave, valor }: { chave: keyof AppSettings; valor: number }) => {
      const { error } = await supabase
        .from("app_settings")
        .upsert({ chave, valor: valor as any }, { onConflict: "chave" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["app_settings"] }),
  });
}
