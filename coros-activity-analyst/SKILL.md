---
name: coros-activity-analyst
description: Analyze COROS activities and short training cycles without export files. Use when the user wants analysis of a single workout, a recent week or month of training, workout quality, fatigue or recovery risk, or advice based on COROS activity pages viewed through an already logged-in browser session.
---

# COROS Activity Analyst

Use this skill to analyze recent COROS training data without relying on email export flows.

## Scope

This skill is for:

- Single activity analysis
- Recent 7-day or 28-day training review
- Easy run, threshold, long run, or interval quality checks
- Fatigue, recovery, and load distribution review
- Turning recent activity patterns into training advice

This skill is not for:

- Building or scheduling plans from scratch
- Export-email workflows
- Long historical data engineering pipelines

For plan creation and calendar scheduling, use `coros-training-planner`.

## Default data strategy

Prefer this order:

1. Reuse an already logged-in COROS browser session
2. Read activity list and activity detail pages with Playwright
3. Ask the user only for small missing context such as:
   - workout intent
   - perceived effort
   - target race or target pace

Do not default to export flows that require manual email input and download steps.

## Core workflow

1. Confirm COROS is already logged in.
2. Open the activity list or requested activity page with Playwright.
3. Read only the visible fields needed for the current question.
4. Normalize the workout into a small structured summary.
5. Analyze against workout type and recent context.
6. Produce a short report with:
   - conclusion
   - evidence
   - risks
   - next-step advice

## Preferred inputs

### Single activity

Capture as many of these as are visible:

- sport type
- date
- distance
- duration
- average pace
- average heart rate
- max heart rate
- cadence
- elevation gain
- lap or split data
- training load
- power, if visible

Also capture:

- intended workout type
- user-reported feel, if available

### Short-cycle review

For 7-day or 28-day review, try to gather:

- workout dates
- workout types
- distance and duration
- training load
- basic intensity cues
- weekly totals
- rest gaps between quality sessions

## Analysis framework

### Single activity

1. Identify workout intent:
   - easy
   - threshold
   - long run
   - interval
   - race or hard effort
2. Check whether execution matched intent.
3. Compare pace, heart rate, power, and splits for internal consistency.
4. Look for pacing drift or collapse.
5. Judge load and recovery implication.
6. Recommend what the next 1-3 sessions should look like.

### Short-cycle review

1. Count easy, quality, and long sessions.
2. Check spacing between hard sessions.
3. Review weekly load pattern.
4. Look for monotony or stacking.
5. Identify whether the user is underloaded, appropriately loaded, or carrying too much fatigue.
6. Recommend whether to hold, build, or deload.

## Output format

Keep the response in four parts:

- Conclusion: what happened overall
- Evidence: which visible metrics support that judgment
- Risks: fatigue, pacing, injury, or progression risks
- Advice: what to do next in training

## Browser guidance

Prefer Playwright over manual user transcription when the data is visible on the page.

Typical page targets:

- activity list
- recent training summary
- single activity detail
- weekly calendar or statistics views

If page automation is noisy:

- re-snapshot after navigation
- read small, targeted DOM segments
- avoid broad scraping when only one activity is needed

## Important limits

- Do not claim precision that the visible data does not support
- Distinguish observed data from inference
- If heart rate, power, or splits are missing, say what can and cannot be concluded
- For short-cycle analysis, avoid pretending a full long-term trend exists

## References

- For the detailed analysis framework and page-reading strategy, read [analysis-framework.md](./references/analysis-framework.md).
