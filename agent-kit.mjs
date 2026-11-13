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
  { name: "agentshield_choose", route: null, description: "Free. Ask whether a subtask is worth paying for. Returns pay, compute or skip and the route to call.",
    parameters: q({ task: s("One sentence: what you are about to do or look up") }, ["task"]) },
];

export function createAgentShield({ key = process.env.X402_PAYER_KEY, ref = process.env.X402_REF, maxUsdc = 0.1 } = {}) {
  if (!key) throw new Error("Set X402_PAYER_KEY. The key is yours; it never leaves your machine.");
  const account = privateKeyToAccount(key.startsWith("0x") ? key : `0x${key}`);
  const paidFetch = wrapFetchWithPayment(globalThis.fetch, new x402Client().register("eip155:8453", new ExactEvmScheme(account)));

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
    // The five bundles take a JSON body (POST), so IBANs and names never appear in a URL.
    const init = { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(clean) };
    const probe = await fetch(url, init);
    if (probe.status === 402) {
      const hdr = probe.headers.get("payment-required");
      const price = hdr ? Number(JSON.parse(Buffer.from(hdr, "base64").toString()).accepts[0].amount) / 1e6 : null;
      if (price !== null && price > maxUsdc) return { error: `price ${price} USDC exceeds maxUsdc ${maxUsdc}` };
    }
    const headers = { accept: "application/json", "content-type": "application/json" };
    if (ref) headers["x-agent-ref"] = ref;
    const res = await paidFetch(url, { method: "POST", headers, body: init.body });
    return { status: res.status, ...(await res.json().catch(() => ({}))) };
  }

  return { tools, choose, call };
}
