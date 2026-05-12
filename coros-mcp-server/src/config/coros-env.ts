/**
 * COROS REST API origin. Mainland Training Hub flows default to CN host; some accounts
 * authenticate against international endpoints — set COROS_API_BASE if validation fails after login.
 */
export function corosApiBaseUrl(): string {
  const raw = process.env.COROS_API_BASE?.trim();
  if (raw) {
    return raw.replace(/\/+$/, "");
  }
  return "https://teamcnapi.coros.com";
}

export function corosCookieSettleDelayMs(): number {
  const raw = process.env.COROS_COOKIE_SETTLE_MS?.trim();
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 2500;
}

/** Retries after /account/query returns non-success (helps when cookie lands before backend accepts token). */
export function corosValidateRetryCount(): number {
  const raw = process.env.COROS_VALIDATE_RETRIES?.trim();
  const n = raw ? Number(raw) : NaN;
  if (Number.isFinite(n) && n >= 1) {
    return Math.min(Math.floor(n), 20);
  }
  return 6;
}

export function corosValidateRetryDelayMs(): number {
  const raw = process.env.COROS_VALIDATE_RETRY_DELAY_MS?.trim();
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 100 ? Math.floor(n) : 1200;
}
