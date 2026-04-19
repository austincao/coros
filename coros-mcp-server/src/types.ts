export type CorosDate = `${number}`;

export type ToolErrorCode =
  | "AUTH_REQUIRED"
  | "TOKEN_INVALID"
  | "SESSION_WRITE_FAILED"
  | "SESSION_CLEAR_FAILED"
  | "PROFILE_UNAVAILABLE"
  | "ACTIVITY_LIST_FAILED"
  | "ACTIVITY_DETAIL_FAILED"
  | "SCHEDULE_QUERY_FAILED"
  | "PROGRAM_CREATE_FAILED"
  | "PLAN_CREATE_FAILED"
  | "PLAN_NOT_FOUND"
  | "INVALID_DAY_NO"
  | "EXECUTION_FAILED"
  | "EXECUTION_SUCCEEDED_BUT_DATES_SHIFTED"
  | "EXECUTED_SUBPLAN_NOT_FOUND"
  | "QUIT_FAILED";

export interface ToolError {
  code: ToolErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export interface ToolFailure {
  ok: false;
  error: ToolError;
}

export interface ToolSuccess<T> {
  ok: true;
  raw?: unknown;
  data: T;
}

export type ToolResult<T> = ToolSuccess<T> | ToolFailure;

export interface AuthStatus {
  authenticated: boolean;
  user_id?: string;
  nickname?: string;
  region?: number;
  token_source?: "env" | "session_file";
  token_profile_path?: string;
}

export interface SetAuthTokenInput {
  access_token: string;
  validate?: boolean;
  raw?: boolean;
}

export interface SetAuthTokenOutput {
  authenticated: boolean;
  token_source: "session_file";
  token_profile_path: string;
  user_id?: string;
  nickname?: string;
  region?: number;
}

export interface ClearAuthSessionInput {
  raw?: boolean;
}

export interface ClearAuthSessionOutput {
  cleared: boolean;
  token_profile_path: string;
}

export interface ImportBrowserSessionInput {
  cookie_header: string;
  cookie_name?: string;
  validate?: boolean;
  raw?: boolean;
}

export interface ImportBrowserSessionOutput extends SetAuthTokenOutput {
  cookie_name: string;
}

export interface ProfileSummary {
  user_id: string;
  nickname: string;
  max_hr: number;
  resting_hr: number;
  lthr: number;
  lt_pace_sec_per_km: number;
  pace_zones: Array<{
    index: number;
    pace_sec_per_km: number;
  }>;
}

export interface ListActivitiesInput {
  date_from?: CorosDate;
  date_to?: CorosDate;
  page_number?: number;
  page_size?: number;
  max_pages?: number;
  sport_types?: number[];
  raw?: boolean;
}

export interface ActivityListItem {
  label_id: string;
  sport_type: number;
  name: string;
  date: CorosDate;
  distance_m: number;
  distance_km: number;
  total_time_s: number;
  workout_time_s: number;
  training_load: number;
  avg_hr: number;
  avg_cadence: number;
  avg_power: number;
  ascent_m: number;
  descent_m: number;
  device: string;
  pace_sec_per_km?: number;
  speed_value?: number;
  speed_type?: number;
}

export interface ListActivitiesOutput {
  total_available: number;
  total_pages: number;
  page_number: number;
  page_size: number;
  pages_fetched: number;
  activities: ActivityListItem[];
}

export interface GetActivityDetailInput {
  label_id: string;
  sport_type: number;
  screen_w?: number;
  screen_h?: number;
  raw?: boolean;
}

export interface ActivityLap {
  lap_index: number;
  distance_m: number;
  total_distance_m: number;
  time_s: number;
  total_time_s: number;
  avg_hr: number;
  max_hr: number;
  avg_cadence: number;
  avg_power: number;
  avg_pace_sec_per_km?: number;
  adjusted_pace_sec_per_km?: number;
  elev_gain_m: number;
  total_descent_m: number;
}

export interface ActivityDetailOutput {
  label_id: string;
  sport_type: number;
  name: string;
  timezone: number;
  start_timestamp_s: number;
  end_timestamp_s: number;
  distance_m: number;
  distance_km: number;
  total_time_s: number;
  workout_time_s: number;
  training_load: number;
  avg_hr: number;
  max_hr: number;
  avg_power: number;
  max_power: number;
  avg_cadence: number;
  max_cadence: number;
  avg_pace_sec_per_km?: number;
  adjusted_pace_sec_per_km?: number;
  elev_gain_m: number;
  total_descent_m: number;
  aerobic_effect?: number;
  anaerobic_effect?: number;
  current_vo2_max?: number;
  stamina_level_7d?: number;
  device_name?: string;
  weather?: {
    temperature?: number;
    humidity?: number;
    weather_type?: number;
    wind_speed?: number;
  };
  graph_types: Array<number | string>;
  laps: ActivityLap[];
}

export interface AnalyzeActivityInput {
  label_id: string;
  sport_type: number;
  raw?: boolean;
}

export interface AnalyzeActivityOutput {
  label_id: string;
  sport_type: number;
  name: string;
  activity_type: string;
  metrics: {
    distance_km: number;
    total_time_s: number;
    training_load: number;
    avg_hr: number;
    max_hr: number;
    avg_cadence: number;
    avg_pace_sec_per_km?: number;
    aerobic_effect?: number;
    anaerobic_effect?: number;
    current_vo2_max?: number;
  };
  conclusion: string;
  evidence: string[];
  risks: string[];
  suggestions: string[];
}

export interface AnalyzeRecentWeekInput {
  end_day?: CorosDate;
  raw?: boolean;
}

export interface AnalyzeRecentWeekOutput {
  date_from: CorosDate;
  date_to: CorosDate;
  totals: {
    activity_count: number;
    run_count: number;
    strength_count: number;
    hike_count: number;
    total_distance_km: number;
    run_distance_km: number;
    total_training_load: number;
    run_training_load: number;
  };
  distribution: {
    long_run_count: number;
    quality_run_count: number;
    easy_run_count: number;
  };
  conclusion: string;
  evidence: string[];
  risks: string[];
  suggestions: string[];
}

export interface AnalyzeTrainingBalanceInput {
  end_day?: CorosDate;
  recent_days?: number;
  baseline_days?: number;
  raw?: boolean;
}

export interface AnalyzeTrainingBalanceOutput {
  recent_window: {
    date_from: CorosDate;
    date_to: CorosDate;
    run_count: number;
    run_distance_km: number;
    run_training_load: number;
  };
  baseline_window: {
    date_from: CorosDate;
    date_to: CorosDate;
    run_count: number;
    run_distance_km: number;
    run_training_load: number;
  };
  comparison: {
    load_ratio: number;
    distance_ratio: number;
    run_count_ratio: number;
  };
  conclusion: string;
  evidence: string[];
  risks: string[];
  suggestions: string[];
}

export interface RecommendNextWeekInput {
  end_day?: CorosDate;
  goal?: "general_running" | "10k" | "half_marathon";
  target_runs_per_week?: number;
  preferred_weekdays?: number[];
  target_weekly_km?: number;
  raw?: boolean;
}

export interface RecommendedSession {
  weekday: number;
  weekday_label: string;
  session_type: "easy" | "threshold" | "long" | "recovery";
  distance_km: number;
  description: string;
  intensity_focus: string;
}

export interface RecommendNextWeekOutput {
  next_week: {
    date_from: CorosDate;
    date_to: CorosDate;
  };
  strategy: "recover" | "maintain" | "rebuild" | "progress";
  goal: "general_running" | "10k" | "half_marathon";
  target_runs_per_week: number;
  target_distance_km_range: {
    min: number;
    max: number;
  };
  key_focus: string;
  pace_guidance: {
    easy: string;
    threshold: string;
  };
  session_blueprint: RecommendedSession[];
  rationale: string[];
  cautions: string[];
}

export interface WorkoutSegmentInput {
  type: "warmup" | "main" | "cooldown";
  target_type: "distance" | "duration";
  target_value: number;
  intensity_type: "pace_range";
  intensity: {
    from_sec_per_km: number;
    to_sec_per_km: number;
  };
}

export interface CreateWorkoutInput {
  name: string;
  overview: string;
  sport_type: "run";
  segments: WorkoutSegmentInput[];
  raw?: boolean;
}

export interface CreateWorkoutOutput {
  program_id: string;
  name: string;
  overview: string;
  sport_type: "run";
}

export interface PlanEntryInput {
  day_no: number;
  program_id: string;
}

export interface CreatePlanInput {
  name: string;
  overview: string;
  total_weeks: number;
  total_day: number;
  entries: PlanEntryInput[];
  raw?: boolean;
}

export interface CreatePlanOutput {
  plan_id: string;
  name: string;
  overview: string;
  total_weeks: number;
  total_day: number;
  entry_count: number;
}

export interface GetPlanDetailInput {
  plan_id: string;
  raw?: boolean;
}

export interface PlanEntryDetail {
  id_in_plan: string;
  day_no: number;
  program_id: string;
  program_name: string;
}

export interface GetPlanDetailOutput {
  plan_id: string;
  name: string;
  overview: string;
  total_weeks: number;
  total_day: number;
  entries: PlanEntryDetail[];
}

export interface ValidatePlanDatesInput {
  plan_id: string;
  start_day: CorosDate;
  expected_weekdays?: number[];
  raw?: boolean;
}

export interface PredictedDate {
  day_no: number;
  date: CorosDate;
  weekday: number;
  program_name: string;
}

export interface ValidatePlanDatesOutput {
  plan_id: string;
  start_day: CorosDate;
  predicted_dates: PredictedDate[];
  weekday_match: boolean;
  mismatch_count: number;
}

export interface ExecutePlanInput {
  plan_id: string;
  start_day: CorosDate;
  verify?: boolean;
  expected_weekdays?: number[];
  raw?: boolean;
}

export interface ExecutePlanOutput {
  plan_id: string;
  executed_subplan_id: string;
  start_day: CorosDate;
  execution_result: string;
  verified: boolean;
  actual_dates: PredictedDate[];
  weekday_match: boolean;
}

export interface QuitExecutedPlanInput {
  executed_subplan_id: string;
  raw?: boolean;
}

export interface QuitExecutedPlanOutput {
  executed_subplan_id: string;
  quit_result: string;
}

export interface QueryScheduleInput {
  start_day: CorosDate;
  end_day: CorosDate;
  support_rest_exercise?: boolean;
  raw?: boolean;
}

export interface ScheduleEntity {
  happen_day: CorosDate;
  id_in_plan?: string;
  plan_id?: string;
  program_id?: string;
  sort_no?: number;
}

export interface ScheduleSubPlan {
  executed_subplan_id: string;
  name?: string;
  origin_plan_id?: string;
  source_plan_id?: string;
  start_day?: CorosDate;
  updated_at_s?: number;
}

export interface QueryScheduleOutput {
  date_from: CorosDate;
  date_to: CorosDate;
  entity_count: number;
  subplan_count: number;
  entities: ScheduleEntity[];
  subplans: ScheduleSubPlan[];
}
