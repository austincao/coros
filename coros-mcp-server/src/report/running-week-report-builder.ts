import type {
  ActivityListItem,
  CorosDate,
  RunningWeekReportActivityRow,
  RunningWeekReportInput,
  RunningWeekReportOutput,
  ToolResult,
} from "../types.js";
import { classifyRun, isRunSport } from "../activity-classification.js";
import type { ActivityService } from "../services/activity-service.js";
import type { ProfileService } from "../services/profile-service.js";
import { assignHrZone, buildHrZoneDefinitions, type HrZoneKey } from "./hr-zones.js";
import { renderRunningWeekReportHtml } from "./render-running-week-report-html.js";

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

const PACE_BASE_SEC_PER_KM = 210;
const PACE_STEP_SEC_PER_KM = 15;
const PACE_BIN_COUNT = 26;

function emptyPaceBins() {
  const bins = [];
  for (let i = 0; i < PACE_BIN_COUNT; i += 1) {
    const low = PACE_BASE_SEC_PER_KM + i * PACE_STEP_SEC_PER_KM;
    bins.push({
      low_sec_per_km: low,
      high_sec_per_km: low + PACE_STEP_SEC_PER_KM,
      distance_km: 0,
    });
  }
  return bins;
}

function addPaceKmToBins(
  bins: Array<{ low_sec_per_km: number; high_sec_per_km: number; distance_km: number }>,
  paceSecPerKm: number | undefined,
  distanceKm: number,
) {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
    return;
  }
  if (!paceSecPerKm || !Number.isFinite(paceSecPerKm)) {
    return;
  }
  let idx = Math.floor((paceSecPerKm - PACE_BASE_SEC_PER_KM) / PACE_STEP_SEC_PER_KM);
  if (idx < 0) {
    idx = 0;
  }
  if (idx >= bins.length) {
    idx = bins.length - 1;
  }
  bins[idx].distance_km = round(bins[idx].distance_km + distanceKm, 3);
}

function emptyZoneSeconds(): Record<HrZoneKey, number> {
  return { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 };
}

function addSecondsToZone(map: Record<HrZoneKey, number>, zone: HrZoneKey, seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return;
  }
  map[zone] += seconds;
}

function addListPaceToBins(bins: ReturnType<typeof emptyPaceBins>, activity: ActivityListItem) {
  if (activity.pace_sec_per_km === undefined) {
    return;
  }
  addPaceKmToBins(bins, activity.pace_sec_per_km, activity.distance_km);
}

export async function buildRunningWeekReport(
  activityService: ActivityService,
  profileService: ProfileService,
  input: RunningWeekReportInput,
): Promise<ToolResult<RunningWeekReportOutput>> {
  const endDay = input.end_day ?? formatLocalCorosDate(new Date());
  const endDate = parseCorosDate(endDay);
  const startDay = formatLocalCorosDate(addDays(endDate, -6));
  const includeHtml = input.include_html !== false;
  const detailCap = Math.min(80, Math.max(1, input.max_activity_details ?? 30));

  const [activitiesResult, profileResult] = await Promise.all([
    activityService.listActivities({
      date_from: startDay,
      date_to: endDay,
      page_size: 50,
      max_pages: 4,
      raw: input.raw,
    }),
    profileService.getProfile(),
  ]);

  if (!activitiesResult.ok) {
    return activitiesResult;
  }
  if (!profileResult.ok) {
    return profileResult;
  }

  const profile = profileResult.data;
  const runs = activitiesResult.data.activities.filter((item) => isRunSport(item.sport_type));
  const zoneDefs = buildHrZoneDefinitions(profile);
  const hrZonesSeconds = emptyZoneSeconds();
  const paceBins = emptyPaceBins();

  const dailyMap = new Map<CorosDate, { run_count: number; distance_km: number; training_load: number; workout_time_s: number }>();
  for (let i = 0; i < 7; i += 1) {
    const d = formatLocalCorosDate(addDays(parseCorosDate(startDay), i));
    dailyMap.set(d, { run_count: 0, distance_km: 0, training_load: 0, workout_time_s: 0 });
  }

  let longCount = 0;
  let qualityCount = 0;
  let easyCount = 0;

  let aerobicEffectSum = 0;
  let anaerobicEffectSum = 0;
  let trainingEffectSessions = 0;

  const activityRows: RunningWeekReportActivityRow[] = [];

  for (const run of runs) {
    const bucket = dailyMap.get(run.date);
    if (bucket) {
      bucket.run_count += 1;
      bucket.distance_km = round(bucket.distance_km + run.distance_km);
      bucket.training_load += run.training_load;
      bucket.workout_time_s += run.workout_time_s;
    }

    const classification = classifyRun(run, profile.lthr);
    if (classification === "long") {
      longCount += 1;
    } else if (classification === "quality") {
      qualityCount += 1;
    } else {
      easyCount += 1;
    }
  }

  const sortedRuns = [...runs].sort((a, b) => Number(b.date) - Number(a.date));
  let detailFetches = 0;

  for (const run of sortedRuns) {
    let detailFetched = false;
    if (detailFetches < detailCap) {
      const detailResult = await activityService.getActivityDetail({
        label_id: run.label_id,
        sport_type: run.sport_type,
        raw: false,
      });
      detailFetches += 1;
      if (detailResult.ok) {
        detailFetched = true;
        const detail = detailResult.data;
        if (detail.aerobic_effect !== undefined || detail.anaerobic_effect !== undefined) {
          aerobicEffectSum += detail.aerobic_effect ?? 0;
          anaerobicEffectSum += detail.anaerobic_effect ?? 0;
          trainingEffectSessions += 1;
        }
        const laps = detail.laps ?? [];
        if (laps.length > 0) {
          for (const lap of laps) {
            const zone = assignHrZone(lap.avg_hr, zoneDefs);
            addSecondsToZone(hrZonesSeconds, zone, lap.time_s);
            const pace = lap.adjusted_pace_sec_per_km ?? lap.avg_pace_sec_per_km;
            let lapKm = lap.distance_m > 0 ? lap.distance_m / 1000 : 0;
            if (lapKm <= 0 && pace && lap.time_s > 0) {
              lapKm = lap.time_s / pace;
            }
            addPaceKmToBins(paceBins, pace, lapKm);
          }
        } else {
          const zone = assignHrZone(detail.avg_hr, zoneDefs);
          addSecondsToZone(hrZonesSeconds, zone, detail.workout_time_s || detail.total_time_s);
          const pace = detail.adjusted_pace_sec_per_km ?? detail.avg_pace_sec_per_km;
          addPaceKmToBins(paceBins, pace, detail.distance_km);
        }
      }
    }

    if (!detailFetched) {
      const zone = assignHrZone(run.avg_hr, zoneDefs);
      addSecondsToZone(hrZonesSeconds, zone, run.workout_time_s || run.total_time_s);
      addListPaceToBins(paceBins, run);
    }

    activityRows.push({
      date: run.date,
      label_id: run.label_id,
      sport_type: run.sport_type,
      name: run.name,
      distance_km: run.distance_km,
      training_load: run.training_load,
      workout_time_s: run.workout_time_s,
      avg_hr: run.avg_hr,
      classification: classifyRun(run, profile.lthr),
      detail_fetched: detailFetched,
    });
  }

  activityRows.sort((a, b) => Number(b.date) - Number(a.date));

  const totals = runs.reduce(
    (acc, run) => {
      acc.distance_km += run.distance_km;
      acc.training_load += run.training_load;
      acc.workout_time_s += run.workout_time_s;
      acc.run_count += 1;
      return acc;
    },
    { run_count: 0, distance_km: 0, training_load: 0, workout_time_s: 0 },
  );
  totals.distance_km = round(totals.distance_km, 2);

  const daily = Array.from(dailyMap.entries())
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([date, v]) => ({
      date,
      run_count: v.run_count,
      distance_km: round(v.distance_km, 2),
      training_load: v.training_load,
      workout_time_s: v.workout_time_s,
    }));

  const methodology = [
    "Running-only filter matches coros_analyze_recent_week (sport types 100 and 101).",
    "Run session labels (easy / quality / long) use the same heuristics as coros_analyze_recent_week.",
    `Heart rate zone time uses lap moving time when activity detail is fetched; otherwise the full workout time is placed in the zone of average HR.`,
    profile.resting_hr > 0 && profile.max_hr - profile.resting_hr > 5
      ? "Heart rate zones are 5-bucket Karvonen-style bands on heart rate reserve (resting to max)."
      : "Heart rate zones are 5-bucket bands on % of max HR (resting HR unavailable or too close to max).",
    `Pace histogram bins are ${PACE_STEP_SEC_PER_KM}s/km wide starting at ${PACE_BASE_SEC_PER_KM}s/km; distance is accumulated from laps when available, otherwise from list pace when present.`,
    `At most ${detailCap} COROS activity detail requests are made (most recent runs first); remaining runs contribute list-level estimates only.`,
    "Aerobic / high-intensity time split: Z1+Z2 = aerobic base, Z3 = threshold / mixed, Z4+Z5 = high intensity (same HR zones as above).",
    "Training effect sums add COROS aerobic_effect and anaerobic_effect only for runs where detail was successfully fetched.",
    "Chart rendering uses Apache ECharts loaded from jsDelivr; open the file online once so scripts can load.",
  ];

  const base: Omit<RunningWeekReportOutput, "html"> = {
    date_from: startDay,
    date_to: endDay,
    generated_at: new Date().toISOString(),
    sport_filter: "run",
    profile: {
      nickname: profile.nickname,
      max_hr: profile.max_hr,
      resting_hr: profile.resting_hr,
      lthr: profile.lthr,
    },
    methodology,
    totals: {
      run_count: totals.run_count,
      distance_km: totals.distance_km,
      training_load: totals.training_load,
      workout_time_s: totals.workout_time_s,
    },
    intensity_counts: {
      easy: easyCount,
      quality: qualityCount,
      long: longCount,
    },
    hr_zones_seconds: {
      z1: Math.round(hrZonesSeconds.z1),
      z2: Math.round(hrZonesSeconds.z2),
      z3: Math.round(hrZonesSeconds.z3),
      z4: Math.round(hrZonesSeconds.z4),
      z5: Math.round(hrZonesSeconds.z5),
    },
    hr_time_groups_seconds: {
      aerobic_base: Math.round(hrZonesSeconds.z1 + hrZonesSeconds.z2),
      threshold: Math.round(hrZonesSeconds.z3),
      high_intensity: Math.round(hrZonesSeconds.z4 + hrZonesSeconds.z5),
    },
    training_effect:
      trainingEffectSessions > 0
        ? {
            aerobic_sum: round(aerobicEffectSum, 2),
            anaerobic_sum: round(anaerobicEffectSum, 2),
            sessions_count: trainingEffectSessions,
          }
        : undefined,
    hr_zone_definitions: zoneDefs,
    daily,
    pace_bins: paceBins.map((b) => ({
      low_sec_per_km: b.low_sec_per_km,
      high_sec_per_km: b.high_sec_per_km,
      distance_km: round(b.distance_km, 3),
    })),
    activities: activityRows,
  };

  const html = includeHtml ? renderRunningWeekReportHtml(base) : "";

  return {
    ok: true,
    raw: input.raw
      ? {
          activities: activitiesResult.raw,
          profile: profileResult.raw,
        }
      : undefined,
    data: {
      ...base,
      html,
    },
  };
}
