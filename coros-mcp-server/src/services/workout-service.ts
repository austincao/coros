import type { CreateWorkoutInput, CreateWorkoutOutput, ToolResult } from "../types.js";
import { CorosClient } from "../client/coros-client.js";

interface CorosAccountResponse {
  result: string;
  message?: string;
  data?: {
    userId?: string;
    nickname?: string;
    headPic?: string;
    sex?: number;
    zoneData?: {
      ltsp?: number;
    };
  };
}

interface CorosProgramAddResponse {
  result: string;
  message?: string;
  data?: string;
}

function midpoint(a: number, b: number) {
  return Math.round((a + b) / 2);
}

function buildIntensity(
  ltPaceSecPerKm: number,
  fromSecPerKm: number,
  toSecPerKm: number,
) {
  const faster = Math.min(fromSecPerKm, toSecPerKm);
  const slower = Math.max(fromSecPerKm, toSecPerKm);
  return {
    intensityType: 3,
    intensityValue: faster * 1000,
    intensityValueExtend: slower * 1000,
    intensityPercent: Math.round((ltPaceSecPerKm / slower) * 100000),
    intensityPercentExtend: Math.round((ltPaceSecPerKm / faster) * 100000),
  };
}

function estimateDurationSeconds(distanceMeters: number, fromSecPerKm: number, toSecPerKm: number) {
  const pace = midpoint(fromSecPerKm, toSecPerKm);
  return Math.round((distanceMeters / 100000) * pace);
}

export class WorkoutService {
  constructor(private readonly corosClient: CorosClient) {}

  async createWorkout(input: CreateWorkoutInput): Promise<ToolResult<CreateWorkoutOutput>> {
    if (!input.name.trim() || input.segments.length === 0) {
      return {
        ok: false,
        error: {
          code: "PROGRAM_CREATE_FAILED",
          message: "Workout name and segments are required",
        },
      };
    }

    if (
      input.sport_type !== "run" ||
      input.segments.length !== 3 ||
      input.segments.some(
        (segment) =>
          segment.target_type !== "distance" || segment.intensity_type !== "pace_range",
      )
    ) {
      return {
        ok: false,
        error: {
          code: "PROGRAM_CREATE_FAILED",
          message:
            "Current implementation supports running workouts with exactly 3 distance-based pace-range segments",
        },
      };
    }

    const [warmup, main, cooldown] = input.segments;

    try {
      const account = await this.corosClient.request<CorosAccountResponse>({
        method: "GET",
        path: "/account/query",
      });

      const ltPace = account.data?.zoneData?.ltsp;
      const userId = account.data?.userId;
      if (account.result !== "0000" || !ltPace || !userId) {
        return {
          ok: false,
          error: {
            code: "PROGRAM_CREATE_FAILED",
            message: account.message ?? "Unable to read COROS profile required for workout creation",
          },
        };
      }

      const warmupIntensity = buildIntensity(
        ltPace,
        warmup.intensity.from_sec_per_km,
        warmup.intensity.to_sec_per_km,
      );
      const mainIntensity = buildIntensity(
        ltPace,
        main.intensity.from_sec_per_km,
        main.intensity.to_sec_per_km,
      );
      const cooldownIntensity = buildIntensity(
        ltPace,
        cooldown.intensity.from_sec_per_km,
        cooldown.intensity.to_sec_per_km,
      );

      const exercises = [
        {
          access: 0,
          defaultOrder: 0,
          equipment: [1],
          exerciseType: 1,
          groupId: "0",
          hrType: 0,
          intensityCustom: 0,
          intensityDisplayUnit: 1,
          intensityMultiplier: 1000,
          isDefaultAdd: 0,
          isGroup: false,
          isIntensityPercent: false,
          name: "T1120",
          originId: "425895398452936705",
          overview: "sid_run_warm_up_dist",
          part: [0],
          restType: 3,
          restValue: 0,
          sets: 1,
          sortNo: 16777216,
          sourceId: "0",
          sourceUrl: "",
          sportType: 1,
          status: 1,
          subType: 0,
          targetDisplayUnit: 1,
          targetType: 5,
          targetValue: warmup.target_value,
          userId,
          videoInfos: [],
          videoUrl: "",
          ...warmupIntensity,
        },
        {
          access: 0,
          defaultOrder: 0,
          equipment: [1],
          exerciseType: 2,
          groupId: "0",
          hrType: 0,
          intensityCustom: 0,
          intensityDisplayUnit: 1,
          intensityMultiplier: 1000,
          isDefaultAdd: 0,
          isGroup: false,
          isIntensityPercent: false,
          name: "T3001",
          originId: "426109589008859136",
          overview: "sid_run_training",
          part: [0],
          restType: 3,
          restValue: 0,
          sets: 1,
          sortNo: 33554432,
          sourceId: "0",
          sourceUrl: "",
          sportType: 1,
          status: 1,
          subType: 0,
          targetDisplayUnit: 1,
          targetType: 5,
          targetValue: main.target_value,
          userId,
          videoInfos: [],
          videoUrl: "",
          ...mainIntensity,
        },
        {
          access: 0,
          defaultOrder: 0,
          equipment: [1],
          exerciseType: 3,
          groupId: "0",
          hrType: 0,
          intensityCustom: 0,
          intensityDisplayUnit: 1,
          intensityMultiplier: 1000,
          isDefaultAdd: 0,
          isGroup: false,
          isIntensityPercent: false,
          name: "T1122",
          originId: "425895456971866112",
          overview: "sid_run_cool_down_dist",
          part: [0],
          restType: 3,
          restValue: 0,
          sets: 1,
          sortNo: 50331648,
          sourceId: "0",
          sourceUrl: "",
          sportType: 1,
          status: 1,
          subType: 0,
          targetDisplayUnit: 1,
          targetType: 5,
          targetValue: cooldown.target_value,
          userId,
          videoInfos: [],
          videoUrl: "",
          ...cooldownIntensity,
        },
      ];

      const totalDistance = warmup.target_value + main.target_value + cooldown.target_value;
      const totalDuration =
        estimateDurationSeconds(
          warmup.target_value,
          warmup.intensity.from_sec_per_km,
          warmup.intensity.to_sec_per_km,
        ) +
        estimateDurationSeconds(
          main.target_value,
          main.intensity.from_sec_per_km,
          main.intensity.to_sec_per_km,
        ) +
        estimateDurationSeconds(
          cooldown.target_value,
          cooldown.intensity.from_sec_per_km,
          cooldown.intensity.to_sec_per_km,
        );
      const mainMidPace = midpoint(main.intensity.from_sec_per_km, main.intensity.to_sec_per_km);
      const intensityFactor = ltPace / mainMidPace;
      const estimatedTrainingLoad = Math.max(
        1,
        Math.round((totalDistance / 100000) * (8 + intensityFactor * 6)),
      );

      const payload = {
        access: 1,
        distance: totalDistance,
        distanceDisplayUnit: 1,
        duration: totalDuration,
        elevGain: 0,
        essence: 0,
        estimatedDistance: totalDistance,
        estimatedTime: totalDuration,
        estimatedType: 6,
        estimatedValue: estimatedTrainingLoad,
        exerciseBarChart: [
          {
            exerciseType: 1,
            height: 78,
            name: "T1120",
            targetType: 5,
            targetValue: warmup.target_value,
            value: warmup.target_value,
            width: Number(((warmup.target_value / totalDistance) * 100).toFixed(2)),
            widthFill: 0,
          },
          {
            exerciseType: 2,
            height: intensityFactor >= 0.9 ? 98 : 78,
            name: "T3001",
            targetType: 5,
            targetValue: main.target_value,
            value: main.target_value,
            width: Number(((main.target_value / totalDistance) * 100).toFixed(2)),
            widthFill: 0,
          },
          {
            exerciseType: 3,
            height: 78,
            name: "T1122",
            targetType: 5,
            targetValue: cooldown.target_value,
            value: cooldown.target_value,
            width: Number(((cooldown.target_value / totalDistance) * 100).toFixed(2)),
            widthFill: 0,
          },
        ],
        exerciseNum: exercises.length,
        exercises,
        isTargetTypeConsistent: 1,
        name: input.name,
        originEssence: 0,
        overview: input.overview,
        pbVersion: 3,
        pitch: 0,
        poolLength: 2500,
        poolLengthId: 1,
        poolLengthUnit: 2,
        referExercise: {
          hrType: 0,
          intensityType: 0,
          valueType: 1,
        },
        simple: false,
        sourceId: "425868142590476288",
        sourceUrl:
          "https://oss.coros.com/source/source_default/0/6097a29cf17a435f88b573c08679280b.jpg",
        sportType: 1,
        status: 1,
        subType: 65535,
        targetType: 5,
        targetValue: totalDistance,
        totalSets: exercises.length,
        trainingLoad: estimatedTrainingLoad,
        type: 0,
        unit: 0,
        userId,
        videoCoverUrl: "",
        videoUrl: "",
      };

      const result = await this.corosClient.request<CorosProgramAddResponse>({
        method: "POST",
        path: "/training/program/add",
        body: payload,
      });

      if (result.result !== "0000" || !result.data) {
        return {
          ok: false,
          error: {
            code: "PROGRAM_CREATE_FAILED",
            message: result.message ?? "COROS workout creation failed",
          },
        };
      }

      return {
        ok: true,
        raw: input.raw ? result : undefined,
        data: {
          program_id: result.data,
          name: input.name,
          overview: input.overview,
          sport_type: "run",
        },
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: "PROGRAM_CREATE_FAILED",
          message: error instanceof Error ? error.message : "Failed to create COROS workout",
        },
      };
    }
  }
}
