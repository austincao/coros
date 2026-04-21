/**
 * 生成最近 7 天跑步周报 HTML（COROS），落盘后用 lark-cli 发到飞书私聊：
 *  1) 交互卡片（摘要）
 *  2) HTML 文件附件
 *
 * 依赖：已 build（dist/）、本机已登录 COROS（session 或 COROS_ACCESS_TOKEN）、
 *       飞书应用机器人已与你在私聊中建立会话（可先给机器人发一条消息）。
 *
 * 环境变量（必填）：
 *   LARK_DM_USER_ID   你的 open_id（ou_xxx），与 lark-cli im +messages-send --user-id 一致
 *
 * 环境变量（可选）：
 *   COROS_WEEKLY_REPORT_DIR   报告目录，默认 ~/coros-weekly-reports
 *   SKIP_LARK=1               只写 HTML，不发飞书
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

function fmtCorosDate(d) {
  const s = String(d);
  if (s.length !== 8) {
    return s;
  }
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

function secToHrMin(sec) {
  const m = Math.round(sec / 60);
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}h${m % 60}m`;
  }
  return `${m}min`;
}

function buildInteractiveCard(report) {
  const z = report.hr_zones_seconds || {};
  const zSum = ["z1", "z2", "z3", "z4", "z5"].reduce((s, k) => s + (z[k] || 0), 0);
  const g = report.hr_time_groups_seconds || {};
  const gSum = (g.aerobic_base || 0) + (g.threshold || 0) + (g.high_intensity || 0);
  const te = report.training_effect;

  const lines = [
    `**统计周期** ${fmtCorosDate(report.date_from)} → ${fmtCorosDate(report.date_to)}`,
    `**跑次** ${report.totals.run_count}　**距离** ${report.totals.distance_km} km　**负荷** ${report.totals.training_load}`,
    `**课型（节数）** 轻松 ${report.intensity_counts.easy} · 质量 ${report.intensity_counts.quality} · 长距离 ${report.intensity_counts.long}`,
  ];

  if (zSum > 0) {
    lines.push(
      `**心率时间** Z1–Z5 合计 ${secToHrMin(zSum)}（Z1 ${secToHrMin(z.z1)} · Z2 ${secToHrMin(z.z2)} · Z3 ${secToHrMin(z.z3)} · Z4 ${secToHrMin(z.z4)} · Z5 ${secToHrMin(z.z5)}）`,
    );
  }
  if (gSum > 0) {
    lines.push(
      `**强度结构** 有氧基础 ${secToHrMin(g.aerobic_base)} · 阈值/混氧 ${secToHrMin(g.threshold)} · 高强度 ${secToHrMin(g.high_intensity)}`,
    );
  }
  if (te && te.sessions_count > 0) {
    lines.push(`**COROS TE（${te.sessions_count} 场详情）** 有氧 ${te.aerobic_sum} · 无氧 ${te.anaerobic_sum}`);
  }

  lines.push(`**完整图表** 见下一条消息中的 HTML 附件（需联网打开以加载图表）。`);

  return {
    config: { wide_screen_mode: true },
    header: {
      template: "blue",
      title: { tag: "plain_text", content: `跑步周报 · ${fmtCorosDate(report.date_to)}` },
    },
    elements: [
      {
        tag: "div",
        text: { tag: "lark_md", content: lines.join("\n\n") },
      },
      {
        tag: "note",
        elements: [{ tag: "plain_text", content: `生成时间 ${report.generated_at || ""}` }],
      },
    ],
  };
}

function runLarkSend(args, label) {
  const r = spawnSync("lark-cli", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (r.status !== 0) {
    const err = (r.stderr || r.stdout || "").trim() || `exit ${r.status}`;
    throw new Error(`lark-cli ${label} failed: ${err}`);
  }
  return (r.stdout || "").trim();
}

async function main() {
  const userId = process.env.LARK_DM_USER_ID?.trim();
  if (!userId && process.env.SKIP_LARK !== "1") {
    throw new Error("Set LARK_DM_USER_ID (your Feishu open_id ou_xxx) or SKIP_LARK=1 to only write HTML.");
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

  const card = buildInteractiveCard(report);
  const cardJson = JSON.stringify(card);
  const idemCard = `coros-running-week-card-${endDay}`;
  const idemFile = `coros-running-week-file-${endDay}`;

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

  runLarkSend(
    ["im", "+messages-send", "--as", "bot", "--user-id", userId, "--file", htmlPath, "--idempotency-key", idemFile],
    "file",
  );

  console.log(JSON.stringify({ ok: true, lark: "sent", user_id: userId }, null, 2));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack ?? e.message : String(e));
  process.exit(1);
});
