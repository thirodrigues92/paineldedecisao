<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Validate Feegow integer identifiers through the shared identifier parser; preserve invalid originals in raw payloads rather than rounding or rejecting entire sync batches.
- Store financial receipts once per Feegow pagamento_id with original payment payload, amount converted from cents and payment date; DRE revenue and drill-down share that source so partial and repeated payments cannot inflate revenue.
- Executive Financeiro uses an authenticated date-range aggregate for exact selected and comparison dates; monthly DRE views retain monthly grouping and both regimes use payment-based revenue.
- Keep imported Feegow DRE reference data separate from existing financial calculations; link identifiers only on unique accent-, case-, and whitespace-normalized name matches to avoid guessing source IDs.
- Persist the paginated Feegow financial category tree by source ID during financial lookup loading; derive DRE groups from position prefixes rather than category labels so renames and moves remain traceable.
- Store invoice items independently by item_id using each item's category and seven-day fetch windows; invoice payment totals repeated on items are audit attributes, not additive receipt revenue.
- Keep fn_dre as a separate invoker-secured item-based Feegow calculation; existing receipt-based screens remain unchanged because latest-payment item accounting is not actual payment allocation. Test its migration query with inline SQL fixtures so financial rules execute in PostgreSQL without changing real data.
- Paginate fn_dre RPC reads through every returned row; annual hierarchy exceeds the Data API row cap, so a single request can omit expenses and result totals.
- The annual DRE screen uses the invoker-secured fn_dre_tela aggregate and vw_dre_itens_tela detail source, mirroring fn_dre classification with unit filtering; retain receipt-based Executive Financeiro unchanged.
- Build annual account trees by source IDs and parent links; roll up each item once per ancestor and export all levels without adding hierarchical rows together.
- Keep annual DRE presentation in the shared DreAnual component, rendered by both the financial route and public dashboard; reuse existing invoker-secured data access to prevent calculation drift.
- Authenticate public-panel email/password access through Cloud Auth; its localStorage flag is only a navigation marker checked alongside getUser, and sign-out cancels queries and clears protected caches before removing the Auth session.
- Resolve DRE person names by the exact account/type pair in fin_conta_pessoa; share bounded enrichment across invoice sync paths, prefer local patient names, persist failed lookups as null, and restrict manual completion to verified admins without changing item accounting.
- Derive annual DRE charts only from the existing account tree; operational exclusions use immutable presentation copies, and prior-year comparisons use already cached data to avoid new queries or changes to table accounting.
- Explicit DRE month comparisons may fetch selected extra years through the shared paginated fetchItemDre query key; match groups/categories by tree IDs, export leaf rows once, and open the existing item drawer with the selected B year/month.

- The executive AI agent (ia-agente.functions.ts) answers via Responses function calling over the invoker-secured ia_* SQL functions with the caller's RLS client, max 8 tool calls, and audits each question in ia_conversas; the older Analista IA stays context-based.
- The floating IAAssistente is mounted in the authenticated layout and public dashboard; its conversation lives in a module-level store (ia-assistente-store) so it survives tab and page changes, and pages publish extra filters (DRE, public tab) into that store.
- Route every production write through gravarProducao and retain the advisory-lock database trigger: reject blank transactions, replace same-pair ATE on billing, and skip stale ATE even across concurrent or older deployed writers.
- Share production-origin classification between presentation and lab_producao_origem/ia_producao; the Não Faturado sentinel is its own group, never an insurance payer, and vw_producao_duplicados audits stale records with invoker permissions.
