# Plano: Autenticação Automática e Visibilidade de Links

O usuário deseja ser mantido logado na conta principal e localizar o link público. O "link público" foi identificado como `/public-login` (ou `/public-dashboard` após o login com `admin`/`admin`). O objetivo é facilitar o acesso e a navegação.

## Ajustes Solicitados

1.  **Autenticação Automática**: Ajustar o fluxo de redirecionamento ou prover instruções claras para manter o estado de login, garantindo que o usuário não precise se reautenticar constantemente durante o desenvolvimento/uso.
2.  **Visibilidade do Link Público**: Melhorar a sinalização do "Link Admin (Visão Executiva)" na sidebar para que seja facilmente encontrado.

## Etapas de Implementação

1.  **Sidebar (`src/components/AppSidebar.tsx`)**:
    *   Destacar visualmente o item "Link Admin (Visão Executiva)" para facilitar a localização.
    *   Adicionar um ícone de "ExternalLink" ou similar para indicar que é um acesso diferenciado.

2.  **Dashboard (`src/routes/_authenticated/dashboard.tsx`)**:
    *   Adicionar um pequeno aviso ou card informativo (apenas para desenvolvedores ou admins logados) contendo a URL pública atual para fácil cópia.

3.  **Persistência de Sessão**:
    *   Verificar se o tempo de expiração do Supabase está adequado (embora isso seja configuração de infra, podemos garantir que o cliente JS esteja configurado para persistência local padrão).

## Verificação

*   Abrir a sidebar e verificar se o link público está em destaque.
*   Acessar o dashboard e verificar se o link para a visão pública está acessível.
*   Garantir que o redirecionamento em `src/routes/index.tsx` está funcionando conforme o esperado para usuários logados.

---
*Nota: A solicitação de texto visual continha instruções ("já me deixe logado..."), que interpretei como objetivos funcionais a serem alcançados via ajustes de UI/UX.*
