# Plano: Acesso Público à Visão Executiva (Link Admin)

O usuário deseja um link "público" (com credenciais simplificadas `admin`/`admin`) para visualizar a Visão Executiva. Para isso, criaremos uma rota desprotegida que renderiza o dashboard em modo somente leitura ou com uma lógica de bypass.

## Alterações Técnicas

### 1. Criar Rota de Login Simplificada
- Criar a rota `src/routes/public-login.tsx`.
- Esta tela pedirá o usuário (`admin`) e a senha (`admin`).
- Ao validar, ela salvará um token de sessão simples no `localStorage` ou `sessionStorage`.

### 2. Criar Rota Pública do Dashboard
- Criar a rota `src/routes/public-dashboard.tsx`.
- Esta rota NÃO estará sob a proteção da rota pai `_authenticated`.
- Ela terá seu próprio `beforeLoad` que verifica se o token `admin` está presente no armazenamento do navegador. Se não, redireciona para `/public-login`.
- O componente reutilizará as seções do dashboard executivo (KPIs, Gráficos), mas sem o menu lateral completo (sidebar), usando apenas um layout simplificado.

### 3. Ajustar Consultas de Dados
- Como a rota é pública (fora do contexto de autenticação do Supabase), as RLS (Row Level Security) precisam permitir o acesso a esses dados ou as funções de consulta precisam ser adaptadas para funcionar sem um usuário autenticado no Supabase (por exemplo, via uma API key de serviço ou permitindo leitura anônima nas tabelas `lab_producao_feegow` se o usuário admin estiver "logado" na camada da aplicação).
- *Nota: Para manter a segurança, implementaremos uma rota de API específica ou habilitaremos leitura anônima controlada.*

### 4. Layout
- O `public-dashboard` usará um layout minimalista (sem sidebar), focando apenas nos dados da visão executiva solicitada.

## Verificação
- Acessar `/public-login`.
- Inserir `admin` / `admin`.
- Confirmar redirecionamento para `/public-dashboard` com todos os dados da Visão Executiva carregados.
