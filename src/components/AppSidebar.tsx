import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, CalendarClock, UserX, DollarSign,
  Stethoscope, Building2, MapPinned, Settings, LogOut,
  TrendingUp, PieChart, Activity, LineChart as LineIcon, Syringe, ShieldCheck,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarFooter,
} from "@/components/ui/sidebar";
import { supabase } from "@/integrations/supabase/client";

const navMain = [
  { title: "Visão Executiva", url: "/dashboard", icon: LayoutDashboard },
  { title: "Heatmap da Agenda", url: "/heatmap", icon: CalendarClock },
  { title: "Análise de No-show", url: "/no-show", icon: UserX },
  { title: "Financeiro", url: "/financeiro", icon: DollarSign },
  { title: "Profissionais", url: "/profissionais", icon: Stethoscope },
  { title: "Unidades", url: "/unidades", icon: Building2 },
  
];

const navAnalytics = [
  { title: "Comercial", url: "/analytics/comercial", icon: TrendingUp },
  { title: "Rentabilidade", url: "/analytics/rentabilidade", icon: PieChart },
  { title: "Capacidade", url: "/analytics/capacidade", icon: Activity },
  { title: "Aplicações Injetáveis", url: "/analytics/aplicacoes", icon: Syringe },
  { title: "Previsões & Alertas", url: "/analytics/previsoes", icon: LineIcon },
  { title: "Mapa de Pacientes", url: "/mapa", icon: MapPinned },
];


const navFooter = [
  { title: "Auditoria de Dados", url: "/auditoria", icon: ShieldCheck },
  { title: "Configurações", url: "/config", icon: Settings },
];


export function AppSidebar() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });

  const renderItem = (item: (typeof navMain)[number]) => {
    const active = pathname === item.url;
    return (
      <SidebarMenuItem key={item.url}>
        <SidebarMenuButton asChild isActive={active}>
          <Link to={item.url} className="flex items-center gap-2">
            <item.icon className="h-4 w-4" />
            <span className="flex-1">{item.title}</span>
            {(item as any).badge && (
              <span className="ml-auto text-[10px] rounded-full bg-warning/20 text-warning px-2 py-0.5">
                {(item as any).badge}
              </span>
            )}
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border px-3 py-4">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-md bg-primary/20 grid place-items-center">
            <span className="text-primary font-bold">P</span>
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">Painel de Decisão</div>
            <div className="text-[11px] text-muted-foreground truncate">Clínica</div>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navegação</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{navMain.map(renderItem)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Análises Estratégicas</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{navAnalytics.map(renderItem)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Sistema</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{navFooter.map(renderItem)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-2">
        <SidebarMenuButton
          onClick={async () => { await supabase.auth.signOut(); window.location.href = "/auth"; }}
        >
          <LogOut className="h-4 w-4" />
          <span>Sair</span>
        </SidebarMenuButton>
      </SidebarFooter>
    </Sidebar>
  );
}
