import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => {
    // Se estiver logado como admin público, vai para o dashboard público
    if (typeof window !== "undefined" && localStorage.getItem("public_admin_session") === "true") {
      throw redirect({ to: "/public-dashboard" as any });
    }

    const { data } = await supabase.auth.getUser();
    if (data.user) throw redirect({ to: "/dashboard" as any });
    throw redirect({ to: "/auth" as any });
  },
  component: () => null,
});