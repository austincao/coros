/**
 * 参考运营活动卡片版式：绿头 + 大图 + 多段文案（图片经 im/v1/images 上传得 img_key）。
 *
 * 用法：
 *   node scripts/feishu-send-sample-image-card.mjs
 *   node scripts/feishu-send-sample-image-card.mjs path/to/hero.png
 *
 * 收件人：LARK_DM_USER_ID 或 .env.lark.local，或 lark-cli auth login 的 userOpenId。
 */

import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { uploadImageFeishuBot, resolveLarkDmUserId } from "./feishu-report-chart-assets.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** 1×1 PNG，未传参时使用 */
const MINI_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

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

/**
 * 大图用 markdown `![](img_key)`（与周报脚本一致，客户端可见性较好）。
 * 可选：`tag: img` 作为补充（部分端表现不一致）。
 */
function buildDemoCard(imgKey, { useImgTag } = {}) {
  const hover = "活动头图";
  const elements = [
    {
      tag: "markdown",
      content: `![${hover}](${imgKey})`,
    },
  ];
  if (useImgTag) {
    elements.push({
      tag: "img",
      img_key: imgKey,
      alt: { tag: "plain_text", content: hover },
      title: { tag: "plain_text", content: hover },
      mode: "fit_horizontal",
      preview: true,
    });
  }
  elements.push(
    { tag: "hr" },
    {
      tag: "div",
      text: {
        tag: "lark_md",
        content: "⏰ **活动时间**：2026年4月23日",
      },
    },
    {
      tag: "div",
      text: {
        tag: "lark_md",
        content: "📍 **活动地点**：18 楼前台",
      },
    },
    {
      tag: "div",
      text: {
        tag: "lark_md",
        content: "🎮 **玩法攻略**",
      },
    },
    {
      tag: "div",
      text: {
        tag: "lark_md",
        content:
          "📌 **第一步：打卡书谜墙**\n\n到书谜墙前完成打卡，领取当日谜面。\n\n📌 **第二步：扫码解锁机会**\n\n扫描现场二维码，提交答案参与抽奖。",
      },
    },
  );

  return {
    config: { wide_screen_mode: true },
    header: {
      template: "green",
      title: {
        tag: "plain_text",
        content: "趣味猜书名 · 读书日脑力大作战（示例卡片）",
      },
    },
    elements,
  };
}

async function main() {
  const userId = resolveLarkDmUserId();
  let pngPath = process.argv[2];
  let tmpDir = null;
  if (!pngPath) {
    tmpDir = mkdtempSync(path.join(tmpdir(), "feishu-demo-card-"));
    pngPath = path.join(tmpDir, "hero.png");
    writeFileSync(pngPath, MINI_PNG);
  } else {
    pngPath = path.resolve(pngPath);
  }

  const useImgTag = process.env.FEISHU_SAMPLE_CARD_IMG_TAG === "1";
  const idem = process.env.LARK_IDEM_SUFFIX?.trim() || `sample-img-${Date.now()}`;

  try {
    const imgKey = await uploadImageFeishuBot(pngPath);
    console.error(JSON.stringify({ feishu_sample_card: true, img_key: imgKey, useImgTag }));
    const card = buildDemoCard(imgKey, { useImgTag });
    const out = runLarkSend(
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
        `coros-sample-image-card-${idem}`,
      ],
      "interactive-card",
    );
    console.log(out);
  } finally {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
