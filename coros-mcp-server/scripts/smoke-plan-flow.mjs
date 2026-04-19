import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

function formatCorosDate(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function addDays(date, days) {
  const value = new Date(date.getTime());
  value.setUTCDate(value.getUTCDate() + days);
  return value;
}

function getIsoWeekday(date) {
  const day = date.getUTCDay();
  return day === 0 ? 7 : day;
}

function parseToolText(result) {
  const textItem = Array.isArray(result.content)
    ? result.content.find((item) => item.type === "text" && typeof item.text === "string")
    : undefined;

  if (!textItem) {
    return undefined;
  }

  try {
    return JSON.parse(textItem.text);
  } catch {
    return textItem.text;
  }
}

function getToolPayload(result) {
  return result.structuredContent ?? parseToolText(result);
}

async function main() {
  if (!process.env.COROS_ACCESS_TOKEN) {
    throw new Error("COROS_ACCESS_TOKEN is required");
  }

  const client = new Client({
    name: "coros-mcp-plan-flow-client",
    version: "0.1.0",
  });

  const transport = new StdioClientTransport({
    command: "node",
    args: ["dist/index.js"],
    cwd: process.cwd(),
    env: {
      ...process.env,
      COROS_ACCESS_TOKEN: process.env.COROS_ACCESS_TOKEN,
    },
    stderr: "pipe",
  });

  const stderr = transport.stderr;
  if (stderr) {
    stderr.on("data", (chunk) => {
      process.stderr.write(chunk);
    });
  }

  let executedSubplanId;

  await client.connect(transport);

  try {
    const now = new Date();
    const startDate = addDays(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())), 35);
    const startDay = formatCorosDate(startDate);
    const suffix = Date.now().toString().slice(-8);

    const workoutName = `MCP Smoke Run ${suffix}`;
    const planName = `MCP Smoke Plan ${suffix}`;

    const createWorkoutResult = await client.callTool({
      name: "coros_create_workout",
      arguments: {
        name: workoutName,
        overview: "Temporary smoke test workout created by coros-mcp-server",
        sport_type: "run",
        segments: [
          {
            type: "warmup",
            target_type: "distance",
            target_value: 1000,
            intensity_type: "pace_range",
            intensity: {
              from_sec_per_km: 380,
              to_sec_per_km: 420,
            },
          },
          {
            type: "main",
            target_type: "distance",
            target_value: 3000,
            intensity_type: "pace_range",
            intensity: {
              from_sec_per_km: 305,
              to_sec_per_km: 320,
            },
          },
          {
            type: "cooldown",
            target_type: "distance",
            target_value: 1000,
            intensity_type: "pace_range",
            intensity: {
              from_sec_per_km: 390,
              to_sec_per_km: 430,
            },
          },
        ],
      },
    });
    const workout = getToolPayload(createWorkoutResult);
    if (createWorkoutResult.isError || !workout?.program_id) {
      throw new Error(`Workout creation failed: ${JSON.stringify(workout)}`);
    }

    const createPlanResult = await client.callTool({
      name: "coros_create_plan",
      arguments: {
        name: planName,
        overview: "Temporary smoke test plan created by coros-mcp-server",
        total_weeks: 1,
        total_day: 7,
        entries: [
          {
            day_no: 1,
            program_id: workout.program_id,
          },
        ],
      },
    });
    const plan = getToolPayload(createPlanResult);
    if (createPlanResult.isError || !plan?.plan_id) {
      throw new Error(`Plan creation failed: ${JSON.stringify(plan)}`);
    }

    const validatePlanResult = await client.callTool({
      name: "coros_validate_plan_dates",
      arguments: {
        plan_id: plan.plan_id,
        start_day: startDay,
      },
    });
    const validated = getToolPayload(validatePlanResult);
    const predictedDates = validated?.predicted_dates;
    const expectedWeekday = Array.isArray(predictedDates) && predictedDates[0]
      ? predictedDates[0].weekday
      : getIsoWeekday(addDays(startDate, 1));
    if (validatePlanResult.isError || !Array.isArray(predictedDates) || predictedDates.length === 0) {
      throw new Error(`Plan validation failed: ${JSON.stringify(validated)}`);
    }

    const executePlanResult = await client.callTool({
      name: "coros_execute_plan",
      arguments: {
        plan_id: plan.plan_id,
        start_day: startDay,
        verify: true,
        expected_weekdays: [expectedWeekday],
      },
    });
    const executed = getToolPayload(executePlanResult);
    if (
      executePlanResult.isError &&
      executed?.error?.details?.executed_subplan_id &&
      !executedSubplanId
    ) {
      executedSubplanId = executed.error.details.executed_subplan_id;
    }
    if (executePlanResult.isError || !executed?.executed_subplan_id) {
      throw new Error(`Plan execution failed: ${JSON.stringify(executed)}`);
    }
    executedSubplanId = executed.executed_subplan_id;

    const quitPlanResult = await client.callTool({
      name: "coros_quit_executed_plan",
      arguments: {
        executed_subplan_id: executedSubplanId,
      },
    });
    const quit = getToolPayload(quitPlanResult);
    if (quitPlanResult.isError || !quit?.quit_result) {
      throw new Error(`Plan quit failed: ${JSON.stringify(quit)}`);
    }

    console.log(
      JSON.stringify(
        {
          start_day: startDay,
          expected_weekday: expectedWeekday,
          workout,
          plan,
          validated,
          executed,
          quit,
        },
        null,
        2,
      ),
    );
  } finally {
    if (executedSubplanId) {
      try {
        await client.callTool({
          name: "coros_quit_executed_plan",
          arguments: {
            executed_subplan_id: executedSubplanId,
          },
        });
      } catch {
        // Best-effort cleanup only.
      }
    }

    await transport.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
