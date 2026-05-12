/**
 * Quit one executed subplan, then re-execute a plan template (no verify).
 * Usage:
 *   node scripts/reexecute-plan.mjs <executed_subplan_id> <plan_id> <start_day>
 *
 * Drops COROS_ACCESS_TOKEN for this run so session.json is used (override by exporting token again after editing script if needed).
 */
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

const [execId, planId, startDay] = process.argv.slice(2);
if (!execId || !planId || !startDay) {
  console.error("Usage: node scripts/reexecute-plan.mjs <executed_subplan_id> <plan_id> <start_day>");
  process.exit(1);
}

const env = mcpChildEnv();
delete env.COROS_ACCESS_TOKEN;

const client = new Client({ name: "reexec", version: "0.1.0" });
const transport = new StdioClientTransport({
  command: "node",
  args: ["dist/index.js"],
  cwd: process.cwd(),
  env,
});
await client.connect(transport);

let r = await client.callTool({
  name: "coros_quit_executed_plan",
  arguments: { executed_subplan_id: execId },
});
console.log("quit:", JSON.stringify(payload(r), null, 2));
if (r.isError) process.exit(1);

r = await client.callTool({
  name: "coros_execute_plan",
  arguments: { plan_id: planId, start_day: startDay, verify: false },
});
console.log("execute:", JSON.stringify(payload(r), null, 2));
if (r.isError) process.exit(1);

await transport.close();
