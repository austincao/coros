import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mcpChildEnv } from "./lib/mcp-child-env.mjs";

async function main() {
  const client = new Client({ name: "recent-week-analyst", version: "0.1.0" });
  const transport = new StdioClientTransport({
    command: "node",
    args: ["dist/index.js"],
    cwd: process.cwd(),
    env: mcpChildEnv(),
  });

  await client.connect(transport);

  const res = await client.callTool({
    name: "coros_analyze_recent_week",
    arguments: { end_day: "20260422" }
  });

  console.log(JSON.stringify(res.structuredContent ?? JSON.parse(res.content[0].text), null, 2));

  await transport.close();
}

main().catch(console.error);
