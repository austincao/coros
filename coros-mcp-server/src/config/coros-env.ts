/**
 * COROS REST API origin.
 * - Default: mainland Training Hub → `https://teamcnapi.coros.com`
 * - International: set `COROS_INTL_API=1` → `https://teamapi.coros.com`
 *
 * Do not use `COROS_API_BASE` (removed): it caused token/host mismatches when mixed with CN sessions.
 */
export function corosIntlApiEnabled(): boolean {
  const v = process.env.COROS_INTL_API?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function corosApiBaseUrl(): string {
  return corosIntlApiEnabled()
    ? "https://teamapi.coros.com"
    : "https://teamcnapi.coros.com";
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

/** Bases to try for GET /account/query (token may only validate on one region). */
export function corosAccountQueryBases(): string[] {
  const primary = corosApiBaseUrl().replace(/\/+$/, "");
  const cn = "https://teamcnapi.coros.com";
  const intl = "https://teamapi.coros.com";
  const other = primary === cn ? intl : cn;
  return primary === other ? [primary] : [primary, other];
}
