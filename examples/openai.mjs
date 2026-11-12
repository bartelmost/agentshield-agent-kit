import OpenAI from "openai";
import { createAgentShield } from "../agent-kit.mjs";
const shield = createAgentShield({ maxUsdc: 0.05 });
const client = new OpenAI();
const tools = shield.tools.map(t => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } }));
const messages = [{ role: "user", content: "Check this invoice before I pay it: net 100.00, VAT 20.00, gross 119.00, seller in Germany." }];
const r = await client.chat.completions.create({ model: "gpt-4o", messages, tools });
for (const call of r.choices[0].message.tool_calls ?? []) {
  console.log(call.function.name, await shield.call(call.function.name, JSON.parse(call.function.arguments)));
}
