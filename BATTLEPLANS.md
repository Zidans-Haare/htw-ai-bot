# Schlachtpläne: HTW AI Bot Verbesserungen

> 5 priorisierte Maßnahmen, die auf der bestehenden Architektur aufbauen.
> Status: **Zur Freigabe** — nach Review beginnen wir mit der Umsetzung.

---

## Plan 1: Hybrides Retrieval (BM25 + Vektor)

### Problem
Die aktuelle `similaritySearch()` in `server/lib/vectorStore.js:475` nutzt ausschließlich Vektor-Ähnlichkeit (Cosine Similarity ≥ 0.7). Das versagt bei:
- **Eigennamen**: "Prof. Müller", "Dekanat FB Informatik"
- **Kursnummern/Abkürzungen**: "BWL", "FB4", "INF-B-320"
- **Exakte Begriffe**: "Prüfungsamt", "BAföG-Antrag"

BM25 (lexikalische Suche) fängt genau diese Fälle ab, weil es auf Token-Übereinstimmung basiert.

### Ansatz
Einen `HybridSearchManager` bauen, der **beide** Suchergebnisse fusioniert mittels **Reciprocal Rank Fusion (RRF)**.

### Betroffene Dateien
| Datei | Änderung |
|-------|----------|
| `server/lib/vectorStore.js` | Neues BM25-Index + `hybridSearch()` Methode |
| `server/controllers/aiController.cjs:312` | `similaritySearch` → `hybridSearch` aufrufen |
| `.env.example` | Neue Env-Vars dokumentieren |
| `package.json` | Dependency `wink-bm25-text-search` hinzufügen |

### Implementierung

#### Schritt 1: BM25-Index aufbauen
```
Neue Klasse BM25Index in vectorStore.js:
- In-Memory BM25-Index (wink-bm25-text-search oder eigene Implementierung)
- Wird beim syncFromDB() parallel zum Vektor-Store befüllt
- Speichert: { docId, pageContent, metadata } pro Chunk
- Tokenizer: Whitespace + Lowercase + deutsche Stoppwörter entfernen
```

#### Schritt 2: hybridSearch() Methode
```javascript
// Pseudocode für die neue Methode
async hybridSearch(query, k = 3, filter = undefined) {
  // 1. Vektor-Suche (bestehend)
  const vectorResults = await this.similaritySearch(query, k * 2, filter);

  // 2. BM25-Suche
  const bm25Results = this.bm25Index.search(query, k * 2);
  // Access-Level-Filter auf BM25-Ergebnisse anwenden
  const filteredBm25 = applyAccessFilter(bm25Results, filter);

  // 3. Reciprocal Rank Fusion
  //    Score = Σ 1/(rank_i + 60) für jede Ergebnisliste
  const fused = reciprocalRankFusion(vectorResults, filteredBm25, k);

  return fused;
}
```

#### Schritt 3: RRF-Algorithmus
```
Für jedes Dokument in beiden Listen:
  rrf_score = 0
  Wenn in Vektor-Ergebnissen auf Rang r_v: rrf_score += 1/(r_v + 60)
  Wenn in BM25-Ergebnissen auf Rang r_b:   rrf_score += 1/(r_b + 60)

Sortiere nach rrf_score absteigend, nimm Top-k
```

#### Schritt 4: Integration in aiController
```
aiController.cjs Zeile 312:
- Alt: vectorStore.similaritySearch(prompt, 3, accessFilter)
- Neu: vectorStore.hybridSearch(prompt, 3, accessFilter)
```

### Neue Env-Vars
```bash
# Hybrid Search
HYBRID_SEARCH_ENABLED=true          # true/false, Default: true wenn Vector DB aktiv
HYBRID_BM25_WEIGHT=0.4              # Gewichtung BM25 vs Vektor (0.0-1.0)
HYBRID_RRF_K=60                     # RRF Konstante (Standard: 60)
```

### Aufwand & Risiko
- **Aufwand**: ~2-3h Implementierung
- **Risiko**: Gering — BM25-Index ist In-Memory, kein externer Service nötig
- **Fallback**: Wenn BM25 deaktiviert, fällt es auf die bestehende Vektor-Suche zurück

---

## Plan 2: Semantisches Chunking

### Problem
Aktuell nutzt `vectorStore.js:148-155` den `RecursiveCharacterTextSplitter` mit fixen Werten:
- `chunkSize: 500` Tokens
- `chunkOverlap: 50` Tokens
- PDF-Splitter: `300` Tokens

Das zerschneidet Texte mitten in Sätzen/Absätzen und ignoriert die Dokumentstruktur. Ein Chunk kann den Anfang eines Absatzes über "Prüfungsanmeldung" und das Ende eines Absatzes über "Bibliotheksöffnungszeiten" enthalten.

### Ansatz
**Zweistufiges Chunking**: Erst nach strukturellen Grenzen (Überschriften, Absätze) splitten, dann nur bei Bedarf (Überlänge) den RecursiveCharacterTextSplitter als Fallback nutzen.

### Betroffene Dateien
| Datei | Änderung |
|-------|----------|
| `server/lib/vectorStore.js` | Neue `semanticSplit()` Methode, Anpassung `syncFromDB()` |
| `.env.example` | Neue Env-Var `CHUNKING_STRATEGY` |

### Implementierung

#### Schritt 1: SemanticSplitter-Klasse
```javascript
class SemanticSplitter {
  constructor(maxChunkSize = 500, overlap = 50) {
    this.maxChunkSize = maxChunkSize;
    this.overlap = overlap;
    // Fallback für Über-Chunks
    this.fallbackSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: maxChunkSize,
      chunkOverlap: overlap
    });
  }

  async splitText(text, metadata = {}) {
    // 1. HTML-Struktur nutzen (Hochschul-ABC hat HTML-Descriptions)
    //    Split an: <h1>-<h6>, <hr>, doppelte Newlines
    const sections = this.splitBySections(text);

    // 2. Jede Section prüfen: Passt sie in maxChunkSize?
    const chunks = [];
    for (const section of sections) {
      const tokenCount = estimateTokens(section.content);
      if (tokenCount <= this.maxChunkSize) {
        // Section passt → ein Chunk
        chunks.push({
          content: section.content,
          metadata: { ...metadata, sectionTitle: section.title }
        });
      } else {
        // Section zu groß → Fallback-Split
        const subChunks = await this.fallbackSplitter.splitText(section.content);
        subChunks.forEach((sc, i) => {
          chunks.push({
            content: sc,
            metadata: { ...metadata, sectionTitle: section.title, subChunk: i }
          });
        });
      }
    }
    return chunks;
  }

  splitBySections(text) {
    // Regex für typische Abschnittsgrenzen:
    // - Markdown-Überschriften (## ...)
    // - HTML-Überschriften (<h2>...</h2>)
    // - Doppelte Newlines als Absatzgrenze
    // - Horizontale Linien (<hr>, ---)
    const sectionRegex = /(?=<h[1-6][^>]*>)|(?=^#{1,6}\s)/gm;
    // ... Implementation
  }
}
```

#### Schritt 2: Kontext-angereicherte Chunks
Jeder Chunk bekommt den **Artikel-Titel als Prefix**, damit der Kontext nicht verloren geht:
```
Aktuell (vectorStore.js:322):
  pageContent = `${h.article}\n${h.description}`
  → Wird dann blind in 500-Token-Stücke geschnitten

Neu:
  Jeder Chunk bekommt: `[${h.article}] ${chunk.content}`
  → Der Artikel-Titel ist in jedem Chunk enthalten
```

#### Schritt 3: Anpassung syncFromDB()
```
In syncFromDB() (Zeile 304-473):
- Ersetze this.splitter.splitText(pageContent) durch this.semanticSplitter.splitText(pageContent, metadata)
- Ersetze this.pdfSplitter.splitText(pageContent) durch this.semanticSplitter.splitText(pageContent, metadata)
- PDF-Chunks: Seitennummer als Kontext-Prefix: "[Seite 3] ..."
```

### Neue Env-Vars
```bash
CHUNKING_STRATEGY=semantic   # "semantic" oder "fixed" (Fallback auf bisheriges Verhalten)
CHUNK_SIZE=500               # Max Chunk-Größe (bestehend, wird weiterverwendet)
```

### Aufwand & Risiko
- **Aufwand**: ~2-3h
- **Risiko**: Gering — `CHUNKING_STRATEGY=fixed` fällt auf aktuelles Verhalten zurück
- **Test**: Nach Implementierung VectorDB re-initialisieren (`--init-vectordb`) und Retrieval-Qualität vergleichen

---

## Plan 3: Reranker zwischen Retrieval und Prompt

### Problem
Die `similaritySearch()` gibt Ergebnisse sortiert nach Cosine Similarity zurück. Aber Bi-Encoder (Embedding-Modelle) sind schnell, jedoch weniger präzise als Cross-Encoder. Ein Reranker nimmt die Top-N Kandidaten und bewertet sie erneut mit einem genaueren Modell.

Aktueller Flow:
```
Query → Embedding → Top 3 aus VectorDB → direkt in Prompt
```

Neuer Flow:
```
Query → Embedding → Top 10 aus VectorDB → Reranker → Top 3 → in Prompt
```

### Ansatz
Drei Optionen, absteigend nach Qualität:
1. **LLM-basierter Reranker** (nutzt den bestehenden Backend-AI-Provider)
2. **Cross-Encoder** (lokales ML-Modell via Transformers)
3. **Externer Reranker-API** (Cohere, Jina)

**Empfehlung: Option 1** — Kein neues Modell nötig, nutzt den Backend-AI den ihr bereits konfiguriert habt.

### Betroffene Dateien
| Datei | Änderung |
|-------|----------|
| `server/lib/vectorStore.js` | Neue `rerankResults()` Methode |
| `server/utils/reranker.js` | **Neue Datei** — Reranker-Logik |
| `server/controllers/aiController.cjs` | Reranking in den Flow einbauen |
| `.env.example` | Neue Env-Vars |

### Implementierung

#### Schritt 1: reranker.js
```javascript
// server/utils/reranker.js
const { chatCompletion } = require('./aiProvider');

/**
 * LLM-basierter Reranker: Bewertet Relevanz jedes Chunks zur Query.
 * Nutzt den Backend-AI-Provider (günstigeres Modell).
 */
async function rerankDocuments(query, documents, topK = 3) {
  if (documents.length <= topK) return documents;

  // Prompt: Bewerte jedes Dokument 0-10 für Relevanz
  const docList = documents.map((doc, i) =>
    `[${i}] ${doc.pageContent.substring(0, 300)}`
  ).join('\n\n');

  const prompt = `Rate each document's relevance to the query on a scale of 0-10.
Query: "${query}"

Documents:
${docList}

Respond ONLY with a JSON array of scores, e.g. [8, 3, 9, ...]`;

  const result = await chatCompletion([
    { role: 'system', content: 'You are a relevance scoring system. Respond only with JSON.' },
    { role: 'user', content: prompt }
  ], { backend: true, temperature: 0, maxTokens: 200 });

  // Parse Scores und sortiere
  const scores = JSON.parse(result.content);
  const scored = documents.map((doc, i) => ({
    ...doc,
    rerankScore: scores[i] || 0
  }));

  return scored
    .sort((a, b) => b.rerankScore - a.rerankScore)
    .slice(0, topK);
}

module.exports = { rerankDocuments };
```

#### Schritt 2: Integration
```
In aiController.cjs nach Zeile 312-313:

// Bestehend:
const relevantDocs = await vectorStore.similaritySearch(prompt, 3, accessFilter);

// Neu:
const candidates = await vectorStore.similaritySearch(prompt, 10, accessFilter);  // Mehr Kandidaten
const relevantDocs = process.env.RERANKER_ENABLED === 'true'
  ? await rerankDocuments(prompt, candidates, 3)
  : candidates.slice(0, 3);
```

#### Schritt 3: hybridSearch + Reranker kombinieren
Wenn Plan 1 (Hybrid Search) auch umgesetzt wird:
```
Query → Hybrid Search (BM25 + Vektor) → Top 10 Kandidaten → Reranker → Top 3 → Prompt
```

### Neue Env-Vars
```bash
RERANKER_ENABLED=true           # true/false
RERANKER_CANDIDATES=10          # Wie viele Kandidaten dem Reranker übergeben werden
RERANKER_TOP_K=3                # Wie viele nach Reranking übrig bleiben
```

### Aufwand & Risiko
- **Aufwand**: ~1-2h
- **Risiko**: Mittel — Jede Chat-Anfrage braucht einen **zusätzlichen LLM-Call** (Backend-AI). Latenz steigt um ~200-500ms
- **Kosten**: Der Backend-AI-Call ist günstig (kurzer Prompt, ~200 Tokens). Bei Uni-ChatAI-API quasi kostenlos
- **Fallback**: `RERANKER_ENABLED=false` → kein Reranking

---

## Plan 4: Weitere MCP-Server (LSF, Bibliothek, Raumplan)

### Problem
Aktuell gibt es nur den OpenMensa MCP-Server (`server/mcp/openmensa-server.js`). Die Infrastruktur für weitere Server ist da (DB-Tabelle `mcp_servers`, Tool Discovery, Execution), wird aber nicht genutzt.

Studierende fragen häufig nach:
- **Stundenplan/LSF-Daten**: "Wann ist meine nächste Vorlesung?"
- **Bibliothek**: "Hat die Bib heute offen?" / "Kann ich das Buch X ausleihen?"
- **Raumbelegung**: "Ist Raum Z207 gerade frei?"

### Ansatz
Drei neue MCP-Server als stdio-basierte Node.js-Prozesse (gleiche Architektur wie `openmensa-server.js`).

### Betroffene Dateien
| Datei | Änderung |
|-------|----------|
| `server/mcp/htw-website-server.js` | **Neue Datei** — HTW-Website-Scraper |
| `server/mcp/slub-bib-server.js` | **Neue Datei** — SLUB/Bib-API |
| `server/mcp/raumbelegung-server.js` | **Neue Datei** — Raumbelegung |
| DB `mcp_servers` | Neue Einträge für die Server |

### Implementierung

#### Server A: HTW-Website-Server
```
Zweck: Aktuelle Infos von der HTW-Website scrapen
Tools:
  - get_htw_news: Aktuelle Nachrichten von htw-dresden.de
  - get_semester_dates: Semestertermine (Vorlesungsbeginn, Prüfungszeit, etc.)
  - get_contact_info: Kontaktdaten von Einrichtungen

Technik:
  - fetch + cheerio für HTML-Parsing
  - Caching: 1h für News, 24h für Semestertermine
  - Stdio JSON-RPC (identisch zu openmensa-server.js Pattern)
```

#### Server B: SLUB/Bibliothek-Server
```
Zweck: Bibliotheksinformationen
Tools:
  - get_library_hours: Öffnungszeiten der HTW-Bibliothek
  - search_catalog: Katalogsuche (falls API verfügbar)

Technik:
  - SLUB API oder HTW-Bib-Website scrapen
  - Caching: 24h für Öffnungszeiten
```

#### Server C: Raumbelegung-Server
```
Zweck: Freie Räume und Belegungspläne
Tools:
  - get_room_schedule: Belegungsplan für einen bestimmten Raum
  - find_free_rooms: Freie Räume zu einem Zeitpunkt

Technik:
  - Abhängig von verfügbarer API/Datenquelle der HTW
  - Falls keine API: HTW-Stundenplan-Export parsen
```

#### Server-Template (Basis für alle)
```javascript
// Jeder Server folgt diesem Pattern (aus openmensa-server.js):
const readline = require('readline');

const TOOLS = [
  {
    name: 'tool_name',
    description: 'Was der Tool macht',
    inputSchema: {
      type: 'object',
      properties: { /* ... */ },
      required: []
    }
  }
];

async function handleToolCall(name, args) {
  switch (name) {
    case 'tool_name': return await doSomething(args);
    default: throw new Error(`Unknown tool: ${name}`);
  }
}

// JSON-RPC über stdin/stdout
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', async (line) => {
  const request = JSON.parse(line);
  if (request.method === 'tools/list') {
    respond(request.id, { tools: TOOLS });
  } else if (request.method === 'tools/call') {
    const result = await handleToolCall(request.params.name, request.params.arguments);
    respond(request.id, result);
  }
});

function respond(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
}
```

#### DB-Einträge
```sql
-- Nach Implementierung über Admin-Panel oder direkt:
INSERT INTO mcp_servers (name, type, command, enabled) VALUES
  ('htw-website', 'local', '["node", "server/mcp/htw-website-server.js"]', true),
  ('slub-bib', 'local', '["node", "server/mcp/slub-bib-server.js"]', true),
  ('raumbelegung', 'local', '["node", "server/mcp/raumbelegung-server.js"]', true);
```

### Aufwand & Risiko
- **Aufwand**: ~2-4h pro Server (abhängig von Datenquellen-Verfügbarkeit)
- **Risiko**: Mittel — Abhängig davon, ob HTW öffentliche APIs/Datenquellen hat
- **Empfehlung**: Mit HTW-Website-Server starten (am einfachsten, höchster Nutzen), dann die anderen

### Voraussetzung
Vor der Implementierung klären:
- [ ] Gibt es eine HTW-API für Raumbelegung/Stundenplan?
- [ ] SLUB-Bibliotheks-API Zugang?
- [ ] Welche HTW-Website-Seiten sind für Studierende am relevantesten?

---

## Plan 5: User Memory in user_profiles

### Problem
Aktuell "vergisst" der Bot alles zwischen Konversationen. Ein Student, der sagt "Ich studiere Informatik im 3. Semester", muss das in jeder neuen Konversation wiederholen.

Das `user_profiles` Model existiert bereits (`prisma/schema.prisma:237-249`) mit:
- `mensa_preferences` (JSON)
- `favorite_prompts` (JSON)
- `ui_settings` (JSON)

Aber es gibt kein **allgemeines Memory** für Konversations-Kontext.

### Ansatz
Ein **Memory-Extraktor** analysiert jede Konversation und speichert relevante Fakten über den Nutzer persistent. Diese werden bei der nächsten Konversation automatisch in den System-Prompt injiziert.

### Betroffene Dateien
| Datei | Änderung |
|-------|----------|
| `prisma/schema.prisma` | Neues Feld `memory` in `user_profiles` |
| `server/utils/memoryExtractor.js` | **Neue Datei** — Extraktor-Logik |
| `server/controllers/aiController.cjs` | Memory laden + in Prompt einbauen |
| `.env.example` | Neue Env-Vars |

### Implementierung

#### Schritt 1: Schema erweitern
```prisma
model user_profiles {
  // ... bestehende Felder
  memory    Json     @default("[]")  // Array von Memory-Einträgen
}
```

Ein Memory-Eintrag:
```json
{
  "fact": "Studiert Informatik im 3. Semester",
  "category": "studium",
  "confidence": 0.9,
  "source_conversation": "conv_abc123",
  "created_at": "2026-02-13T10:00:00Z",
  "last_confirmed": "2026-02-13T10:00:00Z"
}
```

#### Schritt 2: memoryExtractor.js
```javascript
// server/utils/memoryExtractor.js
const { chatCompletion } = require('./aiProvider');

/**
 * Analysiert eine abgeschlossene Konversation und extrahiert
 * persistente Fakten über den Nutzer.
 */
async function extractMemories(conversationMessages, existingMemories = []) {
  const conversation = conversationMessages
    .map(m => `${m.isUser ? 'User' : 'Assistant'}: ${m.text}`)
    .join('\n');

  const existingFacts = existingMemories.map(m => m.fact).join('\n- ');

  const prompt = `Analyze this conversation and extract NEW personal facts about the user.
Only extract facts that are:
- Explicitly stated by the user (not assumed)
- Stable/persistent (study program, preferences, not temporary states)
- Useful for future conversations

Already known facts (do NOT repeat):
- ${existingFacts || 'None'}

Conversation:
${conversation}

Respond with a JSON array of new facts, or [] if none found:
[{"fact": "...", "category": "studium|preferences|personal|campus"}]`;

  const result = await chatCompletion([
    { role: 'system', content: 'You extract user facts from conversations. Respond only with JSON.' },
    { role: 'user', content: prompt }
  ], { backend: true, temperature: 0, maxTokens: 500 });

  return JSON.parse(result.content);
}

module.exports = { extractMemories };
```

#### Schritt 3: Memory in aiController einbauen

**Laden** (vor Prompt-Assembly, ca. Zeile 296):
```javascript
// Load user memory if available
let userMemory = [];
if (userId) {
  const profile = await prisma.user_profiles.findUnique({
    where: { user_id: userId }
  });
  if (profile?.memory) {
    userMemory = typeof profile.memory === 'string'
      ? JSON.parse(profile.memory)
      : profile.memory;
  }
}
```

**In System-Prompt injizieren** (ca. Zeile 416):
```
// Im systemPrompt String, nach den bestehenden Instruktionen:
${userMemory.length > 0 ? `
**Known facts about this user** (from previous conversations):
${userMemory.map(m => `- ${m.fact}`).join('\n')}
Use these facts to personalize your responses without explicitly mentioning them unless relevant.
` : ''}
```

**Speichern** (nach Response, ca. Zeile 580):
```javascript
// Extract memories asynchronously (fire-and-forget)
if (userId && process.env.USER_MEMORY_ENABLED === 'true') {
  extractMemories(messages, userMemory)
    .then(async (newMemories) => {
      if (newMemories.length > 0) {
        const updated = [...userMemory, ...newMemories.map(m => ({
          ...m,
          source_conversation: convoId,
          created_at: new Date().toISOString(),
          last_confirmed: new Date().toISOString()
        }))];
        // Max 20 Memories pro User (älteste raus)
        const trimmed = updated.slice(-20);
        await prisma.user_profiles.update({
          where: { user_id: userId },
          data: { memory: trimmed }
        });
      }
    })
    .catch(err => console.error('Memory extraction failed:', err));
}
```

#### Schritt 4: Memory-Management im Admin/Profil
- User kann Memories im Profil einsehen und löschen
- Admin kann alle Memories einsehen (Datenschutz-Compliance)

### Neue Env-Vars
```bash
USER_MEMORY_ENABLED=true        # true/false
USER_MEMORY_MAX_ENTRIES=20      # Max Fakten pro User
```

### Prisma Migration
```bash
npx prisma migrate dev --name add_user_memory
```

### Aufwand & Risiko
- **Aufwand**: ~3-4h (inkl. Migration + Frontend-Anzeige)
- **Risiko**: Mittel
  - **Datenschutz**: User müssen wissen, dass Fakten gespeichert werden → Opt-in oder transparente Anzeige
  - **Kosten**: Ein zusätzlicher Backend-AI-Call pro Konversation (fire-and-forget, nicht latenz-kritisch)
  - **Falsche Extraktion**: Confidence-Filter + User kann Memories löschen
- **Voraussetzung**: Nur für eingeloggte User (anonyme User haben kein Profil)

---

## Umsetzungsreihenfolge

```
Phase 1 (Retrieval-Qualität):
  ├── Plan 2: Semantisches Chunking     ← Zuerst, da VectorDB re-init nötig
  ├── Plan 1: Hybrides Retrieval        ← Direkt danach, baut auf neuem Index auf
  └── Plan 3: Reranker                  ← Letzter Schritt der Retrieval-Pipeline

Phase 2 (Funktionalität):
  ├── Plan 4: MCP-Server                ← Unabhängig von Phase 1
  └── Plan 5: User Memory               ← Unabhängig, braucht Migration
```

Phase 1 sollte als Einheit umgesetzt werden (die drei Pläne ergänzen sich). Phase 2 kann parallel oder danach kommen.

---

---

## Backlog: Weitere Ideen (ungeplant, zur späteren Evaluation)

### Tool Calling & Agents

#### Dynamische Tool-Definitionen aus DB-Schemata/APIs
- Tool-Definitionen automatisch aus Datenbankschemata oder OpenAPI-Specs generieren statt manuell in MCP-Servern definieren
- **Einschätzung**: Im aktuellen Umfang (wenige MCP-Server) überdimensioniert. Wird relevant, wenn >10 Tools verwaltet werden müssen
- **Voraussetzung**: Standardisierte API-Specs der HTW-Dienste

#### Parallel Tool Calls
- Aktuell werden Tool Calls in `aiController.cjs:505-563` sequentiell in einer Schleife verarbeitet
- Mehrere unabhängige Tool Calls (z.B. Mensa + Raumbelegung) könnten parallel ausgeführt werden
- **Einschätzung**: Mittlerer Aufwand, guter Performance-Gewinn bei Multi-Tool-Anfragen. Wird relevanter wenn mehr MCP-Server da sind (Plan 4)

#### Agentic Workflows
- Bot plant selbstständig mehrstufige Aktionen: "Welche Kurse kann ich noch belegen, die nicht mit meinem Stundenplan kollidieren?" → Agent ruft LSF ab, vergleicht Zeiten, filtert
- Über einfache Tool-Call-Loops hinaus: Planung, Ausführung, Fehlerbehandlung, Iteration
- **Einschätzung**: Größter Sprung in Nutzwert, aber auch größter Aufwand. Langfristiges Ziel. Braucht zuerst die Datenquellen aus Plan 4

### RAG & Retrieval

#### Multimodales RAG
- Bilder nicht nur als Text-Metadaten, sondern visuell verstehen (Vision-Modelle)
- Retrieval über Bild-Inhalte, nicht nur Dateinamen/Beschreibungen
- **Einschätzung**: Use-Case an einer Hochschule begrenzt (wenig bildbasierte Wissensinhalte). Cooles Feature, aber niedriger ROI

#### GraphRAG ausbauen
- Aktuelle Implementierung (`vectorStore.js:512-535`) ist experimentell: ein LLM-Call, flache Node/Edge-Struktur
- Ausbau: Automatischer Wissensgraph-Aufbau, Entity Resolution, Relation Typing
- Nützlich für Beziehungsfragen ("Wer ist zuständig für X in FB Y?")
- **Einschätzung**: Erst messen, ob Standard-RAG + Hybrid Search ausreicht. Dann entscheiden ob GraphRAG den Mehraufwand rechtfertigt

### Konversationsverwaltung

#### Proaktive Summarisierung
- Aktuell: Summarisierung erst bei 6000-Token-Limit (`summarizer.js:9`)
- Idee: Laufende Zusammenfassung nach jeder N-ten Nachricht, nicht erst bei Overflow
- Oder: "Wichtige Punkte" separat tracken (überschneidet sich mit Plan 5 User Memory)
- **Einschätzung**: Plan 5 (User Memory) deckt den wichtigsten Teil ab. Proaktive Summarisierung wäre ein Nice-to-have on top

#### Intelligentere Kontext-Filterung
- Über Access-Level hinaus: Relevanz-basiertes Filtern der Kontext-Informationen vor dem LLM-Call
- Weniger irrelevanten Kontext senden → weniger Tokens → günstiger + schneller
- **Einschätzung**: Plan 3 (Reranker) löst einen großen Teil davon. Weiteres Einsparpotenzial durch dynamische Prompt-Kompression (z.B. LLMLingua)

### Open Source & Local-First

#### Lokale Modelle / Efficient Fine-Tuning
- Provider-Architektur ist bereit (OpenAI-kompatible Base-URL → Ollama sofort nutzbar)
- Backend-AI (Summarisierung, Kategorisierung, Memory-Extraktion) auf lokales Modell umstellen
- Fine-Tuning auf HTW-spezifische Daten für bessere Antwortqualität
- **Einschätzung**: Für Backend-AI geringer Aufwand (Ollama + Base-URL ändern). Fine-Tuning ist ein eigenes Projekt

#### On-Device AI im Frontend
- Kleine Modelle im Browser für: Schnelle Vorschläge, Autovervollständigung, Sentiment-Analyse
- **Einschätzung**: Unpraktisch für eine Hochschul-Webapp. Modelle zu groß für den Browser, Nutzen rechtfertigt Komplexität nicht. Weglassen

### UI/UX & Personalisierung

#### Adaptives UI
- Spezielle Ansichten je nach erkannter Intention: Mensa-Karte, Stundenplan-Tabelle, Kontakt-Card
- **Einschätzung**: Besser als "Spezial-Views": Structured/Rich Responses vom Bot (JSON → Frontend rendert als Card/Tabelle). Mittlerer Aufwand, guter UX-Gewinn. Könnte als Plan 6 irgendwann kommen

#### Proaktive Unterstützung
- Bot erkennt, wann User Hilfe braucht, und greift proaktiv ein
- Push-Benachrichtigungen ("Die Mensa hat heute Schnitzel!")
- **Einschätzung**: Für einen Hochschul-Bot kein starker Use-Case. Studierende kommen mit konkreten Fragen. Eher nervig als hilfreich. Niedrigste Priorität

---

## Nicht-funktionale Anforderungen (für alle Pläne)

1. **Abwärtskompatibilität**: Jeder Plan hat einen Feature-Flag (`HYBRID_SEARCH_ENABLED`, `RERANKER_ENABLED`, etc.). Default ist das bestehende Verhalten.
2. **Logging**: Alle neuen Komponenten nutzen den bestehenden Winston-Logger.
3. **Metriken**: Neue Prometheus-Histogramme für Hybrid-Search-Dauer und Reranker-Dauer.
4. **Tests**: Jest-Tests für BM25-Index, SemanticSplitter und Reranker.
5. **Kein Breaking Change**: Bestehende Env-Konfigurationen funktionieren weiterhin ohne Anpassung.
