DELETE FROM public.lab_producao_feegow 
WHERE situacao IS NULL 
  AND situacao_conta IS NULL 
  AND id_transacao IS NULL 
  AND agendamento_id IN (
      SELECT agendamento_id FROM public.lab_producao_feegow 
      WHERE situacao = 'Faturado'
  );