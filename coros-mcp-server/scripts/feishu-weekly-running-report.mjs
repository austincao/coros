/**
 * 生成最近 7 天跑步周报 HTML（COROS），落盘后用 lark-cli 发到飞书私聊：
 *  1) 交互卡片（摘要）
 *  2) HTML 文件附件
 *
 * 依赖：已 build（dist/）、本机已登录 COROS（session 或 COROS_ACCESS_TOKEN）、
 *       飞书应用机器人已与你在私聊中建立会话（可先给机器人发一条消息）。
 *
 * 环境变量（必填）：
 *   LARK_DM_USER_ID   可选；收件人 open_id。省略且已 auth login 时默认发给自己（userOpenId）
 *
 * 环境变量（可选）：
 *   COROS_WEEKLY_REPORT_DIR   报告目录，默认 ~/coros-weekly-reports
 *   SKIP_LARK=1               只写 HTML，不发飞书
 *   FEISHU_CARD_CHARTS=0      不在卡片内嵌图表截图（省 Chrome / 网络）
 *
 * 定时示例（北京时间 周二、五 11:00，需本机时区或 CRON_TZ）：
 *   CRON_TZ=Asia/Shanghai
 *   0 11 * * 2,5 cd /path/to/coros-mcp-server && /path/to/node scripts/feishu-weekly-running-report.mjs >>/tmp/coros-weekly.log 2>&1
 *
 * 或先：npm run build && npm run report:weekly-feishu
 */

import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  buildInteractiveCard,
  prepareChartImagesForCard,
  resolveLarkDmUserId,
  shouldEmbedChartScreenshots,
} from "./feishu-report-chart-assets.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

function beijingCorosDate(now = new Date()) {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const [y, m, d] = ymd.split("-");
  return `${y}${m}${d}`;
}

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

function runLarkSend(args, label, spawnOpts = {}) {
  const r = spawnSync("lark-cli", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...spawnOpts,
  });
  if (r.status !== 0) {
    const err = (r.stderr || r.stdout || "").trim() || `exit ${r.status}`;
    throw new Error(`lark-cli ${label} failed: ${err}`);
  }
  return (r.stdout || "").trim();
}

function larkFileRelativePath(filePath) {
  const resolved = path.resolve(filePath);
  const cwd = process.cwd();
  let rel = path.relative(cwd, resolved);
  if (rel && !rel.startsWith("..") && !path.isAbsolute(rel)) {
    return { cwd, rel: rel.split(path.sep).join("/") };
  }
  const dir = path.dirname(resolved);
  const base = path.basename(resolved);
  return { cwd: dir, rel: `./${base}` };
}

async function main() {
  let userId = "";
  if (process.env.SKIP_LARK !== "1") {
    userId = resolveLarkDmUserId();
  }

  const reportDir = (process.env.COROS_WEEKLY_REPORT_DIR || path.join(os.homedir(), "coros-weekly-reports")).trim();
  const endDay = beijingCorosDate();
  const fileBase = `running-week-${endDay}`;
  const htmlPath = path.join(reportDir, `${fileBase}.html`);

  const client = new Client({ name: "coros-weekly-feishu", version: "0.1.0" });
  const transport = new StdioClientTransport({
    command: "node",
    args: ["dist/index.js"],
    cwd: ROOT,
    env: { ...process.env },
    stderr: "pipe",
  });
  if (transport.stderr) {
    transport.stderr.on("data", (c) => process.stderr.write(c));
  }

  await client.connect(transport);

  let report;
  try {
    const authResult = await client.callTool({ name: "coros_auth_status", arguments: {} });
    const auth = getToolPayload(authResult);
    if (authResult.isError || !auth?.authenticated) {
      throw new Error(
        "COROS 未登录。请先：npm run auth:browser-login 或设置 COROS_ACCESS_TOKEN / session.json",
      );
    }

    const reportResult = await client.callTool({
      name: "coros_running_week_report",
      arguments: {
        end_day: endDay,
        include_html: true,
        max_activity_details: 30,
      },
    });
    report = getToolPayload(reportResult);
    if (reportResult.isError || !report?.date_from || typeof report.html !== "string") {
      throw new Error(`coros_running_week_report 失败: ${JSON.stringify(report)}`);
    }
  } finally {
    await transport.close();
  }

  await mkdir(reportDir, { recursive: true });
  await writeFile(htmlPath, report.html, "utf8");
  console.log(JSON.stringify({ ok: true, html_path: htmlPath, bytes: report.html.length }, null, 2));

  if (process.env.SKIP_LARK === "1") {
    console.log(JSON.stringify({ lark: "skipped" }, null, 2));
    return;
  }

  let chartImages = [];
  if (shouldEmbedChartScreenshots()) {
    try {
      chartImages = await prepareChartImagesForCard(htmlPath, ROOT);
      console.log(JSON.stringify({ chart_screenshots: chartImages.length }, null, 2));
    } catch (e) {
      console.warn("Feishu 卡片内嵌图表已跳过:", e instanceof Error ? e.message : String(e));
    }
  }

  const card = buildInteractiveCard(report, chartImages);
  const cardJson = JSON.stringify(card);
  const idemSuffix = process.env.LARK_IDEM_SUFFIX?.trim() || endDay;
  const idemCard = `coros-running-week-card-${endDay}-${idemSuffix}`;
  const idemFile = `coros-running-week-file-${endDay}-${idemSuffix}`;

  runLarkSend(
    [
      "im",
      "+messages-send",
      "--as",
      "bot",
      "--user-id",
      userId,
      "--msg-type",
      "interactive",
      "--content",
      cardJson,
      "--idempotency-key",
      idemCard,
    ],
    "card",
  );

  const { cwd: fileCwd, rel: fileRel } = larkFileRelativePath(htmlPath);
  runLarkSend(
    ["im", "+messages-send", "--as", "bot", "--user-id", userId, "--file", fileRel, "--idempotency-key", idemFile],
    "file",
    { cwd: fileCwd },
  );

  console.log(JSON.stringify({ ok: true, lark: "sent", user_id: userId }, null, 2));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack ?? e.message : String(e));
  process.exit(1);
});
