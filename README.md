# ASKI — KI-Assistent der HTW Dresden

Ein KI-gestützter Chat-Assistent für Studierende und Mitarbeitende der HTW Dresden. Beantwortet Fragen zu Studium, Prüfungen, Campus und mehr — mit Zugriff auf das Hochschul-ABC, aktuelle News, Mensa-Speisepläne und Semestertermine.

**Live:** [aski.htw-dresden.de](https://aski.htw-dresden.de)

## Features

- **Multi-Provider KI-Chat** — OpenAI-kompatible APIs, Google Gemini, Anthropic Claude, XAI; Streaming-Antworten; konfigurierbarer Backend-AI-Provider für interne Aufgaben
- **RAG-Pipeline** — Semantisches Chunking (Überschriften/Absätze), Hybrid-Suche (BM25 + Vektor mit Reciprocal Rank Fusion), LLM-Reranker; alles per Feature-Flag toggle-bar
- **MCP Tool Calling** — Externe Datenquellen über Model Context Protocol: HTW-News, Semestertermine, Kontakte, Mensa-Speisepläne (OpenMensa), Library-Docs (Context7)
- **User Memory** — Persistente Fakten pro User (Studiengang, Präferenzen) werden nach Gesprächen automatisch extrahiert und in Folgechats injiziert
- **Admin-Panel** — Hochschul-ABC-Einträge, Benutzer, Bilder, Dokumente, Feedback verwalten; Backup/Restore mit ZIP-Export
- **Dashboard** — Nutzungsstatistiken, Frage-Analyse, Token-Verbrauch, tägliche Trends
- **Bild-Upload** — Nutzer können Bilder im Chat hochladen (Gemini Vision)
- **Vektor-DB** — Optional ChromaDB oder Weaviate für semantische Suche in Dokumenten und Bildern
- **Sicherheit** — Helmet CSP, Rate Limiting, sitzungsbasierte Auth, Audit-Logging

## Tech Stack

| Schicht | Technologie |
|---------|------------|
| Backend | Node.js, Express 5, Prisma ORM |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS |
| Datenbank | PostgreSQL (oder SQLite/MySQL) |
| Vektor-DB | ChromaDB / Weaviate (optional) |
| Embeddings | Xenova Transformers / HuggingFace |
| KI-Provider | OpenAI, Google Gemini, Anthropic Claude, XAI |
| Tools | MCP (stdio JSON-RPC): HTW-Website, OpenMensa, Context7 |
| Deployment | PM2, Docker Compose, Nginx |

## Schnellstart

```bash
# 1. Abhängigkeiten
npm install

# 2. Konfiguration
cp .env.example .env
# → .env anpassen: AI_PROVIDER, AI_API_KEY, DATABASE_URL

# 3. Datenbank
npx prisma db push

# 4. Starten (Entwicklung)
npm run dev:watch

# 5. Starten (Produktion)
npm run build
pm2 start ecosystem.config.js
```

Die App läuft unter `http://localhost:3000`. Standard-Admin: `admin` / `admin`.

## Konfiguration

Alle Einstellungen über `.env` (siehe [.env.example](.env.example)). Wichtigste Variablen:

### KI & Retrieval

| Variable | Beschreibung | Default |
|----------|-------------|---------|
| `AI_PROVIDER` | `openai`, `google`, `claude`, `xai` | `openai` |
| `AI_API_KEY` | API-Key für den gewählten Provider | — |
| `AI_MODEL` | Modell-ID | Provider-Default |
| `AI_STREAMING` | Streaming-Antworten | `true` |
| `CHUNKING_STRATEGY` | `semantic` oder `fixed` | `semantic` |
| `HYBRID_SEARCH_ENABLED` | BM25 + Vektor kombinieren | `true` |
| `RERANKER_ENABLED` | LLM-Reranking der Suchergebnisse | `false` |
| `USER_MEMORY_ENABLED` | Persistente User-Fakten | `false` |

### Datenbank & Vektor-DB

| Variable | Beschreibung | Default |
|----------|-------------|---------|
| `DATABASE_URL` | Prisma Connection-String | SQLite |
| `VECTOR_DB_TYPE` | `none`, `chroma`, `weaviate` | `none` |
| `EMBEDDING_LIBRARY` | `xenova`, `huggingface`, `openai` | `none` |

Ein separater Backend-AI-Provider (für Reranker, Memory-Extraktion, Kategorisierung) kann über `BACKEND_AI_*` Variablen konfiguriert werden.

## Projektstruktur

```
├── server/
│   ├── server.cjs              # Express-Server, Routing, Middleware
│   ├── controllers/
│   │   ├── aiController.cjs    # Chat-Logik, RAG-Pipeline, Tool Calling
│   │   ├── adminController.cjs # Admin-Panel API
│   │   ├── dashboardController.cjs
│   │   └── ...
│   ├── lib/
│   │   └── vectorStore.js      # Vektor-DB, BM25-Index, Semantic Chunking
│   ├── mcp/                    # MCP Tool-Server (stdio)
│   │   ├── htw-website-server.js
│   │   └── openmensa-server.js
│   └── utils/
│       ├── reranker.js         # LLM-basiertes Reranking
│       ├── memoryExtractor.js  # User-Memory-Extraktion
│       ├── mcpTools.js         # MCP Client & Tool-Management
│       └── ...Provider.js      # AI-Provider-Adapter
├── src/
│   ├── new-ui/                 # React Chat-UI (Hauptinterface)
│   ├── admin/ & new-admin/     # Admin-Panel
│   ├── dash/                   # Dashboard
│   └── ...
├── prisma/
│   └── schema.prisma           # Datenbank-Schema
├── .env.example                # Alle Umgebungsvariablen dokumentiert
└── ecosystem.config.js         # PM2-Konfiguration
```

## API-Endpunkte

| Methode | Pfad | Beschreibung |
|---------|------|-------------|
| `POST` | `/api/chat` | Chat mit dem KI-Assistenten (Streaming) |
| `GET` | `/api/suggestions` | Vorgeschlagene Fragen |
| `GET` | `/api/history` | Chat-Verlauf |
| `GET` | `/api/system-status` | Live System-Status (Provider, DB, Features) |
| `POST` | `/api/login` | Authentifizierung |
| `*` | `/api/admin/*` | Admin-Panel API (auth required) |
| `*` | `/api/dashboard/*` | Dashboard API (auth required) |

## Docker

```bash
cp .env.example .env
# .env anpassen
docker compose up -d --build
```

Startet App (Port 3000) + PostgreSQL. Volumes für DB und Uploads sind persistent.

## Nginx (Produktion)

```nginx
server {
    listen 443 ssl http2;
    server_name aski.htw-dresden.de;

    ssl_certificate     /etc/nginx/ssl/origin.crt;
    ssl_certificate_key /etc/nginx/ssl/origin.key;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Backup & Datenbank-Wechsel

**Backup** über Admin-Panel (`/admin/backup`): Tabellen wählen → ZIP-Export → Import mit Modi `replace`, `append-override`, `append-keep`.

**DB wechseln** (SQLite ↔ PostgreSQL ↔ MySQL):
1. `prisma/schema.prisma` → `provider` ändern
2. `.env` → `DATABASE_URL` anpassen
3. `npx prisma db push && npx prisma generate`
4. `npm run build && pm2 restart ecosystem.config.js`

## Tests

```bash
npm test              # Interaktiv (.env oder .env.test wählen)
npm run test:direct   # Direkt mit .env
npm run test:coverage # Mit Coverage-Report
```

## Lizenz

ISC
