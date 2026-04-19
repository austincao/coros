import type {
  ActivityDetailOutput,
  ActivityLap,
  ActivityListItem,
  GetActivityDetailInput,
  ListActivitiesInput,
  ListActivitiesOutput,
  ToolResult,
} from "../types.js";
import { CorosClient } from "../client/coros-client.js";

interface CorosActivityListResponse {
  result: string;
  message?: string;
  data?: {
    count?: number;
    pageNumber?: number;
    totalPage?: number;
    dataList?: Array<{
      labelId?: string;
      sportType?: number;
      name?: string;
      date?: number;
      total?: number;
      totalTime?: number;
      workoutTime?: number;
      trainingLoad?: number;
      avgHr?: number;
      avgCadence?: number;
      avgPower?: number;
      ascent?: number;
      descent?: number;
      device?: string;
      avgSpeed?: number;
      speedType?: number;
    }>;
  };
}

interface CorosActivityDetailResponse {
  result: string;
  message?: string;
  data?: {
    deviceList?: Array<{
      name?: string;
    }>;
    graphList?: Array<{
      type?: number | string;
      key?: string;
    }>;
    lapList?: Array<{
      lapItemList?: Array<{
        lapIndex?: number;
        distance?: number;
        totalDistance?: number;
        time?: number;
        totalLength?: number;
        avgHr?: number;
        maxHr?: number;
        avgCadence?: number;
        avgPower?: number;
        avgPace?: number;
        adjustedPace?: number;
        elevGain?: number;
        totalDescent?: number;
      }>;
    }>;
    summary?: {
      sportType?: number;
      name?: string;
      timezone?: number;
      startTimestamp?: number;
      endTimestamp?: number;
      distance?: number;
      totalTime?: number;
      workoutTime?: number;
      trainingLoad?: number;
      avgHr?: number;
      maxHr?: number;
      avgPower?: number;
      maxPower?: number;
      avgCadence?: number;
      maxCadence?: number;
      avgSpeed?: number;
      adjustedPace?: number;
      elevGain?: number;
      totalDescent?: number;
      aerobicEffect?: number;
      anaerobicEffect?: number;
      currentVo2Max?: number;
      staminaLevel7d?: number;
      speedType?: number;
    };
    weather?: {
      temperature?: number;
      humidity?: number;
      weatherType?: number;
      windSpeed?: number;
    };
  };
}

type CorosActivityListEntry = NonNullable<
  NonNullable<CorosActivityListResponse["data"]>["dataList"]
>[number];

type CorosActivityLapEntry = NonNullable<
  NonNullable<
    NonNullable<CorosActivityDetailResponse["data"]>["lapList"]
  >[number]["lapItemList"]
>[number];

function toCorosDate(value: number | string | undefined) {
  return String(value ?? "") as `${number}`;
}

function fromDetailDistance(value: number | undefined) {
  return Number(((value ?? 0) / 100).toFixed(2));
}

function fromDetailSeconds(value: number | undefined) {
  return Number(((value ?? 0) / 100).toFixed(2));
}

function fromDetailTimestampSeconds(value: number | undefined) {
  return Number(((value ?? 0) / 100).toFixed(2));
}

function isWithinDateRange(date: number, dateFrom?: `${number}`, dateTo?: `${number}`) {
  const numeric = Number(date);
  if (dateFrom && numeric < Number(dateFrom)) {
    return false;
  }
  if (dateTo && numeric > Number(dateTo)) {
    return false;
  }
  return true;
}

function mapActivityListItem(
  item: CorosActivityListEntry,
): ActivityListItem | null {
  if (!item?.labelId || item.sportType === undefined || item.date === undefined || !item.name) {
    return null;
  }

  return {
    label_id: item.labelId,
    sport_type: item.sportType,
    name: item.name,
    date: toCorosDate(item.date),
    distance_m: Number(item.total ?? 0),
    distance_km: Number(((item.total ?? 0) / 1000).toFixed(2)),
    total_time_s: Number(item.totalTime ?? 0),
    workout_time_s: Number(item.workoutTime ?? item.totalTime ?? 0),
    training_load: Number(item.trainingLoad ?? 0),
    avg_hr: Number(item.avgHr ?? 0),
    avg_cadence: Number(item.avgCadence ?? 0),
    avg_power: Number(item.avgPower ?? 0),
    ascent_m: Number(item.ascent ?? 0),
    descent_m: Number(item.descent ?? 0),
    device: item.device ?? "",
    pace_sec_per_km: item.speedType === 3 ? Number(item.avgSpeed ?? 0) : undefined,
    speed_value: item.avgSpeed !== undefined ? Number(item.avgSpeed) : undefined,
    speed_type: item.speedType,
  };
}

function mapActivityLap(
  lap: CorosActivityLapEntry,
): ActivityLap {
  return {
    lap_index: Number(lap.lapIndex ?? 0),
    distance_m: fromDetailDistance(lap.distance),
    total_distance_m: fromDetailDistance(lap.totalDistance),
    time_s: fromDetailSeconds(lap.time),
    total_time_s: fromDetailSeconds(lap.totalLength),
    avg_hr: Number(lap.avgHr ?? 0),
    max_hr: Number(lap.maxHr ?? 0),
    avg_cadence: Number(lap.avgCadence ?? 0),
    avg_power: Number(lap.avgPower ?? 0),
    avg_pace_sec_per_km: lap.avgPace !== undefined ? Number(lap.avgPace) : undefined,
    adjusted_pace_sec_per_km:
      lap.adjustedPace !== undefined ? Number(lap.adjustedPace) : undefined,
    elev_gain_m: Number(lap.elevGain ?? 0),
    total_descent_m: Number(lap.totalDescent ?? 0),
  };
}

export class ActivityService {
  constructor(private readonly corosClient: CorosClient) {}

  async listActivities(input: ListActivitiesInput): Promise<ToolResult<ListActivitiesOutput>> {
    const pageSize = Math.min(Math.max(input.page_size ?? 20, 1), 100);
    const startPage = Math.max(input.page_number ?? 1, 1);
    const maxPages =
      input.max_pages ?? (input.date_from || input.date_to || input.sport_types?.length ? 10 : 1);
    const activities: ActivityListItem[] = [];

    let totalAvailable = 0;
    let totalPages = 0;
    let pagesFetched = 0;

    try {
      for (
        let pageNumber = startPage;
        pageNumber < startPage + maxPages;
        pageNumber += 1
      ) {
        const response = await this.corosClient.request<CorosActivityListResponse>({
          method: "GET",
          path: "/activity/query",
          query: {
            size: pageSize,
            pageNumber,
            modeList: "",
          },
        });

        if (response.result !== "0000" || !response.data) {
          return {
            ok: false,
            error: {
              code: "ACTIVITY_LIST_FAILED",
              message: response.message ?? "COROS activity list is unavailable",
            },
          };
        }

        totalAvailable = response.data.count ?? totalAvailable;
        totalPages = response.data.totalPage ?? totalPages;
        pagesFetched += 1;

        const mappedPage = (response.data.dataList ?? [])
          .map(mapActivityListItem)
          .filter((item): item is ActivityListItem => Boolean(item))
          .filter((item) => isWithinDateRange(Number(item.date), input.date_from, input.date_to))
          .filter((item) =>
            input.sport_types?.length ? input.sport_types.includes(item.sport_type) : true,
          );

        activities.push(...mappedPage);

        const rawItems = response.data.dataList ?? [];
        const lastDate = rawItems.length > 0 ? Number(rawItems[rawItems.length - 1]?.date ?? 0) : 0;

        if (pageNumber >= (response.data.totalPage ?? pageNumber)) {
          break;
        }

        if (input.date_from && lastDate > 0 && lastDate < Number(input.date_from)) {
          break;
        }

        if (!input.date_from && !input.date_to && !input.sport_types?.length && maxPages === 1) {
          break;
        }
      }

      return {
        ok: true,
        raw: input.raw
          ? {
              totalAvailable,
              totalPages,
              pagesFetched,
            }
          : undefined,
        data: {
          total_available: totalAvailable,
          total_pages: totalPages,
          page_number: startPage,
          page_size: pageSize,
          pages_fetched: pagesFetched,
          activities,
        },
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: "ACTIVITY_LIST_FAILED",
          message: error instanceof Error ? error.message : "Failed to fetch COROS activity list",
        },
      };
    }
  }

  async getActivityDetail(
    input: GetActivityDetailInput,
  ): Promise<ToolResult<ActivityDetailOutput>> {
    try {
      const response = await this.corosClient.request<CorosActivityDetailResponse>({
        method: "POST",
        path: "/activity/detail/query",
        query: {
          screenW: input.screen_w ?? 960,
          screenH: input.screen_h ?? 900,
          labelId: input.label_id,
          sportType: input.sport_type,
        },
        body: {},
      });

      if (response.result !== "0000" || !response.data?.summary) {
        return {
          ok: false,
          error: {
            code: "ACTIVITY_DETAIL_FAILED",
            message: response.message ?? "COROS activity detail is unavailable",
          },
        };
      }

      const summary = response.data.summary;
      const laps = (response.data.lapList?.[0]?.lapItemList ?? []).map(mapActivityLap);

      return {
        ok: true,
        raw: input.raw ? response : undefined,
        data: {
          label_id: input.label_id,
          sport_type: Number(summary.sportType ?? input.sport_type),
          name: summary.name ?? "",
          timezone: Number(summary.timezone ?? 0),
          start_timestamp_s: fromDetailTimestampSeconds(summary.startTimestamp),
          end_timestamp_s: fromDetailTimestampSeconds(summary.endTimestamp),
          distance_m: fromDetailDistance(summary.distance),
          distance_km: Number((fromDetailDistance(summary.distance) / 1000).toFixed(2)),
          total_time_s: fromDetailSeconds(summary.totalTime),
          workout_time_s: fromDetailSeconds(summary.workoutTime),
          training_load: Number(summary.trainingLoad ?? 0),
          avg_hr: Number(summary.avgHr ?? 0),
          max_hr: Number(summary.maxHr ?? 0),
          avg_power: Number(summary.avgPower ?? 0),
          max_power: Number(summary.maxPower ?? 0),
          avg_cadence: Number(summary.avgCadence ?? 0),
          max_cadence: Number(summary.maxCadence ?? 0),
          avg_pace_sec_per_km:
            summary.speedType === 3 && summary.avgSpeed !== undefined
              ? Number(summary.avgSpeed)
              : undefined,
          adjusted_pace_sec_per_km:
            summary.adjustedPace !== undefined ? Number(summary.adjustedPace) : undefined,
          elev_gain_m: Number(summary.elevGain ?? 0),
          total_descent_m: Number(summary.totalDescent ?? 0),
          aerobic_effect:
            summary.aerobicEffect !== undefined ? Number(summary.aerobicEffect) : undefined,
          anaerobic_effect:
            summary.anaerobicEffect !== undefined ? Number(summary.anaerobicEffect) : undefined,
          current_vo2_max:
            summary.currentVo2Max !== undefined ? Number(summary.currentVo2Max) : undefined,
          stamina_level_7d:
            summary.staminaLevel7d !== undefined ? Number(summary.staminaLevel7d) : undefined,
          device_name: response.data.deviceList?.[0]?.name,
          weather: response.data.weather
            ? {
                temperature: response.data.weather.temperature,
                humidity: response.data.weather.humidity,
                weather_type: response.data.weather.weatherType,
                wind_speed: response.data.weather.windSpeed,
              }
            : undefined,
          graph_types: (response.data.graphList ?? []).map(
            (graph) => graph.type ?? graph.key ?? "unknown",
          ),
          laps,
        },
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: "ACTIVITY_DETAIL_FAILED",
          message:
            error instanceof Error ? error.message : "Failed to fetch COROS activity detail",
        },
      };
    }
  }
}
