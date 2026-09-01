# Building Memory for an Existing Project

How to populate agentmemory with knowledge about an existing codebase so the agent has useful context in future sessions.

---

## The problem

agentmemory records **agent sessions** - prompts, tool calls, file reads, edits, commands. It is not a codebase indexer. A fresh project has zero memory. This guide shows how to build up memory efficiently.

---

## Two approaches (combine both)

### Approach 1: Organic - let the agent explore

Open the project in Windsurf and have the agent explore the codebase. The Cascade hooks automatically record every file read, command, and response as observations.

**Example prompts to seed memory:**

```
1. "Analysiere die Architektur dieses Projekts und erklär mir die Hauptkomponenten"
2. "Zeig mir die wichtigsten Dateien und ihre Zwecke"
3. "Welche Frameworks und Bibliotheken werden verwendet?"
4. "Erklär mir den Datenfluss von Eingabe bis Ausgabe"
5. "Gibt es wiederkehrende Patterns in der Codebase?"
```

Each of these prompts triggers multiple file reads and tool calls, all recorded by the hooks. After a few sessions, you have a solid observation base.

**Pros:** Fully automatic, captures real agent interactions
**Cons:** Takes multiple sessions, memory is scattered across observations

---

### Approach 2: Explicit - save structured memories

After the agent has explored the codebase, instruct it to save the key findings as explicit long-term memories and slots.

---

## Step-by-step: Explicit memory building

### Step 1: Architecture overview

Have the agent analyze the project, then save an architecture memory:

```
Prompt: "Analysiere die Architektur dieses Projekts und speichere sie mit memory_save ab:
- type: architecture
- content: <detaillierte Architektur-Beschreibung>
- concepts: <komma-getrennte Schlüsselkonzepte>
- files: <komma-getrennte Hauptdateien>
- project: <projekt-name>"
```

### Step 2: Key patterns

```
Prompt: "Identifiziere die wichtigsten Code-Patterns in diesem Projekt und speichere jede als memory_save mit type=pattern"
```

### Step 3: Create a project slot

Slots are persistent, size-limited memory units loaded at every session start. Create one for the project overview:

```
Prompt: "Erstelle einen project-level Slot 'architecture' mit memory_slot_create:
- label: architecture
- scope: project
- sizeLimit: 5000
- content: <kompakte Architektur-Übersicht, max 5000 Zeichen>"
```

Additional useful slots:

| Slot label | Content | Size limit |
|---|---|---|
| `architecture` | High-level architecture overview | 5000 |
| `conventions` | Coding conventions, style rules | 3000 |
| `dependencies` | Key dependencies and their roles | 2000 |
| `gotchas` | Known pitfalls, tricky areas | 2000 |
| `pending_items` | Open work items, TODOs | 2000 |

### Step 4: Save lessons learned

If you or the agent discover important insights during exploration:

```
Prompt: "Speichere diese Erkenntnis als memory_lesson_save:
- content: <what was learned>
- context: <when/where it applies>
- project: <projekt-name>
- tags: <comma-separated tags>"
```

### Step 5: Consolidate

After building up observations and memories, run consolidation to move working memory into long-term tiers:

```
Prompt: "Führe memory_consolidate aus, um den Memory-Bestand zu konsolidieren"
```

This runs the 4-tier pipeline: working → episodic → semantic → procedural.

### Step 6: Verify

Check what's been stored:

```
Prompt: "Zeig mir memory_sessions für dieses Projekt"
Prompt: "Suche mit memory_smart_search nach 'architecture'"
Prompt: "Zeig mir memory_profile für dieses Projekt"
```

---

## Quick-start prompt template

Paste this into a new session in your project to build memory in one go:

```
Du bist in einem neuen Projekt. Bitte führe folgende Schritte aus:

1. Erkunde die Codebase: Lies die wichtigsten Dateien (README, package.json/pyproject.toml/Cargo.toml, Haupt-Einstiegspunkte, Konfiguration).
2. Verstehe die Architektur und Hauptkomponenten.
3. Speichere die Architektur mit memory_save (type=architecture, project=<projekt-name>).
4. Identifiziere 3-5 wichtige Patterns und speichere jede mit memory_save (type=pattern).
5. Erstelle einen Slot 'architecture' mit memory_slot_create (scope=project, sizeLimit=5000) mit einer kompakten Übersicht.
6. Erstelle einen Slot 'conventions' mit memory_slot_create (scope=project, sizeLimit=3000) mit den Coding-Konventionen.
7. Führe memory_consolidate aus.

Projekt-Name: <projekt-name>
```

---

## What gets stored where

| Storage | What | How long | Auto-loaded? |
|---|---|---|---|
| **Observations** | Every file read, command, prompt, response | Session-scoped | Via `memory_smart_search` |
| **Memories** (`memory_save`) | Architecture, patterns, decisions, facts | Permanent | Via `memory_recall` / `memory_smart_search` |
| **Slots** (`memory_slot_create`) | Project overview, conventions, gotchas | Permanent | Yes, at session start (if pinned) |
| **Lessons** (`memory_lesson_save`) | "What worked, what to avoid" | Permanent (with confidence decay) | Via `memory_lesson_recall` |
| **Insights** (`memory_reflect`) | Synthesized higher-order insights | Permanent | Via `memory_insight_list` |
| **Crystals** (`memory_crystallize`) | Compressed action chain digests | Permanent | Via search |

---

## Maintenance

### Periodic consolidation

After several sessions of working on a project, run:

```
memory_consolidate
```

This moves working memory into long-term tiers and extracts patterns.

### Reflection

To synthesize higher-order insights from accumulated memories:

```
memory_reflect
```

This traverses the knowledge graph, groups related memories by concept clusters, and generates new insights via LLM.

### Profile refresh

To rebuild the project profile (top concepts, file patterns):

```
memory_profile with project=<projekt-name> and refresh=true
```

### Health check

```
memory_diagnose
memory_heal
```

---

## Important notes

- **Project name consistency:** The project name is derived from the git repo folder name. Always `git init` your projects so the name is stable. You can override with the `AGENTMEMORY_PROJECT_NAME` environment variable.
- **Slots are size-limited:** Keep slot content compact. Use `memory_slot_replace` to update, not `memory_slot_append` (which can hit the size limit).
- **Memory is per-project:** Memories and slots are scoped to the project. Observations from different projects don't mix.
- **Consolidation is not automatic:** You need to trigger `memory_consolidate` periodically. The hooks only record observations; they don't consolidate.
