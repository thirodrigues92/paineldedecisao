import { feegowIntegerId } from "./plano-contas.ts";

export type PersonPair = { tipo_conta: number; conta_id: number; paciente_nome: string | null };
export type PersonRow = { tipo_conta: number; conta_id: number; nome: string | null; documento: string | null; tipo_descricao: string | null; atualizado_em: string };
export const PERSON_BATCH_LIMIT = 300;
export const PERSON_API_DELAY_MS = 150;
const text = (v: unknown) => typeof v === "string" && v.trim() ? v.trim() : null;
export function associationPerson(body: unknown) {
  if (!body || typeof body !== "object" || !("name" in body)) throw new Error("Associação Feegow sem pessoa");
  const b = body as Record<string, unknown>;
  const type = b["type"];
  return { nome: text(b["name"]), documento: text(b["document"]), tipo_descricao: type && typeof type === "object" && "description" in type ? text(type.description) : null };
}

export async function resolvePersonPairs(pairs: PersonPair[], dependencies: {
  association: (pair: PersonPair) => Promise<unknown>;
  save: (row: PersonRow) => Promise<void>;
  wait: (ms: number) => Promise<void>;
  now: () => number;
  budgetMs?: number;
}) {
  const start = dependencies.now();
  let processados = 0, api = 0, locais = 0, falhas = 0, preenchidos = 0;
  const inflight = new Set<Promise<void>>();
  let storageError: unknown;
  const persist = async (tipo_conta: number, conta_id: number, person: Pick<PersonRow, "nome" | "documento" | "tipo_descricao">) => {
    await dependencies.save({ tipo_conta, conta_id, ...person, atualizado_em: new Date(dependencies.now()).toISOString() });
    processados++;
    if (person.nome) preenchidos++;
  };
  for (const pair of pairs.slice(0, PERSON_BATCH_LIMIT)) {
    if (dependencies.now() - start >= (dependencies.budgetMs ?? 45000)) break;
    if (storageError) break;
    const tipo_conta = feegowIntegerId(pair.tipo_conta), conta_id = feegowIntegerId(pair.conta_id);
    if (!tipo_conta || !conta_id) continue;
    if (tipo_conta === 3 && text(pair.paciente_nome)) {
      await persist(tipo_conta, conta_id, { nome: text(pair.paciente_nome), documento: null, tipo_descricao: "Paciente" }); locais++;
    } else {
      // Bound overlap to four requests, preserving at least 150ms between starts.
      if (inflight.size >= 4) await Promise.race(inflight);
      if (api > 0) await dependencies.wait(PERSON_API_DELAY_MS);
      api++;
      const task = (async () => {
        let person: Pick<PersonRow, "nome" | "documento" | "tipo_descricao"> = { nome: null, documento: null, tipo_descricao: null };
        try { person = associationPerson(await dependencies.association({ ...pair, tipo_conta, conta_id })); }
        catch { falhas++; }
        await persist(tipo_conta, conta_id, person);
      })().catch(error => { storageError = error; });
      inflight.add(task);
      void task.then(() => inflight.delete(task));
    }
  }
  await Promise.all(inflight);
  if (storageError) throw storageError;
  return { processados, api, locais, falhas, preenchidos };
}

/** Called by legacy and modern invoice syncs; only exact account/type pairs are cached. */
export async function completeAccountPeople(client: any, token: string) {
  const { data, error } = await client.rpc("fin_pessoas_pendentes", { p_limite: PERSON_BATCH_LIMIT });
  if (error) throw new Error("Não foi possível consultar pessoas pendentes");
  const result = await resolvePersonPairs(data ?? [], {
    association: async pair => {
      const response = await fetch("https://api.feegow.com/v1/api/core/financial/account/association", {
        method: "POST", headers: { "x-access-token": token, "Content-Type": "application/json" },
        body: JSON.stringify({ account: pair.conta_id, association: pair.tipo_conta }), signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error(`Associação HTTP ${response.status}`);
      return response.json();
    },
    save: async row => {
      const { error } = await client.from("fin_conta_pessoa").upsert(row, { onConflict: "tipo_conta,conta_id" });
      if (error) throw new Error("Não foi possível gravar a associação da pessoa");
    },
    wait: ms => new Promise(resolve => setTimeout(resolve, ms)), now: () => Date.now(),
  });
  const count = await client.rpc("fin_pessoas_pendentes_count");
  if (count.error) throw new Error("Não foi possível contar pessoas pendentes");
  return { ...result, pendentes: Number(count.data ?? 0) };
}