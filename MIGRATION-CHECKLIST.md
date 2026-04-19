# COROS Automation Migration Checklist

This is the shortest practical checklist for moving the COROS automation setup to another computer.

It covers:

- the MCP server
- the skill docs
- the minimum steps needed to make Codex operate COROS again

## What To Copy

Copy this whole workspace, or at least these parts:

- `/Users/austin/wukong/coros/coros-mcp-server`
- `/Users/austin/wukong/coros/coros-training-planner`
- `/Users/austin/wukong/coros/coros-activity-analyst`
- `/Users/austin/wukong/coros/README.md`
- `/Users/austin/wukong/coros/COROS-MCP-DESIGN.md`
- `/Users/austin/wukong/coros/COROS-MCP-SCHEMAS.md`

If you want the simplest path, just copy the whole `coros/` folder.

## What Matters Most

There are two layers:

### 1. MCP

This is the executable layer.

It is what actually lets Codex:

- read your COROS profile
- read activities
- analyze training
- recommend next week
- create workouts and plans
- execute plans to the COROS calendar

### 2. Skills and Docs

These are the knowledge layer.

They help Codex understand:

- how COROS workflows should be handled
- why certain APIs matter
- what pitfalls were already discovered
- how to reason about training and analysis tasks

In practice:

- MCP does the work
- skills improve how Codex uses MCP

## Minimum Setup On the New Computer

### Step 1. Install Node.js

Check:

```bash
node --version
npm --version
```

## Step 2. Install Dependencies

In the MCP project:

```bash
cd /path/to/coros-mcp-server
npm install
```

## Step 3. Build the Server

```bash
npm run check
npm run build
```

## Step 4. Log Into COROS

Open COROS Training Hub in a browser and log in.

## Step 5. Get the Access Token

Read the logged-in COROS token:

- cookie name: `CPL-coros-token`

Export it:

```bash
export COROS_ACCESS_TOKEN="YOUR_COROS_TOKEN"
```

## Step 6. Verify the MCP Server

Run the profile smoke test:

```bash
cd /path/to/coros-mcp-server
COROS_ACCESS_TOKEN="YOUR_COROS_TOKEN" npm run smoke:profile
```

If that works, your new computer is already connected to COROS through the MCP.

## Recommended Validation Order

Run these in order:

### 1. Auth and Profile

```bash
COROS_ACCESS_TOKEN="YOUR_COROS_TOKEN" npm run smoke:profile
```

### 2. Activity Reading

```bash
COROS_ACCESS_TOKEN="YOUR_COROS_TOKEN" npm run smoke:activities
```

### 3. Analysis

```bash
COROS_ACCESS_TOKEN="YOUR_COROS_TOKEN" npm run smoke:analysis
```

### 4. Recommendation

```bash
COROS_ACCESS_TOKEN="YOUR_COROS_TOKEN" npm run smoke:recommendation
```

### 5. Plan Flow

Only run this when you want to verify creation and calendar execution:

```bash
COROS_ACCESS_TOKEN="YOUR_COROS_TOKEN" npm run smoke:plan-flow
```

Note:

- this creates temporary workout and plan templates
- it cleans up the executed calendar entry
- it does not delete the created templates from your COROS library

## Can Codex Use It Directly On the New Computer?

Yes.

Once the new computer has:

- the copied project
- dependencies installed
- a valid `COROS_ACCESS_TOKEN`

Codex can use the MCP server to operate COROS directly.

That includes:

- profile reading
- activity reading
- training analysis
- training recommendation
- workout creation
- plan creation
- calendar execution

## What About the Skills?

If you also want Codex to reuse the skills:

- copy the skill folders too
- or install them into the new machine's Codex skill directory

Useful folders:

- `/Users/austin/wukong/coros/coros-training-planner`
- `/Users/austin/wukong/coros/coros-activity-analyst`

These are helpful, but not strictly required for the MCP itself to work.

## Best Practice On the New Computer

Use this setup:

1. Keep the MCP project locally
2. Keep the skill/docs locally too
3. Let Codex use MCP for execution
4. Let skills guide prompting and workflow structure

That gives you:

- real execution power from MCP
- reusable reasoning and process guidance from skills

## Fastest Practical Path

If you want the shortest possible path on a new computer:

```bash
cd /path/to/coros-mcp-server
npm install
npm run build
export COROS_ACCESS_TOKEN="YOUR_COROS_TOKEN"
npm run smoke:profile
```

If that passes, the setup is basically ready.

## Known Things You Still Need To Do Manually

These are not yet fully automated:

- logging into COROS web on the new machine
- retrieving a fresh `CPL-coros-token`
- optionally installing/copying skills into Codex's skill directory

## Suggested Follow-Up

After migration is working, the next improvement would be:

- add a small launcher or client config so Codex can attach to `coros-mcp-server` automatically without manual startup each time
