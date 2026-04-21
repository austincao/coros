# coros-mcp-server

A focused MCP server for COROS Training Hub workflows.

This project wraps the COROS web APIs we verified during live exploration and exposes them as MCP tools over `stdio`.

It currently supports three major areas:

- Training planning
- Activity retrieval
- Training analysis and next-week recommendations

## What It Can Do

### 1. Training Planning

- Check COROS auth status
- Read profile and running zones
- Create running workouts
- Create multi-week plans
- Inspect plan details
- Validate `dayNo -> actual date` mapping
- Execute a plan onto the COROS calendar
- Quit an executed plan from the calendar

### 2. Activity Retrieval

- List activities for a date window
- Fetch detailed metrics for one activity
- Read laps, summary metrics, weather, and chart types

### 3. Analysis and Recommendations

- Analyze a single activity
- Analyze the recent 7-day training pattern
- Compare recent running load against baseline
- Build a running-only 7-day chart report (HTML with ECharts via CDN + structured metrics)
- Recommend next week's microcycle

## Current Tool Set

The server currently registers these MCP tools:

- `coros_auth_status`
- `coros_auth_validate`
- `coros_auth_set_token`
- `coros_auth_import_browser_cookie`
- `coros_auth_clear_session`
- `coros_get_profile`
- `coros_list_activities`
- `coros_get_activity_detail`
- `coros_analyze_activity`
- `coros_analyze_recent_week`
- `coros_analyze_training_balance`
- `coros_running_week_report`
- `coros_recommend_next_week`
- `coros_create_workout`
- `coros_create_plan`
- `coros_get_plan_detail`
- `coros_validate_plan_dates`
- `coros_execute_plan`
- `coros_quit_executed_plan`

## Architecture

The server is intentionally split into simple layers:

- `auth`
  - reads `COROS_ACCESS_TOKEN`
  - falls back to a local `session.json`
  - validates login with `/account/query`
- `client`
  - wraps COROS HTTP requests
- `services`
  - `profile-service`
  - `activity-service`
  - `analysis-service`
  - `report` (weekly running HTML report builder)
  - `recommendation-service`
  - `workout-service`
  - `plan-service`
  - `schedule-service`
- `index.ts`
  - binds everything into an MCP `stdio` server using `@modelcontextprotocol/sdk`

## Requirements

- Node.js 18+
- A valid COROS web access token

This server currently uses:

- `@modelcontextprotocol/sdk`
- `zod`
- TypeScript

## Authentication

This project now supports two token sources, in this priority order:

1. `COROS_ACCESS_TOKEN`
2. A local session file at `~/.config/coros-mcp/session.json`

You can override the session file location with:

```bash
export COROS_SESSION_PATH="/custom/path/session.json"
```

### Option A: Keep Using an Environment Variable

```bash
export COROS_ACCESS_TOKEN="YOUR_COROS_TOKEN"
```

### Option B: Persist a Local Session

Call the MCP tool:

- `coros_auth_set_token`

with:

```json
{
  "access_token": "YOUR_COROS_TOKEN",
  "validate": true
}
```

This writes a local session file with `0600` permissions and lets future runs start without exporting the token again.

### Option C: Import From a Browser Cookie Header

If you already have a logged-in browser session, copy the `Cookie` request header from DevTools and call:

- `coros_auth_import_browser_cookie`

with:

```json
{
  "cookie_header": "foo=bar; CPL-coros-token=YOUR_COROS_TOKEN; theme=dark",
  "cookie_name": "CPL-coros-token",
  "validate": true
}
```

This is not full browser automation. It is a stable import path that converts an existing browser session into the local persisted session used by the MCP server.

### Option D: Launch a Browser Login Helper

Run:

```bash
npm run auth:browser-login
```

What it does:

- launches Google Chrome with a dedicated persistent profile
- opens the COROS Training Hub login page
- waits for `CPL-coros-token` to appear after you complete login
- validates the token and writes the local session file automatically

Optional environment variables:

```bash
CHROME_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
COROS_BROWSER_PROFILE_DIR="$HOME/.config/coros-mcp/browser-profile"
COROS_BROWSER_LOGIN_TIMEOUT_MS=600000
COROS_SESSION_PATH="$HOME/.config/coros-mcp/session.json"
```

This is the recommended interactive path when you want the project to acquire and persist a fresh token without manually copying browser cookies.

### Validate or Clear a Session

Use:

- `coros_auth_validate`
- `coros_auth_clear_session`

`coros_auth_status` also validates the currently resolved token and reports whether it came from `env` or `session_file`.

## Quick Start

Install dependencies:

```bash
npm install
```

Type-check:

```bash
npm run check
```

Build:

```bash
npm run build
```

Start the MCP server:

```bash
npm start
```

Use the CLI directly:

```bash
node dist/cli.js serve
node dist/cli.js auth status
node dist/cli.js auth login
node dist/cli.js auth clear
```

## Using It As an MCP Server

This project runs over `stdio`, so MCP clients should launch:

```bash
node dist/cli.js serve
```

with:

```bash
COROS_ACCESS_TOKEN=... node dist/cli.js serve
```

or, after persisting a session:

```bash
node dist/cli.js serve
```

## Packaging and Installation

This project is now shaped as an installable CLI package.

Expected public package usage after npm publish:

```bash
npx coros-mcp-server serve
npx coros-mcp-server auth login
```

For local development before publish:

```bash
node dist/cli.js serve
```

## Gemini CLI Integration

Gemini CLI supports MCP servers through `gemini mcp add`.

### Local Validation Before npm Publish

This is the exact shape used for local verification:

```bash
gemini mcp add coros-local node /absolute/path/to/coros-mcp-server/dist/cli.js serve
```

Check connectivity:

```bash
gemini mcp list
```

### Expected Setup After npm Publish

Once published to npm, the cleaner Gemini setup is:

```bash
gemini mcp add coros npx -y coros-mcp-server serve
```

Gemini stores MCP configuration in its settings, so users do not need to manually edit JSON unless they want custom environment variables.

## Smoke Tests

This repo includes live smoke scripts that use an MCP client to spawn the server and call real tools.

### Auth and Profile

```bash
COROS_ACCESS_TOKEN="YOUR_COROS_TOKEN" npm run smoke:profile
```

Verifies:

- server startup
- MCP tool registration
- `coros_auth_status`
- `coros_get_profile`

### Auth Session Management

```bash
npm run smoke:auth-session
```

Verifies without a live COROS token:

- unauthenticated startup when no token exists
- `coros_auth_set_token`
- `coros_auth_import_browser_cookie`
- `coros_auth_clear_session`
- local session file write and cleanup behavior

### Plan Flow

```bash
COROS_ACCESS_TOKEN="YOUR_COROS_TOKEN" npm run smoke:plan-flow
```

Verifies:

- `coros_create_workout`
- `coros_create_plan`
- `coros_validate_plan_dates`
- `coros_execute_plan`
- `coros_quit_executed_plan`

This script creates a temporary workout and plan, executes it on a future date, then quits the executed calendar plan for cleanup.

### Activities

```bash
COROS_ACCESS_TOKEN="YOUR_COROS_TOKEN" npm run smoke:activities
```

Verifies:

- `coros_list_activities`
- `coros_get_activity_detail`

### Analysis

```bash
COROS_ACCESS_TOKEN="YOUR_COROS_TOKEN" npm run smoke:analysis
```

Verifies:

- `coros_analyze_recent_week`
- `coros_analyze_training_balance`
- `coros_analyze_activity`

### Running week report (HTML + ECharts)

Self-test render (no COROS API calls; uses compiled `dist/` modules). Opening the generated HTML in a browser loads ECharts from jsDelivr (network required for charts):


```bash
npm run build
npm run selftest:running-week-report
```

Live MCP smoke (requires a valid token via `COROS_ACCESS_TOKEN` or a valid `~/.config/coros-mcp/session.json`; writes `tmp/smoke-running-week-report.html`):

```bash
COROS_ACCESS_TOKEN="YOUR_COROS_TOKEN" npm run smoke:running-week-report
```

Verifies:

- `coros_running_week_report` is registered
- `coros_auth_status` succeeds
- The tool returns structured metrics plus non-trivial `html`

### Recommendation

```bash
COROS_ACCESS_TOKEN="YOUR_COROS_TOKEN" npm run smoke:recommendation
```

Verifies:

- `coros_recommend_next_week`

## Example Workflows

For more user-facing call examples, see:

- [examples/README.md](./examples/README.md)

### Read Recent Training

Use:

- `coros_list_activities`
- `coros_get_activity_detail`

Typical questions this supports:

- "Show my last 7 days of activities"
- "Fetch the details of this run"
- "Give me lap data and core metrics for this workout"

### Diagnose Training

Use:

- `coros_analyze_activity`
- `coros_analyze_recent_week`
- `coros_analyze_training_balance`

Typical questions this supports:

- "Did I run this session correctly?"
- "Was this week too hard or too light?"
- "Am I missing threshold work?"

### Adjust Next Week

Use:

- `coros_recommend_next_week`

Typical questions this supports:

- "How should I adjust next week?"
- "Should I rebuild, maintain, or recover?"
- "Give me a 3-run blueprint for next week"

## Units and Normalization

COROS APIs are not fully consistent across endpoints.

This server normalizes several important values:

- activity list distance to meters and kilometers
- detail distance from COROS internal hundred-meter scale to meters/kilometers
- detail durations from centiseconds to seconds
- detail timestamps from centiseconds to seconds
- pace-like values are preserved in `sec/km` where applicable

One practical note:

- non-distance activities such as strength training may still contain low-value or placeholder distance numbers from COROS; analysis logic should treat sport type as primary and distance as secondary for those modes

## Known COROS-Specific Findings

These were verified during implementation:

- `executeSubPlan` is the real "put this plan on the calendar" action
- `quitSubPlan` is the rollback action for executed plans
- `dayNo` directly controls actual scheduled dates
- COROS plan execution behaves like:
  - `actual_date = start_day + dayNo`
  - not `start_day + dayNo - 1`
- validating plan dates before execution is important

## Limitations

- Authentication is currently token-based only
- Token refresh is not automated
- The server depends on private COROS web APIs, which may change
- Activity analysis is currently strongest for running and treadmill runs
- Recommendation output currently focuses on a practical weekly microcycle, not full block periodization
- Temporary workout and plan templates created by smoke tests are not automatically deleted from your library
- Executed calendar entries are cleaned up in the plan-flow smoke test, but created templates remain

## Suggested Next Steps

Good next extensions for this project:

- add activity export and richer chart decoding
- add block-level analysis for 14-day and 28-day windows
- add direct "recommendation -> create workout -> create plan" automation
- add optional profile-aware pace zone formatting in user-facing text
- add better handling for cycling, hiking, strength, and mixed-sport analysis
- add integration tests with recorded fixtures for non-live CI coverage

## Project Structure

```text
coros-mcp-server/
├── package.json
├── README.md
├── scripts/
│   ├── smoke-auth-profile.mjs
│   ├── smoke-auth-session.mjs
│   ├── smoke-plan-flow.mjs
│   ├── smoke-activities.mjs
│   ├── smoke-analysis.mjs
│   ├── selftest-running-week-report.mjs
│   ├── smoke-running-week-report.mjs
│   └── smoke-recommendation.mjs
├── src/
│   ├── auth/
│   ├── cli.ts
│   ├── client/
│   ├── services/
│   ├── server.ts
│   ├── tools/
│   ├── index.ts
│   └── types.ts
└── tsconfig.json
```

## Development Notes

Useful commands:

```bash
npm run check
npm run build
npm run auth:browser-login
npm run smoke:profile
npm run smoke:plan-flow
npm run smoke:activities
npm run smoke:analysis
npm run selftest:running-week-report
npm run smoke:running-week-report
npm run smoke:recommendation
```

## License

No license has been added yet.
