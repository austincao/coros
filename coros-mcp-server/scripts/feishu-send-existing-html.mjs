/**
 * 从已生成的周报 HTML 中解析内嵌的 REPORT JSON，向飞书私聊发送：
 *  1) 交互卡片（摘要，可选内嵌图表截图）
 *  2) HTML 文件附件
 *
 * 用法：
 *   export LARK_DM_USER_ID="ou_xxx"
 *   node scripts/feishu-send-existing-html.mjs path/to/report.html
 *
 * 默认路径：tmp/smoke-running-week-report.html（相对 coros-mcp-server 根目录）
 *
 * FEISHU_CARD_CHARTS=0 — 跳过 Playwright 截图与卡片内嵌图（仅文字摘要）
 *
 * LARK_DM_USER_ID — 可选；省略时若已 lark-cli auth login，则默认发给自己（auth status 的 userOpenId）
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  buildInteractiveCard,
  prepareChartImagesForCard,
  resolveLarkDmUserId,
  shouldEmbedChartScreenshots,
} from "./feishu-report-chart-assets.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

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
  const userId = resolveLarkDmUserId();

  const rel = process.argv[2] || "tmp/smoke-running-week-report.html";
  const htmlPath = path.isAbsolute(rel) ? rel : path.join(ROOT, rel);
  const html = await readFile(htmlPath, "utf8");
  const report = parseReportFromHtml(html);
  if (!report.date_from || !report.date_to) {
    throw new Error("解析到的 REPORT 缺少 date_from / date_to");
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
  console.log(JSON.stringify({ ok: true, html_path: htmlPath, chart_images: chartImages.length }, null, 2));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack ?? e.message : String(e));
  process.exit(1);
});
