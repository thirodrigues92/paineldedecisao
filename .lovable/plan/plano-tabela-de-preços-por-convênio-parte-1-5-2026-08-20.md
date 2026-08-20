# Plano - Tabela de Preços por Convênio (Parte 1/5)

Criar a infraestrutura básica para armazenar preços negociados por convênio, permitindo projeções de valores quando a API do Feegow não retorna dados financeiros reais (comum em convênios).

## Alterações

### Backend (Supabase)
- **Nova Tabela**: Criar `lab_tabela_precos_convenio` para armazenar `convenio_id`, `procedimento_id`, `codigo_tuss`, `valor` e `fonte`.
- **Segurança**: Habilitar RLS e conceder permissões para a função de serviço e usuários autenticados.

## Detalhes Técnicos
- Tabela utiliza chaves estrangeiras para `lab_convenios` e `procedimentos`.
- Índice Único: `(convenio_id, procedimento_id)` para evitar duplicatas.
- RLS: Inicialmente configurado para leitura apenas por usuários autenticados (relatórios) e escrita via service role (sync).

```sql
CREATE TABLE public.lab_tabela_precos_convenio (
  id SERIAL PRIMARY KEY,
  convenio_id INTEGER NOT NULL REFERENCES public.lab_convenios(convenio_id),
  procedimento_id INTEGER NOT NULL REFERENCES public.procedimentos(procedimento_id),
  codigo_tuss TEXT,
  valor NUMERIC(10,2) NOT NULL,
  fonte TEXT DEFAULT 'planilha_operadora',
  atualizado_em TIMESTAMPTZ DEFAULT now(),
  UNIQUE(convenio_id, procedimento_id)
);

GRANT SELECT ON public.lab_tabela_precos_convenio TO authenticated;
GRANT ALL ON public.lab_tabela_precos_convenio TO service_role;

ALTER TABLE public.lab_tabela_precos_convenio ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir leitura para usuários autenticados" 
ON public.lab_tabela_precos_convenio FOR SELECT 
TO authenticated 
USING (true);
```
