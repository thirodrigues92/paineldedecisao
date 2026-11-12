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
