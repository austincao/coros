---
name: coros-training-planner
description: Build and schedule COROS Training Hub running workouts and multi-week plans. Use when the user wants to create COROS workouts, create a training plan, attach the plan to the COROS calendar, verify scheduled dates, or repair shifted plan dates after execution.
---

# COROS Training Planner

Use this skill when working with COROS Training Hub plans, especially for reusable running plans such as 10K, half marathon, or marathon blocks.

## What this skill is for

- Create workout courses in COROS
- Create multi-week plan templates in COROS
- Execute a plan onto the COROS calendar
- Verify that workouts landed on the intended dates
- Undo an incorrect execution and re-run with corrected template dates

## Core rule

For COROS plans, `dayNo` in the plan template is the source of truth for where each workout lands after execution.

- If `dayNo` is wrong, execution can still return success while the calendar is shifted
- Always verify the actual `happenDay` values after execution
- If the dates are wrong, quit the executed sub-plan, fix the template, and execute again

## Standard workflow

1. Log into COROS in a browser session.
2. Read the browser cookie `CPL-coros-token`.
3. Create or reuse workout courses with `training/program/add`.
4. Build the plan template with `training/plan/add`.
5. Inspect the template `dayNo` sequence before execution.
6. Execute with `training/schedule/executeSubPlan?startDay=YYYYMMDD&subPlanId=...`.
7. Verify scheduled dates with `training/schedule/query`.
8. If shifted, remove the execution with `training/schedule/quitSubPlan?subPlanId=...`, repair the template, and execute again.

## Token and browser

Prefer a hybrid approach:

- Use Playwright only for login, discovery, and validating UI behavior
- Use backend APIs for creation, execution, verification, and cleanup

Common browser command:

```bash
playwright-cli -s=coros cookie-get CPL-coros-token
```

Use the cookie value as the `accessToken` request header.

## Verified COROS endpoints

- `POST /training/program/add`
- `POST /training/plan/add`
- `GET /training/plan/detail?supportRestExercise=1&id=...`
- `POST /training/plan/query`
- `GET /training/schedule/query?startDate=YYYYMMDD&endDate=YYYYMMDD&supportRestExercise=1`
- `POST /training/schedule/executeSubPlan?startDay=YYYYMMDD&subPlanId=...`
- `POST /training/schedule/quitSubPlan?subPlanId=...`

## Known behavior from this project

- `training/schedule/update` is not enough to attach plan templates to the calendar
- The real calendar attachment happens through `executeSubPlan`
- `startDay` must be chosen together with the template `dayNo` mapping
- A plan can look correct in the library and still execute onto wrong weekdays if `dayNo` is off

## Date mapping guidance

For a 4-week plan starting on Tuesday `2026-03-31` with training on Tuesday, Thursday, Sunday, the correct `dayNo` sequence is:

```json
[1,3,6,8,10,13,15,17,20,22,24,27]
```

The shifted sequence below was verified to be wrong for that goal:

```json
[2,4,7,9,11,14,16,18,21,23,25,28]
```

That wrong sequence lands the block on Wednesday, Friday, Monday and pushes the final workout into a fifth calendar week.

## Validation checklist

After executing a plan:

- Query `training/schedule/query`
- Confirm `subPlans` contains the expected executed plan
- Confirm `happenDay` matches the intended dates
- Confirm the first three workouts land where expected before trusting the rest of the block

For the reference case in this project, the intended first dates were:

- `2026-03-31`
- `2026-04-02`
- `2026-04-05`

## Recovery workflow

If execution succeeds but dates are wrong:

1. Identify the executed sub-plan id from `schedule/query`.
2. Call `training/schedule/quitSubPlan?subPlanId=...`.
3. Rebuild or clone the plan template with corrected `dayNo`.
4. Execute again.
5. Re-verify `happenDay`.

## References

- For the end-to-end workflow and API examples, read [coros-workflow.md](./references/coros-workflow.md).
