import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {
  AuthStatus,
  ClearAuthSessionOutput,
  ImportBrowserSessionOutput,
  SetAuthTokenOutput,
  ToolResult,
} from "../types.js";

export interface SessionProvider {
  getAccessToken(): Promise<string | null>;
  getAuthStatus(): Promise<ToolResult<AuthStatus>>;
  setAccessToken(token: string, validate?: boolean): Promise<ToolResult<SetAuthTokenOutput>>;
  importFromCookieHeader(
    cookieHeader: string,
    cookieName?: string,
    validate?: boolean,
  ): Promise<ToolResult<ImportBrowserSessionOutput>>;
  clearSession(): Promise<ToolResult<ClearAuthSessionOutput>>;
}

interface CorosAccountQueryResponse {
  result: string;
  message?: string;
  data?: {
    userId?: string;
    nickname?: string;
    userProfile?: {
      region?: number;
    };
  };
}

interface StoredSession {
  access_token: string;
  source: "session_file";
  created_at: string;
  validated_at?: string;
  user_id?: string;
  nickname?: string;
  region?: number;
}

interface ValidationSuccess {
  authenticated: true;
  user_id: string;
  nickname?: string;
  region?: number;
}

function defaultSessionPath() {
  return path.join(os.homedir(), ".config", "coros-mcp", "session.json");
}

async function readStoredSession(sessionPath: string): Promise<StoredSession | null> {
  try {
    const content = await readFile(sessionPath, "utf8");
    const parsed = JSON.parse(content) as Partial<StoredSession>;
    if (typeof parsed.access_token !== "string" || !parsed.access_token.trim()) {
      return null;
    }
    return {
      access_token: parsed.access_token.trim(),
      source: "session_file",
      created_at: typeof parsed.created_at === "string" ? parsed.created_at : new Date().toISOString(),
      validated_at: typeof parsed.validated_at === "string" ? parsed.validated_at : undefined,
      user_id: typeof parsed.user_id === "string" ? parsed.user_id : undefined,
      nickname: typeof parsed.nickname === "string" ? parsed.nickname : undefined,
      region: typeof parsed.region === "number" ? parsed.region : undefined,
    };
  } catch {
    return null;
  }
}

function readCookieValue(cookieHeader: string, cookieName: string): string | null {
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) {
      continue;
    }
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }
    const name = trimmed.slice(0, separatorIndex).trim();
    if (name !== cookieName) {
      continue;
    }
    const value = trimmed.slice(separatorIndex + 1).trim();
    return value || null;
  }
  return null;
}

export class EnvSessionProvider implements SessionProvider {
  private readonly sessionPath: string;

  constructor(
    private readonly baseUrl: string,
    private readonly envVarName = "COROS_ACCESS_TOKEN",
    sessionPath = process.env.COROS_SESSION_PATH?.trim() || defaultSessionPath(),
  ) {
    this.sessionPath = sessionPath;
  }

  private async validateToken(token: string): Promise<ToolResult<ValidationSuccess>> {
    try {
      const response = await fetch(`${this.baseUrl}/account/query`, {
        method: "GET",
        headers: {
          accessToken: token,
        },
      });

      if (!response.ok) {
        return {
          ok: false,
          error: {
            code: "TOKEN_INVALID",
            message: `COROS auth check failed with HTTP ${response.status}`,
          },
        };
      }

      const payload = (await response.json()) as CorosAccountQueryResponse;
      if (payload.result !== "0000" || !payload.data?.userId) {
        return {
          ok: false,
          error: {
            code: "TOKEN_INVALID",
            message: payload.message ?? "COROS access token is invalid",
          },
        };
      }

      return {
        ok: true,
        data: {
          authenticated: true,
          user_id: payload.data.userId,
          nickname: payload.data.nickname,
          region: payload.data.userProfile?.region,
        },
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: "TOKEN_INVALID",
          message: error instanceof Error ? error.message : "Failed to validate COROS token",
        },
      };
    }
  }

  private getEnvToken() {
    const token = process.env[this.envVarName]?.trim();
    return token ? token : null;
  }

  private async getStoredSession() {
    return readStoredSession(this.sessionPath);
  }

  async getAccessToken(): Promise<string | null> {
    const envToken = this.getEnvToken();
    if (envToken) {
      return envToken;
    }

    const session = await this.getStoredSession();
    return session?.access_token ?? null;
  }

  async getAuthStatus(): Promise<ToolResult<AuthStatus>> {
    const envToken = this.getEnvToken();
    const session = envToken ? null : await this.getStoredSession();
    const token = envToken ?? session?.access_token ?? null;

    if (!token) {
      return {
        ok: true,
        data: {
          authenticated: false,
          token_profile_path: this.sessionPath,
        },
      };
    }

    const validation = await this.validateToken(token);
    if (!validation.ok) {
      return validation;
    }

    return {
      ok: true,
      data: {
        authenticated: true,
        user_id: validation.data.user_id,
        nickname: validation.data.nickname,
        region: validation.data.region,
        token_source: envToken ? "env" : "session_file",
        token_profile_path: this.sessionPath,
      },
    };
  }

  async setAccessToken(token: string, validate = true): Promise<ToolResult<SetAuthTokenOutput>> {
    const trimmedToken = token.trim();
    if (!trimmedToken) {
      return {
        ok: false,
        error: {
          code: "TOKEN_INVALID",
          message: "COROS access token must not be empty",
        },
      };
    }

    let validation: ToolResult<ValidationSuccess> | undefined;
    if (validate) {
      validation = await this.validateToken(trimmedToken);
      if (!validation.ok) {
        return validation;
      }
    }

    const session: StoredSession = {
      access_token: trimmedToken,
      source: "session_file",
      created_at: new Date().toISOString(),
      validated_at: validation?.ok ? new Date().toISOString() : undefined,
      user_id: validation?.ok ? validation.data.user_id : undefined,
      nickname: validation?.ok ? validation.data.nickname : undefined,
      region: validation?.ok ? validation.data.region : undefined,
    };

    try {
      await mkdir(path.dirname(this.sessionPath), { recursive: true });
      await writeFile(this.sessionPath, `${JSON.stringify(session, null, 2)}\n`, "utf8");
      await chmod(this.sessionPath, 0o600);
    } catch (error) {
      return {
        ok: false,
        error: {
          code: "SESSION_WRITE_FAILED",
          message: error instanceof Error ? error.message : "Failed to write COROS session file",
          details: {
            token_profile_path: this.sessionPath,
          },
        },
      };
    }

    return {
      ok: true,
      data: {
        authenticated: validation?.ok ? validation.data.authenticated : false,
        token_source: "session_file",
        token_profile_path: this.sessionPath,
        user_id: validation?.ok ? validation.data.user_id : undefined,
        nickname: validation?.ok ? validation.data.nickname : undefined,
        region: validation?.ok ? validation.data.region : undefined,
      },
    };
  }

  async importFromCookieHeader(
    cookieHeader: string,
    cookieName = "CPL-coros-token",
    validate = true,
  ): Promise<ToolResult<ImportBrowserSessionOutput>> {
    const token = readCookieValue(cookieHeader, cookieName);
    if (!token) {
      return {
        ok: false,
        error: {
          code: "TOKEN_INVALID",
          message: `Cookie header does not contain ${cookieName}`,
        },
      };
    }

    const stored = await this.setAccessToken(token, validate);
    if (!stored.ok) {
      return stored;
    }

    return {
      ok: true,
      data: {
        ...stored.data,
        cookie_name: cookieName,
      },
    };
  }

  async clearSession(): Promise<ToolResult<ClearAuthSessionOutput>> {
    try {
      await rm(this.sessionPath, { force: true });
      return {
        ok: true,
        data: {
          cleared: true,
          token_profile_path: this.sessionPath,
        },
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: "SESSION_CLEAR_FAILED",
          message: error instanceof Error ? error.message : "Failed to clear COROS session file",
          details: {
            token_profile_path: this.sessionPath,
          },
        },
      };
    }
  }
}

export class PlaceholderSessionProvider implements SessionProvider {
  async getAccessToken(): Promise<string | null> {
    return null;
  }

  async getAuthStatus(): Promise<ToolResult<AuthStatus>> {
    return {
      ok: true,
      data: {
        authenticated: false,
      },
    };
  }

  async setAccessToken(): Promise<ToolResult<SetAuthTokenOutput>> {
    return {
      ok: false,
      error: {
        code: "AUTH_REQUIRED",
        message: "Session provider is not configured",
      },
    };
  }

  async importFromCookieHeader(): Promise<ToolResult<ImportBrowserSessionOutput>> {
    return {
      ok: false,
      error: {
        code: "AUTH_REQUIRED",
        message: "Session provider is not configured",
      },
    };
  }

  async clearSession(): Promise<ToolResult<ClearAuthSessionOutput>> {
    return {
      ok: false,
      error: {
        code: "AUTH_REQUIRED",
        message: "Session provider is not configured",
      },
    };
  }
}
