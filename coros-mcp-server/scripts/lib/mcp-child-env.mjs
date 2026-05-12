/**
 * Environment object passed to the MCP stdio child (`node dist/index.js`).
 *
 * - Deletes legacy `COROS_API_BASE` so an accidental shell export does not force the wrong
 *   region (CN default is `https://teamcnapi.coros.com` in code).
 * - International accounts: set `COROS_INTL_API=1`; see `src/config/coros-env.ts`.
 *
 * @param {NodeJS.ProcessEnv} [base]
 */
export function mcpChildEnv(base = process.env) {
  const env = { ...base };
  delete env.COROS_API_BASE;
  return env;
}
