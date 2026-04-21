import type { ActivityListItem } from "./types.js";

export function isRunSport(sportType: number) {
  return sportType === 100 || sportType === 101;
}

export function isStrengthSport(sportType: number) {
  return sportType === 402;
}

export function isHikeSport(sportType: number) {
  return sportType === 104;
}

export function classifyRun(
  activity: Pick<ActivityListItem, "distance_km" | "training_load" | "avg_hr" | "pace_sec_per_km">,
  lthr: number,
) {
  const distance = activity.distance_km;
  const hr = activity.avg_hr;
  const tl = activity.training_load;
  const pace = activity.pace_sec_per_km;
  const tlPerKm = distance > 0 ? tl / distance : 0;

  if (distance >= 12 || tl >= 140) {
    return "long";
  }

  if ((hr >= lthr - 15 && tlPerKm >= 12) || (pace !== undefined && pace <= 330 && tl >= 90)) {
    return "quality";
  }

  return "easy";
}
