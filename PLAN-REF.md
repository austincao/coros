# Daily Tech News → Feishu（私有仓库）— 实施计划

面向：**每天固定时间**汇总**过去约 24 小时**的科技类新闻，经 **Qwen** 生成简报，推送到 **飞书**。  
运行环境：**GitHub Actions（私有仓库）** + 外部 API（DashScope、飞书自建应用 OpenAPI）。

---

## 0. 已确认需求（口径冻结，coding 以此为基准）

| 维度 | 决定 |
|------|------|
| **调度与时间窗** | 每天 **08:00 `Asia/Shanghai`** 运行；**过去 24 小时**按该时区「当前时刻 − 24h」计算（与 GitHub `cron` 对齐：**UTC `0 0 * * *`** = 北京时间 08:00）。 |
| **简报语言与结构** | **中文**；共 **约 10 条**：**7 条 AI 相关** + **3 条其它科技新闻**（由模型在 prompt 中强制执行；链接来自抓取数据，禁止杜撰 URL）。 |
| **Hacker News** | **Top** 与 **Best** **都要**，合并后参与去重与时间过滤。 |
| **Reddit** | 以 **科技向子版块** 为主；默认建议配置 **`technology` + `MachineLearning`**（第二条补 AI 信号，可在 `sources.yaml` 改）。 |
| **其它网站** | 计划仍保留 **TechCrunch / The Verge** 等 RSS（与首轮规划一致），与 HN、Reddit 一并进池子后再分类筛选。 |
| **DashScope** | **国内 endpoint**：`https://dashscope.aliyuncs.com/compatible-mode/v1`（OpenAI 兼容模式；实现前以官方文档为准）。 |
| **输出** | **每条带可点击原文链接**（卡片字段或 markdown 链接，由飞书卡片模板承载）。 |
| **飞书** | **企业自建应用** + **卡片消息**（非群 Webhook）。需应用具备 **发送消息** 相关权限，以及 **tenant_access_token** 流程。 |
| **去重** | **仅本次运行内去重**（规范化 URL；不做跨天持久化）。 |
| **失败通知** | **需要**：workflow 失败时发一条**简短告警**到飞书（可与正式推送同应用、同接收方，内容用纯文本或极简卡片即可，实现时用 `if: failure()` 步骤或脚本兜底）。 |

### 0.1 仍待你补充或实现时默认的项

- **Qwen 模型档位**：未指定。建议默认 **`qwen-plus`**（质量与成本平衡），可在 Secrets 用环境变量覆盖为 `qwen-flash` 等。
- **飞书接收方**：自建应用发消息需要 **`receive_id` + `receive_id_type`**（如群 `chat_id` 或用户 `open_id`），coding 时写入 Secrets，不在仓库明文出现。
- **应用凭证**：`app_id`、`app_secret`（或飞书 CLI 等价配置）；与 **DashScope API Key** 一并放 GitHub **Actions secrets**。

---

## 1. 信源：RSS / 官方 API 是否可用（初稿，实现前需再验证 URL 可访问性）

多数「有名科技站」都有 **RSS 全文或摘要流**；没有稳定 RSS 的可用 **站点提供的 JSON/API** 或 **社区维护的 RSS 网关**。

| 来源 | 推荐接入方式 | 备注 |
|------|----------------|------|
| **Hacker News** | 官方 **Firebase API**（`item`、`topstories` 等） | 无 key、稳定；可按 `time` 过滤近 24h。社区有 **hnrss.org** 等 RSS，可作备选。 |
| **TechCrunch** | 主站 **RSS**（常见路径为 `/feed/`） | 实现前用浏览器/ `curl` 确认当前 feed URL 与字段。 |
| **The Verge** | **RSS**（站点通常提供 `rss` 或 `feed` 链接） | Vox 系站点一般有标准 RSS。 |
| **Reddit** | 子版块 **`.rss`** 或 **旧版 `.json`**（如 `reddit.com/r/xxx.json`） | 轻量只读一般可接受；频次过高可能遇限流。正式大规模应用可走 Reddit API + OAuth。 |
| **其它**（如 **Ars Technica**、**Wired**、**9to5Mac** 等） | 多数有 **RSS** | 在「信源列表」里逐条验证即可。 |

**策略**：优先 **RSS（统一解析）** + **HN 单独走 API**；Reddit 固定 1～3 个子版块即可，避免爆炸。

---

## 2. 架构草案（与额度相关）

```
GitHub Actions (schedule, 私有仓库)
  → 拉取多源条目（时间过滤 ≈ 24h）
  → 去重（URL 规范化 + 可选标题 hash）
  → 拼装 prompt → DashScope（Qwen）生成简报
  → 飞书自建应用（**卡片**消息 API）+ 失败分支告警
```

- **Actions 分钟数**：私有库按 GitHub 计费页为准；本流水线若为「轻量脚本 + 单次 LLM」，通常每月远小于常见赠送额度（避免 macOS runner、避免超长安装步骤）。
- **Qwen 费用**：与 GitHub 分开，按 DashScope 调用计费；可在计划里定「模型档位 + 每日 token 上限」。

---

## 3. 实施阶段（coding 时的建议顺序）

| 阶段 | 内容 | 产出 |
|------|------|------|
| **P0** | 定稿信源列表 + 验证每个 URL；确定时区与 24h 规则 | `sources.yaml` 或等价配置 |
| **P1** | 无 AI 的「拉取 + 过滤 + 去重 + 打印 Markdown」本地/CI 可跑通 | 可复现的 CLI |
| **P2** | 接入 DashScope（Qwen），模板化 prompt，限制输入长度与输出条数 | `summarize` 步骤 |
| **P3** | 飞书自建应用：**tenant_access_token**、**卡片**构建与发送；控制卡片元素长度 | 端到端每日 workflow |
| **P4** | `schedule`（`0 0 * * *` UTC）、失败告警 job、`workflow_dispatch`、Secrets 清单 | 可运维 |

**测试建议**：为节省 Actions 分钟，开发期以 **`workflow_dispatch`（手动触发）** 为主，定稿后再打开 **`schedule`**。

---

## 4. 仓库内建议文件布局（实现时参考，非最终定稿）

```
.github/workflows/daily-tech-news.yml   # schedule + dispatch
scripts/                                 # 或 src/
  fetchers/                              # rss.py, hackernews.py, reddit.py
  dedupe.py
  summarize_qwen.py
  feishu_card.py          # token + 卡片 JSON + send
  notify_failure.py       # 可选：独立极简告警
config/sources.yaml                      # URL 与开关
requirements.txt 或 package.json       # 择一
README.md                                # Secrets 说明与本地运行方式（coding 阶段再写）
```

---

## 5. 风险与备选

- **RSS 变更或限流**：单源失败应 **降级**（记录日志，其它源继续），避免整日不推。
- **Reddit 不稳定**：可切换为仅 RSS 源或减少子版块。
- **LLM 幻觉**：强制 **链接只能来自输入列表**；卡片渲染以结构化字段为准，必要时「标题/摘要」与「链接」分栏。
- **飞书卡片限长**：10 条 × 字段需控制字数；超限则截断摘要或拆成「主卡片 + 链接附录」。
- **私有库 Actions 额度**：若日后分钟数紧张，可考虑迁到 **自托管 runner** 或 **云函数 + 定时器**；与业务无关，可作为后期优化。

---

## 6. 下一步

需求已对齐 **第 0 节**。进入 **coding** 时顺序仍为：**P0–P1**（信源与去重）→ **P2**（Qwen 中文 7+3）→ **P3–P4**（飞书卡片 + 定时 + 失败通知）。

若你希望 **更换 Reddit 子版块** 或 **指定 Qwen 模型名**，可在开工前改 `PLAN.md` 第 0.1 节或直接在后续 `sources.yaml` / Secrets 中配置。

本文档路径：`PLAN.md`（与仓库根目录同级）。
