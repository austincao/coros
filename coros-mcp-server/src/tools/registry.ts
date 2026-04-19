import type {
  RecommendNextWeekInput,
  ClearAuthSessionInput,
  GetActivityDetailInput,
  AnalyzeActivityInput,
  AnalyzeRecentWeekInput,
  AnalyzeTrainingBalanceInput,
  CreatePlanInput,
  CreateWorkoutInput,
  ExecutePlanInput,
  GetPlanDetailInput,
  ImportBrowserSessionInput,
  ListActivitiesInput,
  QueryScheduleInput,
  QuitExecutedPlanInput,
  SetAuthTokenInput,
  ToolResult,
  ValidatePlanDatesInput,
} from "../types.js";
import type { SessionProvider } from "../auth/session.js";
import { ActivityService } from "../services/activity-service.js";
import { AnalysisService } from "../services/analysis-service.js";
import { CorosClient } from "../client/coros-client.js";
import { PlanService } from "../services/plan-service.js";
import { ProfileService } from "../services/profile-service.js";
import { RecommendationService } from "../services/recommendation-service.js";
import { ScheduleService } from "../services/schedule-service.js";
import { WorkoutService } from "../services/workout-service.js";

type ToolHandler<TInput, TOutput> = (input: TInput) => Promise<ToolResult<TOutput>>;

export interface ToolDefinition<TInput, TOutput> {
  name: string;
  description: string;
  handler: ToolHandler<TInput, TOutput>;
}

export function createToolRegistry(sessionProvider: SessionProvider) {
  const corosClient = new CorosClient(
    "https://teamcnapi.coros.com",
    () => sessionProvider.getAccessToken(),
  );
  const activityService = new ActivityService(corosClient);
  const profileService = new ProfileService(sessionProvider, corosClient);
  const analysisService = new AnalysisService(activityService, profileService);
  const recommendationService = new RecommendationService(analysisService, profileService);
  const workoutService = new WorkoutService(corosClient);
  const planService = new PlanService(corosClient);
  const scheduleService = new ScheduleService(corosClient, planService);

  return {
    coros_auth_status: {
      name: "coros_auth_status",
      description: "Check whether COROS login is available",
      handler: async () => sessionProvider.getAuthStatus(),
    },
    coros_auth_validate: {
      name: "coros_auth_validate",
      description: "Validate the currently resolved COROS token",
      handler: async () => sessionProvider.getAuthStatus(),
    },
    coros_auth_set_token: {
      name: "coros_auth_set_token",
      description: "Persist a COROS access token into the local session file",
      handler: async (input: SetAuthTokenInput) =>
        sessionProvider.setAccessToken(input.access_token, input.validate),
    },
    coros_auth_import_browser_cookie: {
      name: "coros_auth_import_browser_cookie",
      description: "Extract the COROS token from a browser Cookie header and persist it",
      handler: async (input: ImportBrowserSessionInput) =>
        sessionProvider.importFromCookieHeader(
          input.cookie_header,
          input.cookie_name,
          input.validate,
        ),
    },
    coros_auth_clear_session: {
      name: "coros_auth_clear_session",
      description: "Delete the local COROS session file",
      handler: async (_input: ClearAuthSessionInput) => sessionProvider.clearSession(),
    },
    coros_get_profile: {
      name: "coros_get_profile",
      description: "Read user profile and running zones",
      handler: async () => profileService.getProfile(),
    },
    coros_list_activities: {
      name: "coros_list_activities",
      description: "List COROS activities for a recent period or page",
      handler: async (input: ListActivitiesInput) => activityService.listActivities(input),
    },
    coros_get_activity_detail: {
      name: "coros_get_activity_detail",
      description: "Get COROS activity detail for a single labelId and sportType",
      handler: async (input: GetActivityDetailInput) => activityService.getActivityDetail(input),
    },
    coros_analyze_activity: {
      name: "coros_analyze_activity",
      description: "Analyze a single COROS activity and produce diagnosis-oriented feedback",
      handler: async (input: AnalyzeActivityInput) => analysisService.analyzeActivity(input),
    },
    coros_analyze_recent_week: {
      name: "coros_analyze_recent_week",
      description: "Analyze the most recent 7-day COROS training pattern",
      handler: async (input: AnalyzeRecentWeekInput) => analysisService.analyzeRecentWeek(input),
    },
    coros_analyze_training_balance: {
      name: "coros_analyze_training_balance",
      description: "Compare recent run load versus baseline run load",
      handler: async (input: AnalyzeTrainingBalanceInput) =>
        analysisService.analyzeTrainingBalance(input),
    },
    coros_recommend_next_week: {
      name: "coros_recommend_next_week",
      description: "Recommend next week's training adjustment from recent COROS activity data",
      handler: async (input: RecommendNextWeekInput) =>
        recommendationService.recommendNextWeek(input),
    },
    coros_create_workout: {
      name: "coros_create_workout",
      description: "Create a COROS workout program",
      handler: async (input: CreateWorkoutInput) => workoutService.createWorkout(input),
    },
    coros_create_plan: {
      name: "coros_create_plan",
      description: "Create a COROS multi-week plan template",
      handler: async (input: CreatePlanInput) => planService.createPlan(input),
    },
    coros_get_plan_detail: {
      name: "coros_get_plan_detail",
      description: "Get COROS plan template detail",
      handler: async (input: GetPlanDetailInput) => planService.getPlanDetail(input),
    },
    coros_validate_plan_dates: {
      name: "coros_validate_plan_dates",
      description: "Predict calendar dates from start_day and dayNo mapping",
      handler: async (input: ValidatePlanDatesInput) => planService.validatePlanDates(input),
    },
    coros_execute_plan: {
      name: "coros_execute_plan",
      description: "Execute a COROS plan template to the calendar",
      handler: async (input: ExecutePlanInput) => scheduleService.executePlan(input),
    },
    coros_query_schedule: {
      name: "coros_query_schedule",
      description: "Query COROS calendar entities and executed subplans for a date window",
      handler: async (input: QueryScheduleInput) => scheduleService.querySchedule(input),
    },
    coros_quit_executed_plan: {
      name: "coros_quit_executed_plan",
      description: "Quit an executed COROS plan from the calendar",
      handler: async (input: QuitExecutedPlanInput) => scheduleService.quitExecutedPlan(input),
    },
  };
}
