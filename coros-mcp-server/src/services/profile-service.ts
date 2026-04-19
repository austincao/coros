import type { ProfileSummary, ToolResult } from "../types.js";
import type { SessionProvider } from "../auth/session.js";
import { CorosClient } from "../client/coros-client.js";

interface CorosProfileResponse {
  result: string;
  message?: string;
  data?: {
    userId?: string;
    nickname?: string;
    maxHr?: number;
    rhr?: number;
    zoneData?: {
      lthr?: number;
      ltsp?: number;
      ltspZone?: Array<{
        index: number;
        pace: number;
      }>;
    };
  };
}

export class ProfileService {
  constructor(
    private readonly sessionProvider: SessionProvider,
    private readonly corosClient: CorosClient,
  ) {}

  async getProfile(): Promise<ToolResult<ProfileSummary>> {
    const status = await this.sessionProvider.getAuthStatus();
    if (!status.ok) {
      return status;
    }
    if (!status.data.authenticated || !status.data.user_id || !status.data.nickname) {
      return {
        ok: false,
        error: {
          code: "AUTH_REQUIRED",
          message: "COROS login is required",
        },
      };
    }

    try {
      const payload = await this.corosClient.request<CorosProfileResponse>({
        method: "GET",
        path: "/account/query",
      });

      if (payload.result !== "0000" || !payload.data?.userId || !payload.data.zoneData?.ltsp) {
        return {
          ok: false,
          error: {
            code: "PROFILE_UNAVAILABLE",
            message: payload.message ?? "COROS profile data is unavailable",
          },
        };
      }

      return {
        ok: true,
        data: {
          user_id: payload.data.userId,
          nickname: payload.data.nickname ?? status.data.nickname,
          max_hr: payload.data.maxHr ?? 0,
          resting_hr: payload.data.rhr ?? 0,
          lthr: payload.data.zoneData.lthr ?? 0,
          lt_pace_sec_per_km: payload.data.zoneData.ltsp,
          pace_zones: (payload.data.zoneData.ltspZone ?? []).map((zone) => ({
            index: zone.index,
            pace_sec_per_km: zone.pace,
          })),
        },
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: "PROFILE_UNAVAILABLE",
          message: error instanceof Error ? error.message : "Failed to fetch COROS profile",
        },
      };
    }
  }
}
