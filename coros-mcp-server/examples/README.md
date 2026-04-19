# Examples

This document is written from the user's point of view.

If you already have `coros-mcp-server` running as an MCP server, these are the most common calls you are likely to make.

## Before You Start

Make sure:

- you are logged into COROS on the web
- you have a valid `COROS_ACCESS_TOKEN`
- the server is built and available via `node dist/index.js`

## 1. Check Login Status

Question:

- "Is my COROS session valid?"

Tool:

- `coros_auth_status`

Example arguments:

```json
{}
```

Example result:

```json
{
  "authenticated": true,
  "user_id": "123456789012345678",
  "nickname": "Runner",
  "region": 2
}
```

## 2. Read My Running Profile

Question:

- "What are my current threshold and zones?"

Tool:

- `coros_get_profile`

Example arguments:

```json
{}
```

Example result:

```json
{
  "user_id": "123456789012345678",
  "nickname": "Runner",
  "max_hr": 184,
  "resting_hr": 53,
  "lthr": 163,
  "lt_pace_sec_per_km": 306,
  "pace_zones": [
    { "index": 0, "pace_sec_per_km": 438 },
    { "index": 1, "pace_sec_per_km": 375 },
    { "index": 2, "pace_sec_per_km": 333 },
    { "index": 3, "pace_sec_per_km": 306 }
  ]
}
```

## 3. List Recent Activities

Question:

- "Show me what I did in the last week"

Tool:

- `coros_list_activities`

Example arguments:

```json
{
  "date_from": "20260324",
  "date_to": "20260330",
  "page_size": 20,
  "max_pages": 2
}
```

Example result:

```json
{
  "total_available": 294,
  "total_pages": 147,
  "page_number": 1,
  "page_size": 20,
  "pages_fetched": 1,
  "activities": [
    {
      "label_id": "476406894762688515",
      "sport_type": 100,
      "name": "北京市 跑步",
      "date": "20260329",
      "distance_km": 15,
      "total_time_s": 8794,
      "training_load": 148
    },
    {
      "label_id": "476334520268783921",
      "sport_type": 100,
      "name": "北京市 跑步",
      "date": "20260326",
      "distance_km": 5.6,
      "total_time_s": 2391,
      "training_load": 99
    }
  ]
}
```

### Filter by Sport Type

Question:

- "Show me only recent running activities"

Example arguments:

```json
{
  "date_from": "20260324",
  "date_to": "20260330",
  "sport_types": [100, 101]
}
```

## 4. Get One Activity in Detail

Question:

- "Give me the details of this long run"

Tool:

- `coros_get_activity_detail`

Example arguments:

```json
{
  "label_id": "476406894762688515",
  "sport_type": 100
}
```

Example result:

```json
{
  "label_id": "476406894762688515",
  "sport_type": 100,
  "name": "北京市 跑步",
  "distance_km": 15,
  "total_time_s": 6501.03,
  "training_load": 148,
  "avg_hr": 132,
  "max_hr": 149,
  "avg_cadence": 168,
  "aerobic_effect": 3.4,
  "anaerobic_effect": 0.7,
  "current_vo2_max": 48,
  "laps": [
    {
      "lap_index": 1,
      "distance_m": 1000,
      "time_s": 443.02,
      "avg_hr": 116
    }
  ]
}
```

## 5. Analyze a Single Activity

Question:

- "Did I run this session correctly?"

Tool:

- `coros_analyze_activity`

Example arguments:

```json
{
  "label_id": "476406894762688515",
  "sport_type": 100
}
```

Example result:

```json
{
  "label_id": "476406894762688515",
  "activity_type": "long_run",
  "conclusion": "这是一节比较稳的长跑，结构和强度都比较合理。",
  "evidence": [
    "距离 15km，属于长距离范畴",
    "训练负荷 148",
    "平均心率 132，最大心率 149"
  ],
  "risks": [],
  "suggestions": [
    "这类长跑值得保留，后续可以作为半马备赛周的核心课继续推进"
  ]
}
```

## 6. Analyze the Recent Week

Question:

- "How did I train this week?"

Tool:

- `coros_analyze_recent_week`

Example arguments:

```json
{
  "end_day": "20260330"
}
```

Example result:

```json
{
  "date_from": "20260324",
  "date_to": "20260330",
  "totals": {
    "activity_count": 6,
    "run_count": 3,
    "run_distance_km": 25.85,
    "run_training_load": 308
  },
  "distribution": {
    "long_run_count": 1,
    "quality_run_count": 0,
    "easy_run_count": 2
  },
  "conclusion": "这一周更偏基础有氧和耐力，跑步结构稳，但专项质量刺激偏少。",
  "risks": [
    "如果目标是半马提升，本周缺少明确的阈值或质量课",
    "跑步和力量叠加较多，恢复压力会高于表面训练量"
  ],
  "suggestions": [
    "下周优先恢复 1 次明确的专项质量课，而不是继续只堆总量"
  ]
}
```

## 7. Compare Recent Load vs Baseline

Question:

- "Am I undertraining or overreaching compared with baseline?"

Tool:

- `coros_analyze_training_balance`

Example arguments:

```json
{
  "end_day": "20260330",
  "recent_days": 7,
  "baseline_days": 21
}
```

Example result:

```json
{
  "recent_window": {
    "run_count": 3,
    "run_distance_km": 25.85,
    "run_training_load": 308
  },
  "baseline_window": {
    "run_count": 12,
    "run_distance_km": 112.44,
    "run_training_load": 1904
  },
  "comparison": {
    "load_ratio": 0.49,
    "distance_ratio": 0.69,
    "run_count_ratio": 0.75
  },
  "conclusion": "近期训练负荷低于基线，整体更像恢复或偏保守的一段。"
}
```

## 8. Recommend Next Week

Question:

- "Based on recent training, how should I adjust next week?"

Tool:

- `coros_recommend_next_week`

Example arguments:

```json
{
  "end_day": "20260330",
  "goal": "half_marathon",
  "target_runs_per_week": 3,
  "preferred_weekdays": [2, 4, 7]
}
```

Example result:

```json
{
  "strategy": "rebuild",
  "target_distance_km_range": {
    "min": 26.6,
    "max": 29.7
  },
  "key_focus": "在不激进加量的前提下，把 1 次专项质量课重新放回周结构。",
  "session_blueprint": [
    {
      "weekday": 2,
      "session_type": "easy",
      "distance_km": 7.6
    },
    {
      "weekday": 4,
      "session_type": "threshold",
      "distance_km": 9.3
    },
    {
      "weekday": 7,
      "session_type": "long",
      "distance_km": 12
    }
  ]
}
```

## 9. Create a Workout

Question:

- "Create a simple easy run workout"

Tool:

- `coros_create_workout`

Example arguments:

```json
{
  "name": "Easy 8K",
  "overview": "Simple aerobic run",
  "sport_type": "run",
  "segments": [
    {
      "type": "warmup",
      "target_type": "distance",
      "target_value": 1000,
      "intensity_type": "pace_range",
      "intensity": {
        "from_sec_per_km": 380,
        "to_sec_per_km": 420
      }
    },
    {
      "type": "main",
      "target_type": "distance",
      "target_value": 6000,
      "intensity_type": "pace_range",
      "intensity": {
        "from_sec_per_km": 380,
        "to_sec_per_km": 420
      }
    },
    {
      "type": "cooldown",
      "target_type": "distance",
      "target_value": 1000,
      "intensity_type": "pace_range",
      "intensity": {
        "from_sec_per_km": 390,
        "to_sec_per_km": 430
      }
    }
  ]
}
```

## 10. Create and Execute a Plan

Typical order:

1. `coros_create_workout`
2. `coros_create_plan`
3. `coros_validate_plan_dates`
4. `coros_execute_plan`
5. `coros_quit_executed_plan` if cleanup is needed

### Create Plan

```json
{
  "name": "1-week sample",
  "overview": "Minimal sample plan",
  "total_weeks": 1,
  "total_day": 7,
  "entries": [
    {
      "day_no": 1,
      "program_id": "WORKOUT_ID_HERE"
    }
  ]
}
```

### Validate Dates

```json
{
  "plan_id": "PLAN_ID_HERE",
  "start_day": "20260331"
}
```

### Execute Plan

```json
{
  "plan_id": "PLAN_ID_HERE",
  "start_day": "20260331",
  "verify": true,
  "expected_weekdays": [3]
}
```

## Common Usage Patterns

### Pattern A: Coaching Review

Use this order:

1. `coros_list_activities`
2. `coros_analyze_recent_week`
3. `coros_analyze_training_balance`
4. `coros_recommend_next_week`

### Pattern B: Review One Key Run

Use this order:

1. `coros_get_activity_detail`
2. `coros_analyze_activity`

### Pattern C: From Diagnosis to Plan

Use this order:

1. `coros_analyze_recent_week`
2. `coros_recommend_next_week`
3. `coros_create_workout`
4. `coros_create_plan`
5. `coros_execute_plan`

## Notes

- For running analysis, `sport_type` values `100` and `101` are treated as running-oriented.
- Strength and hiking can be listed and summarized, but the richest diagnosis is currently for running.
- COROS private APIs may evolve, so examples may need updates if COROS changes response formats.
