// npm i agentshield-live ai zod
import { tool } from "ai";
import { z } from "zod";
import { createAgentShield } from "agentshield-live";

const shield = createAgentShield({ maxUsdc: 0.05 });   // reads X402_PAYER_KEY, hard per-call cap

export const agentshield = {
  check_transfer: tool({
    description: "Check a bank transfer before money moves: IBAN, BIC, amount. Returns ok and failed fields.",
    inputSchema: z.object({ iban: z.string(), amount: z.string().optional() }),
    execute: (args) => shield.call("agentshield_transfer", args),   // 0.02 USDC
  }),
  choose_route: tool({
    description: "Free. Is this subtask worth paying for? Returns pay, compute or skip.",
    inputSchema: z.object({ task: z.string() }),
    execute: ({ task }) => shield.call("agentshield_choose", { task }),
  }),
};
// generateText({ model, tools: agentshield, prompt })
