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

@C:\Users\anand\.agentmemory\rules\shared-memory.md
