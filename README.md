# HTW ABC AI Bot

Dieses Projekt ist eine Node.js-Anwendung, die einen KI-gestützten Chat-Assistenten über eine API bereitstellt. Es umfasst ein umfassendes Admin-Panel zur Verwaltung von Inhalten, ein Dashboard zur Überwachung von Analysen und optionale Vektor-Datenbank-Unterstützung für erweiterte semantische Suche. Die Anwendung läuft live unter [aski.htw-dresden.de](https://aski.htw-dresden.de).

## ✨ Features

- **KI-Chat:** Eine öffentliche Schnittstelle (`/api/chat`), die Anfragen über verschiedene KI-Provider (OpenAI + kompatible APIs wie universitäre ChatAI, Google Gemini, Claude, XAI) beantwortet.
- **Admin-Panel:** Eine passwortgeschützte Weboberfläche zur Verwaltung von Hochschul-ABC-Einträgen, Benutzern, Bildern, Dokumenten und zur Überprüfung von Feedback.
- **Dashboard:** Ein separates, geschütztes Dashboard zur Anzeige von Nutzungsstatistiken und Anwendungsdaten.
- **Vektor-Datenbank:** Optionale Unterstützung für ChromaDB oder Weaviate zur semantischen Suche in Dokumenten und Bildern.
- **Embeddings:** Konfigurierbare Text-Einbettungen mit Xenova oder Hugging Face Modellen für erweiterte KI-Funktionen.
- **Sicherheit:** Die Anwendung verwendet `helmet` zur Absicherung von HTTP-Headern und `express-rate-limit` zum Schutz vor Brute-Force-Angriffen.
- **Authentifizierung:** Admin- und Dashboard-Bereiche sind durch eine sitzungsbasierte Authentifizierung geschützt.

## 💻 Technologie-Stack

- **Backend:** Node.js, Express.js
- **Datenbank:** SQLite (Standard) über Prisma ORM; optional PostgreSQL/MySQL via `DATABASE_URL`
- **Vektor-DB:** Optional ChromaDB oder Weaviate für semantische Suche
- **Embeddings:** Xenova Transformers oder Hugging Face für Text-Einbettungen
- **Frontend:** Statisches HTML, CSS und JavaScript (gebaut mit Vite)
- **KI:** Mehrere Provider (OpenAI + kompatible APIs wie universitäre ChatAI, Google Gemini, Anthropic Claude, XAI)

## 🚀 Setup & Konfiguration

### Voraussetzungen

- Node.js (Version 18 oder neuer)
- npm (wird mit Node.js installiert)

### Installation

1.  **Abhängigkeiten installieren:**

    Für grundlegende Funktionalität (ohne KI-Provider, Vektor-DBs usw.):
    ```bash
    npm install --production --no-optional
    ```

    Für vollständige Installation (mit allen optionalen Abhängigkeiten):
    ```bash
    npm install
    ```

    **Optionale Abhängigkeiten:** Die folgenden Pakete werden nur installiert, wenn die entsprechenden Features verwendet werden (z. B. über Umgebungsvariablen):
    - `@google/generative-ai`: Für Google Gemini (wenn `AI_PROVIDER=google`).
    - `@anthropic-ai/sdk`: Für Anthropic Claude (wenn `AI_PROVIDER=claude`).
    - `@huggingface/transformers`: Für Hugging Face Embeddings (wenn `EMBEDDING_LIBRARY=huggingface`).
    - `@langchain/community`: Für LangChain-Community-Integrationen.
    - `@langchain/core`: Kernbibliothek für LangChain.
    - `@langchain/openai`: LangChain-Integration für OpenAI.
    - `@langchain/textsplitters`: Textaufteilung für LangChain.
    - `@xenova/transformers`: Für Xenova Embeddings (wenn `EMBEDDING_LIBRARY=xenova`).
    - `chromadb`: Für ChromaDB als Vektor-Datenbank (wenn `VECTOR_DB_TYPE=chroma`).
    - `langchain`: LangChain-Bibliothek.
    - `mysql2`: Für MySQL-Datenbank (wenn `MAIN_DB_TYPE=mysql`).
    - `openai`: Offizielle OpenAI-API-Bibliothek (wenn `AI_PROVIDER=openai`).
    - `pg`: Für PostgreSQL-Datenbank (wenn `MAIN_DB_TYPE=postgresql`).
    - `weaviate-client`: Für Weaviate als Vektor-Datenbank (wenn `VECTOR_DB_TYPE=weaviate`).

2.  **Konfiguration:**
    Erstellen Sie eine `.env`-Datei im Projektstammverzeichnis basierend auf `.env.example`. Kopieren Sie `.env.example` nach `.env` und passen Sie die Werte an.

    Die wichtigsten Umgebungsvariablen sind:

    ```env
    # ========================================================================================
    # AI CHAT CONFIGURATION [REQUIRED]
    # ========================================================================================

    # AI Provider Selection [REQUIRED]
    # Options: openai (official OpenAI + compatible APIs like university chatAi), google (Gemini), claude (Anthropic), xai
    AI_PROVIDER=openai

    # Primary API Key [REQUIRED] - Used for the selected AI_PROVIDER above
    AI_API_KEY=dein-api-key

    # Base URL for API calls [OPTIONAL] - Required for chatAi and xai providers
    AI_BASE_URL=https://chat-ai.academiccloud.de/v1

    # AI Model Selection [OPTIONAL] - Uses provider default if not specified
    AI_MODEL=openai-gpt-oss-120b

    # Response Temperature [OPTIONAL] - Controls randomness (0.0 = deterministic, 2.0 = very random)
    # Range: 0.0 - 2.0, Default: 0.2
    AI_TEMPERATURE=0.2

    # Maximum Response Tokens [OPTIONAL] - Limits response length
    # Default: 1000
    AI_MAX_TOKENS=2000

    # Enable Streaming Responses [OPTIONAL] - Send responses as they are generated
    # Options: true, false, Default: true
    AI_STREAMING=true

    # ========================================================================================
    # BACKEND AI CONFIGURATION [OPTIONAL]
    # ========================================================================================
    # Option to use separate settings for the backend part of the app

    # BACKEND_AI_PROVIDER=
    # BACKEND_AI_API_KEY=
    # BACKEND_AI_BASE_URL=
    # BACKEND_AI_OPENAI_BASE_URL=
    # BACKEND_AI_XAI_BASE_URL=
    # BACKEND_AI_MODEL=
    # BACKEND_AI_TEMPERATURE=
    # BACKEND_AI_MAX_TOKENS=8000

    # ========================================================================================
    # SERVER CONFIGURATION [OPTIONAL]
    # ========================================================================================

    # Server Port [OPTIONAL] - Port for the Express server to listen on
    # Default: 3000
    PORT=3000

    # Trust Proxy Count [OPTIONAL] - Number of proxy layers (e.g., Cloudflare + Nginx)
    # Default: 2
    TRUST_PROXY_COUNT=2

    # ========================================================================================
    # DATABASE CONFIGURATION [REQUIRED]
    # ========================================================================================

    # Main Database Connection [REQUIRED] - Supports SQLite, PostgreSQL, and MySQL
    # SQLite (default - file-based, no server required):
    DATABASE_URL="file:/home/htw/htc-abc-ai-bot/hochschul-abc.db"

    # PostgreSQL example:
    DATABASE_URL="postgresql://username:password@localhost:5432/dbname?schema=public"

    # MySQL example:
    # DATABASE_URL="mysql://username:password@localhost:3306/dbname"

    # ========================================================================================
    # BACKUP & DATABASE SWITCHING
    # ========================================================================================

    ## Backup-Prozess

    Die Anwendung bietet ein integriertes Backup-System für Daten und Dateien über das Admin-Panel (`/admin/backup`).

    ### Backup erstellen:
    1. Melden Sie sich im Admin-Panel an.
    2. Gehen Sie zum Backup-Bereich.
    3. Wählen Sie die zu sichernden Tabellen (z. B. users, artikels, fragen, conversations, dokumente, bilder, feedback, dashboard).
    4. Klicken Sie auf "Backup erstellen" - eine ZIP-Datei wird in `backups/` gespeichert.

    ### Backup wiederherstellen:
    1. Laden Sie die ZIP-Datei über "Backup hochladen" hoch oder verwenden Sie eine vorhandene Datei.
    2. Wählen Sie den Import-Modus:
       - **replace**: Löscht vorhandene Daten und ersetzt sie komplett.
       - **append-override**: Fügt hinzu und überschreibt vorhandene Einträge.
       - **append-keep**: Fügt nur neue Einträge hinzu, behält vorhandene.
    3. Wählen Sie die zu importierenden Tabellen.
    4. Klicken Sie auf "Importieren".

    **Hinweise:**
    - Backups enthalten JSON-Daten und Dateien (Bilder, Dokumente).
    - Bei Schema-Unterschieden wird eine Warnung angezeigt, aber der Import fortgesetzt.
    - Temporäre Dateien werden automatisch bereinigt.
    - Backups sind nach Erstellungsdatum sortiert (neueste zuerst).

    ### Backup-Verwaltung:
    - Liste aller Backups anzeigen und herunterladen.
    - Backups umbenennen oder löschen.

    ## Datenbank wechseln (SQLite ↔ PostgreSQL/MySQL)

    Die Anwendung unterstützt SQLite (Standard), PostgreSQL und MySQL. Um die Datenbank zu wechseln:

    1. **Schema aktualisieren:**
       Ändern Sie in `prisma/schema.prisma` den `provider`:
       ```prisma
       datasource db {
         provider = "postgresql"  // oder "mysql" oder "sqlite"
         url      = env("DATABASE_URL")
       }
       ```

    2. **Umgebungsvariablen aktualisieren:**
       Ändern Sie in `.env` die `DATABASE_URL`:
       - SQLite: `DATABASE_URL="file:/path/to/db.db"`
       - PostgreSQL: `DATABASE_URL="postgresql://user:pass@host:5432/dbname?schema=public"`
       - MySQL: `DATABASE_URL="mysql://user:pass@host:3306/dbname"`

    3. **Datenbank anwenden:**
       ```bash
       npx prisma db push  # Erstellt Tabellen in der neuen DB
       npx prisma generate  # Regeneriert den Prisma-Client
       ```

    4. **Daten migrieren (optional):**
       - Bei Wechsel von SQLite zu PostgreSQL/MySQL: Exportieren Sie Daten manuell (z. B. via Backup) und importieren Sie in die neue DB.
       - Prisma migriert keine Daten zwischen verschiedenen Providern automatisch.

    5. **Server neu starten:**
       ```bash
       npm run build
       pm2 restart ecosystem.config.js  # oder npm start
       ```

    **Wichtig:** Sichern Sie Ihre Daten vor dem Wechsel. Testen Sie die Konfiguration in einer Entwicklungsumgebung.

    # ========================================================================================
    # SESSION & AUTHENTICATION [OPTIONAL]
    # ========================================================================================

    # Session Inactivity Timeout [OPTIONAL] - Minutes after last activity before session expires
    # Also sets client-side cookie expiration. Default: 1440 (24 hours)
    SESSION_INACTIVITY_TIMEOUT_MINUTES=1440

    # Maximum Session Duration [OPTIONAL] - Maximum minutes from session creation
    # Default: 43200 (30 days)
    SESSION_MAX_DURATION_MINUTES=43200

    # ========================================================================================
    # VECTOR DATABASE CONFIGURATION [OPTIONAL]
    # ========================================================================================
    # Used for document embeddings and semantic search

    # Vector Database Type [OPTIONAL] - Enable vector database for advanced features
    # Options: none (default), chroma, weaviate
    VECTOR_DB_TYPE=none

    # ChromaDB Configuration [REQUIRED if VECTOR_DB_TYPE=chroma]
    CHROMA_URL=http://localhost:8000
    CHROMA_COLLECTION=htw-kb

    # Weaviate Configuration [REQUIRED if VECTOR_DB_TYPE=weaviate]
    WEAVIATE_URL=http://localhost:8080
    WEAVIATE_API_KEY=your-optional-key  # Anonymous for dev
    WEAVIATE_COLLECTION=htw-kb

    # ========================================================================================
    # EMBEDDING CONFIGURATION [OPTIONAL]
    # ========================================================================================
    # Used when VECTOR_DB_TYPE is enabled

    # Embedding Library [OPTIONAL] - Library for generating text embeddings
    # Options: none (default), huggingface, openai
    EMBEDDING_LIBRARY=xenova

    # ========================================================================================
    # ADVANCED/CUSTOM SETTINGS
    # ========================================================================================

    # Image List Mode for AI (static|simple|dynamic)
    USE_VECTOR_IMAGES=static

    # HuggingFace token for embeddings (required if EMBEDDING_LIBRARY=huggingface)
    HF_TOKEN=hf_...

    # Embedding Model Configuration
    EMBEDDING_MODEL=all-MiniLM-L12-v2
    EMBEDDING_DIMENSION=384
    EMBEDDING_POOLING=mean
    EMBEDDING_NORMALIZE=true

    # Vector DB Sync Settings
    VECTORDB_LAST_SYNC=0
    CHUNK_SIZE=500  # Tokens per chunk (best practice: 200-1000 for RAG)
    CHUNK_OVERLAP=50  # Overlap for context (prevents split sentences)
    RETRIEVE_K=3  # Num chunks to retrieve (balance precision/tokens)
    MIN_SIMILARITY=0.7  # Confidence threshold (cosine score; filter low-relevance)
    SYNC_ON_START=false  # Auto-sync headlines on server boot (for dev; false in prod)

    # GraphRAG Toggle (requires vector DB)
    ENABLE_GRAPHRAG=false  # Set true for graph extraction
    PDF_CHUNK_SIZE=300  # Chunk size for PDF text extraction
    PDF_EXTRACT_TEXT_ONLY=false  # Set true to skip images in PDF extraction
    SYNC_BATCH=100  # Batch size for vector DB sync to avoid OOM
    DISPLAY_TOKEN_USED_FOR_QUERY=true  # Set true to show tokens sent/received in chat UI

    # ========================================================================================
    # DEVELOPMENT & DEBUGGING [OPTIONAL]
    # ========================================================================================

    # Domain for CORS and links [OPTIONAL] - Used in development
    DOMAIN=http://localhost:3000

    # Upload Size Limit [OPTIONAL] - Maximum upload size in MB
    # Default: 10 (production: 50)
    UPLOAD_LIMIT_MB=50
    ```

3.  **Datenbank-Initialisierung:**
     Die Anwendung verwendet Prisma für die Datenbankverwaltung. Beim ersten Start wird die Datenbank automatisch mit Tabellen und Views erstellt. Bei Versionsänderungen (z. B. nach Schema-Updates) werden Migrationen automatisch angewendet.

     - **Neue Datenbank:** Wenn keine `hochschuhl-abc.db` vorhanden ist, führt die Anwendung `prisma db push` aus, um die Datenbank mit dem aktuellen Schema zu initialisieren.
     - **Versionsänderungen:** Bei Änderungen der App-Version (in `package.json`) oder fehlender Versionsverfolgung wird `prisma migrate deploy` ausgeführt, um ausstehende Migrationen anzuwenden (falls vorhanden).
     - **Manuelle Migration:** Für manuelle Anpassungen verwenden Sie `npx prisma migrate dev --name beschreibung`.

4.  **Server starten:**
    Für Produktion ist PM2 der empfohlene Weg, um den Server zu starten und Änderungen an `.env` automatisch zu überwachen und neu zu starten.

    ```bash
    # Zuerst das Projekt bauen
    npm run build

    # Dann mit PM2 starten (überwacht .env für Änderungen)
    pm2 start ecosystem.config.js
    ```

    Dies stellt sicher, dass der Server bei Änderungen an Umgebungsvariablen (z. B. `VECTOR_DB_TYPE=chroma`) automatisch neu startet, ohne manuelles Eingreifen. PM2 begrenzt automatische Neustarts bei Abstürzen auf 30 Versuche mit 5 Sekunden Verzögerung; manuelle oder watch-basierte Neustarts sind unbegrenzt.

    Für Entwicklung:
    ```bash
    npm run dev:watch
    ```
    Dies startet den Server mit Hot-Reload für Code- und `.env`-Änderungen.

    Für Tests:
    ```bash
    npm test
    ```
    Führt die Testsuite aus (interaktiv oder direkt).
    USE_VECTOR_IMAGES=static  # Image list mode for AI: 'static' (default, from DB), 'simple' (from vector DB), 'dynamic' (per-query from vector DB)

    # Vector DB Processing Options
    CHUNK_SIZE=500  # Size of text chunks for vectorization (200-1000, default: 500)
    CHUNK_OVERLAP=50  # Overlap between chunks (0-200, default: 50)
    RETRIEVE_K=3  # Number of similar chunks to retrieve (1-10, default: 3)
    MIN_SIMILARITY=0.7  # Minimum similarity score for retrieval (0-1, default: 0.7)
    EMBEDDING_LIBRARY=xenova  # Embedding library: 'xenova' (default, uses @xenova/transformers) or 'huggingface' (uses @huggingface/transformers)
    SYNC_ON_START=false  # Sync vector DB on startup: 'true' or 'false' (default: false)
    ENABLE_GRAPHRAG=false  # Enable graph-based retrieval: 'true' or 'false' (default: false)

    # PDF Processing Options
    PDF_CHUNK_SIZE=300  # Chunk size for PDF text (100-1000, default: 300)
    PDF_EXTRACT_TEXT_ONLY=false  # Extract only text from PDFs: 'true' or 'false' (default: false)
    SYNC_BATCH=100  # Batch size for vector DB sync (10-500, default: 100)
    DISPLAY_TOKEN_USED_FOR_QUERY=false  # Display token usage in responses: 'true' or 'false' (default: false)

    # Image Handling Options
    # The AI can reference images in responses. Configure how the image list is generated for the AI prompt.
    # - 'static': Fetch from main DB (Prisma). Fast, no vector DB required. Includes all images with descriptions.
    # - 'simple': Fetch from vector DB. Uses embeddings for retrieval, may improve relevance but adds latency.
    # - 'dynamic': Query vector DB per user question. Most adaptive, but highest latency and token usage.
    # Requires VECTOR_DB_TYPE != 'none' for 'simple'/'dynamic'. Fallbacks to 'static' if vector DB fails.

    # Embedding Models (known working models with dimensions)
    # For EMBEDDING_LIBRARY=xenova (default):
    # - all-MiniLM-L6-v2 (384 dimensions)
    # - paraphrase-multilingual-MiniLM-L12-v2 (384 dimensions)
    # For EMBEDDING_LIBRARY=huggingface:
    # - onnx-community/Qwen3-Embedding-0.6B-ONNX (1024 dimensions)
    # - sentence-transformers/all-MiniLM-L6-v2 (384 dimensions)
    ```

## ▶️ Anwendung starten

### Entwicklung (Watcher-Bundle)

```bash
npm run dev:watch
```

- Baut das Frontend kontinuierlich (`vite build --watch`) und startet den Express-Server mit `nodemon`.
- Änderungen in `src/` erzeugen sofort ein neues Bundle; Änderungen unter `server/` lösen einen automatischen Neustart aus.
- Die Anwendung läuft anschließend unter `http://127.0.0.1:3000/`. Hot Module Reloading ist nicht notwendig, weil die neu gebauten Assets direkt von Express ausgeliefert werden.

### Produktion / Staging

```bash
npm run build
pm2 start ecosystem.config.js
```

- `npm run build` erstellt einmalig das Bundle unter `dist/`.
- `pm2 start ecosystem.config.js` startet den Express-Server mit PM2, welcher Änderungen an `.env` überwacht und automatisch neu startet. Für Dauerbetrieb und automatische Neustarts bei Umgebungsvariablen-Änderungen empfohlen.
- Alternativ `npm start` für einfache Starts ohne PM2, aber ohne automatische `.env`-Überwachung.

### Nginx-Konfiguration (Beispiel für aski.htw-dresden.de)

Für die Produktionsumgebung kann Nginx als Reverse-Proxy verwendet werden. Hier ein Beispiel für die Konfiguration in `/etc/nginx/sites-available/dev`:

```nginx
server {
    listen 80;
    server_name aski.htw-dresden.de;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name aski.htw-dresden.de;

    ssl_certificate     /etc/nginx/ssl/origin.crt;
    ssl_certificate_key /etc/nginx/ssl/origin.key;
    include snippets/ssl-params.conf;

    # Disable separate route to uploads, because marginal gains vs complexity
    # location /uploads/ {
    #    alias /home/htw/htc-abc-ai-bot/uploads/;
    #    add_header Cache-Control "no-cache";
    # }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Diese Konfiguration leitet HTTP-Anfragen auf HTTPS um und proxied alle Anfragen an den lokalen Express-Server auf Port 3000.

## 🔐 Authentifizierung

Der Zugriff auf das Admin-Panel (`/admin/`) und das Dashboard (`/dash/`) erfordert eine Anmeldung. Die Anwendung verwendet ein In-Memory-Session-Management.

-   **Wichtiger Hinweis:** Da die Sitzungen im Speicher gehalten werden, gehen alle Anmeldungen verloren, wenn der Server neu gestartet wird.
-   Ein Standardbenutzer `admin` mit dem Passwort `admin` wird beim ersten Start und der Initialisierung der Datenbank angelegt.

## 📁 Projektstruktur

```
.
├── prisma/          # Prisma schema and database migrations
├── public/          # Static assets (images, documents, fonts)
├── server/          # Server-side code (controllers, utils, server.cjs)
├── src/             # Frontend source code (HTML, CSS, JS for bot, admin, dash, login, view)
├── test/            # Test files and mocks
├── .env             # Environment configuration (copy from .env.example)
├── AGENTS.md        # Project-specific documentation for AI assistants
├── package.json     # Dependencies and scripts
└── README.md        # This file
```

## 📝 API-Endpunkte (Übersicht)

Die Anwendung stellt verschiedene API-Endpunkte bereit:

-   **Öffentliche API:**
    -   `POST /api/chat`: Sendet eine Anfrage an den KI-Chatbot.
    -   `GET /api/suggestions`: Ruft Vorschläge für den Chat ab.
-   **Admin-API (`/api/admin/`):**
    -   Endpunkte zur Verwaltung von Einträgen, Benutzern, Feedback, Bildern und mehr. Erfordert Authentifizierung.
-   **Dashboard-API (`/api/dashboard/`):**
    -   Endpunkte zur Bereitstellung von Daten für das Monitoring-Dashboard. Erfordert Authentifizierung.
-   **Authentifizierungs-API:**
    -   `POST /api/login`: Authentifiziert einen Benutzer und startet eine Sitzung.
    -   `POST /api/logout`: Beendet die aktuelle Sitzung.

## 🛡️ Sicherheit

-   **Helmet:** Schützt die Anwendung durch das Setzen verschiedener sicherheitsrelevanter HTTP-Header.
-   **Rate Limiting:** Begrenzt die Anzahl der Anfragen an die API, um Missbrauch zu verhindern. Für die Anmelde-Endpunkte gelten strengere Limits.

## 🪵 Logging

Benutzeraktionen im Admin-Panel (wie Anmeldungen, Inhaltserstellung und -löschung) werden in der Datei `logs/audit.log` protokolliert, um die Nachverfolgbarkeit zu gewährleisten.

## 🧪 Tests

Die Anwendung enthält Unit- und Integrationstests mit Jest.

- **Tests ausführen (interaktiv wählen .env oder .env.test, defaults to .env in 10s):**
  ```bash
  npm test
  ```

- **Tests direkt mit Jest (ohne Prompt, verwendet .env):**
  ```bash
  npm run test:direct
  ```

- **Tests mit Test-Umgebungsvariablen (.env.test):**
  ```bash
  npm run test:env
  ```

- **Testabdeckung generieren:**
  ```bash
  npm run test:coverage
  ```

Stellen Sie sicher, dass `.env` oder `.env.test` vorhanden ist. Die Tests prüfen nur konfigurierte optionale Abhängigkeiten (z. B. nur ChromaDB, wenn `VECTOR_DB_TYPE=chroma` gesetzt ist).

## 🔧 Troubleshooting

- **Server startet nicht:** Überprüfen Sie die `.env`-Datei auf korrekte Konfiguration (z. B. `AI_API_KEY`, `DATABASE_URL`).
- **Datenbankfehler:** Führen Sie `npx prisma migrate dev` aus, um Migrationen anzuwenden.
- **Vite-Dev-Server:** Verwenden Sie `timeout 10s npm run dev` für Tests, um Blockierungen zu vermeiden.
- **Nginx-Proxy:** Stellen Sie sicher, dass Nginx auf IPv4 bindet (`127.0.0.1:3000`), um 502-Fehler zu vermeiden.
- **Vector DB Sync:** Bei Problemen mit der Vektor-Datenbank führen Sie `node scripts/migrate_to_prisma.js` aus, um alte Daten zu migrieren.

Für detaillierte Logs prüfen Sie `logs/audit.log` und Konsolen-Ausgaben. Projekt-spezifische Details und Konfigurationstipps finden Sie in `AGENTS.md`.

## 🐳 Produktive Bereitstellung mit Docker

Für eine einfache und isolierte Bereitstellung auf einem nackten Debian- oder Ubuntu-Server verwenden Sie Docker. Dies vermeidet manuelle Installation von Node.js, PostgreSQL usw. und stellt alles in Containern bereit.

### Voraussetzungen
- Debian oder Ubuntu Server (nackt, ohne vorinstallierte Software).
- Root- oder sudo-Zugang.

### Schritt-für-Schritt-Anleitung

1. **Server vorbereiten:**
   ```bash
   sudo apt update && sudo apt upgrade -y
   sudo apt install -y curl git
   ```

2. **Docker installieren:**
   ```bash
   curl -fsSL https://get.docker.com -o get-docker.sh
   sudo sh get-docker.sh
   sudo usermod -aG docker $USER  # Optional: Aktueller User zu Docker-Gruppe hinzufügen (nach Logout neu anmelden)
   ```

3. **Projekt klonen:**
   ```bash
   git clone <repository-url> htw-abc-ai-bot
   cd htw-abc-ai-bot
   ```

4. **Umgebung konfigurieren:**
   ```bash
   cp .env.example .env
   nano .env  # Bearbeiten: AI_API_KEY, DATABASE_URL (bleibt postgresql://user:password@db:5432/hochschul_abc), etc.
   ```

5. **Docker-Container starten:**
   ```bash
   docker compose up -d --build
   ```
   - Dies baut das Image, startet App (Port 3000) und PostgreSQL (Port 5432), initialisiert die DB automatisch.
   - App läuft unter `http://server-ip:3000`.

6. **Nginx als Reverse-Proxy einrichten (empfohlen für Produktion):**
   ```bash
   sudo apt install -y nginx
   sudo nano /etc/nginx/sites-available/htw-abc-ai-bot
   ```
   Fügen Sie hinzu:
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;  # Ersetzen durch echte Domain

       location / {
           proxy_pass http://127.0.0.1:3000;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```
   Aktivieren und Nginx neu starten:
   ```bash
   sudo ln -s /etc/nginx/sites-available/htw-abc-ai-bot /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl restart nginx
   ```

7. **SSL mit Let's Encrypt (optional):**
   ```bash
   sudo apt install -y certbot python3-certbot-nginx
   sudo certbot --nginx -d your-domain.com
   ```

8. **Überprüfen und warten:**
   - App initialisiert DB beim ersten Start (kann 1-2 Min. dauern).
   - Logs: `docker compose logs -f app`
   - Stoppen: `docker compose down`
   - Updates: `git pull && docker compose up -d --build`

**Hinweise:**
- Volumes für DB (`postgres_data`) und Uploads (`./uploads`, `./backups`) bleiben persistent.
- Für Sicherheit: `.env` nicht im Container-Image (hier external via env_file möglich, aber aktuell kopiert).
- Bei Port-Konflikten: Ändern Sie Ports in `docker-compose.yml`.
