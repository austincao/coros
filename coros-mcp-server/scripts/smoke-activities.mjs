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
    name: "coros-mcp-activities-client",
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
    const listedResult = await client.callTool({
      name: "coros_list_activities",
      arguments: {
        date_from: "20260324",
        date_to: "20260330",
        page_size: 20,
        max_pages: 2,
      },
    });
    const listed = getToolPayload(listedResult);
    if (listedResult.isError || !Array.isArray(listed?.activities) || listed.activities.length === 0) {
      throw new Error(`Activity list failed: ${JSON.stringify(listed)}`);
    }

    const firstRun = listed.activities.find((item) => item.sport_type === 100 || item.sport_type === 101)
      ?? listed.activities[0];

    const detailResult = await client.callTool({
      name: "coros_get_activity_detail",
      arguments: {
        label_id: firstRun.label_id,
        sport_type: firstRun.sport_type,
      },
    });
    const detail = getToolPayload(detailResult);
    if (detailResult.isError || !detail?.label_id) {
      throw new Error(`Activity detail failed: ${JSON.stringify(detail)}`);
    }

    console.log(
      JSON.stringify(
        {
          list_window: {
            date_from: "20260324",
            date_to: "20260330",
            total_available: listed.total_available,
            pages_fetched: listed.pages_fetched,
            activities: listed.activities.map((item) => ({
              label_id: item.label_id,
              sport_type: item.sport_type,
              name: item.name,
              date: item.date,
              distance_km: item.distance_km,
              total_time_s: item.total_time_s,
              training_load: item.training_load,
            })),
          },
          detail: {
            label_id: detail.label_id,
            sport_type: detail.sport_type,
            name: detail.name,
            distance_km: detail.distance_km,
            total_time_s: detail.total_time_s,
            training_load: detail.training_load,
            avg_hr: detail.avg_hr,
            max_hr: detail.max_hr,
            avg_cadence: detail.avg_cadence,
            avg_pace_sec_per_km: detail.avg_pace_sec_per_km,
            aerobic_effect: detail.aerobic_effect,
            anaerobic_effect: detail.anaerobic_effect,
            current_vo2_max: detail.current_vo2_max,
            laps_preview: detail.laps.slice(0, 3),
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
