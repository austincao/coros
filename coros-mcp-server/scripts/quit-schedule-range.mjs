/**
 * Query COROS schedule for [start_day, end_day], then quit every executed subplan returned.
 * Auth: COROS_ACCESS_TOKEN or default ~/.config/coros-mcp/session.json (via MCP server).
 *
 * Usage:
 *   node scripts/quit-schedule-range.mjs 20260514 20260609
 *   DRY_RUN=1 node scripts/quit-schedule-range.mjs 20260514 20260609
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mcpChildEnv } from "./lib/mcp-child-env.mjs";

function parseToolText(result) {
  const textItem = Array.isArray(result.content)
    ? result.content.find((item) => item.type === "text" && typeof item.text === "string")
    : undefined;
  if (!textItem) return undefined;
  try {
    return JSON.parse(textItem.text);
  } catch {
    return textItem.text;
  }
}

function getToolPayload(result) {
  return result.structuredContent ?? parseToolText(result);
}

async function main() {
  const [startDay, endDay] = process.argv.slice(2);
  if (!startDay || !endDay) {
    console.error("Usage: node scripts/quit-schedule-range.mjs <start_day> <end_day>");
    console.error("Example: node scripts/quit-schedule-range.mjs 20260514 20260609");
    process.exit(1);
  }

  const dryRun = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";

  const client = new Client({ name: "quit-schedule-range", version: "0.1.0" });
  const transport = new StdioClientTransport({
    command: "node",
    args: ["dist/index.js"],
    cwd: process.cwd(),
    env: mcpChildEnv(),
    stderr: "pipe",
  });
  const stderr = transport.stderr;
  if (stderr) {
    stderr.on("data", (chunk) => process.stderr.write(chunk));
  }

  await client.connect(transport);

  try {
    const queryRes = await client.callTool({
      name: "coros_query_schedule",
      arguments: { start_day: startDay, end_day: endDay },
    });
    if (queryRes.isError) {
      throw new Error(`coros_query_schedule failed: ${JSON.stringify(queryRes)}`);
    }
    const schedule = getToolPayload(queryRes);
    if (!schedule || typeof schedule !== "object") {
      throw new Error(`coros_query_schedule: unexpected payload ${JSON.stringify(schedule)}`);
    }

    const subplans = schedule?.subplans ?? [];
    const ids = [
      ...new Set(
        subplans
          .map((s) => s.executed_subplan_id)
          .filter((id) => typeof id === "string" && id.length > 0),
      ),
    ];

    console.log(JSON.stringify({ start_day: startDay, end_day: endDay, subplan_count: subplans.length, ids }, null, 2));

    if (ids.length === 0) {
      console.log("No executed subplans in range; nothing to quit.");
      return;
    }

    if (dryRun) {
      console.log("DRY_RUN=1: would quit:", ids);
      return;
    }

    for (const executed_subplan_id of ids) {
      const quitRes = await client.callTool({
        name: "coros_quit_executed_plan",
        arguments: { executed_subplan_id },
      });
      const payload = getToolPayload(quitRes);
      if (quitRes.isError || !payload?.quit_result) {
        throw new Error(`Quit failed for ${executed_subplan_id}: ${JSON.stringify(payload ?? quitRes)}`);
      }
      console.log("Quit OK:", executed_subplan_id, JSON.stringify(payload));
    }
  } finally {
    await transport.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
