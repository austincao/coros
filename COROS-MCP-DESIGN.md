# COROS MCP Server Design

## 目标

把这次已经验证过的 COROS 能力，从“skill + Playwright + 直连接口”的形态，升级成一个更标准、可复用、可共享的 `coros-mcp-server` 设计。

这个 MCP 的目标不是替代所有 skill，而是作为底层工具层，让上层 skill、代理、客户端都能用统一方式调用 COROS 能力。

## 为什么值得做 MCP

我们这次已经确认：

- COROS 的课程创建、计划创建、计划执行、回滚、周数据查询都可以通过接口完成
- 真正困难的部分不是“有没有能力”，而是“怎么把这些能力稳定封装起来”

MCP 化之后的好处：

- 上层不需要再关心底层接口名
- 上层不需要反复手写 `curl`
- 登录态、token、校验、回滚可以统一封装
- 训练计划 skill 和活动分析 skill 可以共享同一套底层工具
- 更适合以后换电脑、换客户端、或者分享给朋友/团队

## 与当前方案的关系

当前方案：

- Playwright：负责登录、取 token、观察网页行为
- 直连 COROS API：负责写入、执行、查询、回滚
- Skill：负责工作流和经验沉淀

未来 MCP 方案：

- Playwright：只保留为登录辅助和极少数 UI 探测手段
- MCP Server：成为 COROS 结构化能力入口
- Skill：从“教 AI 怎么一步步做”变成“组合 MCP 工具完成业务目标”

一句话说：

- Skill 是“流程知识”
- MCP 是“标准工具接口”

## 设计原则

### 1. 认证与业务分层

不要让每个 tool 都直接暴露 token 细节。  
应该把 token 获取、缓存、检查失效、重登录提示统一封装。

### 2. 业务保护优先

不能只提供“原始接口透传”。

必须把这次踩过的坑固化进去：

- `schedule/update` 不能代替真正的计划执行
- `dayNo` 是排期正确性的核心
- 执行成功不代表日期正确
- 错误执行必须支持回滚

### 3. 先做“够用的窄接口”

第一版不要追求覆盖 COROS 全部能力，优先覆盖已经验证成功的场景：

- 建训练课程
- 建训练计划
- 执行到日历
- 查询日历
- 回滚执行
- 读取近期活动摘要

### 4. 区分模板 ID 和执行中子计划 ID

要在 schema 和命名上明确区分：

- `plan_id`: 计划库中的模板 id
- `executed_subplan_id`: 执行后生成的子计划 id

否则上层很容易误用。

## 系统分层

### A. Session / Auth Layer

职责：

- 管理 COROS 登录态
- 提供 token 读取与可用性校验
- 必要时提示用户登录

建议能力：

- 从 Playwright 浏览器会话读取 `CPL-coros-token`
- 或从本地安全存储读取已缓存 token
- 调用 `account/query` 检查 token 是否有效

建议内部接口：

- `getAccessToken()`
- `validateAccessToken()`
- `ensureAuthenticated()`

### B. COROS API Client Layer

职责：

- 封装底层 HTTP 请求
- 处理 header、错误码、重试、日志

建议内部接口：

- `request(path, method, params?, body?)`
- `getAccount()`
- `addProgram()`
- `addPlan()`
- `getPlanDetail()`
- `querySchedule()`
- `executeSubPlan()`
- `quitSubPlan()`

### C. Domain Services Layer

职责：

- 用领域语言封装业务逻辑
- 做输入校验和业务保护

建议服务：

- `WorkoutService`
- `PlanService`
- `ScheduleService`
- `ActivityService`
- `AnalysisService`

### D. MCP Tools Layer

职责：

- 向外暴露稳定的 tool schema
- 保持输入输出清晰、简洁、强约束

## 建议的 MCP Tools

### 1. `coros_auth_status`

用途：

- 检查当前是否已有可用登录态

输出建议：

```json
{
  "authenticated": true,
  "user_id": "467348415202738190",
  "nickname": "Austin"
}
```

### 2. `coros_get_profile`

用途：

- 获取基础跑步能力参数

建议返回：

- max HR
- resting HR
- LTHR
- LT pace
- 配速分区数据

适用于后续分析和计划生成。

### 3. `coros_create_workout`

用途：

- 创建单个训练课程

输入建议：

```json
{
  "name": "W1 E8 Easy",
  "overview": "Week 1 easy run",
  "sport_type": "run",
  "segments": []
}
```

输出建议：

```json
{
  "program_id": "..."
}
```

### 4. `coros_create_plan`

用途：

- 创建多周训练计划模板

输入建议：

```json
{
  "name": "HM 4-week block",
  "overview": "4-week half marathon block",
  "total_weeks": 4,
  "total_day": 28,
  "entries": [
    {
      "day_no": 1,
      "program_id": "..."
    }
  ]
}
```

重要要求：

- 在服务端校验 `day_no` 合法性
- 返回计划模板 id

### 5. `coros_get_plan_detail`

用途：

- 查看计划模板内容

建议返回：

- 计划元信息
- `entities[].dayNo`
- `programs[].name`
- `totalWeeks`
- `totalDay`

### 6. `coros_validate_plan_dates`

用途：

- 根据 `start_day` 和模板 `dayNo` 预估计划将落在哪些日期

这是非常值得单独做的 tool，因为它可以在执行前发现排期错误。

输入建议：

```json
{
  "plan_id": "...",
  "start_day": "20260331"
}
```

输出建议：

```json
{
  "predicted_dates": [
    "2026-03-31",
    "2026-04-02",
    "2026-04-05"
  ]
}
```

### 7. `coros_execute_plan`

用途：

- 把计划模板真正挂到日历

输入建议：

```json
{
  "plan_id": "...",
  "start_day": "20260331",
  "verify": true
}
```

内部行为建议：

1. 调用 `executeSubPlan`
2. 再查询 `schedule`
3. 自动比对实际 `happenDay`
4. 把执行结果和验证结果一起返回

输出建议：

```json
{
  "executed_subplan_id": "...",
  "result": "ok",
  "verified": true,
  "actual_dates": [
    "2026-03-31",
    "2026-04-02",
    "2026-04-05"
  ]
}
```

### 8. `coros_quit_executed_plan`

用途：

- 回滚一个执行中的计划

输入建议：

```json
{
  "executed_subplan_id": "..."
}
```

### 9. `coros_get_schedule`

用途：

- 查询某个时间范围内的计划和训练安排

输入建议：

```json
{
  "start_date": "20260330",
  "end_date": "20260427"
}
```

### 10. `coros_list_recent_activities`

用途：

- 获取近 7 天或 28 天活动摘要

建议返回：

- 日期
- 运动类型
- 距离
- 时长
- 配速
- 训练负荷

### 11. `coros_get_activity_summary`

用途：

- 获取某条活动的详情摘要

如果后端接口不方便，第一版也可以允许 MCP 内部走 Playwright 页面读取。

### 12. `coros_analyze_recent_week`

用途：

- 直接给出最近 7 天训练结构分析

这是高层工具，可以基于 `list_recent_activities + profile` 组合得出。

建议输出：

- 结论
- 证据
- 风险
- 建议

## 关键业务保护

### 1. 执行前校验 `dayNo`

服务端应在执行前支持：

- 读取计划详情
- 计算预测日期
- 检查是否符合目标星期模式

### 2. 执行后自动验证

执行不应只返回 COROS 原始 `0000`。

更好的行为：

- 执行后自动查询 `schedule`
- 自动提取 `happenDay`
- 返回“执行成功但日期错位”这种更真实的业务状态

### 3. 回滚能力必须是一等公民

不要把回滚当作附属功能。  
这次项目已经证明，回滚是核心能力之一。

### 4. 明确错误分类

建议区分：

- `AUTH_REQUIRED`
- `TOKEN_INVALID`
- `PLAN_NOT_FOUND`
- `EXECUTION_SUCCEEDED_BUT_DATES_SHIFTED`
- `EXECUTED_SUBPLAN_NOT_FOUND`
- `UNSUPPORTED_COROS_RESPONSE`

## 建议的输入输出风格

MCP tools 的输出要尽量结构化，避免把大段原始 COROS JSON 原样透出。

建议：

- 默认返回高价值字段
- 支持 `raw: true` 时再返回原始响应

这样更适合上层 skill 和 agent 消费。

## 与现有两个 skill 的关系

### `coros-training-planner`

未来应从：

- Playwright + curl + 经验规则

升级为：

- 调用 `coros_create_workout`
- 调用 `coros_create_plan`
- 调用 `coros_validate_plan_dates`
- 调用 `coros_execute_plan`
- 必要时调用 `coros_quit_executed_plan`

### `coros-activity-analyst`

未来应从：

- 页面读取 + 手工结构化 + 规则分析

升级为：

- 调用 `coros_list_recent_activities`
- 调用 `coros_get_activity_summary`
- 调用 `coros_get_profile`
- 必要时调用 `coros_analyze_recent_week`

## 实现优先级建议

### Phase 1: 最小可用版

- `coros_auth_status`
- `coros_get_profile`
- `coros_create_workout`
- `coros_create_plan`
- `coros_get_plan_detail`
- `coros_execute_plan`
- `coros_quit_executed_plan`
- `coros_get_schedule`

目标：

- 完整覆盖训练计划创建与挂历能力

### Phase 2: 分析增强版

- `coros_list_recent_activities`
- `coros_get_activity_summary`
- `coros_analyze_recent_week`

目标：

- 覆盖短周期训练分析

### Phase 3: 体验增强

- token 缓存与失效恢复
- 页面读取后备方案
- 更智能的日期模式校验
- 训练计划模板克隆与修正

## 推荐技术实现

如果你准备自己实现，推荐：

- Node.js / TypeScript
- 一个轻量 HTTP MCP server
- 内部封装 COROS API client
- 可选 Playwright sidecar 用于读取登录态或后备页面抓取

目录建议：

```text
coros-mcp-server/
├── src/
│   ├── auth/
│   ├── client/
│   ├── services/
│   ├── tools/
│   └── index.ts
├── docs/
│   └── tool-schemas.md
└── package.json
```

## 一句话总结

如果说这次我们已经完成了“把 COROS 能力跑通”，  
那 `coros-mcp-server` 的意义，就是把这些已验证能力从“人工可操作方案”升级成“可标准调用的平台能力”。
