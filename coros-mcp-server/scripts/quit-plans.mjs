import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mcpChildEnv } from "./lib/mcp-child-env.mjs";

async function main() {
  const client = new Client({ name: "plan-quitter", version: "0.1.0" });
  const transport = new StdioClientTransport({
    command: "node",
    args: ["dist/index.js"],
    cwd: process.cwd(),
    env: mcpChildEnv(),
  });

  await client.connect(transport);

  const res = await client.callTool({
    name: "coros_quit_executed_plan",
    arguments: { executed_subplan_id: "477009574768066660" }
  });
  console.log(`Quit plan 477009574768066660:`, res.content[0].text);

  await transport.close();
}

main().catch(console.error);
