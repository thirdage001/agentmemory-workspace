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

Vollstaendige kanonische Policy: `C:\Users\anand\.agentmemory\rules\shared-memory.md`.
Die folgenden Regeln sind die operative Kurzform und gelten zusaetzlich zur obigen
Agent-Memory-Integration.

### Scope-Hierarchie (Repository > Client > Domain > Global)
- **Repository** (`scope:project`, `project:<slug>`): nur fuer das aktuelle Repo relevant.
- **Client** (`scope:client`, `client:<client>`): fuer mehrere Repos desselben Kunden.
- **Domain** (`scope:domain`, `domain:<domain>`): wiederverwendbar innerhalb einer Technologie/Problemklasse.
- **Global** (`scope:global`): unabhaengig von Repo/Client/Technologie.

### Kontext-Aufloesung (Session Start)
Bestimme still den aktuellen Kontext: `project` (Repo-Slug), `client` (Kunde, falls klar — nicht raten), `domains` (relevante Technologien zum Task).

### Shared-Memory-Retrieval (zusaetzlich zur normalen Suche, nur bei Client-/Domain-Bezug)
1. `memory_smart_search` mit dem Task-Query, `limit` 10, OHNE `project` (scope-uebergreifend) → semantisch relevante Memories mit Inhalt + ID.
2. `memory_facet_query` mit `matchAny` = `scope:global,scope:domain,scope:client,client:<client>,domain:<d1>,domain:<d2>`, `targetType`=`memory` → Menge der Shared-Memory-IDs.
3. Schnittmenge aus 1+2 = relevante Shared Memories. Scope via `memory_facet_get` bestimmen. Gewichtung: project=1.0, client=0.8, domain=0.6, global=0.4 (effektiv = semantisch × scope). Nur semantisch Passende injizieren — globale Memories nie allein wegen ihres Scopes laden.
4. `memory_lesson_recall` (ohne project-Filter) → Lessons; Scope steht im `tags`-Feld (Lessons sind NICHT facet-tag-bar).

### Speichern mit Scope-Klassifizierung
Klassifiziere ZUERST den Scope, dann:
- `memory_save` (mit `project` fuer Repository; OHNE `project` fuer Client/Domain/Global).
- Danach `memory_facet_tag` mit `targetId` = `memory.id` aus dem Save-Result, `targetType`=`memory`, und den passenden Facets (`scope`, ggf. `client`/`domain`/`project`). Ohne Facet ist eine Memory nicht als Shared Memory auffindbar.
- Lessons: `memory_lesson_save` mit `tags` = `<scope>:<wert>,<domain|client>:<wert>` (kein Facet-Tagging bei Lessons).

### Anti-Pollution
Nicht speichern: temporaere Debug-Ausgaben, triviale Tool-Aufrufe, offensichtliche Sourcecode-Fakten, Vermutungen mit geringer Confidence, kurzlebige Task-Zustaende. Nur speichern, wenn es in einer zukuenftigen Session wieder nuetzlich ist, eine stabile Entscheidung dokumentiert, eine nicht offensichtliche Besonderheit festhaelt, einen wiederholten Fehler verhindert, oder uebertragbar ist.
