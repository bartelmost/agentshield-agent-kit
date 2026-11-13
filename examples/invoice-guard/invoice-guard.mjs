// Invoice guard: an agent that must not pay a bad invoice.
// 1. check the invoice (/invoice), 2. check the payment (/transfer), 3. only then "pay".
// Any ok:false, unknown input, price above the cap or error STOPS the run (exit code 1).
// Needs: npm i @x402/fetch @x402/evm viem   and   X402_PAYER_KEY=<your key, USDC on Base>
// Run:   node invoice-guard.mjs invoice-good.json     (about 0.05 USDC)
//        node invoice-guard.mjs invoice-bad.json      (stops after the first check, 0.03 USDC)
import { readFileSync } from "node:fs";
import { createAgentShield } from "../../agent-kit.mjs";

const file = process.argv[2];
if (!file) { console.error("usage: node invoice-guard.mjs <invoice.json>"); process.exit(2); }
const inv = JSON.parse(readFileSync(file, "utf8"));
const shield = createAgentShield({ maxUsdc: 0.05 });   // hard per-call cap

function stop(why, detail) {
  console.error(`STOP: ${why}`);
  if (detail) console.error(JSON.stringify(detail, null, 2));
  console.error("Not paid. Send this invoice to a human.");
  process.exit(1);
}

// Step 1: the invoice itself
const a = await shield.call("agentshield_invoice", {
  net: inv.net, vat: inv.vat, gross: inv.gross, country: inv.country,
  currency: inv.currency, iban: inv.iban, vatid: inv.vatid, date: inv.date, number: inv.number,
});
if (a.error) stop(a.error);
if (a.status !== 200 || a.known !== true) stop(`invoice check not usable (HTTP ${a.status})`, a.note);
if (a.ok !== true) stop(`invoice check failed: ${a.failed.join(", ")}`, a.checks.filter((c) => !c.ok));
console.log("invoice ok. checked:", a.verified.join(", "));
console.log("not checked:", a.not_verified.join(", "));

// Step 2: the payment details
const b = await shield.call("agentshield_transfer", {
  iban: inv.iban, amount: inv.gross, currency: inv.currency, reference: inv.number, name: inv.supplier,
});
if (b.error) stop(b.error);
if (b.status !== 200 || b.known !== true) stop(`transfer check not usable (HTTP ${b.status})`, b.note);
if (b.ok !== true) stop(`transfer check failed: ${b.failed.join(", ")}`, b.checks.filter((c) => !c.ok));
console.log("transfer ok. checked:", b.verified.join(", "));
console.log("not checked:", b.not_verified.join(", "));

// Step 3: the checks cannot see these, so a real system needs its own rules here
console.log("\nAll formal checks passed. Remaining risks are NOT covered by agentshield:");
console.log("- is the IBAN the one you know for this supplier?  - was it already paid?  - is it within your limit?");
console.log(`DRY RUN: would pay ${inv.gross} ${inv.currency} to ${inv.supplier} (${inv.iban}). Replace this line with your payment step.`);
