---
name: coros-training-planner
description: Build and schedule COROS Training Hub workouts and multi-week plans. Use when the user wants to create COROS workouts, create a training plan, attach the plan to the COROS calendar, verify scheduled dates, or repair shifted plan dates after execution.
---

# COROS Training Planner

This is a shareable, generalized version of the skill.

It captures the reusable method for creating and scheduling COROS plans, without including personal account data, private tokens, or user-specific plan cases.

## What this skill is for

- Create workout courses in COROS
- Create multi-week plan templates in COROS
- Execute a plan onto the COROS calendar
- Verify that workouts landed on the intended dates
- Undo an incorrect execution and re-run with corrected template dates

## Core rule

For COROS plans, `dayNo` in the plan template is the main driver of where each workout lands after execution.

- If `dayNo` is wrong, execution can still return success while the calendar is shifted
- Always verify the actual scheduled dates after execution
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

- Use Playwright for login, UI discovery, and confirming real browser behavior
- Use backend APIs for creation, execution, verification, and cleanup

Typical token read:

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

## Known behavior

- `training/schedule/update` is not the correct final step for attaching a plan to the calendar
- The real calendar attachment happens through `executeSubPlan`
- The template can appear correct in the plan library while still executing onto the wrong weekdays if `dayNo` is wrong

## Date-mapping guidance

Before executing any plan:

- inspect `entities[].dayNo`
- confirm it matches the intended weekday pattern
- do not assume the template is correct just because the plan summary looks right

When working with repeating weekly structures:

- define the target weekdays first
- derive `dayNo` from those weekdays relative to the intended `startDay`
- validate the first few scheduled dates after execution

## Validation checklist

After executing a plan:

- query `training/schedule/query`
- confirm `subPlans` contains the expected executed plan
- confirm the first few scheduled workout dates match the target pattern
- only trust the plan after verifying actual scheduled dates, not just execution success

## Recovery workflow

If execution succeeds but the schedule is wrong:

1. Identify the executed sub-plan id from `schedule/query`.
2. Call `training/schedule/quitSubPlan?subPlanId=...`.
3. Rebuild or clone the plan template with corrected `dayNo`.
4. Execute again.
5. Re-verify actual scheduled dates.

## Shareability notes

This file is suitable as a reusable template because it does not include:

- account credentials
- private tokens
- private email or phone data
- user-specific training history

If sharing this skill with others:

- keep it generic
- avoid embedding personal plan names unless intentional
- avoid hardcoding private identifiers
- treat concrete dates as examples, not fixed truth

## References

- For the generalized workflow and endpoint notes, see [coros-workflow.md](./references/coros-workflow.md).
