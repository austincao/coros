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
    name: "coros-mcp-recommendation-client",
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
    const result = await client.callTool({
      name: "coros_recommend_next_week",
      arguments: {
        end_day: "20260330",
        goal: "half_marathon",
        target_runs_per_week: 3,
        preferred_weekdays: [2, 4, 7],
      },
    });

    const recommendation = getToolPayload(result);
    if (result.isError || !recommendation?.next_week) {
      throw new Error(`Recommendation failed: ${JSON.stringify(recommendation)}`);
    }

    console.log(
      JSON.stringify(
        {
          next_week: recommendation.next_week,
          strategy: recommendation.strategy,
          target_distance_km_range: recommendation.target_distance_km_range,
          key_focus: recommendation.key_focus,
          pace_guidance: recommendation.pace_guidance,
          session_blueprint: recommendation.session_blueprint,
          cautions: recommendation.cautions,
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
