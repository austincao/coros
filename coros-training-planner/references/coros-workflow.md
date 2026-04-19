# COROS Workflow

## Scope

This reference captures the working API-first pattern validated in this project.

## Proven workflow

### 1. Get token from logged-in browser

```bash
playwright-cli -s=coros cookie-get CPL-coros-token
```

Use the cookie value as:

```bash
-H 'accessToken: <TOKEN>'
```

### 2. Create or reuse workout courses

Use:

```bash
POST https://teamcnapi.coros.com/training/program/add
```

### 3. Create the plan template

Use:

```bash
POST https://teamcnapi.coros.com/training/plan/add
```

### 4. Inspect the template before execution

Use:

```bash
GET https://teamcnapi.coros.com/training/plan/detail?supportRestExercise=1&id=<PLAN_ID>
```

Check:

- `entities[].dayNo`
- `programs[].name`
- `totalWeeks`
- `totalDay`

### 5. Execute onto the calendar

Use:

```bash
POST https://teamcnapi.coros.com/training/schedule/executeSubPlan?startDay=<YYYYMMDD>&subPlanId=<PLAN_ID>
```

Observed successful response:

```json
{"message":"OK","result":"0000"}
```

### 6. Verify actual scheduled dates

Use:

```bash
GET https://teamcnapi.coros.com/training/schedule/query?startDate=<YYYYMMDD>&endDate=<YYYYMMDD>&supportRestExercise=1
```

Check:

- `data.subPlans[]`
- `data.entities[].happenDay`
- `data.entities[].planProgramId`

### 7. Undo a bad execution

Use:

```bash
POST https://teamcnapi.coros.com/training/schedule/quitSubPlan?subPlanId=<EXECUTED_SUBPLAN_ID>
```

Observed successful response:

```json
{"message":"OK","result":"0000"}
```

## Important findings

### Library plan vs executed sub-plan

- Template plan id: the object created in the plan library
- Executed sub-plan id: the object created after `executeSubPlan`
- `quitSubPlan` needs the executed sub-plan id, not the library template id

### UI findings

Browser/UI behavior matched these backend calls:

- Dragging a plan from the library onto the calendar triggered `executeSubPlan`
- Clicking `退出训练计划` in the executing plan view triggered `quitSubPlan`

### What did not work for scheduling

This project verified that the following is not the correct final scheduling path:

- writing `programs` or `subPlans` into `training/schedule/update`

It may return success while silently ignoring the relevant scheduling data.

## Reference mapping for the half-marathon 4-week plan

### Intended calendar pattern

- Start date: `2026-03-31`
- Weekdays: Tuesday, Thursday, Sunday

### Correct `dayNo`

```json
[1,3,6,8,10,13,15,17,20,22,24,27]
```

### Verified scheduled dates

```json
[
  20260331,
  20260402,
  20260405,
  20260407,
  20260409,
  20260412,
  20260414,
  20260416,
  20260419,
  20260421,
  20260423,
  20260426
]
```

### Wrong `dayNo` that caused shift

```json
[2,4,7,9,11,14,16,18,21,23,25,28]
```

This shifted the same block to Wednesday, Friday, Monday.

## Practical advice for future reuse

- Log in first and reuse a fresh browser token
- Use APIs for all writes after login
- Never trust execution success without querying `happenDay`
- Keep template creation and execution as separate steps
- When cloning an old template, always inspect and if needed rewrite `dayNo`
