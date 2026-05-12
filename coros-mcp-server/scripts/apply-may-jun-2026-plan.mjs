/**
 * May–Jun 2026 12-session plan: create workouts, plan, execute.
 *
 * COROS calendar uses happen_day ≈ start_day + day_no − 1 (see execute actual_dates vs
 * coros_validate_plan_dates which uses start + day_no). day_no 列表已按此校正。
 *
 * start_day 20260512 + day_nos below → 与你给的 5/14–6/9 周四/日/二 对齐。
 *
 * Auth: session.json 或 COROS_ACCESS_TOKEN。脚本通过 `mcpChildEnv()` 忽略 shell 里残留的 COROS_API_BASE。
 * 国际区账号：`export COROS_INTL_API=1`。
 *
 * Usage:
 *   cd coros-mcp-server && npm run build
 *   node scripts/apply-may-jun-2026-plan.mjs
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mcpChildEnv } from "./lib/mcp-child-env.mjs";

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

function seg(w, m, c, mainFrom, mainTo, wFrom = 390, wTo = 440, cFrom = 390, cTo = 440) {
  return [
    {
      type: "warmup",
      target_type: "distance",
      target_value: w,
      intensity_type: "pace_range",
      intensity: { from_sec_per_km: wFrom, to_sec_per_km: wTo },
    },
    {
      type: "main",
      target_type: "distance",
      target_value: m,
      intensity_type: "pace_range",
      intensity: { from_sec_per_km: mainFrom, to_sec_per_km: mainTo },
    },
    {
      type: "cooldown",
      target_type: "distance",
      target_value: c,
      intensity_type: "pace_range",
      intensity: { from_sec_per_km: cFrom, to_sec_per_km: cTo },
    },
  ];
}

async function main() {
  const queryStart = process.env.SCHEDULE_QUERY_START ?? "20260514";
  const queryEnd = process.env.SCHEDULE_QUERY_END ?? "20260609";
  const planStartDay = process.env.PLAN_START_DAY ?? "20260512";

  const client = new Client({ name: "apply-may-jun-2026-plan", version: "0.1.0" });
  const transport = new StdioClientTransport({
    command: "node",
    args: ["dist/index.js"],
    cwd: process.cwd(),
    env: mcpChildEnv(),
    stderr: "pipe",
  });
  const stderr = transport.stderr;
  if (stderr) stderr.on("data", (c) => process.stderr.write(c));

  await client.connect(transport);

  try {
    const auth = await client.callTool({ name: "coros_auth_status", arguments: {} });
    const authPayload = getToolPayload(auth);
    console.log("coros_auth_status:", JSON.stringify(authPayload, null, 2));
    if (auth.isError || !authPayload?.authenticated) {
      throw new Error("Not authenticated — set session.json or COROS_ACCESS_TOKEN");
    }

    const q = await client.callTool({
      name: "coros_query_schedule",
      arguments: { start_day: queryStart, end_day: queryEnd },
    });
    const schedule = getToolPayload(q);
    if (q.isError) throw new Error(`query_schedule failed: ${JSON.stringify(schedule)}`);
    console.log(
      "\nSchedule check",
      queryStart,
      "→",
      queryEnd,
      "| subplans:",
      schedule.subplan_count,
      "| entities:",
      schedule.entity_count,
    );

    const easy = (km, name, overview) => ({
      name,
      overview,
      segments: seg(100000, (km - 2) * 100000, 100000, 375, 425),
    });
    const long = (km, name, overview) => ({
      name,
      overview,
      segments: seg(200000, (km - 4) * 100000, 200000, 365, 395),
    });
    const threshold = (km, name, overview) => ({
      name,
      overview,
      segments: seg(200000, (km - 4) * 100000, 200000, 295, 315, 390, 440, 390, 440),
    });
    const hmSteady = {
      name: "HM Steady 10.5K",
      overview: "半马配速上下稳态 (由脚本创建)",
      segments: seg(150000, 700000, 200000, 315, 335),
    };
    const hmPace = {
      name: "HM Pace 9K",
      overview: "半马目标配速主课 (由脚本创建)",
      segments: seg(100000, 700000, 100000, 285, 305, 380, 430, 380, 430),
    };

    const workoutDefs = [
      easy(8, "Easy 8K", "轻松有氧"),
      long(12, "Long 12K", "长距离 LSD"),
      threshold(10, "Threshold 10K", "阈值主课"),
      easy(8, "Easy 8K (2)", "轻松有氧"),
      long(13, "Long 13K", "长距离 LSD"),
      hmSteady,
      easy(9, "Easy 9K", "轻松有氧"),
      long(15, "Long 15K", "长距离 LSD"),
      threshold(11, "Threshold 11K", "阈值主课"),
      easy(7, "Easy 7K", "轻松有氧"),
      long(12, "Long 12K (2)", "长距离 LSD"),
      hmPace,
    ];

    const programIds = [];
    for (const w of workoutDefs) {
      const res = await client.callTool({
        name: "coros_create_workout",
        arguments: { ...w, sport_type: "run" },
      });
      const payload = getToolPayload(res);
      if (res.isError || !payload?.program_id) {
        throw new Error(`create_workout ${w.name}: ${JSON.stringify(payload)}`);
      }
      console.log("Created workout:", w.name, "→", payload.program_id);
      programIds.push(payload.program_id);
    }

    /** COROS happen ≈ start + day_no − 1 → 目标日 = start + day_no − 1 */
    const dayNos = [3, 6, 8, 10, 13, 15, 17, 20, 22, 24, 27, 29];
    const entries = dayNos.map((day_no, i) => ({ day_no, program_id: programIds[i] }));

    const planRes = await client.callTool({
      name: "coros_create_plan",
      arguments: {
        name: "May–Jun 2026 跑步周期 (12 课)",
        overview: "Easy/Long/Threshold/HM；距离 100000/km；day_no 与 COROS 日历对齐",
        total_weeks: 5,
        total_day: 29,
        entries,
      },
    });
    const plan = getToolPayload(planRes);
    if (planRes.isError || !plan?.plan_id) {
      throw new Error(`create_plan: ${JSON.stringify(plan)}`);
    }
    console.log("\nCreated plan:", plan.plan_id);

    const valRes = await client.callTool({
      name: "coros_validate_plan_dates",
      arguments: { plan_id: plan.plan_id, start_day: planStartDay },
    });
    const validated = getToolPayload(valRes);
    if (valRes.isError) throw new Error(`validate: ${JSON.stringify(validated)}`);
    console.log("\nPredicted dates (工具公式 start+day_no，与 COROS 日历可能差 1 日):");
    console.log(JSON.stringify(validated.predicted_dates, null, 2));

    const execRes = await client.callTool({
      name: "coros_execute_plan",
      arguments: {
        plan_id: plan.plan_id,
        start_day: planStartDay,
        verify: false,
      },
    });
    const exec = getToolPayload(execRes);
    if (execRes.isError) {
      throw new Error(`execute_plan: ${JSON.stringify(exec)}`);
    }
    console.log("\nExecuted (COROS actual_dates):", JSON.stringify(exec.actual_dates, null, 2));
  } finally {
    await transport.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
