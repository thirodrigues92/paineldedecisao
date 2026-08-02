/**
 * Classificação de aplicações injetáveis.
 *
 * A base do Feegow não expõe um campo booleano para isso, e o campo `tipo` dos
 * procedimentos vem como código numérico (2/3/4/9) sem semântica de "injetável".
 * Por isso a classificação é feita pelo nome do procedimento — assim novos
 * procedimentos sincronizados são classificados automaticamente, sem backfill.
 */
const INJETAVEL_RE =
  /(aplica[çc][ãa]o|injet[áa]vel|inje[çc][ãa]o|tirzepatida|semaglutida|liraglutida|ozempic|mounjaro|saxenda|coenzima|co-?q10|toxina\s+botul|botox|infiltra[çc][ãa]o|intramuscular|endovenos|subcut[âa]ne|soroterapia|vitamina\s+d\s+intramuscular|adek)/i;

export function isAplicacaoInjetavel(nomeProcedimento: string | null | undefined): boolean {
  if (!nomeProcedimento) return false;
  return INJETAVEL_RE.test(nomeProcedimento);
}
