# invoice-guard

A small agent step that refuses to pay a bad invoice. It calls `/invoice`, then `/transfer`, and stops (exit code 1) on any `ok:false`, unknown input, price above the cap, or error. Both calls use POST, so IBANs and names stay out of URLs.

```
npm i @x402/fetch @x402/evm viem
export X402_PAYER_KEY=0x...        # your own key, a little USDC on Base
node invoice-guard.mjs invoice-good.json   # passes, about 0.05 USDC
node invoice-guard.mjs invoice-bad.json    # VAT does not add up, stops after 0.03 USDC
```

The final step is a dry run. Put your own payment call there. The checks are formal only: they do not know whether the IBAN belongs to this supplier, whether the invoice was already paid, or whether it is within your limit. Keep those rules in your own system.
