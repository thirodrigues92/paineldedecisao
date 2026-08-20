ALTER TABLE public.lab_faturamento DROP CONSTRAINT lab_faturamento_origem_check;
ALTER TABLE public.lab_faturamento ADD CONSTRAINT lab_faturamento_origem_check 
CHECK (origem = ANY (ARRAY[
    'particular'::text, 
    'convenio'::text, 
    'convenio_estimado'::text, 
    'convenio_tabela_manual'::text, 
    'convenio_pendente_preco'::text, 
    'convenio_pendente_identificacao'::text
]));

DELETE FROM lab_faturamento WHERE origem = 'convenio_estimado';
SELECT lab_enriquecer_faturamento();