import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { EnvSessionProvider } from "./auth/session.js";
import type { ToolFailure, ToolResult } from "./types.js";
import { createToolRegistry } from "./tools/registry.js";

function asText(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function isFailure<T>(result: ToolResult<T>): result is ToolFailure {
  return !result.ok;
}

function asStructuredContent(value: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function failureResponse(result: ToolFailure) {
  return {
    content: [{ type: "text" as const, text: asText(result) }],
    isError: true,
  };
}

function successResponse<T>(data: T) {
  return {
    content: [{ type: "text" as const, text: asText(data) }],
    structuredContent: asStructuredContent(data),
  };
}

export async function startServer() {
  const sessionProvider = new EnvSessionProvider("https://teamcnapi.coros.com");
  const tools = createToolRegistry(sessionProvider);

  const server = new McpServer({
    name: "coros-mcp-server",
    version: "0.1.0",
  });

  server.registerTool(
    "coros_auth_status",
    {
      title: "COROS Auth Status",
      description: "Check whether COROS login is available via env token or local session file",
      inputSchema: {
        raw: z.boolean().optional(),
      },
    },
    async (_input) => {
      const result = await tools.coros_auth_status.handler();
      if (isFailure(result)) {
        return failureResponse(result);
      }
      return successResponse(result.data);
    },
  );

  server.registerTool(
    "coros_auth_set_token",
    {
      title: "COROS Auth Set Token",
      description: "Persist a COROS access token to the local session file",
      inputSchema: {
        access_token: z.string().min(1),
        validate: z.boolean().optional(),
        raw: z.boolean().optional(),
      },
    },
    async (input) => {
      const result = await tools.coros_auth_set_token.handler(input);
      if (isFailure(result)) {
        return failureResponse(result);
      }
      return successResponse(result.data);
    },
  );

  server.registerTool(
    "coros_auth_validate",
    {
      title: "COROS Auth Validate",
      description: "Validate the currently resolved COROS token",
      inputSchema: {
        raw: z.boolean().optional(),
      },
    },
    async (_input) => {
      const result = await tools.coros_auth_validate.handler();
      if (isFailure(result)) {
        return failureResponse(result);
      }
      return successResponse(result.data);
    },
  );

  server.registerTool(
    "coros_auth_import_browser_cookie",
    {
      title: "COROS Auth Import Browser Cookie",
      description: "Extract a COROS token from a copied browser Cookie header and persist it",
      inputSchema: {
        cookie_header: z.string().min(1),
        cookie_name: z.string().min(1).optional(),
        validate: z.boolean().optional(),
        raw: z.boolean().optional(),
      },
    },
    async (input) => {
      const result = await tools.coros_auth_import_browser_cookie.handler(input);
      if (isFailure(result)) {
        return failureResponse(result);
      }
      return successResponse(result.data);
    },
  );

  server.registerTool(
    "coros_auth_clear_session",
    {
      title: "COROS Auth Clear Session",
      description: "Delete the persisted COROS session file",
      inputSchema: {
        raw: z.boolean().optional(),
      },
    },
    async (input) => {
      const result = await tools.coros_auth_clear_session.handler(input);
      if (isFailure(result)) {
        return failureResponse(result);
      }
      return successResponse(result.data);
    },
  );

  server.registerTool(
    "coros_get_profile",
    {
      title: "COROS Get Profile",
      description: "Read COROS profile summary and running zones",
      inputSchema: {
        raw: z.boolean().optional(),
      },
    },
    async () => {
      const result = await tools.coros_get_profile.handler();
      if (isFailure(result)) {
        return failureResponse(result);
      }
      return successResponse(result.data);
    },
  );

  server.registerTool(
    "coros_list_activities",
    {
      title: "COROS List Activities",
      description: "List COROS activities for a page or date window",
      inputSchema: {
        date_from: z.string().regex(/^\d{8}$/).optional(),
        date_to: z.string().regex(/^\d{8}$/).optional(),
        page_number: z.number().int().positive().optional(),
        page_size: z.number().int().positive().max(100).optional(),
        max_pages: z.number().int().positive().max(50).optional(),
        sport_types: z.array(z.number().int().positive()).optional(),
        raw: z.boolean().optional(),
      },
    },
    async (input) => {
      const result = await tools.coros_list_activities.handler({
        ...input,
        date_from: input.date_from as `${number}` | undefined,
        date_to: input.date_to as `${number}` | undefined,
      });
      if (isFailure(result)) {
        return failureResponse(result);
      }
      return successResponse(result.data);
    },
  );

  server.registerTool(
    "coros_get_activity_detail",
    {
      title: "COROS Get Activity Detail",
      description: "Fetch detailed metrics, laps, and charts for a COROS activity",
      inputSchema: {
        label_id: z.string().min(1),
        sport_type: z.number().int().positive(),
        screen_w: z.number().int().positive().optional(),
        screen_h: z.number().int().positive().optional(),
        raw: z.boolean().optional(),
      },
    },
    async (input) => {
      const result = await tools.coros_get_activity_detail.handler(input);
      if (isFailure(result)) {
        return failureResponse(result);
      }
      return successResponse(result.data);
    },
  );

  server.registerTool(
    "coros_analyze_activity",
    {
      title: "COROS Analyze Activity",
      description: "Analyze one COROS activity and generate evidence, risks, and suggestions",
      inputSchema: {
        label_id: z.string().min(1),
        sport_type: z.number().int().positive(),
        raw: z.boolean().optional(),
      },
    },
    async (input) => {
      const result = await tools.coros_analyze_activity.handler(input);
      if (isFailure(result)) {
        return failureResponse(result);
      }
      return successResponse(result.data);
    },
  );

  server.registerTool(
    "coros_analyze_recent_week",
    {
      title: "COROS Analyze Recent Week",
      description: "Summarize the last 7 days of COROS training",
      inputSchema: {
        end_day: z.string().regex(/^\d{8}$/).optional(),
        raw: z.boolean().optional(),
      },
    },
    async (input) => {
      const result = await tools.coros_analyze_recent_week.handler({
        ...input,
        end_day: input.end_day as `${number}` | undefined,
      });
      if (isFailure(result)) {
        return failureResponse(result);
      }
      return successResponse(result.data);
    },
  );

  server.registerTool(
    "coros_analyze_training_balance",
    {
      title: "COROS Analyze Training Balance",
      description: "Compare recent run load and distance versus baseline",
      inputSchema: {
        end_day: z.string().regex(/^\d{8}$/).optional(),
        recent_days: z.number().int().positive().max(28).optional(),
        baseline_days: z.number().int().positive().max(84).optional(),
        raw: z.boolean().optional(),
      },
    },
    async (input) => {
      const result = await tools.coros_analyze_training_balance.handler({
        ...input,
        end_day: input.end_day as `${number}` | undefined,
      });
      if (isFailure(result)) {
        return failureResponse(result);
      }
      return successResponse(result.data);
    },
  );

  server.registerTool(
    "coros_recommend_next_week",
    {
      title: "COROS Recommend Next Week",
      description: "Recommend next week's microcycle from recent COROS training data",
      inputSchema: {
        end_day: z.string().regex(/^\d{8}$/).optional(),
        goal: z.enum(["general_running", "10k", "half_marathon"]).optional(),
        target_runs_per_week: z.number().int().positive().max(7).optional(),
        preferred_weekdays: z.array(z.number().int().min(1).max(7)).optional(),
        target_weekly_km: z.number().positive().optional(),
        raw: z.boolean().optional(),
      },
    },
    async (input) => {
      const result = await tools.coros_recommend_next_week.handler({
        ...input,
        end_day: input.end_day as `${number}` | undefined,
      });
      if (isFailure(result)) {
        return failureResponse(result);
      }
      return successResponse(result.data);
    },
  );

  server.registerTool(
    "coros_create_workout",
    {
      title: "COROS Create Workout",
      description: "Create a running workout in COROS",
      inputSchema: {
        name: z.string().min(1),
        overview: z.string(),
        sport_type: z.literal("run"),
        segments: z.array(
          z.object({
            type: z.enum(["warmup", "main", "cooldown"]),
            target_type: z.enum(["distance", "duration"]),
            target_value: z.number().positive(),
            intensity_type: z.literal("pace_range"),
            intensity: z.object({
              from_sec_per_km: z.number().positive(),
              to_sec_per_km: z.number().positive(),
            }),
          }),
        ),
        raw: z.boolean().optional(),
      },
    },
    async (input) => {
      const result = await tools.coros_create_workout.handler(input);
      if (isFailure(result)) {
        return failureResponse(result);
      }
      return successResponse(result.data);
    },
  );

  server.registerTool(
    "coros_create_plan",
    {
      title: "COROS Create Plan",
      description: "Create a multi-week COROS plan template",
      inputSchema: {
        name: z.string().min(1),
        overview: z.string(),
        total_weeks: z.number().int().positive(),
        total_day: z.number().int().positive(),
        entries: z.array(
          z.object({
            day_no: z.number().int().positive(),
            program_id: z.string().min(1),
          }),
        ),
        raw: z.boolean().optional(),
      },
    },
    async (input) => {
      const result = await tools.coros_create_plan.handler(input);
      if (isFailure(result)) {
        return failureResponse(result);
      }
      return successResponse(result.data);
    },
  );

  server.registerTool(
    "coros_get_plan_detail",
    {
      title: "COROS Get Plan Detail",
      description: "Fetch a COROS plan template and its dayNo mapping",
      inputSchema: {
        plan_id: z.string().min(1),
        raw: z.boolean().optional(),
      },
    },
    async (input) => {
      const result = await tools.coros_get_plan_detail.handler(input);
      if (isFailure(result)) {
        return failureResponse(result);
      }
      return successResponse(result.data);
    },
  );

  server.registerTool(
    "coros_validate_plan_dates",
    {
      title: "COROS Validate Plan Dates",
      description: "Predict scheduled dates from a plan template and start day",
      inputSchema: {
        plan_id: z.string().min(1),
        start_day: z.string().regex(/^\d{8}$/),
        expected_weekdays: z.array(z.number().int().min(1).max(7)).optional(),
        raw: z.boolean().optional(),
      },
    },
    async (input) => {
      const result = await tools.coros_validate_plan_dates.handler({
        ...input,
        start_day: input.start_day as `${number}`,
      });
      if (isFailure(result)) {
        return failureResponse(result);
      }
      return successResponse(result.data);
    },
  );

  server.registerTool(
    "coros_execute_plan",
    {
      title: "COROS Execute Plan",
      description: "Execute a COROS plan template onto the calendar and verify results",
      inputSchema: {
        plan_id: z.string().min(1),
        start_day: z.string().regex(/^\d{8}$/),
        verify: z.boolean().optional(),
        expected_weekdays: z.array(z.number().int().min(1).max(7)).optional(),
        raw: z.boolean().optional(),
      },
    },
    async (input) => {
      const result = await tools.coros_execute_plan.handler({
        ...input,
        start_day: input.start_day as `${number}`,
      });
      if (isFailure(result)) {
        return failureResponse(result);
      }
      return successResponse(result.data);
    },
  );

  server.registerTool(
    "coros_query_schedule",
    {
      title: "COROS Query Schedule",
      description: "Query COROS calendar entities and executed subplans for a date window",
      inputSchema: {
        start_day: z.string().regex(/^\d{8}$/),
        end_day: z.string().regex(/^\d{8}$/),
        support_rest_exercise: z.boolean().optional(),
        raw: z.boolean().optional(),
      },
    },
    async (input) => {
      const result = await tools.coros_query_schedule.handler({
        ...input,
        start_day: input.start_day as `${number}`,
        end_day: input.end_day as `${number}`,
      });
      if (isFailure(result)) {
        return failureResponse(result);
      }
      return successResponse(result.data);
    },
  );

  server.registerTool(
    "coros_quit_executed_plan",
    {
      title: "COROS Quit Executed Plan",
      description: "Quit an executed COROS plan from the calendar",
      inputSchema: {
        executed_subplan_id: z.string().min(1),
        raw: z.boolean().optional(),
      },
    },
    async (input) => {
      const result = await tools.coros_quit_executed_plan.handler(input);
      if (isFailure(result)) {
        return failureResponse(result);
      }
      return successResponse(result.data);
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
