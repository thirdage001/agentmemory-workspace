# agentmemory Setup Guide

Complete installation guide for deploying agentmemory to Coolify and integrating it with Devin Desktop (Windsurf) via Cascade Hooks.

## Overview

This setup gives you:

- A self-hosted **agentmemory** instance running on Coolify
- **Automatic session observation** - every prompt, tool call, file edit, and agent response is recorded
- **Memory recall** via MCP tools (`memory_recall`, `memory_smart_search`, etc.)
- **Automatic memory search** at the start of every new conversation via a global rule
- **Proactive memory saving** — the agent saves important learnings (architecture decisions, bugs, patterns, preferences, workflows) automatically via the global rule
- **Shared memory across repositories and agents** — a scope hierarchy (Repository > Client > Domain > Global) via AgentMemory facets, so knowledge transferable across repos/clients/technologies is discoverable from any agent session

## Architecture

```
Windsurf/Devin Desktop (Cascade) / Claude Code
  │
  ├── Lifecycle Hooks (Cascade / Claude / Devin)
  │     │
  │     └── bridge scripts (~/.agentmemory/scripts/)
  │           │
  │           └── HTTP POST → agentmemory server
  │
  ├── MCP Server (agentmemory)
  │     │
  │     └── memory_recall, memory_smart_search, memory_save,
  │         memory_facet_tag, memory_facet_query, memory_lesson_save, ...
  │
  └── Rules layer
        ├── Global Rule (~/.codeium/windsurf/memories/global_rules.md  — Windsurf + Devin)
        ├── Claude Code Rule (~/.claude/CLAUDE.md  — @import of canonical policy)
        └── Canonical Shared-Memory Policy (~/.agentmemory/rules/shared-memory.md)
              │
              └── Scope hierarchy: Repository > Client > Domain > Global
                  via facets (scope/domain/client/project)
```

> **Hooks = reliability / lifecycle. Rules = memory policy / classification / retrieval strategy.**
> AgentMemory itself is not forked — the scope hierarchy lives entirely in the rules layer.

## Prerequisites

- Coolify instance with API access
- Windsurf / Devin Desktop IDE installed
- Node.js 18+ installed and on PATH
- Git installed

---

## Step 1: Deploy agentmemory to Coolify

### 1.1 Get Coolify API credentials

You need:
- `COOLIFY_BASE_URL` - your Coolify instance URL
- `COOLIFY_TOKEN` - an API token from Coolify settings

### 1.2 Create the application

Use the Coolify API (or MCP tools) to create a new application:

- **Type**: Docker Compose
- **Base directory**: `deploy/coolify`
- **Public port**: `3111`
- **Source**: Public Git repo `https://github.com/<user>/agentmemory`
- **Instant deploy**: yes

### 1.3 Configure the domain

After the first deployment loads the Compose file, set the domain:

```
Domain: agentmemory.kopps.net:3111
```

> Replace `agentmemory.kopps.net` with your own domain if you deploy a separate instance.

### 1.4 Verify deployment

Check that the application status is `running:healthy`. The agentmemory API should respond at:

```
https://agentmemory.kopps.net/agentmemory/sessions
```

### 1.5 Extract the HMAC secret

On first startup, agentmemory generates an HMAC secret and logs it. Retrieve it from the container logs:

```bash
docker logs <container-name> 2>&1 | grep -i secret
```

Save this secret - you need it for all subsequent configuration.

### 1.6 Enable feature flags on the server (Coolify env vars)

Several agentmemory features are **off by default** and must be enabled as environment variables on the Coolify application before they work over MCP/REST. Set these in the Coolify UI (Application → Environment Variables) or via the Coolify API, then restart the application:

| Variable | Default | What it enables |
|---|---|---|
| `AGENTMEMORY_SLOTS` | `false` | `memory_slot_create` / `memory_slot_append` / `memory_slot_replace` / `memory_slot_delete` — persistent, pinned context slots loaded at session start. Without this flag, `mem::slot-create` is never registered and MCP slot calls return 500. |
| `AGENTMEMORY_REFLECT` | `false` | `memory_reflect` — LLM-synthesized higher-order insights. Requires `AGENTMEMORY_SLOTS=true`. |
| `CONSOLIDATION_ENABLED` | `false` | `memory_consolidate` — the 4-tier pipeline (working → episodic → semantic → procedural). Alternatively, set any LLM provider key (`ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `OPENROUTER_API_KEY` / `GEMINI_API_KEY` / `GOOGLE_API_KEY` / `MINIMAX_API_KEY` / `OPENAI_BASE_URL` / `AGENTMEMORY_PROVIDER=agent-sdk`). |
| `OPENAI_MODEL` | `gpt-5.6-luna` | Model name for the OpenAI LLM provider. **Note:** newer OpenAI models (`gpt-5.x`, `o1`, `o3`, `o4-mini`) reject the legacy `max_tokens` parameter and cause `Summarize failed` 400 errors during consolidation. Set `OPENAI_MODEL=gpt-4o-mini` (or another `max_tokens`-compatible model) until the `max_completion_tokens` fix ships in a published npm release. |
| `AGENTMEMORY_AUTO_COMPRESS` | `false` | LLM-driven observation compression. Requires an LLM provider key. |
| `EMBEDDING_PROVIDER` | (none) | Set to `local` for free on-device semantic embeddings (downloads `Xenova/all-MiniLM-L6-v2`), or a cloud provider for vector search. Without this, `memory_smart_search` falls back to BM25 keyword + graph fusion only. |
| `AGENTMEMORY_TOOLS` | `default` | Set to `all` to expose all 54 MCP tools; otherwise only 8 are visible by default. |

After adding the variables, restart the application so the new env is picked up.

---

## Step 2: Configure environment variables (client side)

Set these as **user-level** environment variables on your local machine (so they apply to all processes — the MCP client, the Cascade bridge, and any curl/REST calls):

### Windows (PowerShell)

```powershell
[Environment]::SetEnvironmentVariable("AGENTMEMORY_URL", "https://agentmemory.kopps.net", "User")
[Environment]::SetEnvironmentVariable("AGENTMEMORY_SECRET", "<your-hmac-secret>", "User")
```

### macOS / Linux

```bash
# Add to ~/.bashrc or ~/.zshrc
export AGENTMEMORY_URL="https://agentmemory.kopps.net"
export AGENTMEMORY_SECRET="<your-hmac-secret>"
```

**Important:** Restart your terminal / IDE after setting these so they take effect.

> **This instance's address:** the production agentmemory daemon runs at `https://agentmemory.kopps.net` (Coolify Docker Compose, Traefik reverse proxy, TLS via Let's Encrypt). Replace `agentmemory.kopps.net` with your own domain if you deploy a separate instance.

---

## Step 3: Install the Cascade Hooks bridge script

Cascade (the Devin Desktop agent) uses a different hooks system than the Devin CLI. We need a bridge script that translates Cascade's hook format into agentmemory API calls.

### 3.1 Create the scripts directory

```bash
mkdir -p ~/.agentmemory/scripts
```

### 3.2 Save the bridge script

Save the following as `~/.agentmemory/scripts/cascade-bridge.mjs`:

```javascript
#!/usr/bin/env node
/**
 * Cascade-to-agentmemory bridge.
 * Translates Cascade hook stdin format (trajectory_id, tool_info, etc.)
 * into agentmemory REST API calls using /agentmemory/observe format.
 */
import { execSync } from "node:child_process";
import { basename } from "node:path";

const REST_URL = (process.env["AGENTMEMORY_URL"] || "http://localhost:3111").replace(/\/+$/, "");
const SECRET = process.env["AGENTMEMORY_SECRET"] || "";
const TIMEOUT_MS = 5000;

function authHeaders() {
  const h = { "Content-Type": "application/json" };
  if (SECRET) h["Authorization"] = `Bearer ${SECRET}`;
  return h;
}

function resolveProject(cwd) {
  const explicit = process.env["AGENTMEMORY_PROJECT_NAME"];
  if (explicit && explicit.trim()) return explicit.trim();
  const dir = cwd && cwd.trim() ? cwd : process.cwd();
  try {
    const top = execSync("git rev-parse --show-toplevel", {
      cwd: dir,
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 500,
    }).toString().trim();
    if (top) return basename(top);
  } catch {}
  return basename(dir);
}

async function post(path, body) {
  try {
    await fetch(`${REST_URL}${path}`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {}
}

function observe(sessionId, project, cwd, hookType, data) {
  return post("/agentmemory/observe", {
    hookType,
    sessionId,
    project,
    cwd,
    timestamp: new Date().toISOString(),
    data,
  });
}

function truncate(value, max = 8000) {
  if (typeof value === "string" && value.length > max) return value.slice(0, max) + "\n[...truncated]";
  if (value && typeof value === "object") {
    const str = JSON.stringify(value);
    if (str.length > max) return str.slice(0, max) + "...[truncated]";
  }
  return value;
}

async function main() {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  let data;
  try { data = JSON.parse(input); } catch { return; }
  if (!data || typeof data !== "object") return;

  const sessionId = data.trajectory_id || data.session_id || data.sessionId || data.conversation_id || `ses_${Date.now().toString(36)}`;
  const event = data.agent_action_name || data.hook_event_name || "";
  const toolInfo = data.tool_info || {};
  const cwd = toolInfo.cwd || data.cwd || process.cwd();
  const project = resolveProject(cwd);

  const tasks = [];

  switch (event) {
    case "pre_user_prompt": {
      tasks.push(post("/agentmemory/session/start", { sessionId, project, cwd }));
      const prompt = toolInfo.user_prompt || "";
      if (prompt) tasks.push(observe(sessionId, project, cwd, "prompt_submit", { prompt }));
      break;
    }
    case "pre_read_code":
    case "pre_write_code":
    case "pre_run_command":
    case "pre_mcp_tool_use": {
      let toolName, toolInput;
      if (event === "pre_read_code") { toolName = "read"; toolInput = { file_path: toolInfo.file_path }; }
      else if (event === "pre_write_code") { toolName = "edit"; toolInput = { file_path: toolInfo.file_path, edits: toolInfo.edits }; }
      else if (event === "pre_run_command") { toolName = "exec"; toolInput = { command: toolInfo.command_line, cwd: toolInfo.cwd }; }
      else { toolName = `mcp__${toolInfo.mcp_server_name}__${toolInfo.mcp_tool_name}`; toolInput = { server: toolInfo.mcp_server_name, tool: toolInfo.mcp_tool_name, args: toolInfo.mcp_tool_arguments }; }
      tasks.push(observe(sessionId, project, cwd, "pre_tool_use", { tool_name: toolName, tool_input: toolInput }));
      break;
    }
    case "post_read_code":
    case "post_write_code":
    case "post_run_command":
    case "post_mcp_tool_use": {
      let toolName, toolInput, toolOutput;
      if (event === "post_read_code") { toolName = "read"; toolInput = { file_path: toolInfo.file_path }; toolOutput = toolInfo.file_path ? `[read ${toolInfo.file_path}]` : ""; }
      else if (event === "post_write_code") { toolName = "edit"; toolInput = { file_path: toolInfo.file_path, edits: toolInfo.edits }; toolOutput = `[edited ${toolInfo.file_path}]`; }
      else if (event === "post_run_command") { toolName = "exec"; toolInput = { command: toolInfo.command_line, cwd: toolInfo.cwd }; toolOutput = toolInfo.command_output || toolInfo.output || `[ran ${toolInfo.command_line}]`; }
      else { toolName = `mcp__${toolInfo.mcp_server_name}__${toolInfo.mcp_tool_name}`; toolInput = { server: toolInfo.mcp_server_name, tool: toolInfo.mcp_tool_name, args: toolInfo.mcp_tool_arguments }; toolOutput = toolInfo.mcp_result || ""; }
      tasks.push(observe(sessionId, project, cwd, "post_tool_use", { tool_name: toolName, tool_input: toolInput, tool_output: truncate(toolOutput) }));
      break;
    }
    case "post_cascade_response": {
      const response = toolInfo.response || "";
      if (response) tasks.push(observe(sessionId, project, cwd, "agent_response", { response: truncate(response, 8000) }));
      tasks.push(post("/agentmemory/session/end", { sessionId }));
      break;
    }
    case "post_cascade_response_with_transcript": {
      const transcriptPath = toolInfo.transcript_path || "";
      if (transcriptPath) tasks.push(observe(sessionId, project, cwd, "transcript", { transcript_path: transcriptPath }));
      break;
    }
    case "post_setup_worktree": {
      tasks.push(observe(sessionId, project, cwd, "worktree_setup", { worktree_path: toolInfo.worktree_path, root_workspace_path: toolInfo.root_workspace_path }));
      break;
    }
    default: break;
  }

  await Promise.all(tasks);
}

main().catch(() => process.exit(0));
```

---

## Step 4: Configure Cascade Hooks

Cascade reads hooks from `~/.codeium/windsurf/hooks.json` (user-level, all projects).

### 4.1 Create the hooks config

Save as `~/.codeium/windsurf/hooks.json`:

> **Windows:** `C:\Users\<username>\.codeium\windsurf\hooks.json`
> **macOS/Linux:** `~/.codeium/windsurf/hooks.json`

```json
{
  "hooks": {
    "pre_user_prompt": [
      {
        "command": "node \"<HOME>/.agentmemory/scripts/cascade-bridge.mjs\"",
        "powershell": "node \"<HOME>/.agentmemory/scripts/cascade-bridge.mjs\""
      }
    ],
    "pre_read_code": [
      {
        "command": "node \"<HOME>/.agentmemory/scripts/cascade-bridge.mjs\"",
        "powershell": "node \"<HOME>/.agentmemory/scripts/cascade-bridge.mjs\""
      }
    ],
    "pre_write_code": [
      {
        "command": "node \"<HOME>/.agentmemory/scripts/cascade-bridge.mjs\"",
        "powershell": "node \"<HOME>/.agentmemory/scripts/cascade-bridge.mjs\""
      }
    ],
    "pre_run_command": [
      {
        "command": "node \"<HOME>/.agentmemory/scripts/cascade-bridge.mjs\"",
        "powershell": "node \"<HOME>/.agentmemory/scripts/cascade-bridge.mjs\""
      }
    ],
    "pre_mcp_tool_use": [
      {
        "command": "node \"<HOME>/.agentmemory/scripts/cascade-bridge.mjs\"",
        "powershell": "node \"<HOME>/.agentmemory/scripts/cascade-bridge.mjs\""
      }
    ],
    "post_read_code": [
      {
        "command": "node \"<HOME>/.agentmemory/scripts/cascade-bridge.mjs\"",
        "powershell": "node \"<HOME>/.agentmemory/scripts/cascade-bridge.mjs\""
      }
    ],
    "post_write_code": [
      {
        "command": "node \"<HOME>/.agentmemory/scripts/cascade-bridge.mjs\"",
        "powershell": "node \"<HOME>/.agentmemory/scripts/cascade-bridge.mjs\""
      }
    ],
    "post_run_command": [
      {
        "command": "node \"<HOME>/.agentmemory/scripts/cascade-bridge.mjs\"",
        "powershell": "node \"<HOME>/.agentmemory/scripts/cascade-bridge.mjs\""
      }
    ],
    "post_mcp_tool_use": [
      {
        "command": "node \"<HOME>/.agentmemory/scripts/cascade-bridge.mjs\"",
        "powershell": "node \"<HOME>/.agentmemory/scripts/cascade-bridge.mjs\""
      }
    ],
    "post_cascade_response": [
      {
        "command": "node \"<HOME>/.agentmemory/scripts/cascade-bridge.mjs\"",
        "powershell": "node \"<HOME>/.agentmemory/scripts/cascade-bridge.mjs\""
      }
    ]
  }
}
```

Replace `<HOME>` with your home directory path:
- **Windows:** `C:\\Users\\<username>` (double backslashes in JSON)
- **macOS/Linux:** `/Users/<username>` or `/home/<username>`

### 4.2 Hook events covered

| Event | What it records |
|---|---|
| `pre_user_prompt` | Session start + user prompt |
| `pre_read_code` / `post_read_code` | File reads |
| `pre_write_code` / `post_write_code` | File edits |
| `pre_run_command` / `post_run_command` | Shell commands |
| `pre_mcp_tool_use` / `post_mcp_tool_use` | MCP tool calls |
| `post_cascade_response` | Agent response + session end |

---

## Step 5: Configure the agentmemory MCP server

Add the agentmemory MCP server to **every** agent you use. The MCP client (`@agentmemory/mcp`) is a local stdio process that proxies all tool calls to the remote daemon at `AGENTMEMORY_URL` using `AGENTMEMORY_SECRET` for HMAC auth.

The same server block works for all agents — only the config file location differs:

| Agent | Config file (Windows) | Config file (macOS/Linux) |
|---|---|---|
| **Devin Desktop** | `%APPDATA%\devin\mcp_config.json` | `~/.config/devin/mcp_config.json` |
| **Claude Code** | `C:\Users\<username>\.claude.json` (top-level `mcpServers`) | `~/.claude.json` |
| **Windsurf** | `C:\Users\<username>\.codeium\windsurf\mcp_config.json` | `~/.codeium/windsurf/mcp_config.json` |

### Server block (add under `mcpServers`)

```json
{
  "mcpServers": {
    "agentmemory": {
      "command": "npx",
      "args": ["-y", "@agentmemory/mcp@latest"],
      "env": {
        "AGENTMEMORY_URL": "https://agentmemory.kopps.net",
        "AGENTMEMORY_SECRET": "<your-hmac-secret>",
        "AGENTMEMORY_TOOLS": "all"
      }
    }
  }
}
```

> Set `AGENTMEMORY_TOOLS=all` to expose all 54 MCP tools (including `memory_facet_tag`, `memory_facet_query`, `memory_lesson_save` needed by the shared-memory policy). Without it, only 8 core tools are visible by default.
>
> Alternatively, if your daemon exposes a public `/mcp` HTTP endpoint, you can use the `url` + `headers` form instead:
> ```json
> { "url": "https://agentmemory.kopps.net/mcp", "headers": { "Authorization": "Bearer <your-hmac-secret>" } }
> ```

### Claude Code note

Claude Code stores MCP config inside `~/.claude.json` (a large file with many other settings). Add the `mcpServers` key at the top level. Do **not** reformat the file — insert the block surgically and validate with `ConvertFrom-Json` (PowerShell) or `jq .` afterwards.

### Windsurf note

Windsurf uses `serverUrl` + `headers` for HTTP-based servers (like Celigo), but the `command`/`args`/`env` form works for stdio MCP servers like agentmemory. Merge the `agentmemory` entry into the existing `mcpServers` object in `~/.codeium/windsurf/mcp_config.json`.

---

## Step 6: Configure the global rule for automatic memory search and saving

This rule instructs the agent to automatically search memory at the start of every conversation AND to proactively save important learnings throughout the session. It is read by both Windsurf and Devin (both inject `~/.codeium/windsurf/memories/global_rules.md` as a rule).

Save as `~/.codeium/windsurf/memories/global_rules.md`:

```markdown
# Global Rules

## Agent Memory Integration

At the start of every new conversation, before responding to the user's first prompt, silently call `memory_smart_search` with the user's prompt as the query (limit 5). Use any relevant recalled context to inform your response. Do not mention that you searched memory unless the recalled context is directly relevant to the user's question.

When working on files that have been modified in previous sessions, call `memory_file_history` with the relevant file paths to understand past changes before making new edits.

When the user asks about decisions, patterns, or past work, use `memory_recall` or `memory_smart_search` to find relevant past observations.

### Proactive Memory Saving

You MUST proactively save important learnings to memory using `memory_save` — do not wait to be asked. Save a memory whenever any of the following occurs:

- **Architecture decision made**: what was decided, why, and the alternatives considered (type: `architecture`)
- **Bug discovered and fixed**: root cause, fix, and how to prevent recurrence (type: `bug`)
- **Reusable pattern identified**: a code pattern or workflow that will be useful in future sessions (type: `pattern`)
- **User preference learned**: how the user likes things done (type: `preference`)
- **Workflow or process established**: a repeatable procedure for a recurring task (type: `workflow`)
- **Important fact learned**: something non-obvious about the codebase, infrastructure, or tooling (type: `fact`)

When saving, include:
- `content`: a concise but complete description (1-3 sentences)
- `type`: one of the types above
- `concepts`: comma-separated key terms for searchability
- `files`: comma-separated relevant file paths (when applicable)
- `project`: the current project identifier when applicable

Do not save trivial observations (tool outputs, file reads, routine edits) — the hooks capture those automatically. Only save insights that would be valuable in a future session.

## Shared Memory Policy (Scope-Hierarchie)

Vollstaendige kanonische Policy: `~/.agentmemory/rules/shared-memory.md`.
[... operative Kurzform siehe Step 8 unten ...]
```

> The full current content of this file (including the complete Shared Memory Policy section) is shown in **Step 8**. The canonical policy file is the single source of truth — this rule file contains an operative short-form summary and a pointer to it.

### Claude Code rule

Claude Code reads `~/.claude/CLAUDE.md` as its global rule. Create it with the same Agent Memory Integration section plus an `@import` of the canonical policy:

```markdown
# Global Rules

## Agent Memory Integration
[... same as above ...]

## Shared Memory Policy (Scope-Hierarchie)

@~/.agentmemory/rules/shared-memory.md
```

> Claude Code supports `@<path>` imports in rule files, so the canonical policy is included without duplication.

---

## Step 7: Restart and verify

1. **Restart Windsurf / Devin Desktop completely** - this loads the hooks and the global rule
2. Open any project folder
3. Send a prompt to the agent
4. Check that a session was created:

```
# Via MCP tool (ask the agent):
"List recent memory sessions"

# Or via curl:
curl -H "Authorization: Bearer <secret>" https://agentmemory.kopps.net/agentmemory/sessions
```

You should see a new session with observations.

---

## Step 8: Configure the Shared Memory Policy (scope hierarchy)

This step adds a repository-agnostic shared-memory layer on top of the per-project memory from Steps 1–7. It uses AgentMemory's existing facet system (`memory_facet_tag` / `memory_facet_query` / `memory_facet_get`) — **no fork or internal change to AgentMemory is required**. The policy lives entirely in rule files.

### 8.1 Why

Per-project memory (Step 6) only surfaces knowledge tagged with the current `project`. But some insights are transferable: a NetSuite RESTlet quirk applies to every NetSuite project, a client-wide identifier applies to every repo of that client, and a general debugging strategy applies everywhere. The shared-memory policy makes these discoverable from any session without polluting repo-specific context.

### 8.2 Scope hierarchy

| Scope | Facets | When |
|---|---|---|
| **Repository** | `scope:project`, `project:<slug>` | Only the current repo (file paths, internal APIs, repo-specific bugs) |
| **Client** | `scope:client`, `client:<client>` | Multiple repos of the same customer (shared identifiers, client conventions) |
| **Domain** | `scope:domain`, `domain:<domain>` | A technology/problem class (NetSuite patterns, Shopify API quirks, OAuth) |
| **Global** | `scope:global` | Agent-agnostic working rules and lessons (debugging strategies, coding principles) |

Priority on conflict: Repository > Client > Domain > Global.

### 8.3 Create the canonical policy file

```bash
mkdir -p ~/.agentmemory/rules
```

Save as `~/.agentmemory/rules/shared-memory.md`:

```markdown
# Shared Memory Policy (Scope-Hierarchie via Facets)

[... full policy: scope hierarchy, facet vocabulary, context resolution,
    retrieval strategy, save-with-classification, anti-pollution rules ...]
```

> The full canonical policy content is maintained in the repo at
> `~/.agentmemory/rules/shared-memory.md`. It defines:
> - **Context resolution** at session start (determine project, client, domains)
> - **Retrieval strategy**: `memory_smart_search` (semantic, no project filter) crossed with
>   `memory_facet_query` (scope facet set) → intersection = relevant shared memories.
>   Scope weighting: project=1.0, client=0.8, domain=0.6, global=0.4.
>   Lessons via `memory_lesson_recall` (scope in `tags` field, not facets).
> - **Save with classification**: `memory_save` → then `memory_facet_tag` with the returned
>   `memory.id` (targetType=`memory`) and the appropriate scope/domain/client/project facets.
>   Lessons: `memory_lesson_save` with `tags` = `scope:<value>,domain:<value>` (not facet-taggable).
> - **Anti-pollution**: only save if reusable, stable, non-obvious, or prevents a repeated error.

### 8.4 Wire the policy into each agent's rules

| Agent | Rule file | How |
|---|---|---|
| **Windsurf + Devin** | `~/.codeium/windsurf/memories/global_rules.md` | Append the operative short-form summary + pointer to canonical file (both agents read this file) |
| **Claude Code** | `~/.claude/CLAUDE.md` | `@import` the canonical policy file via `@~/.agentmemory/rules/shared-memory.md` |

### 8.5 Ensure all agents have the MCP server

The shared-memory policy calls `memory_facet_tag`, `memory_facet_query`, `memory_facet_get`, and `memory_lesson_save` — these require `AGENTMEMORY_TOOLS=all` (see Step 5). Verify each agent's MCP config includes the agentmemory server before relying on the policy.

### 8.6 Verify

After restarting all agents, save a test global memory and confirm it is facet-tagged:

1. Call `memory_save` with a test insight (no `project`).
2. Take the `memory.id` from the result.
3. Call `memory_facet_tag` with `targetId`=<that id>, `targetType`=`memory`, `dimension`=`scope`, `value`=`global`.
4. Call `memory_facet_query` with `matchAny`=`scope:global`, `targetType`=`memory` — you should see the test memory's ID in the results.

### 8.7 Key design notes

- **Lessons are not facet-taggable** — `memory_facet_tag` accepts `targetType` only for `action|memory|observation`. Lessons carry their scope in the `tags` field of `memory_lesson_save` (e.g. `scope:domain,domain:shopify`).
- **Retrieval is a two-step intersection** — `memory_smart_search` returns content+IDs but cannot filter by facet; `memory_facet_query` returns IDs but no content. The policy crosses them: semantic hits whose IDs appear in the scope facet set are the relevant shared memories.
- **No AgentMemory core change** — everything runs through existing MCP tools and the rules layer. If the rule-based approach proves unreliable, a native scope-aware context builder can be added to AgentMemory later.

---

## File locations summary

| File | Purpose | Scope |
|---|---|---|
| `~/.agentmemory/scripts/cascade-bridge.mjs` | Bridge script (Cascade → agentmemory) | User-level |
| `~/.codeium/windsurf/hooks.json` | Cascade hooks configuration | User-level, all projects |
| `~/.codeium/windsurf/memories/global_rules.md` | Global rule: auto memory search + proactive saving + shared-memory policy short form | User-level, all projects (Windsurf + Devin) |
| `~/.agentmemory/rules/shared-memory.md` | Canonical shared-memory policy (scope hierarchy, retrieval, classification) | User-level, all agents |
| `~/.claude/CLAUDE.md` | Claude Code global rule (`@import` of canonical policy) | User-level, all projects (Claude Code) |
| `~/.claude.json` (Win/macOS/Linux) | Claude Code MCP server config (top-level `mcpServers`) | User-level |
| `~/.codeium/windsurf/mcp_config.json` | Windsurf MCP server config | User-level |
| `%APPDATA%\devin\mcp_config.json` (Win) / `~/.config/devin/mcp_config.json` (Unix) | Devin MCP server config | User-level |
| Environment vars `AGENTMEMORY_URL`, `AGENTMEMORY_SECRET` | Server connection | User-level |

---

## Troubleshooting

### Hooks not firing
- Verify `~/.codeium/windsurf/hooks.json` is valid JSON
- Verify Node.js is on PATH: `node --version`
- Verify environment variables are set: `echo $AGENTMEMORY_URL`
- Restart Windsurf completely (not just reload)

### Observations not appearing
- Check the bridge script path in `hooks.json` matches the actual file location
- Test the bridge manually:
  ```bash
  echo '{"agent_action_name":"pre_user_prompt","trajectory_id":"test","tool_info":{"user_prompt":"test"}}' | node ~/.agentmemory/scripts/cascade-bridge.mjs
  ```
- Check the agentmemory server is reachable:
  ```bash
  curl -H "Authorization: Bearer <secret>" https://agentmemory.kopps.net/agentmemory/sessions
  ```

### `/hooks` command shows nothing
- The `/hooks` slash command is a **Devin CLI** feature, not a Cascade/IDE feature
- Cascade hooks don't have a UI command to list them
- Verify they're loaded by checking `memory_sessions` after a conversation

### Project name is wrong
- The bridge derives the project name from the git repo folder name
- Ensure your project is a git repo: `git init`
- Or set `AGENTMEMORY_PROJECT_NAME` environment variable to override

---

## Web Viewer / Dashboard

agentmemory includes a built-in web viewer on port `3113` with:
- **Knowledge Graph Canvas** - force-directed graph with color-coded nodes (file, function, concept, error, decision, pattern, library, person)
- **Session Explorer** - live observation stream with session list and detail panel
- **Session Replay** - scrub through past sessions with play/pause and speed control
- **Memories & Lessons** - expandable rows with full records and provenance
- **Health Dashboard** - system health and circuit breaker status
- **Dark Mode** - toggle in header, persists to localStorage

### Setup (Coolify)

The viewer port (`3113`) is intentionally not exposed publicly. It binds to `127.0.0.1` inside the container. To reach it:

1. **Fork the agentmemory repo** on GitHub
2. **Modify `deploy/coolify/docker-compose.yml`** - add a `ports` section:
   ```yaml
   ports:
     - "127.0.0.1:3113:3113"
   ```
3. **Update the Coolify application** to point to your fork (change `git_repository` via API or UI)
4. **Redeploy** the application
5. **Access via SSH tunnel:**
   ```bash
   ssh -L 3113:127.0.0.1:3113 root@185.207.250.150
   ```
6. **Open in browser:** `http://localhost:3113`

### Security notes
- The viewer binds to `127.0.0.1` only - it is NOT accessible from the public internet
- You need SSH access to the Coolify host to tunnel in
- The REST-served `/agentmemory/viewer` endpoint follows normal `AGENTMEMORY_SECRET` bearer-token rules
- For team access without SSH, expose 3113 as a second Coolify domain with HTTP basic auth
