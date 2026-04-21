import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

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
  const client = new Client({
    name: "coros-mcp-running-week-report-smoke",
    version: "0.1.0",
  });

  const transport = new StdioClientTransport({
    command: "node",
    args: ["dist/index.js"],
    cwd: ROOT,
    env: {
      ...process.env,
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
    const tools = await client.listTools();
    const names = tools.tools.map((tool) => tool.name);
    if (!names.includes("coros_running_week_report")) {
      throw new Error(`coros_running_week_report missing; have: ${names.join(", ")}`);
    }

    const authResult = await client.callTool({
      name: "coros_auth_status",
      arguments: {},
    });
    if (authResult.isError) {
      const body = parseToolText(authResult);
      throw new Error(
        `coros_auth_status failed (token missing/expired/invalid). ${typeof body === "string" ? body : JSON.stringify(body)}\n` +
          `Fix: export a fresh COROS_ACCESS_TOKEN or run: npm run auth:browser-login\n` +
          `Offline check (no COROS): npm run selftest:running-week-report`,
      );
    }
    const auth = getToolPayload(authResult);
    if (!auth?.authenticated) {
      throw new Error(
        "COROS is not authenticated. Set COROS_ACCESS_TOKEN or create ~/.config/coros-mcp/session.json",
      );
    }

    const reportResult = await client.callTool({
      name: "coros_running_week_report",
      arguments: {
        include_html: true,
        max_activity_details: 20,
      },
    });

    const report = getToolPayload(reportResult);
    if (reportResult.isError || !report?.date_from) {
      throw new Error(`coros_running_week_report failed: ${JSON.stringify(report)}`);
    }

    if (typeof report.html !== "string" || report.html.length < 100) {
      throw new Error(`Expected non-trivial html, got length=${report.html?.length ?? 0}`);
    }

    const outDir = path.join(ROOT, "tmp");
    await mkdir(outDir, { recursive: true });
    const outHtml = path.join(outDir, "smoke-running-week-report.html");
    await writeFile(outHtml, report.html, "utf8");

    const printable = {
      date_from: report.date_from,
      date_to: report.date_to,
      generated_at: report.generated_at,
      profile: report.profile,
      totals: report.totals,
      intensity_counts: report.intensity_counts,
      hr_zones_seconds: report.hr_zones_seconds,
      daily: report.daily,
      pace_bins_nonzero: (report.pace_bins ?? []).filter((b) => b.distance_km > 0).length,
      activities: (report.activities ?? []).map((a) => ({
        date: a.date,
        name: a.name,
        km: a.distance_km,
        load: a.training_load,
        class: a.classification,
        detail_fetched: a.detail_fetched,
      })),
      methodology_lines: (report.methodology ?? []).length,
      html_bytes: report.html.length,
      html_written_to: outHtml,
    };

    console.log(JSON.stringify(printable, null, 2));
  } finally {
    await transport.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
