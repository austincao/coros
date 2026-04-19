# Analysis Framework

## Purpose

This reference defines a lightweight, reusable method for analyzing COROS activities when only recent browser-visible data is available.

## Recommended operating mode

Use an already logged-in COROS browser session and read only the fields needed for the current question.

Avoid:

- export-by-email
- large historical ingestion
- making the user manually transcribe long tables when the page can be read directly

## Minimal structured summary

For each activity, try to build this object:

```json
{
  "date": "",
  "sport": "",
  "title": "",
  "distance_km": null,
  "duration": "",
  "avg_pace": "",
  "avg_hr": null,
  "max_hr": null,
  "cadence": null,
  "elevation_gain_m": null,
  "training_load": null,
  "splits": [],
  "intent": "",
  "subjective_feel": ""
}
```

Not every field is required. Missing fields should narrow the confidence of the judgment.

## Workout-type heuristics

### Easy run

Good signs:

- pace stable
- heart rate controlled
- no sharp late fade
- load moderate for the user

Potential issues:

- easy pace too close to threshold effort
- rising heart rate with stable or slowing pace
- back-to-back placement after hard sessions

### Threshold run

Good signs:

- pace sits near target band
- heart rate rises but remains controlled
- splits are even
- final section is sustainable rather than collapsing

Potential issues:

- first split too aggressive
- heart rate spikes early
- pace fades hard
- too much accumulated fatigue before the session

### Long run

Good signs:

- stable pacing
- manageable cardiac drift
- finish still controlled

Potential issues:

- excessive fade
- unusually high load compared with recent weeks
- long run placed too near another hard session

### Intervals

Good signs:

- repeats are consistent
- recoveries are adequate
- later reps remain close to early reps

Potential issues:

- large drop-off across reps
- recoveries too short for the intended quality
- total load too high for current phase

## Short-cycle analysis

For a recent 7-day or 28-day block, organize activities into:

- easy
- quality
- long
- other or non-running

Then review:

- total number of runs
- hard-session spacing
- total distance
- total load
- whether easy days are actually easy
- whether fatigue appears to be accumulating

## Suggested judgment scale

Use plain-language outcomes rather than pseudo-precise scores:

- on target
- slightly too hard
- clearly too hard
- under-stimulating
- good session but recovery now matters
- solid week
- overloaded week
- uneven week

## Output pattern

### Single workout

- Conclusion
- Evidence
- Risks
- Advice

### Short-cycle block

- Conclusion
- What is working
- What is risky
- What to change next week

## Playwright collection strategy

When browsing COROS:

1. Open the exact page needed.
2. Snapshot.
3. Identify stable labels and visible metrics.
4. Read targeted text blocks or targeted elements.
5. Re-snapshot after expanding charts or opening splits.

Useful page types:

- activity list page
- activity detail page
- week calendar
- summary cards

## Good follow-up prompts this skill should handle

- “分析这次阈值跑有没有跑对”
- “看一下我这周是不是强度太高了”
- “这次长跑后，下次训练该怎么接”
- “最近两周我是在进步还是太累了”
- “根据最近记录，下一周该不该降量”
