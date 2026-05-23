---
name: "dev"
description: "Boot the beeromat dev server on port 3010 with the docker stack verified, then arm a persistent monitor on the dev log that fires on any error, warning, 4xx, or 5xx during the session."
argument-hint: "(no arguments — runs the standard dev-start + monitor sequence)"
compatibility: "beeromat repo only — assumes docker-compose.yml with beeromat-* containers, pnpm dev → port 3010, Mailpit Web UI at 18025"
metadata:
  author: "skorunka + claude"
  source: "manual"
user-invocable: true
disable-model-invocation: false
---

## Goal

Bring the beeromat dev server up cleanly and arm a live error watcher,
in one shot. Replaces the manual sequence the agent has been doing
~10 times per polish session:

  1. Verify the docker stack is up (postgres + neon proxies + mailpit).
  2. Start `pnpm dev` in the background; output goes to a tracked log
     file the runtime gives back.
  3. Wait for the first event in the log — either `Ready in NNNms`
     (success) or a boot error.
  4. Print the boot summary + the URLs the user needs.
  5. Arm a persistent `Monitor` task on the log, filtered for the
     patterns that actually matter (errors, warnings, 4xx/5xx, etc.).
     Each match becomes a chat notification.

The combined effect: the user pokes the app in their browser; the
agent gets pinged on anything actionable; no polling required.

## Execution Steps

### 1. Verify the docker stack

Run `docker ps --filter name=beeromat --format '{{.Names}} {{.Status}}'`
through PowerShell with a 10-second timeout (`Start-Job` + `Wait-Job`).
The docker daemon hangs in known-failure modes on Windows (post-update,
post-WSL-shutdown), and a 10s timeout catches that without blocking
the rest of the slash command.

If the daemon is hung or `beeromat-postgres` / `beeromat-neon-proxy` /
`beeromat-neon-proxy-test` / `beeromat-mailpit` are missing, surface
the gap to the user and ask whether to recover. Standard recovery
(documented in
`C:\Users\<user>\.claude\projects\C----beeromat\memory\reference_speckit_skills_install.md`'s
sibling memories): force-kill Docker Desktop processes, `wsl
--shutdown`, user relaunches Docker Desktop.

If the four containers are up + healthy, proceed.

### 2. Start the dev server in the background

```
Bash(command='pnpm dev 2>&1', run_in_background=true)
```

The tool returns a task id (e.g. `bc2fke559`) and the absolute output
file path. Capture both; both are needed for steps 3-5.

### 3. Wait for the boot signal

```
Bash(command='until grep -qE "Ready in|Error:|EADDRINUSE|failed to compile" "<output-file>" 2>/dev/null; do sleep 1; done; echo "BOOT-EVENT-SEEN"', timeout=120000)
```

This blocks until ONE event lands in the log — success (`Ready in
NNNms`) or a boot failure. The `until` loop is the recommended
single-notification pattern (see Monitor tool docs: "tell me when the
server is ready"). Don't use `Monitor` for this — Monitor is for
ongoing events.

### 4. Read the first 20-ish lines of the log

`Read` the output file. Confirm the dev server reported its URL
(usually `http://localhost:3010`). If the log shows a boot error
instead (port in use, missing env var, etc.), report the error and
DO NOT proceed to step 5. The user should fix and re-invoke the
slash command.

### 5. Arm the persistent monitor

```
Monitor(
  description: "errors/warnings in pnpm dev (port 3010)",
  persistent: true,
  timeout_ms: 3600000,
  command: 'tail -n 0 -f "<output-file>" | grep -E --line-buffered "Error|error:|⚠|Warning|warn|Failed|failed to compile|EADDRINUSE|TypeError|ReferenceError|UnhandledPromiseRejection| 5[0-9]{2} | 4[0-9]{2} "'
)
```

Notes on the filter:
- `tail -n 0` so the watcher starts at the END of the log; otherwise
  every historic line replays as a notification.
- `--line-buffered` so each matched line emits as it arrives instead
  of being held in a pipe buffer for minutes.
- The HTTP-status regexes (` 5[0-9]{2} ` and ` 4[0-9]{2} `) have
  spaces on both sides so they don't false-match three-digit numbers
  inside other content. Next.js's dev log prints `GET /foo 200 in NNms`
  — the surrounding spaces are reliable anchors.
- `persistent: true` so the watcher survives until the session ends
  or the user explicitly stops it.

### 6. Final summary message

Print (in markdown, tight):

  Dev server up cleanly on **http://localhost:3010** (Ready in NNNms).
  Mailpit (catches dev emails): **http://localhost:18025**.
  Watcher armed — I'll get pinged on anything actionable.

Note both task ids in the response (dev server + watcher) so the
user can refer to them later if they want to ask the agent to stop
either.

## Things this skill does NOT do

- Does NOT clean `.next` or restart an existing dev process. If a
  dev server is already running on 3010 (`netstat -ano | findstr
  :3010`), the new `pnpm dev` will EADDRINUSE — surface that error
  in step 4 and ask the user how to proceed.
- Does NOT bring up the docker stack if it's down. Bringing docker
  up may include `docker compose up -d` which has its own concerns
  (port collisions with other projects, Docker Desktop wedged, etc.)
  — surface the missing containers to the user and let them decide.
- Does NOT run any verification gates (typecheck, lint, build). The
  skill is about "see what the dev server is doing live", not about
  pre-flight correctness. Use the verification gates separately.

## Recovery paths

- **Boot error in step 4**: dump the log tail to the user, ask whether
  to investigate (read more of the log, inspect the changed files,
  etc.) or to abort. Don't auto-fix — boot errors usually indicate a
  bigger problem the user knows about.
- **Watcher fires immediately on a recurring error**: don't muffle
  the filter. The user wants to see real signal. If the noise is
  truly benign (e.g., a known DEP0169 deprecation from a transitive
  dep), surface ONCE with the diagnosis and propose either a code
  fix or a filter narrowing — but only with explicit user nod.
- **Session restart while the dev server is running**: the dev
  process keeps running but the monitor + task tracking is lost. On
  re-invocation, the new `pnpm dev` will EADDRINUSE. The user must
  first `taskkill /F /IM node.exe` for any orphaned `next dev`
  process before re-running the skill.
