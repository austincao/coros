import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

function parseToolText(result) {
  const textItem = Array.isArray(result.content)
    ? result.content.find((item) => item.type === "text" && typeof item.text === "string")
    : undefined;
  if (!textItem) return undefined;
  try {
    return JSON.parse(textItem.text);
  } catch {
    return textItem.text;
  }
}

function getToolPayload(result) {
  return result.structuredContent ?? parseToolText(result);
}

async function getFeishuToken() {
  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;
  if (!appId || !appSecret) throw new Error("FEISHU_APP_ID and FEISHU_APP_SECRET are required");

  const response = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });
  const data = await response.json();
  if (data.code !== 0) throw new Error(`Failed to get Feishu token: ${data.msg}`);
  return data.tenant_access_token;
}

async function sendFeishuCard(token, receiveId, cardData) {
  const receiveIdType = process.env.FEISHU_RECEIVE_ID_TYPE || 'open_id';
  const response = await fetch(`https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=${receiveIdType}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({
      receive_id: receiveId,
      msg_type: "interactive",
      content: JSON.stringify(cardData)
    }),
  });
  const data = await response.json();
  if (data.code !== 0) throw new Error(`Failed to send Feishu message: ${data.msg}`);
  return data;
}

async function callDashScope(reportData) {
  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) throw new Error("AI_API_KEY is required");

  // Simplified report data for AI context
  const aiData = {
    date_from: reportData.date_from,
    date_to: reportData.date_to,
    totals: reportData.totals,
    hr_time_groups: reportData.hr_time_groups_seconds,
    intensity_counts: reportData.intensity_counts,
    activities: (reportData.activities || []).map(a => ({
      date: a.date,
      name: a.name,
      km: a.distance_km,
      load: a.training_load,
      class: a.classification
    }))
  };

  const prompt = `你是一位专业的跑步教练。以下是用户最近一周的 COROS 运动数据摘要：
${JSON.stringify(aiData, null, 2)}

请根据以上数据进行分析，并提供下周的训练建议。
分析要求：
1. 总结本周的训练重点（有氧基础、强度、恢复等）。
2. 评价当前的训练负荷和心率区间分布是否合理。
3. 指出潜在的风险（如疲劳过度、加量过快、强度不足等）。
4. 针对下周给出具体的运动建议（建议包含 2-3 次具体的跑步安排，如轻松跑、阈值跑、长距离跑的建议里程和强度控制）。

回复请使用简洁的中文，直接给出核心结论和建议，不要有过多的开场白，字数控制在 500 字以内，适合手机阅读。`;

  const model = process.env.QWEN_MODEL || "tongyi-xiaomi-analysis-pro";

  const response = await fetch("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model,
      messages: [{ role: "user", content: prompt }]
    }),
  });
  const data = await response.json();
  if (!data.choices || !data.choices[0]) throw new Error(`AI API failed: ${JSON.stringify(data)}`);
  return data.choices[0].message.content;
}

async function main() {
  const client = new Client({ name: "coros-feishu-delivery", version: "0.1.0" });
  const transport = new StdioClientTransport({
    command: "node",
    args: ["dist/index.js"],
    cwd: ROOT,
  });

  await client.connect(transport);

  try {
    console.log("Fetching COROS running week report...");
    const reportResult = await client.callTool({
      name: "coros_running_week_report",
      arguments: { include_html: false, max_activity_details: 10 }
    });
    const report = getToolPayload(reportResult);
    if (reportResult.isError || !report?.date_from) throw new Error("Failed to get report");

    console.log("Generating AI analysis...");
    const aiAnalysis = await callDashScope(report);

    console.log("Preparing Feishu card...");
    const feishuToken = await getFeishuToken();
    const receiveId = process.env.FEISHU_RECEIVE_ID;
    if (!receiveId) throw new Error("FEISHU_RECEIVE_ID is required");

    const totals = report.totals;
    const intensity = report.intensity_counts;

    const card = {
      config: { wide_screen_mode: true },
      header: {
        template: "blue",
        title: { content: `🏃‍♂️ COROS 训练周报 (${report.date_from} - ${report.date_to})`, tag: "plain_text" }
      },
      elements: [
        {
          tag: "div",
          fields: [
            { is_short: true, text: { content: `**总里程:** ${totals.distance_km} km`, tag: "lark_md" } },
            { is_short: true, text: { content: `**总负荷:** ${totals.training_load}`, tag: "lark_md" } },
            { is_short: true, text: { content: `**跑步次数:** ${totals.run_count}`, tag: "lark_md" } },
            { is_short: true, text: { content: `**总时长:** ${Math.round(totals.workout_time_s / 60)} min`, tag: "lark_md" } }
          ]
        },
        { tag: "hr" },
        {
          tag: "div",
          text: {
            content: `**训练分布:**\n🟢 轻松跑: ${intensity.easy} 次 | 🟡 质量课: ${intensity.quality} 次 | 🔴 长距离: ${intensity.long} 次`,
            tag: "lark_md"
          }
        },
        { tag: "hr" },
        {
          tag: "div",
          text: { content: `**AI 教练分析与建议:**\n\n${aiAnalysis}`, tag: "lark_md" }
        },
        {
          tag: "note",
          elements: [{ content: `数据更新于: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`, tag: "plain_text" }]
        }
      ]
    };

    console.log("Sending card to Feishu...");
    await sendFeishuCard(feishuToken, receiveId, card);
    console.log("Done!");
  } finally {
    await transport.close();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
