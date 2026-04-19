# COROS MCP Tool Schemas

## 目标

这份文档把 `coros-mcp-server` 第一批核心工具的输入输出规格固定下来，作为后续实现的接口契约。

本批次覆盖训练计划主链路：

- 登录态检查
- 用户能力读取
- 训练课程创建
- 训练计划创建
- 计划详情查看
- 计划日期校验
- 计划执行到日历
- 执行计划回滚

## 设计约定

### 通用原则

- 输入尽量结构化
- 输出默认返回高价值字段，不直接透传整段原始 COROS JSON
- 如需要原始 COROS 返回，可统一支持 `raw: true`

### 日期格式

统一使用：

- `YYYYMMDD`

例如：

- `20260331`

### ID 命名约定

- `program_id`: 训练课程 id
- `plan_id`: 计划模板 id
- `executed_subplan_id`: 执行后生成的子计划 id

不要混用。

### 通用错误对象

建议所有工具统一支持如下错误结构：

```json
{
  "ok": false,
  "error": {
    "code": "AUTH_REQUIRED",
    "message": "COROS login is required",
    "details": {}
  }
}
```

建议错误码集合：

- `AUTH_REQUIRED`
- `TOKEN_INVALID`
- `PROFILE_UNAVAILABLE`
- `PROGRAM_CREATE_FAILED`
- `PLAN_CREATE_FAILED`
- `PLAN_NOT_FOUND`
- `INVALID_DAY_NO`
- `EXECUTION_FAILED`
- `EXECUTION_SUCCEEDED_BUT_DATES_SHIFTED`
- `EXECUTED_SUBPLAN_NOT_FOUND`
- `QUIT_FAILED`

## 1. `coros_auth_status`

### 用途

检查当前是否有可用的 COROS 登录态。

### Input

```json
{
  "raw": false
}
```

### Output

```json
{
  "ok": true,
  "authenticated": true,
  "user_id": "467348415202738190",
  "nickname": "Austin",
  "region": 2,
  "raw": null
}
```

### 说明

- 内部可通过 token + `account/query` 验证
- 若未登录，返回 `authenticated: false`

## 2. `coros_get_profile`

### 用途

读取用户基础训练能力参数，供计划生成和活动分析使用。

### Input

```json
{
  "raw": false
}
```

### Output

```json
{
  "ok": true,
  "user_id": "467348415202738190",
  "nickname": "Austin",
  "max_hr": 184,
  "resting_hr": 53,
  "lthr": 163,
  "lt_pace_sec_per_km": 306,
  "pace_zones": [
    { "index": 0, "pace_sec_per_km": 438 },
    { "index": 1, "pace_sec_per_km": 375 },
    { "index": 2, "pace_sec_per_km": 333 },
    { "index": 3, "pace_sec_per_km": 306 },
    { "index": 4, "pace_sec_per_km": 300 },
    { "index": 5, "pace_sec_per_km": 269 },
    { "index": 6, "pace_sec_per_km": 153 }
  ],
  "raw": null
}
```

### 最小实现要求

- 至少返回 `max_hr`, `resting_hr`, `lthr`, `lt_pace_sec_per_km`

## 3. `coros_create_workout`

### 用途

创建单个训练课程。

### Input

```json
{
  "name": "W1 E8 Easy",
  "overview": "Week 1 easy run",
  "sport_type": "run",
  "segments": [
    {
      "type": "warmup",
      "target_type": "distance",
      "target_value": 100000,
      "intensity_type": "pace_range",
      "intensity": {
        "from_sec_per_km": 370,
        "to_sec_per_km": 410
      }
    },
    {
      "type": "main",
      "target_type": "distance",
      "target_value": 600000,
      "intensity_type": "pace_range",
      "intensity": {
        "from_sec_per_km": 370,
        "to_sec_per_km": 410
      }
    },
    {
      "type": "cooldown",
      "target_type": "distance",
      "target_value": 100000,
      "intensity_type": "pace_range",
      "intensity": {
        "from_sec_per_km": 370,
        "to_sec_per_km": 410
      }
    }
  ],
  "raw": false
}
```

### Output

```json
{
  "ok": true,
  "program_id": "476418553445269803",
  "name": "W1 E8 Easy",
  "overview": "Week 1 easy run",
  "sport_type": "run",
  "raw": null
}
```

### 服务端校验建议

- `name` 非空
- `segments` 非空
- `sport_type` 第一版可先只支持 `run`
- `target_value` 必须大于 0

## 4. `coros_create_plan`

### 用途

创建多周训练计划模板。

### Input

```json
{
  "name": "HM 4-week block",
  "overview": "4-week half marathon block",
  "total_weeks": 4,
  "total_day": 28,
  "entries": [
    { "day_no": 1, "program_id": "p1" },
    { "day_no": 3, "program_id": "p2" },
    { "day_no": 6, "program_id": "p3" }
  ],
  "raw": false
}
```

### Output

```json
{
  "ok": true,
  "plan_id": "476429703455096932",
  "name": "HM 4-week block",
  "overview": "4-week half marathon block",
  "total_weeks": 4,
  "total_day": 28,
  "entry_count": 3,
  "raw": null
}
```

### 服务端校验建议

- `entries` 至少 1 条
- `day_no` 必须在 `1..total_day` 范围内
- `day_no` 不应重复
- `entries` 按 `day_no` 排序
- `total_weeks * 7 >= total_day`

## 5. `coros_get_plan_detail`

### 用途

读取计划模板详情。

### Input

```json
{
  "plan_id": "476429703455096932",
  "raw": false
}
```

### Output

```json
{
  "ok": true,
  "plan_id": "476429703455096932",
  "name": "HM 4-week block",
  "overview": "4-week half marathon block",
  "total_weeks": 4,
  "total_day": 28,
  "entries": [
    { "id_in_plan": "1", "day_no": 1, "program_id": "p1", "program_name": "W1 E8 Easy" },
    { "id_in_plan": "2", "day_no": 3, "program_id": "p2", "program_name": "W1 T10 Threshold" },
    { "id_in_plan": "3", "day_no": 6, "program_id": "p3", "program_name": "W1 L12 Long" }
  ],
  "raw": null
}
```

### 最小实现要求

- 返回 `entries[].day_no`
- 返回 `entries[].program_name`

## 6. `coros_validate_plan_dates`

### 用途

根据模板 `dayNo` 和给定 `start_day`，预测计划执行后将落到哪些日期。

### Input

```json
{
  "plan_id": "476429703455096932",
  "start_day": "20260331",
  "expected_weekdays": [2, 4, 7],
  "raw": false
}
```

### 星期定义

- `1 = Monday`
- `2 = Tuesday`
- `3 = Wednesday`
- `4 = Thursday`
- `5 = Friday`
- `6 = Saturday`
- `7 = Sunday`

### Output

```json
{
  "ok": true,
  "plan_id": "476429703455096932",
  "start_day": "20260331",
  "predicted_dates": [
    { "day_no": 1, "date": "20260331", "weekday": 2, "program_name": "W1 E8 Easy" },
    { "day_no": 3, "date": "20260402", "weekday": 4, "program_name": "W1 T10 Threshold" },
    { "day_no": 6, "date": "20260405", "weekday": 7, "program_name": "W1 L12 Long" }
  ],
  "weekday_match": true,
  "mismatch_count": 0,
  "raw": null
}
```

### 说明

- 这是很重要的防错 tool
- 即使不真正执行，也能提前发现 `dayNo` 是否会错位

## 7. `coros_execute_plan`

### 用途

把计划模板真正执行到日历，并可选自动验证实际落表日期。

### Input

```json
{
  "plan_id": "476429703455096932",
  "start_day": "20260331",
  "verify": true,
  "expected_weekdays": [2, 4, 7],
  "raw": false
}
```

### Output

```json
{
  "ok": true,
  "plan_id": "476429703455096932",
  "executed_subplan_id": "476430191196029027",
  "start_day": "20260331",
  "execution_result": "0000",
  "verified": true,
  "actual_dates": [
    { "id_in_plan": "1", "date": "20260331", "weekday": 2, "program_name": "W1 E8 Easy" },
    { "id_in_plan": "2", "date": "20260402", "weekday": 4, "program_name": "W1 T10 Threshold" },
    { "id_in_plan": "3", "date": "20260405", "weekday": 7, "program_name": "W1 L12 Long" }
  ],
  "weekday_match": true,
  "raw": null
}
```

### 内部建议流程

1. 调用 `executeSubPlan`
2. 查询 `schedule`
3. 定位新产生的 `executed_subplan_id`
4. 提取 `actual_dates`
5. 如果提供了 `expected_weekdays`，做匹配校验

### 特殊错误建议

如果执行成功但日期错误，建议返回：

```json
{
  "ok": false,
  "error": {
    "code": "EXECUTION_SUCCEEDED_BUT_DATES_SHIFTED",
    "message": "Plan executed, but actual scheduled dates do not match expected weekdays",
    "details": {
      "executed_subplan_id": "476430191196029027"
    }
  }
}
```

## 8. `coros_quit_executed_plan`

### 用途

退出一个执行中的计划，用于回滚。

### Input

```json
{
  "executed_subplan_id": "476430191196029027",
  "raw": false
}
```

### Output

```json
{
  "ok": true,
  "executed_subplan_id": "476430191196029027",
  "quit_result": "0000",
  "raw": null
}
```

## 推荐实现顺序

### 第一优先级

- `coros_auth_status`
- `coros_get_profile`
- `coros_get_plan_detail`
- `coros_validate_plan_dates`

原因：

- 读操作先跑通，最容易验证

### 第二优先级

- `coros_create_workout`
- `coros_create_plan`

原因：

- 有了读操作和校验，写操作更容易防错

### 第三优先级

- `coros_execute_plan`
- `coros_quit_executed_plan`

原因：

- 执行与回滚是最敏感的动作，最好在前面能力稳定后再接入

## 一句话总结

这 8 个 tool schema 已经足够把这次验证成功的 COROS 训练计划全链路，转成一套真正可实现、可复用、可校验、可回滚的 MCP 接口契约。
