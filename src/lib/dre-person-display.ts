type PersonDetail = { pessoa_nome: string | null; pessoa_tipo: string | null; pessoa_documento: string | null; pessoa_conta_id: number | null; pessoa_tipo_conta: number | null };
export function personLabel(item: PersonDetail) {
  return item.pessoa_nome?.trim() || `${item.pessoa_tipo || "Tipo"} #${item.pessoa_conta_id ?? "—"}`;
}
export function personSearch(item: PersonDetail) {
  return `${personLabel(item)} ${item.pessoa_tipo ?? ""} ${item.pessoa_documento ?? ""} ${(item.pessoa_documento ?? "").replace(/\D/g, "")}`;
}