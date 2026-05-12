import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mcpChildEnv } from "./lib/mcp-child-env.mjs";

async function main() {
  const client = new Client({ name: "austin-plan-maker", version: "0.1.0" });
  const transport = new StdioClientTransport({
    command: "node",
    args: ["dist/index.js"],
    cwd: process.cwd(),
    env: mcpChildEnv(),
  });

  await client.connect(transport);

  const workouts = [
    {
      name: "W5轻松跑 8km",
      overview: "维持有氧基础 (设计配速 06:12-07:18)",
      segments: [
        { type: "warmup", target_type: "distance", target_value: 100000, intensity_type: "pace_range", intensity: { from_sec_per_km: 400, to_sec_per_km: 450 } },
        { type: "main", target_type: "distance", target_value: 600000, intensity_type: "pace_range", intensity: { from_sec_per_km: 372, to_sec_per_km: 438 } },
        { type: "cooldown", target_type: "distance", target_value: 100000, intensity_type: "pace_range", intensity: { from_sec_per_km: 400, to_sec_per_km: 450 } },
      ]
    },
    {
      name: "W5间歇跑",
      overview: "2km热身 + 4x1.5km @04:50 + 2km冷却",
      segments: [
        { type: "warmup", target_type: "distance", target_value: 200000, intensity_type: "pace_range", intensity: { from_sec_per_km: 400, to_sec_per_km: 450 } },
        { type: "main", target_type: "distance", target_value: 600000, intensity_type: "pace_range", intensity: { from_sec_per_km: 280, to_sec_per_km: 300 } },
        { type: "cooldown", target_type: "distance", target_value: 200000, intensity_type: "pace_range", intensity: { from_sec_per_km: 400, to_sec_per_km: 450 } },
      ]
    },
    {
      name: "W5长距离 15km",
      overview: "建立耐力 (@06:20)",
      segments: [
        { type: "warmup", target_type: "distance", target_value: 200000, intensity_type: "pace_range", intensity: { from_sec_per_km: 400, to_sec_per_km: 450 } },
        { type: "main", target_type: "distance", target_value: 1100000, intensity_type: "pace_range", intensity: { from_sec_per_km: 370, to_sec_per_km: 390 } },
        { type: "cooldown", target_type: "distance", target_value: 200000, intensity_type: "pace_range", intensity: { from_sec_per_km: 400, to_sec_per_km: 450 } },
      ]
    },
    {
      name: "W6轻松跑 10km",
      overview: "维持有氧基础 (@06:30)",
      segments: [
        { type: "warmup", target_type: "distance", target_value: 100000, intensity_type: "pace_range", intensity: { from_sec_per_km: 400, to_sec_per_km: 450 } },
        { type: "main", target_type: "distance", target_value: 800000, intensity_type: "pace_range", intensity: { from_sec_per_km: 380, to_sec_per_km: 400 } },
        { type: "cooldown", target_type: "distance", target_value: 100000, intensity_type: "pace_range", intensity: { from_sec_per_km: 400, to_sec_per_km: 450 } },
      ]
    },
    {
      name: "W6阈值跑 10km",
      overview: "2km热身 + 6km @05:05 + 2km冷却",
      segments: [
        { type: "warmup", target_type: "distance", target_value: 200000, intensity_type: "pace_range", intensity: { from_sec_per_km: 400, to_sec_per_km: 450 } },
        { type: "main", target_type: "distance", target_value: 600000, intensity_type: "pace_range", intensity: { from_sec_per_km: 300, to_sec_per_km: 310 } },
        { type: "cooldown", target_type: "distance", target_value: 200000, intensity_type: "pace_range", intensity: { from_sec_per_km: 400, to_sec_per_km: 450 } },
      ]
    },
    {
      name: "W6长距离 18km",
      overview: "建立耐力 (@06:20)",
      segments: [
        { type: "warmup", target_type: "distance", target_value: 200000, intensity_type: "pace_range", intensity: { from_sec_per_km: 400, to_sec_per_km: 450 } },
        { type: "main", target_type: "distance", target_value: 1400000, intensity_type: "pace_range", intensity: { from_sec_per_km: 370, to_sec_per_km: 390 } },
        { type: "cooldown", target_type: "distance", target_value: 200000, intensity_type: "pace_range", intensity: { from_sec_per_km: 400, to_sec_per_km: 450 } },
      ]
    }
  ];

  const programIds = [];
  for (const w of workouts) {
    const res = await client.callTool({ name: "coros_create_workout", arguments: { ...w, sport_type: "run" } });
    const payload = res.structuredContent ?? JSON.parse(res.content[0].text);
    if (res.isError || !payload.program_id) throw new Error(`Failed to create workout ${w.name}: ${JSON.stringify(payload)}`);
    console.log(`Created workout: ${w.name} -> ${payload.program_id}`);
    programIds.push(payload.program_id);
  }

  const planRes = await client.callTool({
    name: "coros_create_plan",
    arguments: {
      name: "Austin 提升计划 (W5-W6)",
      overview: "基于 72.4 跑力的两周提升周期 (由 AI 设计)",
      total_weeks: 2,
      total_day: 14,
      entries: [
        { day_no: 1, program_id: programIds[0] }, // W5 Tue
        { day_no: 3, program_id: programIds[1] }, // W5 Thu
        { day_no: 6, program_id: programIds[2] }, // W5 Sun
        { day_no: 8, program_id: programIds[3] }, // W6 Tue
        { day_no: 10, program_id: programIds[4] }, // W6 Thu
        { day_no: 13, program_id: programIds[5] }  // W6 Sun
      ]
    }
  });
  const plan = planRes.structuredContent ?? JSON.parse(planRes.content[0].text);
  if (planRes.isError || !plan.plan_id) throw new Error(`Failed to create plan: ${JSON.stringify(plan)}`);
  console.log(`Created plan: ${plan.plan_id}`);

  const execRes = await client.callTool({
    name: "coros_execute_plan",
    arguments: { plan_id: plan.plan_id, start_day: "20260427" }
  });
  const exec = execRes.structuredContent ?? JSON.parse(execRes.content[0].text);
  if (execRes.isError) throw new Error(`Failed to execute plan: ${JSON.stringify(exec)}`);
  console.log("Plan executed successfully to 2026-04-27!");

  await transport.close();
}

main().catch(console.error);
