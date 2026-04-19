---
name: coros-activity-analyst
description: Analyze COROS activities and short training cycles without export files. Use when the user wants analysis of a single workout, a recent week or month of training, workout quality, fatigue or recovery risk, or advice based on COROS activity pages viewed through an already logged-in browser session.
---

# COROS Activity Analyst

This is a shareable, generalized version of the skill.

It captures a reusable method for analyzing recent COROS activities without including private account information, long-term personal history, or user-specific cases.

## What this skill is for

- Analyze a single activity
- Review a recent 7-day or 28-day training block
- Check whether an easy run, threshold run, long run, or interval session matched intent
- Identify signs of fatigue, recovery pressure, or uneven load distribution
- Turn recent activity patterns into training advice

## What this skill is not for

- Building training plans from scratch
- Scheduling plans onto the COROS calendar
- Export-by-email workflows
- Large historical data ingestion pipelines

For plan creation and scheduling, use `coros-training-planner`.

## Default data strategy

Prefer this order:

1. Reuse an already logged-in COROS browser session
2. Read activity list and activity detail pages with Playwright
3. Ask the user only for a small amount of missing context, such as:
   - workout intent
   - perceived effort
   - target race or target pace

Do not default to export flows that require manual email input and download steps.

## Core workflow

1. Confirm COROS is already logged in.
2. Open the activity list, summary page, or target activity page with Playwright.
3. Read only the visible fields needed for the current question.
4. Normalize the activity into a small structured summary.
5. Analyze it against workout type and recent context.
6. Produce a short report with:
   - conclusion
   - evidence
   - risks
   - next-step advice

## Preferred inputs

### Single activity

Capture as many visible fields as are available:

- sport type
- date
- distance
- duration
- average pace
- average heart rate
- max heart rate
- cadence
- elevation gain
- split or lap data
- training load
- power, if visible

Also capture:

- intended workout type
- user-reported feel, if available

### Short-cycle review

For a 7-day or 28-day review, try to gather:

- workout dates
- workout types
- distance and duration
- training load
- basic intensity cues
- weekly totals
- spacing between harder sessions

## Analysis framework

### Single activity

1. Identify workout intent:
   - easy
   - threshold
   - long run
   - interval
   - race or hard effort
2. Check whether execution matched intent.
3. Compare pace, heart rate, power, and splits for consistency.
4. Look for fade, drift, or pacing instability.
5. Judge the recovery implication of the session.
6. Recommend what the next 1-3 sessions should look like.

### Short-cycle review

1. Count easy, quality, and long sessions.
2. Check spacing between harder sessions.
3. Review weekly load shape.
4. Look for stacking, monotony, or hidden intensity.
5. Identify whether the user is underloaded, appropriately loaded, or carrying too much fatigue.
6. Recommend whether to hold, build, or deload.

## Output format

Keep the response in four parts:

- Conclusion
- Evidence
- Risks
- Advice

## Browser guidance

Prefer Playwright over manual user transcription when the data is visible on the page.

Typical page targets:

- activity list
- recent training summary
- single activity detail
- weekly calendar or statistics views

If page automation is noisy:

- re-snapshot after navigation
- read small targeted DOM sections
- avoid broad scraping when only one activity is needed

## Important limits

- Do not claim precision the visible data does not support
- Distinguish observed data from inference
- If key fields such as heart rate, power, or splits are missing, say what can and cannot be concluded
- For short-cycle analysis, avoid pretending a full long-term trend exists when only recent data is available

## Shareability notes

This file is suitable as a reusable template because it does not include:

- account credentials
- private tokens
- private activity exports
- user-specific medical or personal details

If sharing this skill with others:

- keep examples generic
- avoid embedding private identifiers
- avoid turning a single user case into a universal rule

## References

- For the generalized analysis framework and page-reading strategy, see [analysis-framework.md](./references/analysis-framework.md).
