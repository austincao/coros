/**
 * 从已生成的周报 HTML 中解析内嵌的 REPORT JSON，向飞书私聊发送：
 *  1) 与 report:weekly-feishu 相同的交互卡片
 *  2) HTML 文件附件
 *
 * 用法：
 *   export LARK_DM_USER_ID="ou_xxx"
 *   node scripts/feishu-send-existing-html.mjs path/to/report.html
 *
 * 默认路径：tmp/smoke-running-week-report.html（相对 coros-mcp-server 根目录）
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

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

function parseReportFromHtml(html) {
  const marker = "const REPORT = ";
  const start = html.indexOf(marker);
  if (start < 0) {
    throw new Error("HTML 中未找到 const REPORT = …（请确认是 coros_running_week_report 生成的页面）");
  }
  let i = start + marker.length;
  while (html[i] === " " || html[i] === "\n" || html[i] === "\r") {
    i += 1;
  }
  if (html[i] !== "{") {
    throw new Error("REPORT 载荷不是以 { 开头");
  }
  let depth = 0;
  let inStr = false;
  let q = "";
  let esc = false;
  for (let j = i; j < html.length; j += 1) {
    const c = html[j];
    if (esc) {
      esc = false;
      continue;
    }
    if (inStr) {
      if (c === "\\") {
        esc = true;
        continue;
      }
      if (c === q) {
        inStr = false;
      }
      continue;
    }
    if (c === '"' || c === "'") {
      inStr = true;
      q = c;
      continue;
    }
    if (c === "{") {
      depth += 1;
    }
    if (c === "}") {
      depth -= 1;
      if (depth === 0) {
        return JSON.parse(html.slice(i, j + 1));
      }
    }
  }
  throw new Error("REPORT JSON 未闭合");
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

/** lark-cli --file 仅允许「当前目录下」的相对路径；必要时切换 cwd 到文件所在目录 */
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
  const userId = process.env.LARK_DM_USER_ID?.trim();
  if (!userId) {
    throw new Error("请设置环境变量 LARK_DM_USER_ID（飞书用户 open_id，ou_ 开头）");
  }

  const rel = process.argv[2] || "tmp/smoke-running-week-report.html";
  const htmlPath = path.isAbsolute(rel) ? rel : path.join(ROOT, rel);
  const html = await readFile(htmlPath, "utf8");
  const report = parseReportFromHtml(html);
  if (!report.date_from || !report.date_to) {
    throw new Error("解析到的 REPORT 缺少 date_from / date_to");
  }

  const card = buildInteractiveCard(report);
  const endDay = String(report.date_to);
  const idemSuffix = process.env.LARK_IDEM_SUFFIX?.trim() || "resend";
  const idemCard = `coros-running-week-card-${endDay}-${idemSuffix}`;
  const idemFile = `coros-running-week-file-${endDay}-${idemSuffix}`;

  const cardOut = runLarkSend(
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
      JSON.stringify(card),
      "--idempotency-key",
      idemCard,
    ],
    "card",
  );
  console.log("card:", cardOut);

  const { cwd: fileCwd, rel: fileRel } = larkFileRelativePath(htmlPath);
  const fileOut = runLarkSend(
    [
      "im",
      "+messages-send",
      "--as",
      "bot",
      "--user-id",
      userId,
      "--file",
      fileRel,
      "--idempotency-key",
      idemFile,
    ],
    "file",
    { cwd: fileCwd },
  );
  console.log("file:", fileOut);
  console.log(JSON.stringify({ ok: true, html_path: htmlPath }, null, 2));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack ?? e.message : String(e));
  process.exit(1);
});
