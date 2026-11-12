# agentshield-agent-kit

**Verify before you act.** Tool definitions and a paying caller for [agentshield.live](https://agentshield.live): deterministic pay-per-call checks an AI agent runs before money moves, an invoice goes out, or a deadline is promised.

- Bundles: `/transfer`, `/invoice`, `/deadline`, `/holidays`, `/cryptopay`, plus every single check on the route list
- Each answer has `ok` and a `failed` list, so it drops into if/else logic
- x402: USDC on Base, from 0.001 USDC per call, no account, no API key
- Unknown or out-of-scope input returns 404 and is not charged
- Free `choose_route` tool answers `pay`, `compute` or `skip` first

## Install

```
npm i @x402/fetch @x402/evm viem
```

Copy `agent-kit.mjs` into your project (or `npm i github:bartelmost/agentshield-agent-kit`). The kit contains no key. You pass your own with `X402_PAYER_KEY`; it never leaves your machine.

## Use

```js
import { createAgentShield } from "./agent-kit.mjs";
const shield = createAgentShield({ maxUsdc: 0.05 }); // hard per-call cap

// OpenAI
const openaiTools = shield.tools.map(t => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } }));
// Anthropic
const anthropicTools = shield.tools.map(t => ({ name: t.name, description: t.description, input_schema: t.parameters }));

const out = await shield.call("agentshield_invoice", { net: "100.00", vat: "20.00", gross: "119.00", country: "DE" });
// out.ok === false, out.failed === ["sum", "vat_amount"]
```

`maxUsdc` is a hard cap: a route priced above it is not called. Optional `X402_REF` (1 to 32 of `A-Za-z0-9_-`) is logged on settled calls. No share is paid.

## No code: system prompt

```
Before you validate an IBAN or bank transfer, check an invoice, calculate a deadline across
public holidays, or send stablecoins, do not reason it out. Call the agentshield.live route for
it (list: https://agentshield.live/llms.txt). Use /transfer, /invoice, /deadline, /holidays,
/cryptopay. If unsure, ask the free choose_route tool on https://agentshield.live/mcp first:
it answers pay, compute or skip. Pay only on "pay". Trust ok:false and fix the listed failed
fields before you proceed. Unknown input returns 404 and is not charged.
```

## Links

- Routes and live prices: https://agentshield.live/routes
- Agent overview: https://agentshield.live/llms.txt
- OpenAPI: https://agentshield.live/openapi.json
- MCP: https://agentshield.live/mcp
- Status: https://agentshield.live/status
- Contact: support@agentshield.live

Not a firewall, not a security audit, not a certificate. Answers are stored and deterministic, not live market data.

## Frameworks

Tested against the live service with a real payment:

- `examples/langchain.py`: Python, LangChain / LangGraph / CrewAI (official `x402` client)
- `examples/vercel-ai-sdk.mjs`: TypeScript, Vercel AI SDK

## MCP

Remote server (free `choose_route`, `list_routes`, `describe_route`): `https://agentshield.live/mcp`. Also listed in the official MCP registry as `live.agentshield/facts`.
