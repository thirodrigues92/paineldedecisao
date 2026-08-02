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
  "Faturamento em lote (convênio)",
  "Sem detalhamento da Feegow",
  "Outros serviços",
] as const;

export type CategoriaServico = (typeof CATEGORIAS_SERVICO)[number];

const RE_CONSULTA = /(consulta|retorno\s+m[ée]dic|avalia[çc][ãa]o\s+m[ée]dic|primeira\s+consulta)/i;
const RE_OCUPACIONAL =
  /(toxicol[óo]gico|\baso\b|admissional|demissional|periódico|peri[óo]dico\s+ocupacional|atestado|laudo|per[íi]cia|cnh|carteira\s+de\s+motorista)/i;
const RE_IMAGEM =
  /(\busg\b|ultrassom|ultra-?som|ultrassonograf|ecocardio|doppler|raio\s?-?\s?x|\brx\b|radiograf|densitometr|mamograf|tomograf|resson[âa]ncia|elastograf)/i;
const RE_CARDIO =
  /(\becg\b|eletrocardiograma|holter|\bmapa\b|ergom[ée]tric|teste\s+de\s+esfor[çc]o|eletroencefalograma|\beeg\b|espirometr|polissonograf|risco\s+cir[úu]rgico|mapeamento\s+de\s+retina|bioimped[âa]ncia|percentual\s+de\s+gordura|pool\s+cognitivo|patch\s+test|campimetr|audiometr)/i;
const RE_LAB =
  /(hemograma|glicose|glicemia|colesterol|triglic|\btsh\b|\bt3\b|\bt4\b|urina|\beas\b|urocultura|cultura|sorolog|hemoglobina|creatinina|ureia|[áa]cido\s+[úu]rico|ferritina|vitamina|\bpcr\b|\bvhs\b|\btgo\b|\btgp\b|beta\s?hcg|psa\b|coagulograma|parasitol|coprocultura|citol[óo]gic|papanicolau|preventivo|painel|dosagem|exame\s+de\s+sangue|ant[íi]geno|anticorpo|hepatite|\bhpv\b|prova\s+fun|\bshbg\b|dehidrotestosterona|\bdht\b|testosterona|estradiol|progesterona|prolactina|cortisol|paratorm[ôo]nio|\bpth\b|homociste[íi]na|d[íi]mero\s*d|dimero|\bzinco\b|\bzn\b|andro(stenediona)?\b|anti\s?ccp|anti\s?trab|lipidograma|sangue\s+oculto|\bca\s?-?\s?1?\d{1,2}\/?\d?\b|complemento\s+c\d|sexagem\s+fetal|microscopia|bioclin|insulina|amilase|lipase|magn[ée]sio|f[óo]sforo|s[óo]dio|pot[áa]ssio|albumina|bilirrubin|gama\s?gt|fosfatase|eletrofor)/i;
const RE_VACINA = /(vacina|imuniza|imunobiol[óo]gic)/i;
const RE_APLICACAO_EXTRA =
  /(protocolo.*\b(im|ev|iv|intramuscular|endovenos)\b|viscosuplementa|intradermoterapia|toxina\s+botul[íi]nica|\bbotox\b|soroterapia|infus[ãa]o)/i;
const RE_PROCEDIMENTO =
  /(bi[óo]psia|cauteriza|sutura|ex[ée]rese|drenagem|curativo|retirada\s+de\s+ponto|crioterapia|eletrocoagula|puncao|pun[çc][ãa]o|cirurgi|colocação\s+de\s+diu|\bdiu\b|implante|implanom|implanon|mirena|kyleena|conoplastia|peeling|preenchimento)/i;
/** Faturas agregadas de convênio (não têm procedimento individual). */
const RE_LOTE = /(^\s*lote\(s\)?:|^\s*lote\b|faturamento\s+autogest|faturamento\s+em\s+lote|^\s*repasse\b|guia\s+de\s+convenio)/i;

export function categoriaServico(nomeProcedimento: string | null | undefined): CategoriaServico {
  const nome = (nomeProcedimento ?? "").trim();
  if (!nome) return "Sem detalhamento da Feegow";
  if (RE_LOTE.test(nome)) return "Faturamento em lote (convênio)";
  if (RE_VACINA.test(nome) || RE_APLICACAO_EXTRA.test(nome) || isAplicacaoInjetavel(nome)) return "Aplicações e vacinas";
  if (RE_OCUPACIONAL.test(nome)) return "Ocupacional e atestados";
  if (RE_CONSULTA.test(nome)) return "Consultas";
  if (RE_IMAGEM.test(nome)) return "Imagem e ultrassom";
  if (RE_CARDIO.test(nome)) return "Cardiologia diagnóstica";
  if (RE_LAB.test(nome)) return "Exames laboratoriais";
  if (RE_PROCEDIMENTO.test(nome)) return "Procedimentos e cirurgias";
  return "Outros serviços";
}

