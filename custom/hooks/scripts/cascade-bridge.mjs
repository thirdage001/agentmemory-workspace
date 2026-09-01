#!/usr/bin/env node
/**
 * Cascade-to-agentmemory bridge.
 * Translates Cascade hook stdin format (trajectory_id, tool_info, etc.)
 * into agentmemory REST API calls using the correct /agentmemory/observe format.
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
  } catch {
    // Swallow errors - hooks must never break the agent.
  }
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
  try {
    data = JSON.parse(input);
  } catch {
    return;
  }
  if (!data || typeof data !== "object") return;

  const sessionId = data.trajectory_id || data.session_id || data.sessionId || data.conversation_id || `ses_${Date.now().toString(36)}`;
  const event = data.agent_action_name || data.hook_event_name || "";
  const toolInfo = data.tool_info || {};
  const cwd = toolInfo.cwd || data.cwd || process.cwd();
  const project = resolveProject(cwd);

  const tasks = [];

  switch (event) {
    case "pre_user_prompt": {
      // Register session + record user prompt
      tasks.push(post("/agentmemory/session/start", { sessionId, project, cwd }));
      const prompt = toolInfo.user_prompt || "";
      if (prompt) {
        tasks.push(observe(sessionId, project, cwd, "prompt_submit", { prompt }));
      }
      break;
    }

    case "pre_read_code":
    case "pre_write_code":
    case "pre_run_command":
    case "pre_mcp_tool_use": {
      // Record tool use as pre-tool observation
      let toolName, toolInput;
      if (event === "pre_read_code") {
        toolName = "read";
        toolInput = { file_path: toolInfo.file_path };
      } else if (event === "pre_write_code") {
        toolName = "edit";
        toolInput = { file_path: toolInfo.file_path, edits: toolInfo.edits };
      } else if (event === "pre_run_command") {
        toolName = "exec";
        toolInput = { command: toolInfo.command_line, cwd: toolInfo.cwd };
      } else {
        toolName = `mcp__${toolInfo.mcp_server_name}__${toolInfo.mcp_tool_name}`;
        toolInput = {
          server: toolInfo.mcp_server_name,
          tool: toolInfo.mcp_tool_name,
          args: toolInfo.mcp_tool_arguments,
        };
      }
      tasks.push(observe(sessionId, project, cwd, "pre_tool_use", {
        tool_name: toolName,
        tool_input: toolInput,
      }));
      break;
    }

    case "post_read_code":
    case "post_write_code":
    case "post_run_command":
    case "post_mcp_tool_use": {
      // Record tool result as post-tool observation
      let toolName, toolInput, toolOutput;
      if (event === "post_read_code") {
        toolName = "read";
        toolInput = { file_path: toolInfo.file_path };
        toolOutput = toolInfo.file_path ? `[read ${toolInfo.file_path}]` : "";
      } else if (event === "post_write_code") {
        toolName = "edit";
        toolInput = { file_path: toolInfo.file_path, edits: toolInfo.edits };
        toolOutput = `[edited ${toolInfo.file_path}]`;
      } else if (event === "post_run_command") {
        toolName = "exec";
        toolInput = { command: toolInfo.command_line, cwd: toolInfo.cwd };
        toolOutput = toolInfo.command_output || toolInfo.output || `[ran ${toolInfo.command_line}]`;
      } else {
        toolName = `mcp__${toolInfo.mcp_server_name}__${toolInfo.mcp_tool_name}`;
        toolInput = {
          server: toolInfo.mcp_server_name,
          tool: toolInfo.mcp_tool_name,
          args: toolInfo.mcp_tool_arguments,
        };
        toolOutput = toolInfo.mcp_result || "";
      }
      tasks.push(observe(sessionId, project, cwd, "post_tool_use", {
        tool_name: toolName,
        tool_input: toolInput,
        tool_output: truncate(toolOutput),
      }));
      break;
    }

    case "post_cascade_response": {
      // Record the agent response
      const response = toolInfo.response || "";
      if (response) {
        tasks.push(observe(sessionId, project, cwd, "agent_response", {
          response: truncate(response, 8000),
        }));
      }
      // End the session turn
      tasks.push(post("/agentmemory/session/end", { sessionId }));
      break;
    }

    case "post_cascade_response_with_transcript": {
      // Record transcript path
      const transcriptPath = toolInfo.transcript_path || "";
      if (transcriptPath) {
        tasks.push(observe(sessionId, project, cwd, "transcript", {
          transcript_path: transcriptPath,
        }));
      }
      break;
    }

    case "post_setup_worktree": {
      tasks.push(observe(sessionId, project, cwd, "worktree_setup", {
        worktree_path: toolInfo.worktree_path,
        root_workspace_path: toolInfo.root_workspace_path,
      }));
      break;
    }

    default:
      break;
  }

  await Promise.all(tasks);
}

main().catch(() => process.exit(0));
