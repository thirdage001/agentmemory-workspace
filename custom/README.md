# agentmemory-workspace — Custom Files

Selbst angelegte und modifizierte Dateien, die **nicht** zum upstream Git-Repo
(`../repo/`) gehören. Dieser Ordner ermöglicht die Reproduktion des kompletten
Setups auf einem anderen Computer.

## Struktur

```
agentmemory-workspace/
├── repo/          ← Git-Repo (github.com/thirdage001/agentmemory), upstream: rohitg00/agentmemory
│   └── docs/      ← nur Upstream-Dateien (benchmarks/, recipes/)
└── custom/        ← Selbst angelegte Dateien (dieser Ordner)
    ├── README.md                          — diese Datei
    ├── install.ps1                        — Reproduktionsskript (PowerShell)
    │
    ├── docs/                              ← selbst angelegte Doku
    │   ├── setup-guide.md                 — vollständiger Setup-Guide (Coolify, Hooks, MCP, Rules, Shared-Memory)
    │   └── create-memory.md               — Memory-Erstellungs-Doku
    │
    ├── rules/
    │   └── shared-memory.md               — kanonische Shared-Memory-Policy (Scope-Hierarchie via Facets)
    │
    ├── agent-rules/
    │   ├── CLAUDE.md                      — Claude Code Global Rule (@import der Policy)
    │   └── global_rules.md                — Windsurf+Devin Global Rule (mit Shared-Memory-Section)
    │
    ├── mcp-configs/                       ← MCP-Server-Konfigurationen (Secrets als <...> Platzhalter)
    │   ├── agentmemory-block.json         — agentmemory-MCP-Block (Merge-Snippet für beliebigen Agent)
    │   ├── claude-mcp-block.json          — Claude Code: mcpServers-Block für ~/.claude.json
    │   ├── windsurf-mcp-config.json       — Windsurf: vollständige mcp_config.json
    │   └── devin-mcp-config.json          — Devin: vollständige mcp_config.json (alle Server)
    │
    └── hooks/                             ← Lifecycle-Hook-Konfigurationen + Skripte
        ├── devin-hooks.v1.json            — Devin: hooks.v1.json (~/.devin/)
        ├── claude-settings.json           — Claude Code: settings.json (~/.claude/)
        ├── windsurf-hooks.json            — Windsurf: hooks.json (~/.codeium/windsurf/)
        └── scripts/                       — Hook-Bridge-Skripte (~/.agentmemory/scripts/)
            ├── cascade-bridge.mjs         — Cascade (Windsurf) → agentmemory REST
            ├── session-start.mjs          — SessionStart (Claude/Devin)
            ├── session-end.mjs            — SessionEnd
            ├── prompt-submit.mjs          — UserPromptSubmit
            ├── pre-tool-use.mjs           — PreToolUse
            ├── post-tool-use.mjs          — PostToolUse
            └── stop.mjs                   — Stop
```

## Setup auf einem neuen Computer reproduzieren

### Schnellstart

```powershell
# 1. Diesen Workspace-Ordner auf den neuen Computer kopieren
# 2. Secrets in custom/mcp-configs/*.json eintragen (alle <...> Platzhalter)
# 3. Install-Skript ausführen (Dry Run zuerst, dann echt):
cd custom
./install.ps1 -DryRun    # zeigt was kopiert wird
./install.ps1            # kopiert alle Dateien an ihre festen Pfade
# 4. MCP-Configs manuell mergen (siehe Skript-Ausgabe)
# 5. Alle Agents neu starten
```

### Ziel-Pfade der Dateien

| custom/ Quelle | Ziel auf dem System | Zweck |
|---|---|---|
| `hooks/scripts/*.mjs` | `~/.agentmemory/scripts/` | Hook-Bridge-Skripte |
| `rules/shared-memory.md` | `~/.agentmemory/rules/shared-memory.md` | Kanonische Shared-Memory-Policy |
| `agent-rules/CLAUDE.md` | `~/.claude/CLAUDE.md` | Claude Code Global Rule |
| `agent-rules/global_rules.md` | `~/.codeium/windsurf/memories/global_rules.md` | Windsurf+Devin Global Rule |
| `hooks/devin-hooks.v1.json` | `~/.devin/hooks.v1.json` | Devin Hook-Config |
| `hooks/claude-settings.json` | `~/.claude/settings.json` | Claude Code Hook-Config |
| `hooks/windsurf-hooks.json` | `~/.codeium/windsurf/hooks.json` | Windsurf Hook-Config |
| `mcp-configs/claude-mcp-block.json` | merge in `~/.claude.json` (top-level `mcpServers`) | Claude Code MCP-Server |
| `mcp-configs/windsurf-mcp-config.json` | `~/.codeium/windsurf/mcp_config.json` | Windsurf MCP-Server |
| `mcp-configs/devin-mcp-config.json` | `%APPDATA%/devin/mcp_config.json` | Devin MCP-Server |

### Was manuell nötig ist

1. **Secrets eintragen**: In `mcp-configs/*.json` alle `<...>` Platzhalter durch echte Werte ersetzen (AGENTMEMORY_SECRET, Celigo/NetSuite/Coolify/Supabase Tokens).
2. **MCP-Configs mergen**: Claude Code und Windsurf haben oft schon andere MCP-Server — der agentmemory-Block muss in die bestehende `mcpServers`-Sektion eingefügt werden, nicht ersetzt.
3. **AgentMemory-Server**: Der Remote-Daemon unter `https://agentmemory.kopps.net` muss laufen (siehe `docs/setup-guide.md` Step 1 für Coolify-Deploy).
4. **Node.js 18+**: Muss auf PATH sein (`npx` wird für den MCP-Client und die Hook-Skripte gebraucht).

## Ursprung der selbst angelegten Dateien

| Datei | Ursprung |
|---|---|
| `docs/setup-guide.md`, `docs/create-memory.md` | Selbst auf Fork (thirdage001/agentmemory) erstellt, aus repo/docs/ ausgelagert |
| `rules/shared-memory.md` | Neu erstellt in dieser Session (Phase 1 Shared-Memory-Policy) |
| `agent-rules/CLAUDE.md` | Neu erstellt (Claude Code Rule mit @import) |
| `agent-rules/global_rules.md` | Bestehend, um Shared-Memory-Section erweitert |
| `mcp-configs/*.json` | Neu erstellt als redigierte Vorlagen (Secrets entfernt) |
| `hooks/*.json` | Bestehende Hook-Configs, kopiert als Referenz |
| `hooks/scripts/*.mjs` | Kompilierte Hook-Skripte aus dem agentmemory-Build, kopiert für Offline-Reproduktion |
| `install.ps1` | Neu erstellt |

## Runtime-Ordner (nicht Teil des Workspaces)

`~/.agentmemory/` (mit Punkt) ist der Runtime-Ordner — wird vom Install-Skript befüllt:
- `scripts/` — Hook-Skripte (von custom/hooks/scripts/ kopiert)
- `rules/shared-memory.md` — Policy (von custom/rules/ kopiert)
- `bin/` — iii-engine Binary (wird von `npx @agentmemory/agentmemory` verwaltet)
- `data/` — SQLite State Store (wird zur Laufzeit erstellt)
