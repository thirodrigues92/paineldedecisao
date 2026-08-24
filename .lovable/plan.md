# Plano: Retorno ao Fluxo Principal e Limpeza de Acessos Públicos

O usuário solicitou "voltar o sistema para a tela principal", o que indica um desejo de remover ou despriorizar os atalhos de acesso público configurados anteriormente e restaurar o comportamento padrão de login/dashboard administrativo como foco principal.

## Ajustes Solicitados

1.  **Remoção de Destaques Públicos**: Remover os links e banners que apontam para o painel público (`/public-login`, `/public-dashboard`) das áreas administrativas autenticadas.
2.  **Restauração do Fluxo de Login**: Garantir que o acesso principal (`/`) sempre direcione para a autenticação padrão do Supabase ou para o dashboard administrativo completo se já autenticado.
3.  **Limpeza da Sidebar**: Remover o item "Link Admin (Visão Executiva)" da sidebar para evitar confusão.

## Etapas de Implementação

1.  **Sidebar (`src/components/AppSidebar.tsx`)**:
    *   Remover a entrada `{ title: "Link Admin (Visão Executiva)", url: "/public-login", icon: LayoutDashboard }` do array `navFooter`.

2.  **Dashboard (`src/routes/_authenticated/dashboard.tsx`)**:
    *   Remover quaisquer banners ou cards informativos que exibam o link público (caso tenham sido adicionados conforme o plano anterior).

3.  **Redirecionamento (`src/routes/index.tsx`)**:
    *   Manter a lógica de redirecionamento para o `/dashboard` administrativo para usuários logados via Supabase.
    *   Manter a lógica de redirecionamento para `/auth` para usuários não logados.
    *   *Nota*: A lógica do `public_admin_session` em `localStorage` pode ser mantida no código para funcionamento técnico do dashboard público, mas não será mais incentivada via UI principal.

## Verificação

*   Confirmar que o item de link público não aparece mais na barra lateral.
*   Confirmar que ao acessar a raiz do site, o usuário é levado ao dashboard principal (se logado) ou à tela de login padrão.
