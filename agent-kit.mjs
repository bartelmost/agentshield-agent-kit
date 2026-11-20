// agentshield.live agent kit. Drop-in tool definitions plus a caller that pays with YOUR key.
// Needs: npm i @x402/fetch @x402/evm viem. This file contains no key. Node 20+.
import { privateKeyToAccount } from "viem/accounts";
import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm";

const BASE = "https://agentshield.live";

const q = (props, required) => ({ type: "object", properties: props, required, additionalProperties: false });
const s = (description) => ({ type: "string", description });

// OpenAI-style function definitions. Works as-is for OpenAI, and maps 1:1 to Anthropic input_schema and LangChain tools.
export const tools = [
  { name: "agentshield_transfer", route: "/transfer", description: "Check a bank transfer before money moves: IBAN, BIC, amount, SEPA scope, remittance text, name. Returns ok and failed fields.",
    parameters: q({ iban: s("Beneficiary IBAN"), bic: s("Optional BIC"), amount: s("Optional decimal amount"), currency: s("Optional currency code"), reference: s("Optional remittance text"), name: s("Optional beneficiary name"), cid: s("Optional German SEPA creditor id") }, ["iban"]) },
  { name: "agentshield_invoice", route: "/invoice", description: "Check an invoice before sending or paying: net + VAT = gross, VAT rate, IBAN, VAT id, date, number. Optional registry=1 asks EU VIES. Returns ok and failed fields.",
    parameters: q({ net: s("Net amount"), vat: s("VAT amount"), gross: s("Gross amount"), rate: s("Optional VAT percent"), country: s("Seller country code"), currency: s("Currency code"), iban: s("Optional IBAN"), vatid: s("Optional VAT id"), date: s("Optional YYYY-MM-DD"), number: s("Optional invoice number"), registry: s("Set to 1 to also ask EU VIES for the VAT id") }, ["net", "gross"]) },
  { name: "agentshield_deadline", route: "/deadline", description: "Add or subtract business days, skipping weekends and public holidays of a country or region.",
    parameters: q({ date: s("Start date YYYY-MM-DD, not counted"), days: s("Non-zero business-day count"), country: s("Two-letter country code"), region: s("Optional region such as BY") }, ["date", "days", "country"]) },
  { name: "agentshield_holidays", route: "/holidays", description: "All statutory public holidays of a year for a country, optionally one region.",
    parameters: q({ country: s("Two-letter country code"), year: s("Year"), region: s("Optional region") }, ["country", "year"]) },
  { name: "agentshield_cryptopay", route: "/cryptopay", description: "Check an EVM stablecoin transfer: recipient checksum, token contract on that chain.",
    parameters: q({ to: s("Recipient 0x address"), chain: s("Chain id or name"), token: s("Optional USDC, USDT or contract address") }, ["to", "chain"]) },
  { name: "agentshield_fields", route: "/fields", description: "Check required Peppol invoice fields before sending. Not arithmetic. Returns ok and the missing fields.",
    parameters: q({ profile: s("peppol"), number: s("Optional invoice number"), date: s("Optional YYYY-MM-DD"), seller: s("Optional seller name"), buyer: s("Optional buyer name") }, ["profile"]) },
  { name: "agentshield_routing", route: "/routing", description: "Check a German BLZ, Swiss IID, or Banxico SPEI clave before money moves. Not a SWIFT BIC lookup.",
    parameters: q({ system: s("blz, iid, or spei"), code: s("The clearing code") }, ["system", "code"]) },
  { name: "agentshield_settle", route: "/settle", description: "Check when a TARGET, Fedwire, or CHAPS payment can arrive. Not a bank cutoff.",
    parameters: q({ system: s("TARGET, Fedwire, or CHAPS"), date: s("YYYY-MM-DD") }, ["system", "date"]) },
  { name: "agentshield_value", route: "/value", description: "Check a Lynx, ACSS, Real-Time Rail, SIC, or euroSIC value date. TARGET, Fedwire, and CHAPS are settle.",
    parameters: q({ system: s("Lynx, ACSS, RTR, SIC, or euroSIC"), date: s("YYYY-MM-DD") }, ["system", "date"]) },
  { name: "agentshield_choose", route: null, description: "Free. Ask whether a subtask is worth paying for. Returns pay, compute or skip and the route to call.",
    parameters: q({ task: s("One sentence: what you are about to do or look up") }, ["task"]) },
];

// Options:
//   maxUsdc  hard per-call cap. A call above it is not made.
//   onPay    optional callback after each paid call: { tool, route, price_usdc, status, ok, failed, transaction, network, payer }.
//            Silent when not set. Example: onPay: (p) => console.log(`[agentshield] ${p.route} ${p.price_usdc} USDC ${p.transaction}`)
//   dryRun   no payment and no key needed. Each call sends the unpaid request and returns the live price from the 402
//            ({ dryRun: true, would_pay, price_usdc, ... }) or the free 404. It never returns a made-up check result.
//            Also on with env AGENTSHIELD_DRY_RUN=1, for CI. A real check needs a real payment on Base. A retired /try path is not a rehearsal.
export function createAgentShield({ key = process.env.X402_PAYER_KEY, ref = process.env.X402_REF, maxUsdc = 0.1, onPay = null,
  dryRun = process.env.AGENTSHIELD_DRY_RUN === "1" } = {}) {
  let paidFetch = null;
  if (!dryRun) {
    if (!key) throw new Error("Set X402_PAYER_KEY, or pass dryRun: true. The key is yours; it never leaves your machine.");
    const account = privateKeyToAccount(key.startsWith("0x") ? key : `0x${key}`);
    paidFetch = wrapFetchWithPayment(globalThis.fetch, new x402Client().register("eip155:8453", new ExactEvmScheme(account)));
  }
  const decode = (h) => { try { return h ? JSON.parse(Buffer.from(h, "base64").toString()) : null; } catch { return null; } };

  async function choose(task) {
    const r = await fetch(`${BASE}/mcp`, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "choose_route", arguments: { task } } }) });
    return JSON.parse((await r.json()).result.content[0].text);
  }

  async function call(name, args = {}) {
    const tool = tools.find((t) => t.name === name);
    if (!tool) throw new Error(`Unknown tool ${name}`);
    if (!tool.route) return choose(args.task);
    const url = new URL(BASE + tool.route);
    const clean = {};
    for (const [k, v] of Object.entries(args)) if (v !== undefined && v !== "") clean[k] = String(v);
    // The bundles take a JSON body (POST), so IBANs and names never appear in a URL.
    const headers = { accept: "application/json", "content-type": "application/json" };
    if (ref) headers["x-agent-ref"] = ref;
    const body = JSON.stringify(clean);
    const probe = await fetch(url, { method: "POST", headers, body });
    // Not 402: a free 404 (unknown input, not charged, do not retry) or an error. Nothing was paid.
    if (probe.status !== 402) return { status: probe.status, charged: false, ...(await probe.json().catch(() => ({}))) };
    const req = decode(probe.headers.get("payment-required"));
    const accept = req?.accepts?.[0];
    const price = accept ? Number(accept.amount) / 1e6 : null;
    if (dryRun) return { dryRun: true, status: 402, charged: false, route: tool.route, price_usdc: price, network: accept?.network ?? null,
      would_pay: price !== null && price <= maxUsdc, note: "Dry run: price from the live 402. No payment, no check result." };
    if (price === null || price > maxUsdc) return { error: `price ${price} USDC exceeds maxUsdc ${maxUsdc}`, charged: false };
    const res = await paidFetch(url, { method: "POST", headers, body });
    const out = { status: res.status, ...(await res.json().catch(() => ({}))) };
    const settle = decode(res.headers.get("payment-response"));
    if (onPay && settle) {
      try {
        await onPay({ tool: name, route: tool.route, price_usdc: price, status: res.status, ok: out.ok ?? null, failed: out.failed ?? [],
          transaction: settle.transaction ?? null, network: settle.network ?? accept.network, payer: settle.payer ?? null });
      } catch { /* a logging hook must not break the call */ }
    }
    return out;
  }

  return { tools, choose, call, dryRun };
}
