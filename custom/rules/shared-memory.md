# Shared Memory Policy (Scope-Hierarchie via Facets)

Diese Rule definiert die Memory-Policy fuer repository-uebergreifendes Shared-Memory.
Sie ist agent-unabhaengig und gilt fuer alle Coding-Agents, die den AgentMemory-MCP-Server
verfuegbar haben. AgentMemory selbst wird NICHT geforkt oder intern veraendert — die
Klassifizierung und Retrieval-Strategie liegt in dieser Rule-Schicht.

HOOKS = reliability / lifecycle (bleiben wie sie sind)
RULES = memory policy / classification / retrieval strategy (diese Datei)

---

## 1. Scope-Hierarchie und Facet-Vokabular

Vier Ebenen, absteigend in Spezifitaet:

| Scope      | Facets                                          | Wann verwenden                                                              |
|------------|-------------------------------------------------|-----------------------------------------------------------------------------|
| Global     | `scope:global`                                  | Allgemeine Arbeitsregeln/Lessons, unabhaengig von Repo/Client/Technologie   |
| Domain     | `scope:domain`, `domain:<domain>`               | Wissen innerhalb einer Technologie/Problemklasse (netsuite, shopify, ...)   |
| Client     | `scope:client`, `client:<client>`               | Wissen, das fuer mehrere Repos desselben Kunden relevant ist                |
| Repository | `scope:project`, `project:<project>`            | Nur fuer das aktuelle Repository relevant                                   |

Facet-Vokabular (dimension:value), das konsistent verwendet wird:
- `scope` ∈ {global, project, client, domain}
- `domain` ∈ {netsuite, shopify, warehouse-integration, typescript, supabase, ...}
- `client` ∈ {yepoda, yotrio, ...}
- `project` ∈ <aktueller Repo-Slug>

Prioritaet bei Konflikten: Repository > Client > Domain > Global.
Repo-spezifisches Wissen hat Vorrang vor allgemeinerem.

---

## 2. Kontext-Aufloesung (Session Start)

Bestimme STILL zu Beginn einer Session (oder sobald der Task klar ist):

1. **project**: aktueller Repo-Slug (git top-level basename, oder AGENTMEMORY_PROJECT_NAME).
2. **client**: Kunde, dem das Repo gehoert (aus Repo-Namen, Konvention, oder Memory). Falls unklar, nicht raten — leer lassen.
3. **domains**: relevante Technologien/Problemklassen fuer den aktuellen Task (z.B. netsuite, warehouse-integration, typescript). Nur die, die tatsaechlich zum Task passen.

Beispiel aufgeloester Kontext:
```
project:yepoda-warehouse-middleware
client:yepoda
domain:netsuite
domain:warehouse-integration
domain:typescript
```

---

## 3. Retrieval-Strategie (Shared Memories laden)

NEBEN der normalen Repo-spezifischen Suche (memory_smart_search/memory_recall mit
dem User-Prompt) fuehre eine zusaetzliche Shared-Memory-Abfrage durch, WENN der Task
plausibel einen Client- oder Domain-Bezug hat. Bei rein repo-lokalen Tasks entfaellt sie.

### 3.1 Semantische Suche (liefert Inhalt + IDs)
Rufe `memory_smart_search` mit dem Task/Prompt als Query, `limit` 10, OHNE `project`
(sodass scope-uebergreifend gesucht wird). Das liefert semantisch relevante Memories
mit Inhalt und `obsId`/Memory-ID.

### 3.2 Scope-Menge (liefert IDs der klassifizierten Shared Memories)
Rufe `memory_facet_query` mit:
- `matchAny` = `scope:global,scope:domain,scope:client,client:<client>,domain:<d1>,domain:<d2>`
  (alle aufgeloesten scope/client/domain Facets, kommagetrennt)
- `targetType` = `memory`

Das liefert die Menge der Memory-IDs, die als Shared Memory klassifiziert sind.

### 3.3 Schnittmenge + Gewichtung
- Shared Memories = smart_search-Ergebnisse, deren ID in der Scope-Menge (3.2) liegt.
- Bestimme fuer die Top-Kandidaten den genauen Scope via `memory_facet_get` (targetId).
- Gewichtung (Startwerte, spaeter anpassen):
  ```
  project = 1.00
  client  = 0.80
  domain  = 0.60
  global  = 0.40
  ```
  effektiver_score = semantische_relevanz × scope_gewicht.
- Injiziere nur die Top-Ergebnisse, die SEMANTISCH relevant sind. Global gespeicherte
  Memories duerfen NICHT allein wegen ihres globalen Scopes geladen werden.

### 3.4 Lessons
Rufe `memory_lesson_recall` mit dem Task-Query (ohne project-Filter). Lessons sind
NICHT facet-tag-bar (Facet-targetType unterstuetzt nur action|memory|observation).
Lessons tragen ihren Scope stattdessen im `tags`-Feld (z.B. `scope:domain,domain:shopify`).
Inspektiere die `tags` der zurueckgegebenen Lessons, um den Scope zu bestimmen und die
Gewichtung anzuwenden.

### 3.5 Anti-Pollution
Nicht jede Session braucht Shared Memories. Lade nur, was semantisch zum Task passt.
Repo-spezifisches Wissen hat Vorrang. Keine Bulk-Injektion globaler Memories.

---

## 4. Speichern: Scope-Klassifizierung

Wenn eine Information als langfristig relevant erkannt wird, klassifiziere ZUERST den Scope:

### 4.1 Nur aktuelles Repository relevant → Project Memory
- `memory_save` mit `project` = <aktueller Repo-Slug>
- danach `memory_facet_tag`: targetId=<Memory-ID aus save-Result>, targetType=`memory`,
  dimension=`scope` value=`project` UND dimension=`project` value=<Repo-Slug>

### 4.2 Fuer mehrere Repos desselben Clients relevant → Client Memory
- `memory_save` OHNE `project` (cross-projekt)
- `memory_facet_tag`: scope=`client`, client=<client>

### 4.3 Fuer dieselbe Technologie/Domain relevant → Domain Memory
- `memory_save` OHNE `project`
- `memory_facet_tag`: scope=`domain`, domain=<domain>

### 4.4 Allgemein wiederverwendbar → Global Memory
- `memory_save` OHNE `project`
- `memory_facet_tag`: scope=`global`

WICHTIG: `memory_save` gibt `{ success, memory }` zurueck. Verwende `memory.id` aus
dem Result als `targetId` fuer `memory_facet_tag`. Facet-Tagging ist der zweite Schritt
nach dem Save — ohne Facet ist eine Memory nicht als Shared Memory auffindbar.

### 4.5 Lessons
- `memory_lesson_save` mit `tags` = `<scope>:<wert>,<domain|client>:<wert>,...`
  (z.B. `scope:domain,domain:shopify`). Lessons werden NICHT facet-getaggt.
- Eine Lesson gehoert NICHT automatisch zum aktuellen Repo, wenn die Erkenntnis
  generalisierbar ist. Klassifiziere wie bei Memories (4.1–4.4).

---

## 5. Wann NICHT gespeichert wird (Anti-Pollution)

Speichere NICHT als langfristige Memory:
- temporaere Debug-Ausgaben, triviale Tool-Aufrufe, einmalige Zwischenschritte
- Informationen, die direkt aus dem Sourcecode offensichtlich hervorgehen
- Vermutungen mit geringer Confidence
- kurzlebige Task-Zustaende

Speichere NUR, wenn mindestens EINES zutrifft:
- wahrscheinlich in einer zukuenftigen Session wieder nuetzlich
- beschreibt eine stabile Entscheidung
- dokumentiert eine nicht offensichtliche technische Besonderheit
- verhindert wahrscheinlich einen wiederholten Fehler
- ist auf mehrere Aufgaben oder Projekte uebertragbar
- enthaelt eine belastbare Lesson aus tatsaechlicher Erfahrung

Die Hooks erfassen Routine-Beobachtungen automatisch — diese Rule steuert nur die
expliziten, langfristig wertvollen Speicherungen.

---

## 6. Verantwortlichkeiten

- **Hooks**: Lifecycle (SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, Stop,
  SessionEnd). Stellen sicher, dass AgentMemory angesprochen wird und Observations
  erfasst werden. Memory-Verarbeitung haengt NICHT vom LLM ab.
- **Rules (diese Datei)**: Memory-Policy. Entscheiden, welche Shared Memories geladen
  werden, welcher Scope fuer neue Memories geeignet ist, welche Facets gesetzt werden.

Langfristiges Ziel (nicht Teil von Phase 1): AgentMemory selbst erhaelt einen
Scope-aware Context Builder. Bis dahin uebernimmt diese Rule-Schicht die Funktion.
