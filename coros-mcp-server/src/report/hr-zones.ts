import type { ProfileSummary, RunningWeekReportHrZoneDefinition } from "../types.js";

export type HrZoneKey = "z1" | "z2" | "z3" | "z4" | "z5";

export function buildHrZoneDefinitions(profile: ProfileSummary): RunningWeekReportHrZoneDefinition[] {
  const max = profile.max_hr;
  const rest = profile.resting_hr;
  const hrr = max - rest;

  if (max > 0 && hrr > 5 && rest > 0) {
    const z1h = rest + 0.6 * hrr;
    const z2h = rest + 0.7 * hrr;
    const z3h = rest + 0.8 * hrr;
    const z4h = rest + 0.9 * hrr;
    return [
      { zone: "z1", label: "Z1", bpm_low: rest, bpm_high: Math.round(z1h) },
      { zone: "z2", label: "Z2", bpm_low: Math.round(z1h), bpm_high: Math.round(z2h) },
      { zone: "z3", label: "Z3", bpm_low: Math.round(z2h), bpm_high: Math.round(z3h) },
      { zone: "z4", label: "Z4", bpm_low: Math.round(z3h), bpm_high: Math.round(z4h) },
      { zone: "z5", label: "Z5", bpm_low: Math.round(z4h), bpm_high: max },
    ];
  }

  const z1h = Math.round(0.6 * max);
  const z2h = Math.round(0.7 * max);
  const z3h = Math.round(0.8 * max);
  const z4h = Math.round(0.9 * max);
  return [
    { zone: "z1", label: "Z1", bpm_low: 0, bpm_high: z1h },
    { zone: "z2", label: "Z2", bpm_low: z1h, bpm_high: z2h },
    { zone: "z3", label: "Z3", bpm_low: z2h, bpm_high: z3h },
    { zone: "z4", label: "Z4", bpm_low: z3h, bpm_high: z4h },
    { zone: "z5", label: "Z5", bpm_low: z4h, bpm_high: max },
  ];
}

export function assignHrZone(hr: number, zones: RunningWeekReportHrZoneDefinition[]): HrZoneKey {
  if (!Number.isFinite(hr) || hr <= 0) {
    return "z1";
  }
  if (zones.length < 5) {
    return "z1";
  }
  if (hr < zones[0].bpm_high) {
    return "z1";
  }
  if (hr < zones[1].bpm_high) {
    return "z2";
  }
  if (hr < zones[2].bpm_high) {
    return "z3";
  }
  if (hr < zones[3].bpm_high) {
    return "z4";
  }
  return "z5";
}
