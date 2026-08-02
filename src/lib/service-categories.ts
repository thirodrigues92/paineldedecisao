/**
 * Classificação de procedimentos em categorias de serviço (consultas, exames
 * laboratoriais, imagem, cardiologia diagnóstica, aplicações/vacinas etc.).
 *
 * A Feegow devolve `grupo` e `tipo` apenas como códigos numéricos sem nome, e a
 * categoria financeira vem majoritariamente vazia. Por isso a classificação é
 * feita pelo nome do procedimento — novos procedimentos sincronizados entram
 * automaticamente na categoria certa, sem backfill.
 */
import { isAplicacaoInjetavel } from "./injectables";

export const CATEGORIAS_SERVICO = [
  "Consultas",
  "Exames laboratoriais",
  "Imagem e ultrassom",
  "Cardiologia diagnóstica",
  "Aplicações e vacinas",
  "Procedimentos e cirurgias",
  "Ocupacional e atestados",
  "Outros",
] as const;

export type CategoriaServico = (typeof CATEGORIAS_SERVICO)[number];

const RE_CONSULTA = /(consulta|retorno\s+m[ée]dic|avalia[çc][ãa]o\s+m[ée]dic|primeira\s+consulta)/i;
const RE_OCUPACIONAL =
  /(toxicol[óo]gico|\baso\b|admissional|demissional|periódico|peri[óo]dico\s+ocupacional|atestado|laudo|per[íi]cia|cnh|carteira\s+de\s+motorista)/i;
const RE_IMAGEM =
  /(\busg\b|ultrassom|ultra-?som|ultrassonograf|ecocardio|doppler|raio\s?-?\s?x|\brx\b|radiograf|densitometr|mamograf|tomograf|resson[âa]ncia|elastograf)/i;
const RE_CARDIO =
  /(\becg\b|eletrocardiograma|holter|\bmapa\b|ergom[ée]tric|teste\s+de\s+esfor[çc]o|eletroencefalograma|\beeg\b|espirometr)/i;
const RE_LAB =
  /(hemograma|glicose|glicemia|colesterol|triglic|\btsh\b|\bt3\b|\bt4\b|urina|\beas\b|urocultura|cultura|sorolog|hemoglobina|creatinina|ureia|[áa]cido\s+[úu]rico|ferritina|vitamina\s+b12|\bpcr\b|\bvhs\b|\btgo\b|\btgp\b|beta\s?hcg|psa\b|coagulograma|parasitol|coprocultura|citol[óo]gic|papanicolau|preventivo|painel|dosagem|exame\s+de\s+sangue|antígeno|anticorpo)/i;
const RE_VACINA = /(vacina|imuniza|imunobiol[óo]gic)/i;
const RE_PROCEDIMENTO =
  /(bi[óo]psia|cauteriza|sutura|ex[ée]rese|drenagem|curativo|retirada\s+de\s+ponto|crioterapia|eletrocoagula|puncao|pun[çc][ãa]o|cirurgi|colocação\s+de\s+diu|\bdiu\b|implante|peeling|preenchimento)/i;

export function categoriaServico(nomeProcedimento: string | null | undefined): CategoriaServico {
  const nome = (nomeProcedimento ?? "").trim();
  if (!nome) return "Outros";
  if (RE_VACINA.test(nome) || isAplicacaoInjetavel(nome)) return "Aplicações e vacinas";
  if (RE_OCUPACIONAL.test(nome)) return "Ocupacional e atestados";
  if (RE_CONSULTA.test(nome)) return "Consultas";
  if (RE_IMAGEM.test(nome)) return "Imagem e ultrassom";
  if (RE_CARDIO.test(nome)) return "Cardiologia diagnóstica";
  if (RE_LAB.test(nome)) return "Exames laboratoriais";
  if (RE_PROCEDIMENTO.test(nome)) return "Procedimentos e cirurgias";
  return "Outros";
}
