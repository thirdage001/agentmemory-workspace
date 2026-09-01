# agentmemory Setup Reproduktionsskript (Windows / PowerShell)
#
# Kopiert alle Custom-Dateien an ihre festen Agent-Pfade.
# Vor dem Ausführen:
#   1. Secrets in mcp-configs/*.json eintragen (alle <...> Platzhalter)
#   2. Skript aus dem custom/ Ordner heraus ausführen:  ./install.ps1
#
# Das Skript ist idempotent — kann mehrfach ausgeführt werden.
# Vorhandene Dateien werden überschrieben. Backup der alten Versionen
# liegt in der Verantwortung des Nutzers.

param(
    [string]$Home = $env:USERPROFILE,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$Custom = $PSScriptRoot

function Copy-File {
    param([string]$Src, [string]$Dst, [string]$Label)
    if ($DryRun) {
        Write-Output "[DRY] $Label : $Src -> $Dst"
        return
    }
    $dir = Split-Path $Dst -Parent
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    Copy-Item $Src $Dst -Force
    Write-Output "[OK]  $Label : $Dst"
}

Write-Output "=== agentmemory Custom Setup ==="
Write-Output "Home: $Home"
Write-Output "Custom source: $Custom"
if ($DryRun) { Write-Output "*** DRY RUN — keine Dateien werden geschrieben ***" }
Write-Output ""

# --- 1. Hook-Skripte (~/.agentmemory/scripts/) ---
Write-Output "--- Hook-Skripte ---"
$scripts = @(
    "cascade-bridge.mjs",
    "session-start.mjs",
    "session-end.mjs",
    "prompt-submit.mjs",
    "pre-tool-use.mjs",
    "post-tool-use.mjs",
    "stop.mjs"
)
foreach ($s in $scripts) {
    Copy-File "$Custom\hooks\scripts\$s" "$Home\.agentmemory\scripts\$s" "script"
}

# --- 2. Kanonische Shared-Memory-Policy (~/.agentmemory/rules/) ---
Write-Output ""
Write-Output "--- Shared-Memory-Policy ---"
Copy-File "$Custom\rules\shared-memory.md" "$Home\.agentmemory\rules\shared-memory.md" "policy"

# --- 3. Agent-Rules ---
Write-Output ""
Write-Output "--- Agent-Rules ---"
Copy-File "$Custom\agent-rules\CLAUDE.md" "$Home\.claude\CLAUDE.md" "claude-rule"
Copy-File "$Custom\agent-rules\global_rules.md" "$Home\.codeium\windsurf\memories\global_rules.md" "windsurf-rule"

# --- 4. Hook-Configs ---
Write-Output ""
Write-Output "--- Hook-Configs ---"
Copy-File "$Custom\hooks\devin-hooks.v1.json" "$Home\.devin\hooks.v1.json" "devin-hooks"
Copy-File "$Custom\hooks\claude-settings.json" "$Home\.claude\settings.json" "claude-hooks"
Copy-File "$Custom\hooks\windsurf-hooks.json" "$Home\.codeium\windsurf\hooks.json" "windsurf-hooks"

# --- 5. MCP-Configs (Achtung: Merge nötig bei Claude und Windsurf) ---
Write-Output ""
Write-Output "--- MCP-Configs ---"
Write-Output ""
Write-Output "ACHTUNG: MCP-Configs muessen manuell gemerged werden:"
Write-Output ""
Write-Output "  Claude Code:"
Write-Output "    Merge den agentmemory-Block aus mcp-configs/claude-mcp-block.json"
Write-Output "    in die top-level 'mcpServers' in $Home\.claude.json"
Write-Output ""
Write-Output "  Windsurf:"
Write-Output "    Merge den agentmemory-Block aus mcp-configs/windsurf-mcp-config.json"
Write-Output "    in $Home\.codeium\windsurf\mcp_config.json"
Write-Output ""
Write-Output "  Devin:"
Write-Output "    Merge den agentmemory-Block aus mcp-configs/devin-mcp-config.json"
Write-Output "    in $env:APPDATA\devin\mcp_config.json"
Write-Output ""
Write-Output "  Vor dem Merge: Secrets in den JSON-Dateien eintragen (<...> Platzhalter)!"

# --- 6. Setup-Guide ---
Write-Output ""
Write-Output "--- Doku ---"
Write-Output "Setup-Guide: $Custom\docs\setup-guide.md"
Write-Output "Diese Datei dokumentiert alle Schritte inkl. Coolify-Deploy."

Write-Output ""
Write-Output "=== Fertig ==="
Write-Output "Alle Agents neu starten, damit Hooks/MCP/Rules geladen werden."
