/**
 * 周报 HTML → Playwright 截图 → 飞书机器人上传图片 → 交互卡片内嵌 img_key
 *
 * 环境变量：
 *   FEISHU_CARD_CHARTS=0  跳过截图与内嵌（仅文字卡）
 *   CHROME_EXECUTABLE_PATH  无头 Chrome 路径（可选）
 *   LARK_CLI_CONFIG_PATH    默认 ~/.lark-cli/config.json
 *
 * 项目根目录可放置 `.env.lark.local`（已 gitignore）每行 KEY=value，例如 LARK_DM_USER_ID=ou_xxx
 *
 * FEISHU_CHART_IMAGES_AS_MESSAGES=1 — 除卡片外，再逐条发送图片消息（聊天记录可见；可与卡片内图同时开，易重复）
 */

import { existsSync, readFileSync } from "node:fs";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(SCRIPT_DIR, "..");

function applyLarkLocalEnvFile() {
  const candidates = [path.join(process.cwd(), ".env.lark.local"), path.join(REPO_ROOT, ".env.lark.local")];
  for (const filePath of candidates) {
    try {
      if (!existsSync(filePath)) {
        continue;
      }
      const raw = readFileSync(filePath, "utf8");
      for (const line of raw.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) {
          continue;
        }
        const eq = trimmed.indexOf("=");
        if (eq <= 0) {
          continue;
        }
        const key = trimmed.slice(0, eq).trim();
        let val = trimmed.slice(eq + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        if (key && val !== "" && process.env[key] === undefined) {
          process.env[key] = val;
        }
      }
    } catch {
      /* ignore */
    }
  }
}

/**
 * 机器人私聊需收件人 open_id。优先级：环境变量 LARK_DM_USER_ID → `.env.lark.local` → lark-cli auth status 的 userOpenId。
 */
export function resolveLarkDmUserId() {
  applyLarkLocalEnvFile();
  const fromEnv = process.env.LARK_DM_USER_ID?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  const r = spawnSync("lark-cli", ["auth", "status"], { encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(
      `lark-cli auth status 失败。请设置 LARK_DM_USER_ID，或先执行 lark-cli auth login。\n${(r.stderr || r.stdout || "").trim()}`,
    );
  }
  let j;
  try {
    j = JSON.parse(r.stdout || "{}");
  } catch {
    throw new Error("无法解析 lark-cli auth status 输出，请设置 LARK_DM_USER_ID。");
  }
  if (j.identity !== "user" || j.tokenStatus !== "valid" || typeof j.userOpenId !== "string" || !j.userOpenId) {
    throw new Error(
      "当前没有有效的 lark-cli 用户登录，无法自动推断收件人。请执行 lark-cli auth login，或设置 LARK_DM_USER_ID（ou_ 开头）。",
    );
  }
  return j.userOpenId;
}

/** 与 render-running-week-report-html.ts 中图表容器 id 一致 */
export const DEFAULT_CHART_TARGETS = [
  { id: "ech_hr_zones", file: "hr-zones.png", label: "心率区间 · 时间占比" },
  { id: "ech_hr_groups", file: "hr-groups.png", label: "强度结构 · 有氧 / 阈值 / 高强度" },
  { id: "ech_daily", file: "daily.png", label: "每日负荷与跑量" },
  { id: "ech_pace_bars", file: "pace.png", label: "配速分布 · 距离" },
];

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

/** hover 文案：避免破坏 ![hover](img_key) 语法 */
function feishuMarkdownImgHover(text) {
  return String(text).replace(/\s+/g, " ").replace(/[[\]]/g, " ").trim() || "chart";
}

/**
 * @param {object} report - Running week payload (no html required)
 * @param {{ label: string, img_key: string }[]} chartImages
 */
export function buildInteractiveCard(report, chartImages = []) {
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

  if (chartImages.length > 0) {
    lines.push(`**下图** 为周报图表截图；**可缩放交互版**见本消息后 HTML 附件（需联网加载 ECharts）。`);
  } else {
    lines.push(`**完整图表** 见下一条消息中的 HTML 附件（需联网打开以加载图表）。`);
  }

  /** 飞书消息卡片：图片须用独立 markdown 组件 `![hover](img_key)`，勿用 tag=img（易不渲染） */
  const chartMarkdownEls = chartImages.map(({ label, img_key }) => {
    const hover = feishuMarkdownImgHover(label);
    return {
      tag: "markdown",
      content: `**${hover}**\n![${hover}](${img_key})`,
    };
  });

  const betweenSummaryAndCharts = chartMarkdownEls.length > 0 ? [{ tag: "hr" }] : [];

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
      ...betweenSummaryAndCharts,
      ...chartMarkdownEls,
      {
        tag: "note",
        elements: [{ tag: "plain_text", content: `生成时间 ${report.generated_at || ""}` }],
      },
    ],
  };
}

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function findOnPath(command) {
  const result = spawnSync("which", [command], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() || null : null;
}

export async function detectChromeExecutable() {
  const explicit = process.env.CHROME_EXECUTABLE_PATH?.trim();
  if (explicit) {
    return explicit;
  }
  const platform = process.platform;
  const darwinCandidates =
    platform === "darwin"
      ? [
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
          "/Applications/Chromium.app/Contents/MacOS/Chromium",
          "/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
        ]
      : [];
  for (const candidate of darwinCandidates) {
    if (candidate && (await pathExists(candidate))) {
      return candidate;
    }
  }
  for (const command of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]) {
    const resolved = findOnPath(command);
    if (resolved) {
      return resolved;
    }
  }
  throw new Error(
    "未找到 Chrome/Chromium。请安装浏览器或设置 CHROME_EXECUTABLE_PATH（与 coros auth:browser-login 相同）。",
  );
}

/**
 * @returns {Promise<{ id: string, file: string, label: string, path: string }[]>}
 */
export async function captureRunningWeekChartPngs(htmlPath, outDir) {
  const { mkdir } = await import("node:fs/promises");
  await mkdir(outDir, { recursive: true });
  const resolvedHtml = path.resolve(htmlPath);
  if (!(await pathExists(resolvedHtml))) {
    throw new Error(`HTML 不存在: ${resolvedHtml}`);
  }

  const executablePath = await detectChromeExecutable();
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ["--disable-dev-shm-usage", "--no-sandbox"],
  });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2,
  });

  try {
    const fileUrl = pathToFileURL(resolvedHtml).href;
    await page.goto(fileUrl, { waitUntil: "networkidle", timeout: 120000 });
    await new Promise((r) => setTimeout(r, 2000));

    const ids = DEFAULT_CHART_TARGETS.map((t) => t.id);
    await page.waitForFunction(
      (chartIds) => chartIds.every((id) => document.querySelector(`#${id} canvas`)),
      ids,
      { timeout: 90000 },
    );
    await new Promise((r) => setTimeout(r, 800));

    const results = [];
    for (const t of DEFAULT_CHART_TARGETS) {
      const loc = page.locator(`#${t.id}`);
      const outPng = path.join(outDir, t.file);
      await loc.screenshot({ path: outPng, type: "png" });
      results.push({ ...t, path: outPng });
    }
    return results;
  } finally {
    await browser.close();
  }
}

export async function uploadImageFeishuBot(pngPath) {
  const configPath = process.env.LARK_CLI_CONFIG_PATH?.trim() || path.join(os.homedir(), ".lark-cli", "config.json");
  const raw = await readFile(configPath, "utf8");
  const cfg = JSON.parse(raw);
  const appId = cfg.appId;
  const appSecret = cfg.appSecret;
  if (!appId || !appSecret) {
    throw new Error(`配置缺少 appId/appSecret: ${configPath}`);
  }
  const base = cfg.brand === "lark" ? "https://open.larksuite.com" : "https://open.feishu.cn";

  const tokenRes = await fetch(`${base}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });
  const tokenJson = await tokenRes.json();
  if (tokenJson.code !== 0) {
    throw new Error(`tenant_access_token: ${tokenJson.msg || JSON.stringify(tokenJson)}`);
  }
  const token = tokenJson.tenant_access_token;

  const buf = await readFile(pngPath);
  const form = new FormData();
  form.append("image_type", "message");
  form.append("image", new Blob([buf]), path.basename(pngPath));

  const imgRes = await fetch(`${base}/open-apis/im/v1/images`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const imgJson = await imgRes.json();
  if (imgJson.code !== 0) {
    throw new Error(`im/v1/images: ${imgJson.msg || JSON.stringify(imgJson)}`);
  }
  const imageKey = imgJson.data?.image_key;
  if (!imageKey) {
    throw new Error(`im/v1/images 无 image_key: ${JSON.stringify(imgJson)}`);
  }
  return imageKey;
}

export function shouldEmbedChartScreenshots() {
  return process.env.FEISHU_CARD_CHARTS?.trim() !== "0";
}

/** 卡片内若仍不显示图，可设 1：在卡片后再发 4 条图片消息 */
export function shouldSendChartImagesAsSeparateMessages() {
  return process.env.FEISHU_CHART_IMAGES_AS_MESSAGES?.trim() === "1";
}

/**
 * 截图并上传；不删除临时目录（便于再发 --image）
 * @returns {Promise<{ items: { label: string, img_key: string, localPath: string }[], tmpDir: string }>}
 */
export async function prepareChartImagesWithLocalPaths(htmlPath, projectRoot) {
  const { mkdir } = await import("node:fs/promises");
  await mkdir(path.join(projectRoot, "tmp"), { recursive: true });
  const tmpDir = await mkdtemp(path.join(projectRoot, "tmp", "chart-cap-"));
  const shots = await captureRunningWeekChartPngs(htmlPath, tmpDir);
  const items = [];
  for (const s of shots) {
    const img_key = await uploadImageFeishuBot(s.path);
    items.push({ label: s.label, img_key, localPath: s.path });
  }
  return { items, tmpDir };
}

export async function cleanupChartTempDir(tmpDir) {
  await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
}

/**
 * 截图、上传、删除临时目录（仅卡片内嵌、不发独立图片消息时使用）
 * @returns {Promise<{ label: string, img_key: string }[]>}
 */
export async function prepareChartImagesForCard(htmlPath, projectRoot) {
  const { items, tmpDir } = await prepareChartImagesWithLocalPaths(htmlPath, projectRoot);
  try {
    return items.map(({ label, img_key }) => ({ label, img_key }));
  } finally {
    await cleanupChartTempDir(tmpDir);
  }
}
