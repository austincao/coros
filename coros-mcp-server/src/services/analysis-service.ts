import type {
  ActivityDetailOutput,
  AnalyzeActivityInput,
  AnalyzeActivityOutput,
  AnalyzeRecentWeekInput,
  AnalyzeRecentWeekOutput,
  AnalyzeTrainingBalanceInput,
  AnalyzeTrainingBalanceOutput,
  CorosDate,
  RunningWeekReportInput,
  RunningWeekReportOutput,
  ToolResult,
} from "../types.js";
import { classifyRun, isHikeSport, isRunSport, isStrengthSport } from "../activity-classification.js";
import { ActivityService } from "./activity-service.js";
import { ProfileService } from "./profile-service.js";
import { buildRunningWeekReport } from "../report/running-week-report-builder.js";

function formatLocalCorosDate(date: Date): CorosDate {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}` as CorosDate;
}

function parseCorosDate(date: CorosDate): Date {
  const value = String(date);
  return new Date(
    Number(value.slice(0, 4)),
    Number(value.slice(4, 6)) - 1,
    Number(value.slice(6, 8)),
  );
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

function round(value: number, digits = 2) {
  return Number(value.toFixed(digits));
}

function formatPace(pace?: number) {
  if (!pace || !Number.isFinite(pace)) {
    return undefined;
  }
  const minutes = Math.floor(pace / 60);
  const seconds = Math.round(pace % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}'${seconds}"`;
}

function buildRunConclusion(detail: ActivityDetailOutput, lthr: number, ltPace?: number) {
  const evidence: string[] = [];
  const risks: string[] = [];
  const suggestions: string[] = [];

  const paceText = formatPace(detail.avg_pace_sec_per_km);
  if (paceText) {
    evidence.push(`平均配速约 ${paceText}/km`);
  }
  evidence.push(`训练负荷 ${detail.training_load}`);
  evidence.push(`平均心率 ${detail.avg_hr}，最大心率 ${detail.max_hr}`);

  if (detail.distance_km >= 12) {
    evidence.push(`距离 ${detail.distance_km}km，属于长距离范畴`);
    if (detail.avg_hr >= lthr - 10) {
      risks.push("长跑平均心率偏高，说明这次长跑更接近中高强度而不是纯慢跑");
      suggestions.push("下次长跑优先把前半程心率压低，避免把长跑跑成隐性质量课");
      return {
        activityType: "long_run",
        conclusion: "这是一节完成质量不错的长跑，但整体强度略偏高。",
        evidence,
        risks,
        suggestions,
      };
    }

    suggestions.push("这类长跑值得保留，后续可以作为半马备赛周的核心课继续推进");
    return {
      activityType: "long_run",
      conclusion: "这是一节比较稳的长跑，结构和强度都比较合理。",
      evidence,
      risks,
      suggestions,
    };
  }

  if (
    detail.avg_pace_sec_per_km !== undefined &&
    ltPace !== undefined &&
    Math.abs(detail.avg_pace_sec_per_km - ltPace) <= 20 &&
    detail.aerobic_effect !== undefined &&
    detail.aerobic_effect >= 3
  ) {
    suggestions.push("这类接近阈值的训练可以作为专项质量课保留，但一周控制在 1 次左右更稳");
    return {
      activityType: "threshold_like",
      conclusion: "这次更像一节接近阈值的专项跑，训练刺激比较明确。",
      evidence,
      risks,
      suggestions,
    };
  }

  if (detail.avg_hr <= lthr - 15 && detail.training_load <= 90) {
    suggestions.push("如果本意是轻松跑，这次完成得比较接近目标");
    return {
      activityType: "easy_run",
      conclusion: "这次整体更像轻松有氧跑，强度控制比较温和。",
      evidence,
      risks,
      suggestions,
    };
  }

  risks.push("这次不算很硬，但也不像纯恢复跑，属于中等刺激");
  suggestions.push("如果这类跑安排在恢复日，建议再放松一点；如果安排在承上启下的训练日，则问题不大");
  return {
    activityType: "moderate_run",
    conclusion: "这次属于中等偏上的有氧跑，不是纯轻松，也还没到很强的专项刺激。",
    evidence,
    risks,
    suggestions,
  };
}

export class AnalysisService {
  constructor(
    private readonly activityService: ActivityService,
    private readonly profileService: ProfileService,
  ) {}

  async analyzeActivity(
    input: AnalyzeActivityInput,
  ): Promise<ToolResult<AnalyzeActivityOutput>> {
    const [detailResult, profileResult] = await Promise.all([
      this.activityService.getActivityDetail({
        label_id: input.label_id,
        sport_type: input.sport_type,
        raw: input.raw,
      }),
      this.profileService.getProfile(),
    ]);

    if (!detailResult.ok) {
      return detailResult;
    }

    if (!profileResult.ok) {
      return profileResult;
    }

    const detail = detailResult.data;
    const profile = profileResult.data;

    let activityType = "other";
    let conclusion = "这次活动已经成功读取，但当前自动诊断更偏向跑步项目。";
    let evidence = [`训练负荷 ${detail.training_load}`];
    let risks: string[] = [];
    let suggestions = ["如果你主要关注跑步能力提升，优先分析跑步和跑步机记录会更有价值"];

    if (isRunSport(detail.sport_type)) {
      const runAnalysis = buildRunConclusion(detail, profile.lthr, profile.lt_pace_sec_per_km);
      activityType = runAnalysis.activityType;
      conclusion = runAnalysis.conclusion;
      evidence = runAnalysis.evidence;
      risks = runAnalysis.risks;
      suggestions = runAnalysis.suggestions;
    } else if (isStrengthSport(detail.sport_type)) {
      activityType = "strength";
      conclusion = "这是一节力量训练，更适合作为跑步之外的辅助刺激。";
      evidence = [`训练负荷 ${detail.training_load}`, `总时长 ${round(detail.total_time_s / 60, 1)} 分钟`];
      suggestions = ["力量课更适合放在轻松跑当天或非关键跑前后，避免和阈值课、长跑叠加过重"];
    } else if (isHikeSport(detail.sport_type)) {
      activityType = "hike";
      conclusion = "这是一节低到中等强度的徒步/恢复性活动。";
      evidence = [`训练负荷 ${detail.training_load}`, `时长 ${round(detail.total_time_s / 60, 1)} 分钟`];
      suggestions = ["这类活动可以作为恢复和补充活动，但不要替代专项跑步训练"];
    }

    return {
      ok: true,
      raw: input.raw ? { detail: detailResult.raw, profile: profileResult.raw } : undefined,
      data: {
        label_id: detail.label_id,
        sport_type: detail.sport_type,
        name: detail.name,
        activity_type: activityType,
        metrics: {
          distance_km: detail.distance_km,
          total_time_s: detail.total_time_s,
          training_load: detail.training_load,
          avg_hr: detail.avg_hr,
          max_hr: detail.max_hr,
          avg_cadence: detail.avg_cadence,
          avg_pace_sec_per_km: detail.avg_pace_sec_per_km,
          aerobic_effect: detail.aerobic_effect,
          anaerobic_effect: detail.anaerobic_effect,
          current_vo2_max: detail.current_vo2_max,
        },
        conclusion,
        evidence,
        risks,
        suggestions,
      },
    };
  }

  async analyzeRecentWeek(
    input: AnalyzeRecentWeekInput,
  ): Promise<ToolResult<AnalyzeRecentWeekOutput>> {
    const endDay = input.end_day ?? formatLocalCorosDate(new Date());
    const endDate = parseCorosDate(endDay);
    const startDay = formatLocalCorosDate(addDays(endDate, -6));

    const [activitiesResult, profileResult] = await Promise.all([
      this.activityService.listActivities({
        date_from: startDay,
        date_to: endDay,
        page_size: 50,
        max_pages: 4,
        raw: input.raw,
      }),
      this.profileService.getProfile(),
    ]);

    if (!activitiesResult.ok) {
      return activitiesResult;
    }
    if (!profileResult.ok) {
      return profileResult;
    }

    const activities = activitiesResult.data.activities;
    const profile = profileResult.data;
    const runs = activities.filter((item) => isRunSport(item.sport_type));
    const strengths = activities.filter((item) => isStrengthSport(item.sport_type));
    const hikes = activities.filter((item) => isHikeSport(item.sport_type));

    const longRunCount = runs.filter((item) => classifyRun(item, profile.lthr) === "long").length;
    const qualityRunCount = runs.filter((item) => classifyRun(item, profile.lthr) === "quality").length;
    const easyRunCount = runs.filter((item) => classifyRun(item, profile.lthr) === "easy").length;

    const totalDistanceKm = round(activities.reduce((sum, item) => sum + item.distance_km, 0));
    const runDistanceKm = round(runs.reduce((sum, item) => sum + item.distance_km, 0));
    const totalTrainingLoad = activities.reduce((sum, item) => sum + item.training_load, 0);
    const runTrainingLoad = runs.reduce((sum, item) => sum + item.training_load, 0);

    let conclusion = "这一周整体训练结构比较均衡。";
    const evidence = [
      `共 ${activities.length} 条活动，其中跑步 ${runs.length} 次`,
      `总训练负荷 ${totalTrainingLoad}，跑步训练负荷 ${runTrainingLoad}`,
      `跑步距离 ${runDistanceKm}km`,
    ];
    const risks: string[] = [];
    const suggestions: string[] = [];

    if (runs.length >= 3 && longRunCount >= 1 && qualityRunCount === 0) {
      conclusion = "这一周更偏基础有氧和耐力，跑步结构稳，但专项质量刺激偏少。";
      risks.push("如果目标是半马提升，本周缺少明确的阈值或质量课");
      suggestions.push("下周优先恢复 1 次明确的专项质量课，而不是继续只堆总量");
    } else if (qualityRunCount >= 2) {
      conclusion = "这一周跑步刺激偏强，质量课占比略高。";
      risks.push("质量课过多会抬高疲劳，影响后续恢复和长跑质量");
      suggestions.push("下周更适合保留 1 次关键质量课，其余回到轻松有氧");
    } else if (runs.length <= 1) {
      conclusion = "这一周跑步频率偏低，更像恢复周或非专项周。";
      suggestions.push("如果后续想提升跑步能力，下周需要把跑步频率逐步恢复起来");
    } else {
      conclusion = "这一周整体训练节奏比较平稳，基础训练占主导。";
      suggestions.push("如果主观恢复还可以，下周可以在保持总量的前提下加入 1 次更明确的专项刺激");
    }

    if (strengths.length >= 2 && runs.length >= 2) {
      risks.push("跑步和力量叠加较多，恢复压力会高于表面训练量");
      suggestions.push("关键跑当天尽量不要叠太重的力量课，或者把力量强度下调一些");
    }

    return {
      ok: true,
      raw: input.raw ? { activities: activitiesResult.raw, profile: profileResult.raw } : undefined,
      data: {
        date_from: startDay,
        date_to: endDay,
        totals: {
          activity_count: activities.length,
          run_count: runs.length,
          strength_count: strengths.length,
          hike_count: hikes.length,
          total_distance_km: totalDistanceKm,
          run_distance_km: runDistanceKm,
          total_training_load: totalTrainingLoad,
          run_training_load: runTrainingLoad,
        },
        distribution: {
          long_run_count: longRunCount,
          quality_run_count: qualityRunCount,
          easy_run_count: easyRunCount,
        },
        conclusion,
        evidence,
        risks,
        suggestions,
      },
    };
  }

  async analyzeTrainingBalance(
    input: AnalyzeTrainingBalanceInput,
  ): Promise<ToolResult<AnalyzeTrainingBalanceOutput>> {
    const endDay = input.end_day ?? formatLocalCorosDate(new Date());
    const endDate = parseCorosDate(endDay);
    const recentDays = input.recent_days ?? 7;
    const baselineDays = input.baseline_days ?? 21;

    const recentStart = formatLocalCorosDate(addDays(endDate, -(recentDays - 1)));
    const baselineEndDate = addDays(endDate, -recentDays);
    const baselineStart = formatLocalCorosDate(addDays(baselineEndDate, -(baselineDays - 1)));
    const baselineEnd = formatLocalCorosDate(baselineEndDate);

    const [recentResult, baselineResult] = await Promise.all([
      this.activityService.listActivities({
        date_from: recentStart,
        date_to: endDay,
        page_size: 100,
        max_pages: 6,
      }),
      this.activityService.listActivities({
        date_from: baselineStart,
        date_to: baselineEnd,
        page_size: 100,
        max_pages: 10,
      }),
    ]);

    if (!recentResult.ok) {
      return recentResult;
    }
    if (!baselineResult.ok) {
      return baselineResult;
    }

    const recentRuns = recentResult.data.activities.filter((item) => isRunSport(item.sport_type));
    const baselineRuns = baselineResult.data.activities.filter((item) => isRunSport(item.sport_type));

    const recentLoad = recentRuns.reduce((sum, item) => sum + item.training_load, 0);
    const baselineLoad = baselineRuns.reduce((sum, item) => sum + item.training_load, 0);
    const recentDistance = round(recentRuns.reduce((sum, item) => sum + item.distance_km, 0));
    const baselineDistance = round(baselineRuns.reduce((sum, item) => sum + item.distance_km, 0));
    const baselineLoadPerWeek = baselineDays > 0 ? (baselineLoad / baselineDays) * recentDays : 0;
    const baselineDistancePerWeek =
      baselineDays > 0 ? (baselineDistance / baselineDays) * recentDays : 0;
    const baselineRunCountPerWeek =
      baselineDays > 0 ? (baselineRuns.length / baselineDays) * recentDays : 0;

    const loadRatio = baselineLoadPerWeek > 0 ? recentLoad / baselineLoadPerWeek : 1;
    const distanceRatio = baselineDistancePerWeek > 0 ? recentDistance / baselineDistancePerWeek : 1;
    const runCountRatio =
      baselineRunCountPerWeek > 0 ? recentRuns.length / baselineRunCountPerWeek : 1;

    let conclusion = "近期训练负荷和基线大体接近。";
    const evidence = [
      `近 ${recentDays} 天跑步 ${recentRuns.length} 次，跑步负荷 ${recentLoad}`,
      `前 ${baselineDays} 天折算到 ${recentDays} 天的跑步负荷约 ${round(baselineLoadPerWeek)}`,
      `负荷比约 ${round(loadRatio, 2)}`,
    ];
    const risks: string[] = [];
    const suggestions: string[] = [];

    if (loadRatio >= 1.2 || distanceRatio >= 1.2) {
      conclusion = "近期训练负荷明显高于基线，属于偏上冲的一段。";
      risks.push("如果继续无保护地加量，疲劳和伤病风险会上升");
      suggestions.push("下一周优先持平或小降量，不要继续连续上冲");
    } else if (loadRatio <= 0.8 && distanceRatio <= 0.8) {
      conclusion = "近期训练负荷低于基线，整体更像恢复或偏保守的一段。";
      suggestions.push("如果主观恢复良好，可以考虑把下周跑量或专项刺激逐步补回来");
    } else {
      suggestions.push("目前负荷节奏相对稳，适合在维持总量的前提下微调质量课结构");
    }

    return {
      ok: true,
      raw: input.raw ? { recent: recentResult.raw, baseline: baselineResult.raw } : undefined,
      data: {
        recent_window: {
          date_from: recentStart,
          date_to: endDay,
          run_count: recentRuns.length,
          run_distance_km: recentDistance,
          run_training_load: recentLoad,
        },
        baseline_window: {
          date_from: baselineStart,
          date_to: baselineEnd,
          run_count: baselineRuns.length,
          run_distance_km: baselineDistance,
          run_training_load: baselineLoad,
        },
        comparison: {
          load_ratio: round(loadRatio, 2),
          distance_ratio: round(distanceRatio, 2),
          run_count_ratio: round(runCountRatio, 2),
        },
        conclusion,
        evidence,
        risks,
        suggestions,
      },
    };
  }

  async runningWeekReport(
    input: RunningWeekReportInput,
  ): Promise<ToolResult<RunningWeekReportOutput>> {
    return buildRunningWeekReport(this.activityService, this.profileService, input);
  }
}
