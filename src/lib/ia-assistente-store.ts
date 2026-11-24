import { useSyncExternalStore } from "react";

export type IAPasso = { ferramenta: string; descricao: string; linhas: number; erro?: string };
export type IAMsg = { role: "user" | "assistant"; content: string; passos?: IAPasso[]; erro?: boolean };
type State = {
  aberto: boolean;
  mensagens: IAMsg[];
  carregando: boolean;
  aba: string | null;
  dreFiltros: { ano: number; regime: string; unidade: string } | null;
};

let state: State = { aberto: false, mensagens: [], carregando: false, aba: null, dreFiltros: null };
const subs = new Set<() => void>();

export function setIA(patch: Partial<State> | ((s: State) => Partial<State>)) {
  state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) };
  subs.forEach((f) => f());
}
export function useIA() {
  return useSyncExternalStore(
    (f) => { subs.add(f); return () => subs.delete(f); },
    () => state,
    () => state,
  );
}
