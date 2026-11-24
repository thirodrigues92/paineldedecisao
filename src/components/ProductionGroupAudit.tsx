import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save, Search, Loader2, RefreshCw } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { completeProductionGroups } from "@/lib/production-groups.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { brl, num } from "@/lib/format";

export function ProductionGroupAudit() {
  const client = useQueryClient();
  const complete = useServerFn(completeProductionGroups);
  const [search, setSearch] = useState("");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const query = useQuery({ queryKey: ["production-group-audit"], queryFn: async () => {
    const [pending, saved, role] = await Promise.all([
      supabase.from("vw_producao_sem_grupo").select("*").order("valor", { ascending: false }),
      supabase.from("dim_grupo_procedimento_manual").select("*").order("procedimento_nome"),
      supabase.auth.getUser(),
    ]);
    if (pending.error) throw pending.error;
    if (saved.error) throw saved.error;
    const { data: admin, error } = role.data.user ? await supabase.rpc("has_role", { _user_id: role.data.user.id, _role: "admin" }) : { data: false, error: null };
    if (error) throw error;
    return { pending: pending.data, saved: saved.data, admin: !!admin };
  }});
  const save = useMutation({ mutationFn: async ({ name, group }: { name: string; group: string }) => {
    if (!group.trim()) throw new Error("Informe a especialidade.");
    const { error } = await supabase.from("dim_grupo_procedimento_manual").upsert({ procedimento_nome: name, grupo_nome: group.trim(), atualizado_em: new Date().toISOString() }, { onConflict: "procedimento_nome" });
    if (error) throw error;
  }, onSuccess: async () => { await client.invalidateQueries(); } });
  const enrich = useMutation({ mutationFn: () => complete(), onSuccess: async () => { await client.invalidateQueries(); } });
  const pending = new Map<string, { qtd: number; valor: number }>();
  for (const row of query.data?.pending ?? []) {
    const name = row.procedimento_nome || "Procedimento sem nome";
    const item = pending.get(name) ?? { qtd: 0, valor: 0 };
    item.qtd += Number(row.qtd); item.valor += Number(row.valor); pending.set(name, item);
  }
  const saved = new Map((query.data?.saved ?? []).map(row => [row.procedimento_nome, row.grupo_nome]));
  const names = [...new Set([...pending.keys(), ...saved.keys()])].filter(name => name.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")));
  return <section className="space-y-4">
    <h2 className="text-lg font-semibold">Especialidades dos procedimentos</h2>
    {query.data?.admin && <Button variant="outline" onClick={() => enrich.mutate()} disabled={enrich.isPending}><RefreshCw className={`mr-2 h-4 w-4 ${enrich.isPending ? "animate-spin" : ""}`} />Completar pelo catálogo</Button>}
    {enrich.isSuccess && <p role="status" className="text-sm text-muted-foreground">{num(enrich.data.completed)} itens classificados pelo catálogo.</p>}
    <div className="relative max-w-sm"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="Pesquisar procedimento" placeholder="Pesquisar procedimento" value={search} onChange={event => setSearch(event.target.value)} className="pl-9" /></div>
    {query.isPending && <Loader2 className="h-5 w-5 animate-spin" />}
    {(query.error || save.error || enrich.error) && <p role="alert" className="text-sm text-destructive">{(query.error || save.error || enrich.error)?.message}</p>}
    {!query.isPending && !query.data?.admin && <p className="text-sm text-muted-foreground">Somente administradores podem alterar a classificação.</p>}
    <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Procedimento</TableHead><TableHead className="text-right">Itens sem grupo</TableHead><TableHead className="text-right">Valor sem grupo</TableHead><TableHead>Especialidade</TableHead><TableHead /></TableRow></TableHeader><TableBody>
      {names.map(name => <TableRow key={name}><TableCell className="min-w-48">{name}</TableCell><TableCell className="text-right">{num(pending.get(name)?.qtd ?? 0)}</TableCell><TableCell className="whitespace-nowrap text-right">{brl(pending.get(name)?.valor ?? 0)}</TableCell><TableCell><Input aria-label={`Especialidade de ${name}`} value={edits[name] ?? saved.get(name) ?? ""} onChange={event => setEdits(prev => ({ ...prev, [name]: event.target.value }))} disabled={!query.data?.admin} className="min-w-40" /></TableCell><TableCell><Button size="icon" variant="outline" title="Salvar classificação" aria-label={`Salvar ${name}`} disabled={!query.data?.admin || save.isPending || !(edits[name] ?? saved.get(name))?.trim() || name === "Procedimento sem nome"} onClick={() => save.mutate({ name, group: edits[name] ?? saved.get(name) ?? "" })}><Save className="h-4 w-4" /></Button></TableCell></TableRow>)}
      {!query.isPending && !names.length && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Nenhum procedimento pendente.</TableCell></TableRow>}
    </TableBody></Table></div>
  </section>;
}