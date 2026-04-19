import type {
  CorosDate,
  RecommendNextWeekInput,
  RecommendNextWeekOutput,
  RecommendedSession,
  ToolResult,
} from "../types.js";
import { AnalysisService } from "./analysis-service.js";
import { ProfileService } from "./profile-service.js";

const WEEKDAY_LABELS: Record<number, string> = {
  1: "周一",
  2: "周二",
  3: "周三",
  4: "周四",
  5: "周五",
  6: "周六",
  7: "周日",
};

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

function round(value: number, digits = 1) {
  return Number(value.toFixed(digits));
}

function formatPace(sec: number) {
  const minutes = Math.floor(sec / 60);
  const seconds = Math.round(sec % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}'${seconds}"`;
}

function normalizeWeekdays(preferredWeekdays?: number[], targetRunsPerWeek = 3) {
  const defaults = [2, 4, 7];
  const base = (preferredWeekdays?.length ? preferredWeekdays : defaults)
    .filter((day) => day >= 1 && day <= 7)
    .slice(0, targetRunsPerWeek);

  if (base.length >= targetRunsPerWeek) {
    return base;
  }

  for (const candidate of defaults) {
    if (!base.includes(candidate)) {
      base.push(candidate);
    }
    if (base.length >= targetRunsPerWeek) {
      break;
    }
  }

  return base;
}

function buildThreeRunBlueprint(
  strategy: RecommendNextWeekOutput["strategy"],
  goal: RecommendNextWeekOutput["goal"],
  targetKmMid: number,
  weekdays: number[],
): RecommendedSession[] {
  if (strategy === "recover") {
    return [
      {
        weekday: weekdays[0],
        weekday_label: WEEKDAY_LABELS[weekdays[0]],
        session_type: "easy",
        distance_km: round(Math.max(6, targetKmMid * 0.26)),
        description: "轻松有氧跑，跑感放松即可",
        intensity_focus: "E，保持轻松对话感",
      },
      {
        weekday: weekdays[1],
        weekday_label: WEEKDAY_LABELS[weekdays[1]],
        session_type: "recovery",
        distance_km: round(Math.max(6, targetKmMid * 0.28)),
        description: "轻松跑或轻松跑后加几组短加速，不做正式阈值课",
        intensity_focus: "E，结尾可加 4-6 组轻松加速",
      },
      {
        weekday: weekdays[2],
        weekday_label: WEEKDAY_LABELS[weekdays[2]],
        session_type: "long",
        distance_km: round(Math.max(10, targetKmMid * 0.42)),
        description: "长距离慢跑，稳住节奏，不追求速度",
        intensity_focus: "E，以耐力和恢复友好为先",
      },
    ];
  }

  if (strategy === "rebuild" || strategy === "maintain") {
    const thresholdDescription =
      goal === "10k"
        ? "阈值或 10K 专项跑，可以做连续阈值或分段阈值"
        : "阈值跑，重新把专项刺激放回周结构里";

    return [
      {
        weekday: weekdays[0],
        weekday_label: WEEKDAY_LABELS[weekdays[0]],
        session_type: "easy",
        distance_km: round(Math.max(7, targetKmMid * 0.27)),
        description: "轻松有氧跑，主要服务于恢复和补量",
        intensity_focus: "E，轻松完成",
      },
      {
        weekday: weekdays[1],
        weekday_label: WEEKDAY_LABELS[weekdays[1]],
        session_type: "threshold",
        distance_km: round(Math.max(9, targetKmMid * 0.33)),
        description: thresholdDescription,
        intensity_focus: "T，围绕阈值能力输出",
      },
      {
        weekday: weekdays[2],
        weekday_label: WEEKDAY_LABELS[weekdays[2]],
        session_type: "long",
        distance_km: round(Math.max(12, targetKmMid * 0.4)),
        description: "长距离慢跑，保持稳定完成",
        intensity_focus: "E，避免跑成隐性质量课",
      },
    ];
  }

  return [
    {
      weekday: weekdays[0],
      weekday_label: WEEKDAY_LABELS[weekdays[0]],
      session_type: "easy",
      distance_km: round(Math.max(8, targetKmMid * 0.26)),
      description: "轻松有氧跑，维持总量",
      intensity_focus: "E",
    },
    {
      weekday: weekdays[1],
      weekday_label: WEEKDAY_LABELS[weekdays[1]],
      session_type: "threshold",
      distance_km: round(Math.max(10, targetKmMid * 0.34)),
      description: "阈值或专项质量课，作为全周关键刺激",
      intensity_focus: "T",
    },
    {
      weekday: weekdays[2],
      weekday_label: WEEKDAY_LABELS[weekdays[2]],
      session_type: "long",
      distance_km: round(Math.max(13, targetKmMid * 0.4)),
      description: "长跑，巩固耐力",
      intensity_focus: "E",
    },
  ];
}

export class RecommendationService {
  constructor(
    private readonly analysisService: AnalysisService,
    private readonly profileService: ProfileService,
  ) {}

  async recommendNextWeek(
    input: RecommendNextWeekInput,
  ): Promise<ToolResult<RecommendNextWeekOutput>> {
    const goal = input.goal ?? "half_marathon";
    const targetRunsPerWeek = input.target_runs_per_week ?? 3;
    const endDay = input.end_day ?? formatLocalCorosDate(new Date());

    const [weekResult, balanceResult, profileResult] = await Promise.all([
      this.analysisService.analyzeRecentWeek({ end_day: endDay }),
      this.analysisService.analyzeTrainingBalance({
        end_day: endDay,
        recent_days: 7,
        baseline_days: 21,
      }),
      this.profileService.getProfile(),
    ]);

    if (!weekResult.ok) {
      return weekResult;
    }
    if (!balanceResult.ok) {
      return balanceResult;
    }
    if (!profileResult.ok) {
      return profileResult;
    }

    const week = weekResult.data;
    const balance = balanceResult.data;
    const profile = profileResult.data;
    const loadRatio = balance.comparison.load_ratio;
    const distanceRatio = balance.comparison.distance_ratio;
    const recentRunKm = week.totals.run_distance_km;
    const weeklyBaselineKm =
      balance.baseline_window.run_distance_km > 0
        ? (balance.baseline_window.run_distance_km / 21) * 7
        : recentRunKm;

    let strategy: RecommendNextWeekOutput["strategy"] = "maintain";
    let keyFocus = "维持有氧基础并保留 1 次关键训练。";
    const rationale = [
      `最近一周跑步 ${week.totals.run_count} 次，跑量 ${week.totals.run_distance_km}km`,
      `近期负荷比约 ${loadRatio}`,
      `最近一周质量跑 ${week.distribution.quality_run_count} 次，长跑 ${week.distribution.long_run_count} 次`,
    ];
    const cautions = [...week.risks];

    if (loadRatio >= 1.15 || distanceRatio >= 1.15) {
      strategy = "recover";
      keyFocus = "控制疲劳，保护恢复，不继续上冲。";
    } else if (loadRatio <= 0.8 && week.distribution.quality_run_count === 0) {
      strategy = "rebuild";
      keyFocus = "在不激进加量的前提下，把 1 次专项质量课重新放回周结构。";
    } else if (loadRatio < 1 && week.distribution.quality_run_count >= 1) {
      strategy = "maintain";
      keyFocus = "保持当前节奏，小幅优化训练结构。";
    } else if (week.distribution.quality_run_count >= 1 && week.distribution.long_run_count >= 1) {
      strategy = "progress";
      keyFocus = "在可恢复前提下做小幅进阶。";
    }

    const baseKm = input.target_weekly_km ?? recentRunKm ?? weeklyBaselineKm ?? 24;
    let minKm = baseKm * 0.95;
    let maxKm = baseKm * 1.05;

    if (strategy === "recover") {
      minKm = baseKm * 0.8;
      maxKm = baseKm * 0.9;
    } else if (strategy === "rebuild") {
      minKm = Math.max(baseKm * 1.03, recentRunKm);
      maxKm = Math.min(baseKm * 1.15, weeklyBaselineKm > 0 ? weeklyBaselineKm : baseKm * 1.15);
    } else if (strategy === "progress") {
      minKm = baseKm * 1.02;
      maxKm = baseKm * 1.1;
    }

    minKm = round(minKm);
    maxKm = round(Math.max(minKm, maxKm));
    const targetKmMid = round((minKm + maxKm) / 2);

    const weekdays = normalizeWeekdays(input.preferred_weekdays, targetRunsPerWeek);
    const sessionBlueprint =
      targetRunsPerWeek === 3
        ? buildThreeRunBlueprint(strategy, goal, targetKmMid, weekdays)
        : buildThreeRunBlueprint(strategy, goal, targetKmMid, weekdays.slice(0, 3));

    const nextWeekStart = formatLocalCorosDate(addDays(parseCorosDate(endDay), 1));
    const nextWeekEnd = formatLocalCorosDate(addDays(parseCorosDate(endDay), 7));

    return {
      ok: true,
      raw: input.raw
        ? {
            week: weekResult.raw,
            balance: balanceResult.raw,
            profile: profileResult.raw,
          }
        : undefined,
      data: {
        next_week: {
          date_from: nextWeekStart,
          date_to: nextWeekEnd,
        },
        strategy,
        goal,
        target_runs_per_week: targetRunsPerWeek,
        target_distance_km_range: {
          min: minKm,
          max: maxKm,
        },
        key_focus: keyFocus,
        pace_guidance: {
          easy: `轻松跑以舒适对话感为主，心率尽量低于乳酸阈心率 ${profile.lthr} 较多`,
          threshold: `阈值段可围绕约 ${formatPace(profile.lt_pace_sec_per_km)}/km 的阈值能力展开`,
        },
        session_blueprint: sessionBlueprint,
        rationale,
        cautions,
      },
    };
  }
}
