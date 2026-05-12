import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mcpChildEnv } from "./lib/mcp-child-env.mjs";

function payload(r) {
  const t = r.content?.find((c) => c.type === "text" && c.text);
  try {
    return JSON.parse(t.text);
  } catch {
    return t?.text;
  }
}

const env = mcpChildEnv();
delete env.COROS_ACCESS_TOKEN;

const client = new Client({ name: "dbg", version: "0.1.0" });
const transport = new StdioClientTransport({
  command: "node",
  args: ["dist/index.js"],
  cwd: process.cwd(),
  env,
});
await client.connect(transport);
let r = await client.callTool({ name: "coros_auth_status", arguments: {} });
console.log("auth", JSON.stringify(payload(r), null, 2));
r = await client.callTool({ name: "coros_get_profile", arguments: {} });
console.log("profile isError", r.isError, JSON.stringify(payload(r), null, 2).slice(0, 500));
r = await client.callTool({
  name: "coros_query_schedule",
  arguments: { start_day: "20260514", end_day: "20260609" },
});
console.log("schedule isError", r.isError, JSON.stringify(payload(r), null, 2).slice(0, 800));
await transport.close();
