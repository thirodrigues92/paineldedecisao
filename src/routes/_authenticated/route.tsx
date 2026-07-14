import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { GlobalFilters } from "@/components/GlobalFilters";
import { FiltersProvider } from "@/lib/filters-context";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return (
    <FiltersProvider>
      <SidebarProvider>
        <div className="flex min-h-screen w-full bg-background">
          <AppSidebar />
          <SidebarInset className="flex-1">
            <header className="flex h-12 items-center gap-2 border-b border-border bg-card/40 px-3">
              <SidebarTrigger />
              <span className="text-sm text-muted-foreground">Painel de Decisão Clínica</span>
            </header>
            <GlobalFilters />
            <main className="flex-1 p-6">
              <Outlet />
            </main>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </FiltersProvider>
  );
}
