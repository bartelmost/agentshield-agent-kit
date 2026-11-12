import Anthropic from "@anthropic-ai/sdk";
import { createAgentShield } from "../agent-kit.mjs";
const shield = createAgentShield({ maxUsdc: 0.05 });
const client = new Anthropic();
const tools = shield.tools.map(t => ({ name: t.name, description: t.description, input_schema: t.parameters }));
const r = await client.messages.create({ model: "claude-sonnet-4-5", max_tokens: 1024, tools,
  messages: [{ role: "user", content: "Due date 5 business days after 2026-12-22 in Bavaria?" }] });
for (const block of r.content) if (block.type === "tool_use") console.log(block.name, await shield.call(block.name, block.input));
