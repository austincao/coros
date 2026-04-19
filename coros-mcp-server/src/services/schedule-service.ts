import type {
  CorosDate,
  ExecutePlanInput,
  ExecutePlanOutput,
  PredictedDate,
  QueryScheduleInput,
  QueryScheduleOutput,
  QuitExecutedPlanInput,
  QuitExecutedPlanOutput,
  ToolResult,
} from "../types.js";
import { CorosClient } from "../client/coros-client.js";
import { PlanService } from "./plan-service.js";

interface CorosScheduleExecuteResponse {
  result: string;
  message?: string;
  data?: string;
}

interface CorosScheduleQueryResponse {
  result: string;
  message?: string;
  data?: {
    entities?: Array<{
      happenDay?: number;
      idInPlan?: string;
      planId?: string;
      planProgramId?: string;
      sortNo?: number;
    }>;
    subPlans?: Array<{
      id?: string;
      name?: string;
      originId?: string;
      sourcePlanId?: string;
      startDay?: number;
      updateTimestamp?: number;
    }>;
  };
}

function parseCorosDate(date: CorosDate): Date {
  const value = String(date);
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  return new Date(Date.UTC(year, month - 1, day));
}

function formatCorosDate(date: Date): CorosDate {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}` as CorosDate;
}

function addDays(date: Date, days: number): Date {
  const value = new Date(date.getTime());
  value.setUTCDate(value.getUTCDate() + days);
  return value;
}

function getIsoWeekday(date: Date): number {
  const day = date.getUTCDay();
  return day === 0 ? 7 : day;
}

export class ScheduleService {
  constructor(
    private readonly corosClient: CorosClient,
    private readonly planService: PlanService,
  ) {}

  async querySchedule(input: QueryScheduleInput): Promise<ToolResult<QueryScheduleOutput>> {
    try {
      const schedule = await this.corosClient.request<CorosScheduleQueryResponse>({
        method: "GET",
        path: "/training/schedule/query",
        query: {
          startDate: input.start_day,
          endDate: input.end_day,
          supportRestExercise:
            input.support_rest_exercise === undefined
              ? 1
              : input.support_rest_exercise
                ? 1
                : 0,
        },
      });

      if (schedule.result !== "0000") {
        return {
          ok: false,
          error: {
            code: "SCHEDULE_QUERY_FAILED",
            message: schedule.message ?? "COROS schedule query failed",
          },
        };
      }

      return {
        ok: true,
        raw: input.raw ? schedule : undefined,
        data: {
          date_from: input.start_day,
          date_to: input.end_day,
          entity_count: schedule.data?.entities?.length ?? 0,
          subplan_count: schedule.data?.subPlans?.length ?? 0,
          entities: (schedule.data?.entities ?? []).map((entity) => ({
            happen_day: String(entity.happenDay ?? "") as CorosDate,
            id_in_plan: entity.idInPlan,
            plan_id: entity.planId,
            program_id: entity.planProgramId,
            sort_no: entity.sortNo,
          })),
          subplans: (schedule.data?.subPlans ?? []).map((subPlan) => ({
            executed_subplan_id: subPlan.id ?? "",
            name: subPlan.name,
            origin_plan_id: subPlan.originId,
            source_plan_id: subPlan.sourcePlanId,
            start_day: subPlan.startDay ? (String(subPlan.startDay) as CorosDate) : undefined,
            updated_at_s: subPlan.updateTimestamp,
          })),
        },
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: "SCHEDULE_QUERY_FAILED",
          message: error instanceof Error ? error.message : "Failed to query COROS schedule",
        },
      };
    }
  }

  async executePlan(input: ExecutePlanInput): Promise<ToolResult<ExecutePlanOutput>> {
    const detailResult = await this.planService.getPlanDetail({
      plan_id: input.plan_id,
      raw: false,
    });
    if (!detailResult.ok) {
      return detailResult;
    }

    try {
      const executeResult = await this.corosClient.request<CorosScheduleExecuteResponse>({
        method: "POST",
        path: "/training/schedule/executeSubPlan",
        query: {
          startDay: input.start_day,
          subPlanId: input.plan_id,
        },
        body: {},
      });

      if (executeResult.result !== "0000") {
        return {
          ok: false,
          error: {
            code: "EXECUTION_FAILED",
            message: executeResult.message ?? "COROS plan execution failed",
          },
        };
      }

      const startDate = parseCorosDate(input.start_day);
      const endDate = formatCorosDate(addDays(startDate, detailResult.data.total_day + 7));
      const schedule = await this.corosClient.request<CorosScheduleQueryResponse>({
        method: "GET",
        path: "/training/schedule/query",
        query: {
          startDate: input.start_day,
          endDate,
          supportRestExercise: 1,
        },
      });

      if (schedule.result !== "0000") {
        return {
          ok: false,
          error: {
            code: "EXECUTION_FAILED",
            message: schedule.message ?? "COROS schedule query failed after execution",
          },
        };
      }

      const matchedSubPlan = [...(schedule.data?.subPlans ?? [])]
        .filter(
          (subPlan) =>
            subPlan.sourcePlanId === input.plan_id || subPlan.originId === input.plan_id,
        )
        .sort((a, b) => (b.updateTimestamp ?? 0) - (a.updateTimestamp ?? 0))[0];

      if (!matchedSubPlan?.id) {
        return {
          ok: false,
          error: {
            code: "EXECUTION_FAILED",
            message: "Plan executed but the resulting executed sub-plan could not be found",
          },
        };
      }

      const planEntryById = new Map(
        detailResult.data.entries.map((entry) => [entry.id_in_plan, entry]),
      );
      const actualDates: PredictedDate[] = (schedule.data?.entities ?? [])
        .filter((entity) => entity.planId === matchedSubPlan.id && entity.happenDay)
        .map((entity) => {
          const date = String(entity.happenDay) as CorosDate;
          const actualDate = parseCorosDate(date);
          const entry = planEntryById.get(entity.idInPlan ?? "");
          return {
            day_no: entry?.day_no ?? 0,
            date,
            weekday: getIsoWeekday(actualDate),
            program_name: entry?.program_name ?? "",
          };
        })
        .sort((a, b) => Number(a.date) - Number(b.date));

      const expectedWeekdays = input.expected_weekdays ?? [];
      const mismatchCount =
        expectedWeekdays.length === 0
          ? 0
          : actualDates.filter(
              (item, index) => expectedWeekdays[index % expectedWeekdays.length] !== item.weekday,
            ).length;

      if ((input.verify ?? true) && expectedWeekdays.length > 0 && mismatchCount > 0) {
        return {
          ok: false,
          error: {
            code: "EXECUTION_SUCCEEDED_BUT_DATES_SHIFTED",
            message:
              "Plan executed, but actual scheduled dates do not match expected weekdays",
            details: {
              executed_subplan_id: matchedSubPlan.id,
              actual_dates: actualDates,
            },
          },
        };
      }

      return {
        ok: true,
        raw: input.raw ? { executeResult, schedule } : undefined,
        data: {
          plan_id: input.plan_id,
          executed_subplan_id: matchedSubPlan.id,
          start_day: input.start_day,
          execution_result: executeResult.result,
          verified: input.verify ?? true,
          actual_dates: actualDates,
          weekday_match: mismatchCount === 0,
        },
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: "EXECUTION_FAILED",
          message: error instanceof Error ? error.message : "Failed to execute COROS plan",
        },
      };
    }
  }

  async quitExecutedPlan(
    input: QuitExecutedPlanInput,
  ): Promise<ToolResult<QuitExecutedPlanOutput>> {
    try {
      const result = await this.corosClient.request<CorosScheduleExecuteResponse>({
        method: "POST",
        path: "/training/schedule/quitSubPlan",
        query: {
          subPlanId: input.executed_subplan_id,
        },
        body: {},
      });

      if (result.result !== "0000") {
        return {
          ok: false,
          error: {
            code: "QUIT_FAILED",
            message: result.message ?? "COROS quit executed plan failed",
          },
        };
      }

      return {
        ok: true,
        raw: input.raw ? result : undefined,
        data: {
          executed_subplan_id: input.executed_subplan_id,
          quit_result: result.result,
        },
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: "QUIT_FAILED",
          message: error instanceof Error ? error.message : "Failed to quit COROS executed plan",
        },
      };
    }
  }
}
