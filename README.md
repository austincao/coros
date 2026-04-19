# COROS Training Plan Project

## 项目目的

本次会话的目标，是把一套可执行的 COROS 跑步训练计划真正落到 COROS Training Hub 里，并验证它能正确进入日历，而不是只停留在“计划库里已创建”。

更具体地说，这次要完成的是：

- 基于既定训练结构，创建 COROS 训练课程
- 创建一个 4 周跑步训练计划
- 将该计划真正执行到 COROS 日历
- 确认训练日期与预期完全一致
- 将整个过程沉淀为可复用的方法和 skill

## 本次实际解决的问题

### 1. 训练课程和训练计划能否用接口稳定创建

结论：可以。

已验证成功的接口：

- `POST /training/program/add`
- `POST /training/plan/add`

这意味着：

- 课程创建不必依赖网页手工录入
- 计划模板创建也不必依赖网页手工点选
- 真正适合采用“浏览器登录 + 接口执行”的混合方案

### 2. “计划已创建”不等于“计划已挂到日历”

这是这次排查中最重要的区别。

我们最初已经成功创建了：

- 多个训练课程
- 一个 4 周计划模板

但在 COROS 中，计划模板存在于“计划库”里，并不会自动出现在日历上。  
也就是说：

- `training/plan/add` 只是在库里建了模板
- 真正把模板排进日历，需要额外执行一步

### 3. COROS 真正挂日历的关键动作是什么

最终确认：

- 网页里把计划拖到日历格子上
- 背后触发的是：

```text
POST /training/schedule/executeSubPlan?startDay=YYYYMMDD&subPlanId=...
```

这个接口才是“将训练计划执行到日历”的关键接口。

### 4. 如何从日历里移除一个执行错的计划

最终确认：

```text
POST /training/schedule/quitSubPlan?subPlanId=...
```

注意这里的 `subPlanId` 不是计划库里的模板 id，而是“执行后生成的执行中子计划 id”。

这个区别非常关键。

## 调研过程中踩到的坑

### 1. `training/schedule/update` 不是最终排程入口

我们验证过：

- `training/schedule/update` 可能返回成功
- 但它会静默忽略手工塞进去的 `programs` 或 `subPlans`

也就是说，不能用它来替代真正的“执行计划到日历”。

### 2. 网页操作表面成功，不代表日期正确

最开始我们抓到了 `executeSubPlan`，接口也返回了：

```json
{"message":"OK","result":"0000"}
```

但进一步查询发现，训练实际落表日期是错的。

这说明：

- 接口返回成功，只代表执行成功
- 不代表排到的是你想要的星期几

### 3. COROS 计划的 `dayNo` 是真正的排期核心

这是本次项目最关键的技术结论。

在 COROS 的计划模板里，`entities[].dayNo` 决定了每节训练相对起始日落在哪一天。

如果 `dayNo` 错了：

- 执行也会成功
- 日历也会出现训练
- 但会整体偏移到错误日期

## 本次验证出的关键规律

### 目标场景

我们最终要的是：

- 4 周计划
- 从 `2026-03-31` 开始
- 每周训练日在：周二、周四、周日

### 错误的 `dayNo`

最初模板里的：

```json
[2,4,7,9,11,14,16,18,21,23,25,28]
```

它会导致训练落在：

- 周三
- 周五
- 周一

并且最后一课会拖进第 5 周。

### 正确的 `dayNo`

最终修正后验证正确的是：

```json
[1,3,6,8,10,13,15,17,20,22,24,27]
```

这套映射在 `startDay=20260331` 时，实际落表为：

- `2026-03-31`
- `2026-04-02`
- `2026-04-05`
- `2026-04-07`
- `2026-04-09`
- `2026-04-12`
- `2026-04-14`
- `2026-04-16`
- `2026-04-19`
- `2026-04-21`
- `2026-04-23`
- `2026-04-26`

这与“周二 / 周四 / 周日”的目标完全一致。

## 本次采用的方法

### 方法论：混合方案

我们最后确认最稳的方案不是纯网页，也不是纯盲猜接口，而是：

- 浏览器负责登录、观察真实行为、抓请求
- 接口负责稳定创建、执行、校验、回滚

### 为什么不是纯 Playwright

纯 Playwright 的问题：

- 会话容易丢
- 网页状态不稳定
- 有些入口是拖拽、悬浮、弹窗组合，不适合长期依赖

### 为什么不是纯猜接口

纯猜接口的问题：

- 很容易碰到“HTTP 成功但业务没生效”
- 很容易混淆模板 id 和执行后的 sub-plan id
- 不知道网页到底触发了哪个真实请求

### 最优流程

1. 登录 COROS 网页
2. 用浏览器拿 `CPL-coros-token`
3. 用接口建课程
4. 用接口建计划模板
5. 用接口查计划详情，检查 `dayNo`
6. 用接口执行到日历
7. 用接口查日历，确认真实 `happenDay`
8. 如有偏差，退出执行中计划，修正模板，再执行

## 已验证成功的 COROS 接口

### 课程与计划

- `POST /training/program/add`
- `POST /training/plan/add`
- `POST /training/plan/query`
- `GET /training/plan/detail?supportRestExercise=1&id=...`

### 日历与执行

- `GET /training/schedule/query?startDate=YYYYMMDD&endDate=YYYYMMDD&supportRestExercise=1`
- `POST /training/schedule/executeSubPlan?startDay=YYYYMMDD&subPlanId=...`
- `POST /training/schedule/quitSubPlan?subPlanId=...`

## 最终交付结果

本次已完成的最终结果包括：

- 创建了 COROS 训练课程
- 创建了 COROS 训练计划模板
- 新建了修正版计划：
  - `半马4周30K计划-031修正`
- 将该修正版计划成功挂到日历
- 验证了起始日期和全部训练日期正确
- 将错误执行结果回滚清理

## 项目沉淀

这次调研已经被整理成一个可复用 skill 草稿：

- [coros-training-planner/SKILL.md](./coros-training-planner/SKILL.md)
- [coros-training-planner/references/coros-workflow.md](./coros-training-planner/references/coros-workflow.md)

这个 skill 里沉淀了：

- 什么时候应该触发该 skill
- 标准工作流
- 核心接口
- `dayNo` 的关键规律
- 执行后验证方法
- 错误回滚方法

## 以后如何复用这次经验

如果下个月在另一台电脑上还想继续做 COROS 训练计划，推荐这样做：

1. 带上本目录里的 `coros-training-planner`
2. 登录 COROS 网页
3. 通过 Playwright 读取 `CPL-coros-token`
4. 使用 skill 中的 API-first 流程
5. 创建后一定查询 `schedule/query` 验证真实日期

建议未来继续做两件事：

- 把 skill 再升级成一个半自动脚本
- 输入“开始日期 + 周训练结构”，自动生成 payload 并执行

## 一句话总结

这次项目真正解决的，不只是“如何在 COROS 里建计划”，而是完整搞清楚了：

- COROS 的课程怎么建
- 计划模板怎么建
- 日历到底怎么挂
- 日期为什么会错位
- 错位后怎么回滚
- 以及这整套能力怎么复用到下一次
