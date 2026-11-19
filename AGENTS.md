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
