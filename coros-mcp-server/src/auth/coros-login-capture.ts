import type { Page, Response } from "playwright-core";

/**
 * COROS login responses usually embed the REST accessToken under `data.accessToken`.
 * If the vendor stops mapping `CPL-coros-token` cookie to `/account/query`, this path still works.
 */
export function extractAccessTokenFromCorosJson(body: unknown): string | null {
  if (!body || typeof body !== "object") {
    return null;
  }
  const root = body as Record<string, unknown>;
  const candidates: unknown[] = [
    root.accessToken,
    root.token,
    (root.data as Record<string, unknown> | undefined)?.accessToken,
    (root.data as Record<string, unknown> | undefined)?.token,
    (root.data as Record<string, unknown> | undefined)?.authToken,
  ];
  const nested = (root.data as Record<string, unknown> | undefined)?.data;
  if (nested && typeof nested === "object") {
    const n = nested as Record<string, unknown>;
    candidates.push(n.accessToken, n.token);
  }
  for (const c of candidates) {
    if (typeof c === "string") {
      const t = c.trim();
      if (t.length >= 8) {
        return t;
      }
    }
  }
  return null;
}

function looksLikeCorosAuthResponseUrl(url: string): boolean {
  if (!/coros\.com/i.test(url)) {
    return false;
  }
  return (
    /\/account\/login\b/i.test(url) ||
    /\/user\/login\b/i.test(url) ||
    /\/account\/signin\b/i.test(url) ||
    /\/auth\/login\b/i.test(url)
  );
}

/**
 * Listens for JSON login responses and captures `accessToken` when present.
 */
export function attachCorosLoginAccessTokenCapture(page: Page): {
  getCaptured: () => string | null;
  dispose: () => void;
} {
  let captured: string | null = null;

  const handler = (response: Response) => {
    void (async () => {
      try {
        const url = response.url();
        if (!looksLikeCorosAuthResponseUrl(url)) {
          return;
        }
        const status = response.status();
        if (status < 200 || status >= 300) {
          return;
        }
        const ct = (response.headers()["content-type"] ?? "").toLowerCase();
        if (!ct.includes("json")) {
          return;
        }
        const body = await response.json().catch(() => null);
        const token = extractAccessTokenFromCorosJson(body);
        if (token) {
          captured = token;
        }
      } catch {
        /* ignore parse / network noise */
      }
    })();
  };

  page.on("response", handler);
  return {
    getCaptured: () => captured,
    dispose: () => page.off("response", handler),
  };
}
