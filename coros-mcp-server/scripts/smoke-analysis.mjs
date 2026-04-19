import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

function parseToolText(result) {
  const textItem = Array.isArray(result.content)
    ? result.content.find((item) => item.type === "text" && typeof item.text === "string")
    : undefined;

  if (!textItem) {
    return undefined;
  }

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
  if (!process.env.COROS_ACCESS_TOKEN) {
    throw new Error("COROS_ACCESS_TOKEN is required");
  }

  const client = new Client({
    name: "coros-mcp-analysis-client",
    version: "0.1.0",
  });

  const transport = new StdioClientTransport({
    command: "node",
    args: ["dist/index.js"],
    cwd: process.cwd(),
    env: {
      ...process.env,
      COROS_ACCESS_TOKEN: process.env.COROS_ACCESS_TOKEN,
    },
    stderr: "pipe",
  });

  const stderr = transport.stderr;
  if (stderr) {
    stderr.on("data", (chunk) => {
      process.stderr.write(chunk);
    });
  }

  await client.connect(transport);

  try {
    const weekResult = await client.callTool({
      name: "coros_analyze_recent_week",
      arguments: {
        end_day: "20260330",
      },
    });
    const week = getToolPayload(weekResult);
    if (weekResult.isError || !week?.date_from) {
      throw new Error(`Recent week analysis failed: ${JSON.stringify(week)}`);
    }

    const balanceResult = await client.callTool({
      name: "coros_analyze_training_balance",
      arguments: {
        end_day: "20260330",
        recent_days: 7,
        baseline_days: 21,
      },
    });
    const balance = getToolPayload(balanceResult);
    if (balanceResult.isError || !balance?.recent_window) {
      throw new Error(`Training balance analysis failed: ${JSON.stringify(balance)}`);
    }

    const activityResult = await client.callTool({
      name: "coros_analyze_activity",
      arguments: {
        label_id: "476406894762688515",
        sport_type: 100,
      },
    });
    const activity = getToolPayload(activityResult);
    if (activityResult.isError || !activity?.label_id) {
      throw new Error(`Single activity analysis failed: ${JSON.stringify(activity)}`);
    }

    console.log(
      JSON.stringify(
        {
          week: {
            date_from: week.date_from,
            date_to: week.date_to,
            totals: week.totals,
            distribution: week.distribution,
            conclusion: week.conclusion,
            risks: week.risks,
            suggestions: week.suggestions,
          },
          balance: {
            recent_window: balance.recent_window,
            baseline_window: balance.baseline_window,
            comparison: balance.comparison,
            conclusion: balance.conclusion,
          },
          activity: {
            label_id: activity.label_id,
            name: activity.name,
            activity_type: activity.activity_type,
            metrics: activity.metrics,
            conclusion: activity.conclusion,
            risks: activity.risks,
            suggestions: activity.suggestions,
          },
        },
        null,
        2,
      ),
    );
  } finally {
    await transport.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
