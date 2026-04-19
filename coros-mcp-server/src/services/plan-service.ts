import type {
  CreatePlanInput,
  CreatePlanOutput,
  CorosDate,
  GetPlanDetailInput,
  GetPlanDetailOutput,
  PlanEntryDetail,
  PredictedDate,
  ToolResult,
  ValidatePlanDatesInput,
  ValidatePlanDatesOutput,
} from "../types.js";
import { CorosClient } from "../client/coros-client.js";

interface CorosPlanDetailResponse {
  result: string;
  message?: string;
  data?: {
    id?: string;
    name?: string;
    overview?: string;
    totalWeeks?: number;
    totalDay?: number;
    entities?: Array<{
      idInPlan?: string;
      dayNo?: number;
      planProgramId?: string;
    }>;
    programs?: Array<{
      id?: string;
      idInPlan?: string;
      name?: string;
    }>;
  };
}

interface CorosProgramDetailResponse {
  result: string;
  message?: string;
  data?: {
    access?: number;
    distance?: number;
    distanceDisplayUnit?: number;
    duration?: number;
    elevGain?: number;
    essence?: number;
    estimatedDistance?: number;
    estimatedTime?: number;
    estimatedType?: number;
    estimatedValue?: number;
    exerciseBarChart?: unknown[];
    exerciseNum?: number;
    exercises?: unknown[];
    isTargetTypeConsistent?: number;
    name?: string;
    originEssence?: number;
    overview?: string;
    pbVersion?: number;
    pitch?: number;
    poolLength?: number;
    poolLengthId?: number;
    poolLengthUnit?: number;
    referExercise?: Record<string, unknown>;
    simple?: boolean;
    sourceId?: string;
    sourceUrl?: string;
    sportType?: number;
    status?: number;
    subType?: number;
    targetType?: number;
    targetValue?: number;
    totalSets?: number;
    trainingLoad?: number;
    type?: number;
    unit?: number;
    userId?: string | number;
    videoCoverUrl?: string;
    videoUrl?: string;
  };
}

interface CorosAccountResponse {
  result: string;
  message?: string;
  data?: {
    userId?: string;
    nickname?: string;
    headPic?: string;
    sex?: number;
    userProfile?: {
      region?: number;
    };
  };
}

interface CorosPlanAddResponse {
  result: string;
  message?: string;
  data?: string;
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

export class PlanService {
  constructor(private readonly corosClient: CorosClient) {}

  async createPlan(input: CreatePlanInput): Promise<ToolResult<CreatePlanOutput>> {
    const dayNos = input.entries.map((entry) => entry.day_no);
    const hasInvalidDayNo = dayNos.some((dayNo) => dayNo < 1 || dayNo > input.total_day);
    const hasDuplicates = new Set(dayNos).size !== dayNos.length;

    if (hasInvalidDayNo || hasDuplicates) {
      return {
        ok: false,
        error: {
          code: "INVALID_DAY_NO",
          message: "Plan entries contain invalid or duplicate day_no values",
          details: { dayNos },
        },
      };
    }

    try {
      const account = await this.corosClient.request<CorosAccountResponse>({
        method: "GET",
        path: "/account/query",
      });
      const userId = account.data?.userId;
      if (account.result !== "0000" || !userId) {
        return {
          ok: false,
          error: {
            code: "PLAN_CREATE_FAILED",
            message: account.message ?? "Unable to read COROS account profile for plan creation",
          },
        };
      }

      const sortedEntries = [...input.entries].sort((a, b) => a.day_no - b.day_no);
      const programResults = await Promise.all(
        sortedEntries.map((entry) =>
          this.corosClient.request<CorosProgramDetailResponse>({
            method: "GET",
            path: "/training/program/detail",
            query: {
              id: entry.program_id,
            },
          }),
        ),
      );

      const programs = programResults.map((result, index) => {
        const program = result.data;
        if (result.result !== "0000" || !program?.name) {
          throw new Error(result.message ?? `Unable to fetch program ${sortedEntries[index]?.program_id}`);
        }

        return {
          access: program.access ?? 1,
          distance: program.distance ?? program.estimatedDistance ?? program.targetValue ?? 0,
          distanceDisplayUnit: program.distanceDisplayUnit ?? 1,
          duration: program.duration ?? program.estimatedTime ?? 0,
          elevGain: program.elevGain ?? 0,
          essence: program.essence ?? 0,
          estimatedDistance:
            program.estimatedDistance ?? program.distance ?? program.targetValue ?? 0,
          estimatedTime: program.estimatedTime ?? program.duration ?? 0,
          estimatedType: program.estimatedType ?? 6,
          estimatedValue: program.estimatedValue ?? program.trainingLoad ?? 0,
          exerciseBarChart: program.exerciseBarChart ?? [],
          exerciseNum: program.exerciseNum ?? (program.exercises ?? []).length,
          exercises: program.exercises ?? [],
          idInPlan: String(index + 1),
          isTargetTypeConsistent: program.isTargetTypeConsistent ?? 1,
          name: program.name,
          originEssence: program.originEssence ?? 0,
          overview: program.overview ?? "",
          pbVersion: program.pbVersion ?? 3,
          pitch: program.pitch ?? 0,
          poolLength: program.poolLength ?? 2500,
          poolLengthId: program.poolLengthId ?? 1,
          poolLengthUnit: program.poolLengthUnit ?? 2,
          referExercise: program.referExercise ?? {
            hrType: 0,
            intensityType: 0,
            valueType: 1,
          },
          simple: program.simple ?? false,
          sourceId: program.sourceId ?? "425868142590476288",
          sourceUrl:
            program.sourceUrl ??
            "https://oss.coros.com/source/source_default/0/6097a29cf17a435f88b573c08679280b.jpg",
          sportType: program.sportType ?? 1,
          status: program.status ?? 1,
          subType: program.subType ?? 65535,
          targetType: program.targetType ?? 5,
          targetValue: program.targetValue ?? program.distance ?? 0,
          totalSets: program.totalSets ?? program.exerciseNum ?? (program.exercises ?? []).length,
          trainingLoad: program.trainingLoad ?? program.estimatedValue ?? 0,
          type: program.type ?? 0,
          unit: program.unit ?? 0,
          userId: String(program.userId ?? userId),
          videoCoverUrl: program.videoCoverUrl ?? "",
          videoUrl: program.videoUrl ?? "",
        };
      });

      const totalDistance = programs.reduce((sum, program) => sum + Number(program.distance ?? 0), 0);
      const totalDuration = programs.reduce((sum, program) => sum + Number(program.estimatedTime ?? 0), 0);
      const totalTrainingLoad = programs.reduce(
        (sum, program) => sum + Number(program.trainingLoad ?? 0),
        0,
      );

      const payload = {
        access: 1,
        authorId: userId,
        category: 0,
        competitions: [],
        createTime: "",
        entities: sortedEntries.map((entry, index) => ({
          dayNo: entry.day_no,
          executeStatus: 0,
          idInPlan: String(index + 1),
          operateUserId: userId,
          planIdIndex: 0,
          planProgramId: String(index + 1),
          score: "0",
          sortNo: index + 1,
          standardRate: "0",
          thirdParty: false,
        })),
        eventTags: [],
        executeStatus: 0,
        headPic: account.data?.headPic ?? "",
        id: "0",
        inSchedule: 0,
        likeTpIds: [],
        maxIdInPlan: String(sortedEntries.length),
        maxPlanProgramId: String(sortedEntries.length),
        maxWeeks: input.total_weeks,
        minWeeks: input.total_weeks,
        name: input.name,
        nickname: account.data?.nickname ?? "",
        officalConfig: {
          difficultyList: [],
          isOffical: 0,
          targetList: [],
        },
        operateUserId: userId,
        overview: input.overview,
        pbVersion: 3,
        planIcon: 1,
        programs,
        region: account.data?.userProfile?.region ?? 2,
        sex: account.data?.sex ?? 0,
        sourceId: "425868125142171649",
        sourceUrl:
          "https://oss.coros.com/source/source_default/0/915b927e9e0b4eccbdfee1dc45fddfc6.jpg",
        sportDatasInPlan: [],
        sportDatasNotInPlan: [],
        starTimestamp: 0,
        status: 1,
        thirdPartyId: 0,
        totalDay: input.total_day,
        totalDistance,
        totalDuration,
        totalTrainingLoad,
        totalWeeks: input.total_weeks,
        unit: 0,
        updateTime: "",
        updateTimestamp: 0,
        userId,
        userInfos: [],
        version: 0,
        videoCoverUrl: "",
        videoUrl: "",
        weekStages: [],
      };

      const result = await this.corosClient.request<CorosPlanAddResponse>({
        method: "POST",
        path: "/training/plan/add",
        body: payload,
      });

      if (result.result !== "0000" || !result.data) {
        return {
          ok: false,
          error: {
            code: "PLAN_CREATE_FAILED",
            message: result.message ?? "COROS plan creation failed",
          },
        };
      }

      return {
        ok: true,
        raw: input.raw ? result : undefined,
        data: {
          plan_id: result.data,
          name: input.name,
          overview: input.overview,
          total_weeks: input.total_weeks,
          total_day: input.total_day,
          entry_count: sortedEntries.length,
        },
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: "PLAN_CREATE_FAILED",
          message: error instanceof Error ? error.message : "Failed to create COROS plan",
        },
      };
    }
  }

  async getPlanDetail(input: GetPlanDetailInput): Promise<ToolResult<GetPlanDetailOutput>> {
    try {
      const payload = await this.corosClient.request<CorosPlanDetailResponse>({
        method: "GET",
        path: "/training/plan/detail",
        query: {
          supportRestExercise: 1,
          id: input.plan_id,
        },
      });

      if (payload.result !== "0000" || !payload.data?.id || !payload.data.name) {
        return {
          ok: false,
          error: {
            code: "PLAN_NOT_FOUND",
            message: payload.message ?? "COROS plan detail is unavailable",
          },
        };
      }

      const programsByIdInPlan = new Map(
        (payload.data.programs ?? []).map((program) => [program.idInPlan ?? "", program]),
      );
      const entries: PlanEntryDetail[] = (payload.data.entities ?? [])
        .filter((entity): entity is Required<Pick<typeof entity, "idInPlan" | "dayNo" | "planProgramId">> & typeof entity =>
          entity.idInPlan !== undefined &&
          entity.dayNo !== undefined &&
          entity.planProgramId !== undefined,
        )
        .map((entity) => {
          const program = programsByIdInPlan.get(entity.planProgramId);
          return {
            id_in_plan: entity.idInPlan,
            day_no: entity.dayNo,
            program_id: program?.id ?? "",
            program_name: program?.name ?? "",
          };
        })
        .sort((a, b) => a.day_no - b.day_no);

      return {
        ok: true,
        raw: input.raw ? payload : undefined,
        data: {
          plan_id: payload.data.id,
          name: payload.data.name,
          overview: payload.data.overview ?? "",
          total_weeks: payload.data.totalWeeks ?? 0,
          total_day: payload.data.totalDay ?? 0,
          entries,
        },
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: "PLAN_NOT_FOUND",
          message: error instanceof Error ? error.message : "Failed to fetch COROS plan detail",
        },
      };
    }
  }

  async validatePlanDates(
    input: ValidatePlanDatesInput,
  ): Promise<ToolResult<ValidatePlanDatesOutput>> {
    const detailResult = await this.getPlanDetail({
      plan_id: input.plan_id,
      raw: input.raw,
    });
    if (!detailResult.ok) {
      return detailResult;
    }

    const startDate = parseCorosDate(input.start_day);
    const predictedDates: PredictedDate[] = detailResult.data.entries.map((entry) => {
      const actualDate = addDays(startDate, entry.day_no);
      return {
        day_no: entry.day_no,
        date: formatCorosDate(actualDate),
        weekday: getIsoWeekday(actualDate),
        program_name: entry.program_name,
      };
    });

    const expectedWeekdays = input.expected_weekdays ?? [];
    const mismatchCount =
      expectedWeekdays.length === 0
        ? 0
        : predictedDates.filter(
            (item, index) => expectedWeekdays[index % expectedWeekdays.length] !== item.weekday,
          ).length;

    return {
      ok: true,
      raw: input.raw ? detailResult.raw : undefined,
      data: {
        plan_id: detailResult.data.plan_id,
        start_day: input.start_day,
        predicted_dates: predictedDates,
        weekday_match: mismatchCount === 0,
        mismatch_count: mismatchCount,
      },
    };
  }
}
