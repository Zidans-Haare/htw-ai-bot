// Vector store classes loaded dynamically
let Chroma, Weaviate;

// Factory to create embeddings based on library
const createEmbeddings = (modelName) => {
  const lib = process.env.EMBEDDING_LIBRARY || 'xenova';
  if (lib === 'xenova') {
    return new XenovaEmbeddings(modelName);
  } else {
    return new HuggingFaceEmbeddings(modelName);
  }
};

// Real embeddings using Xenova Transformers
class XenovaEmbeddings {
  constructor(modelName = 'all-MiniLM-L6-v2') {
    this.modelName = `Xenova/${modelName}`;
    this.pipe = null;
    this.dimension = parseInt(process.env.EMBEDDING_DIMENSION) || 384;
    this.pooling = process.env.EMBEDDING_POOLING || 'mean';
    this.normalize = process.env.EMBEDDING_NORMALIZE === 'true' || true;
  }

  async init() {
    if (!this.pipe) {
      const { pipeline } = require('@xenova/transformers');
      this.pipe = await pipeline('feature-extraction', this.modelName, { auth_token: process.env.HF_TOKEN });
    }
  }

  async embedQuery(text) {
    await this.init();
    const output = await this.pipe(text, { pooling: this.pooling, normalize: this.normalize });
    return Array.from(output.data);
  }

  async embedDocuments(texts) {
    await this.init();
    const embeddings = [];
    for (const text of texts) {
      const output = await this.pipe(text, { pooling: this.pooling, normalize: this.normalize });
      embeddings.push(Array.from(output.data));
    }
    return embeddings;
  }
}

// Real embeddings using Hugging Face Transformers
class HuggingFaceEmbeddings {
  constructor(modelName = 'all-MiniLM-L6-v2') {
    this.modelName = modelName;
    this.pipe = null;
    this.dimension = parseInt(process.env.EMBEDDING_DIMENSION) || 384;
    this.pooling = process.env.EMBEDDING_POOLING || 'mean';
    this.normalize = process.env.EMBEDDING_NORMALIZE === 'true' || true;
  }

  async init() {
    if (!this.pipe) {
      try {
        const { pipeline } = require('@huggingface/transformers');
        this.pipe = await pipeline('feature-extraction', this.modelName, { token: process.env.HF_TOKEN });
      } catch (error) {
        console.log('Installing @huggingface/transformers...');
        const { execSync } = require('child_process');
        execSync('npm install @huggingface/transformers', { stdio: 'inherit' });
        // Retry after install
        const { pipeline } = require('@huggingface/transformers');
        this.pipe = await pipeline('feature-extraction', this.modelName, { token: process.env.HF_TOKEN });
      }
    }
  }

  async embedQuery(text) {
    await this.init();
    const output = await this.pipe(text, { pooling: this.pooling, normalize: this.normalize });
    return Array.from(output.data);
  }

  async embedDocuments(texts) {
    await this.init();
    const embeddings = [];
    for (const text of texts) {
      const output = await this.pipe(text, { pooling: this.pooling, normalize: this.normalize });
      embeddings.push(Array.from(output.data));
    }
    return embeddings;
  }
}
const { Document } = require("@langchain/core/documents");
const { RecursiveCharacterTextSplitter } = require("@langchain/textsplitters");
const { v4: uuidv4 } = require('uuid');
const winston = require('winston');
const sanitizeHtml = require('sanitize-html');
const { estimateTokens } = require('../utils/tokenizer');
const promClient = require('prom-client');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const { DocxLoader } = require("@langchain/community/document_loaders/fs/docx");
// const { PPTXLoader } = require("@langchain/community/document_loaders/fs/pptx"); // Disabled due to missing officeparser
const { UnstructuredLoader } = require("@langchain/community/document_loaders/fs/unstructured");
// const { PDFLoader } = require("@langchain/community/document_loaders/fs/pdf"); // Replaced with unpdf for Node.js compatibility

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const HochschuhlABC = prisma.hochschuhl_abc;
const { readFile } = require('fs/promises');
const { extractText, getDocumentProxy } = require('unpdf');


const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });
const syncDuration = new promClient.Histogram({
  name: 'vector_sync_duration_seconds',
  help: 'Duration of vector DB sync',
  registers: [register]
});
const retrievalDuration = new promClient.Histogram({
  name: 'vector_retrieval_duration_seconds',
  help: 'Duration of similarity search',
  registers: [register]
});

// Logger setup (reuse from server or local)
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => `${timestamp} [${level}]: ${message}`)
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/vector-db.log' })
  ]
});

// German stop words for BM25 tokenization
const STOP_WORDS = new Set([
  'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einer', 'eines', 'einem', 'einen',
  'und', 'oder', 'aber', 'wenn', 'als', 'wie', 'dass', 'weil', 'denn', 'so', 'also',
  'ist', 'sind', 'war', 'hat', 'haben', 'wird', 'werden', 'kann', 'können', 'muss', 'müssen',
  'ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr', 'mich', 'mir', 'dich', 'dir',
  'in', 'an', 'auf', 'für', 'mit', 'von', 'zu', 'bei', 'nach', 'aus', 'um', 'über', 'vor',
  'nicht', 'auch', 'nur', 'noch', 'schon', 'sehr', 'mehr', 'hier', 'da', 'dort',
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
  'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'and', 'or', 'but', 'not',
  'this', 'that', 'it', 'its', 'i', 'you', 'he', 'she', 'we', 'they',
]);

/**
 * Lightweight BM25 index for keyword-based retrieval.
 * Complements vector similarity search for exact matches (names, abbreviations, IDs).
 */
class BM25Index {
  constructor() {
    this.documents = [];     // { id, pageContent, metadata }
    this.df = new Map();     // document frequency per term
    this.docTermFreqs = [];  // per-doc term frequency maps
    this.avgDl = 0;          // average document length
    this.k1 = 1.5;
    this.b = 0.75;
  }

  /**
   * Tokenize text: lowercase, split on non-alphanumeric, remove stop words.
   */
  _tokenize(text) {
    return text
      .toLowerCase()
      .split(/[^a-zäöüß0-9]+/)
      .filter(t => t.length > 1 && !STOP_WORDS.has(t));
  }

  /**
   * Add a document to the index.
   */
  addDocument(doc) {
    const idx = this.documents.length;
    this.documents.push(doc);

    const tokens = this._tokenize(doc.pageContent);
    const tf = new Map();
    for (const token of tokens) {
      tf.set(token, (tf.get(token) || 0) + 1);
    }
    this.docTermFreqs.push({ tf, length: tokens.length });

    // Update document frequencies
    for (const term of tf.keys()) {
      this.df.set(term, (this.df.get(term) || 0) + 1);
    }

    // Recalculate average document length
    this.avgDl = this.docTermFreqs.reduce((sum, d) => sum + d.length, 0) / this.documents.length;
  }

  /**
   * Clear the index (for re-init).
   */
  clear() {
    this.documents = [];
    this.df = new Map();
    this.docTermFreqs = [];
    this.avgDl = 0;
  }

  /**
   * Search the index. Returns top-k results sorted by BM25 score.
   * @param {string} query
   * @param {number} k
   * @param {object} [filter] - Access level filter: { access_level: { $in: [...] } }
   * @returns {{ pageContent: string, metadata: object, score: number }[]}
   */
  search(query, k = 10, filter = undefined) {
    const queryTokens = this._tokenize(query);
    if (queryTokens.length === 0) return [];

    const N = this.documents.length;
    const scores = [];

    for (let i = 0; i < N; i++) {
      // Apply access level filter
      if (filter?.access_level?.$in) {
        const docLevel = this.documents[i].metadata?.access_level;
        if (docLevel && !filter.access_level.$in.includes(docLevel)) {
          continue;
        }
      }

      const { tf, length: dl } = this.docTermFreqs[i];
      let score = 0;

      for (const term of queryTokens) {
        const termFreq = tf.get(term) || 0;
        if (termFreq === 0) continue;

        const docFreq = this.df.get(term) || 0;
        // IDF with smoothing
        const idf = Math.log((N - docFreq + 0.5) / (docFreq + 0.5) + 1);
        // BM25 term score
        const tfNorm = (termFreq * (this.k1 + 1)) / (termFreq + this.k1 * (1 - this.b + this.b * (dl / this.avgDl)));
        score += idf * tfNorm;
      }

      if (score > 0) {
        scores.push({ index: i, score });
      }
    }

    return scores
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .map(s => ({
        pageContent: this.documents[s.index].pageContent,
        metadata: this.documents[s.index].metadata,
        score: s.score,
      }));
  }
}

class SemanticSplitter {
  constructor(maxChunkSize = 500, overlap = 50) {
    this.maxChunkSize = maxChunkSize;
    this.overlap = overlap;
    this.fallbackSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: maxChunkSize,
      chunkOverlap: overlap
    });
  }

  /**
   * Split text by structural boundaries (headings, paragraphs, HRs),
   * then only use RecursiveCharacterTextSplitter for oversized sections.
   * @param {string} text - Raw text (may contain HTML/Markdown)
   * @param {string} [contextPrefix] - Prefix to prepend to each chunk (e.g. article title)
   * @returns {Promise<string[]>} Array of chunk strings
   */
  async splitText(text, contextPrefix = '') {
    const sections = this._splitBySections(text);
    const chunks = [];

    for (const section of sections) {
      const prefixed = contextPrefix
        ? `[${contextPrefix}] ${section.title ? section.title + ': ' : ''}${section.content}`
        : (section.title ? `${section.title}: ${section.content}` : section.content);

      const tokenCount = estimateTokens(prefixed);

      if (tokenCount <= this.maxChunkSize) {
        if (prefixed.trim()) {
          chunks.push(prefixed.trim());
        }
      } else {
        // Section too large — split with fallback, but keep prefix on each sub-chunk
        const subChunks = await this.fallbackSplitter.splitText(section.content);
        for (const sc of subChunks) {
          const sub = contextPrefix
            ? `[${contextPrefix}] ${section.title ? section.title + ': ' : ''}${sc}`
            : (section.title ? `${section.title}: ${sc}` : sc);
          if (sub.trim()) {
            chunks.push(sub.trim());
          }
        }
      }
    }

    return chunks.length > 0 ? chunks : [text.trim()].filter(Boolean);
  }

  /**
   * Split text into sections based on structural boundaries:
   * - HTML headings (<h1>-<h6>)
   * - Markdown headings (# - ######)
   * - Horizontal rules (<hr>, ---, ***)
   * - Double newlines (paragraph breaks)
   * @returns {{ title: string, content: string }[]}
   */
  _splitBySections(text) {
    // Normalize line endings
    const normalized = text.replace(/\r\n/g, '\n');

    // Split on heading patterns and horizontal rules
    const sectionRegex = /(?=<h[1-6][^>]*>)|(?=^#{1,6}\s)/gm;
    const rawSections = normalized.split(sectionRegex).filter(s => s.trim());

    if (rawSections.length <= 1) {
      // No headings found — split on double newlines (paragraph breaks)
      return this._splitByParagraphs(normalized);
    }

    return rawSections.map(section => {
      // Extract title from heading if present
      const htmlHeadingMatch = section.match(/^<h[1-6][^>]*>(.*?)<\/h[1-6]>/i);
      const mdHeadingMatch = section.match(/^(#{1,6})\s+(.+)/m);

      let title = '';
      let content = section;

      if (htmlHeadingMatch) {
        title = sanitizeHtml(htmlHeadingMatch[1], { allowedTags: [] }).trim();
        content = section.replace(htmlHeadingMatch[0], '').trim();
      } else if (mdHeadingMatch) {
        title = mdHeadingMatch[2].trim();
        content = section.replace(mdHeadingMatch[0], '').trim();
      }

      return { title, content: content || title };
    }).filter(s => s.content.trim());
  }

  /**
   * Fallback: split on double newlines, grouping small paragraphs together.
   */
  _splitByParagraphs(text) {
    const paragraphs = text.split(/\n{2,}/).filter(p => p.trim());
    const sections = [];
    let current = '';

    for (const p of paragraphs) {
      const combined = current ? `${current}\n\n${p}` : p;
      if (estimateTokens(combined) <= this.maxChunkSize) {
        current = combined;
      } else {
        if (current.trim()) {
          sections.push({ title: '', content: current.trim() });
        }
        current = p;
      }
    }
    if (current.trim()) {
      sections.push({ title: '', content: current.trim() });
    }

    return sections;
  }
}

class VectorStoreManager {
  constructor() {
    const modelName = process.env.EMBEDDING_MODEL || 'all-MiniLM-L6-v2';
    this.embeddings = createEmbeddings(modelName);
    this.lastSync = new Date(0);
    try {
      this.lastSync = new Date(fs.readFileSync('.vectordb_last_sync', 'utf8'));
    } catch (e) { }
    this.store = null;
    this.graphData = null;
    const chunkSize = parseInt(process.env.CHUNK_SIZE) || 500;
    const chunkOverlap = parseInt(process.env.CHUNK_OVERLAP) || 50;
    const pdfChunkSize = parseInt(process.env.PDF_CHUNK_SIZE) || 300;
    this.splitter = new RecursiveCharacterTextSplitter({
      chunkSize,
      chunkOverlap
    });
    this.pdfSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: pdfChunkSize,
      chunkOverlap
    });
    this.semanticSplitter = new SemanticSplitter(chunkSize, chunkOverlap);
    this.pdfSemanticSplitter = new SemanticSplitter(pdfChunkSize, chunkOverlap);
    this.useSemanticChunking = (process.env.CHUNKING_STRATEGY || 'semantic') === 'semantic';
    this.bm25Index = new BM25Index();
    this.useHybridSearch = process.env.HYBRID_SEARCH_ENABLED !== 'false';
    this.hybridRrfK = parseInt(process.env.HYBRID_RRF_K) || 60;
    this.connect();
  }

  async loadPDF(filePath) {
    try {
      const buffer = await readFile(filePath);
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      const { totalPages, text } = await extractText(pdf, { mergePages: false });
      const docs = [];
      for (let i = 0; i < text.length; i++) {
        docs.push(new Document({
          pageContent: text[i],
          metadata: { source: filePath, page: i + 1 }
        }));
      }
      return docs;
    } catch (err) {
      logger.error(`PDF load failed for ${filePath}: ${err.message}`, err);
      console.error(`PDF load failed: ${err.message}`);
      return [];
    }
  }

  async connect() {
    const type = process.env.VECTOR_DB_TYPE;
    console.log(`VECTOR_DB_TYPE in connect(): ${type}`);
    if (type === 'none') return;

    try {
      if (type === 'chroma') {
        if (!Chroma) {
          try {
            const chromaModule = require("@langchain/community/vectorstores/chroma");
            Chroma = chromaModule.Chroma;
          } catch (error) {
            console.log('Installing chromadb...');
            execSync('npm install chromadb', { stdio: 'inherit' });
            const chromaModule = require("@langchain/community/vectorstores/chroma");
            Chroma = chromaModule.Chroma;
          }
        }
        const url = new URL(process.env.CHROMA_URL);
        this.store = new Chroma(this.embeddings, {
          collectionName: process.env.CHROMA_COLLECTION,
          host: url.hostname,
          port: url.port,
          ssl: url.protocol === 'https:'
        });
      } else if (type === 'weaviate') {
        if (!Weaviate) {
          try {
            const weaviateModule = require("@langchain/community/vectorstores/weaviate");
            Weaviate = weaviateModule.Weaviate;
          } catch (error) {
            console.log('Installing weaviate-client...');
            execSync('npm install weaviate-client', { stdio: 'inherit' });
            const weaviateModule = require("@langchain/community/vectorstores/weaviate");
            Weaviate = weaviateModule.Weaviate;
          }
        }
        let weaviate;
        try {
          weaviate = require('weaviate-client');
        } catch (error) {
          console.log('Installing weaviate-client...');
          execSync('npm install weaviate-client', { stdio: 'inherit' });
          weaviate = require('weaviate-client');
        }
        const url = new URL(process.env.WEAVIATE_URL);
        const client = await weaviate.connectToLocal({
          host: url.hostname,
          port: url.port,
          authCredentials: process.env.WEAVIATE_API_KEY ? new weaviate.ApiKey(process.env.WEAVIATE_API_KEY) : undefined
        });
        this.store = new Weaviate(client, {
          indexName: process.env.WEAVIATE_COLLECTION || 'htw-kb',
          embedding: this.embeddings
        });
      }
      logger.info(`Connected to ${type} vector DB`);
    } catch (err) {
      logger.error('Vector DB connection failed:', err);
      throw err;
    }
  }

  async initVectorDB() {
    const startTime = Date.now();
    try {
      console.log('Initializing vector DB...');
      // Drop existing vectors and BM25 index for a clean init
      await this.dropVectorDB();
      this.bm25Index.clear();
      // Force full sync for init
      const oldLastSync = this.lastSync;
      this.lastSync = new Date(0);
      const stats = await this.syncFromDB();
      this.lastSync = oldLastSync;
      const duration = (Date.now() - startTime) / 1000;
      logger.info(`Vector DB initialized and synced in ${duration.toFixed(2)} seconds`);
      console.log(`Vector DB initialized and synced in ${duration.toFixed(2)} seconds`);
      return stats;
    } catch (err) {
      logger.error('Init vector DB failed:', err);
      throw err;
    }
  }

  async syncVectorDB() {
    try {
      console.log('Syncing vector DB...');
      // Use current lastSync for incremental sync
      const stats = await this.syncFromDB();
      logger.info('Vector DB synced');
      return stats;
    } catch (err) {
      logger.error('Sync vector DB failed:', err);
      throw err;
    }
  }

  async syncVectorDB() {
    try {
      console.log('Syncing vector DB...');
      // Use current lastSync for incremental sync
      const stats = await this.syncFromDB();
      logger.info('Vector DB synced');
      return stats;
    } catch (err) {
      logger.error('Sync vector DB failed:', err);
      throw err;
    }
  }

  async dropVectorDB() {
    if (!this.store) return;
    try {
      if (process.env.VECTOR_DB_TYPE === 'weaviate') {
        await this.store.deleteCollection();
      } else if (process.env.VECTOR_DB_TYPE === 'chroma') {
        execSync(`curl -X POST http://localhost:8000/api/v1/reset`, { stdio: 'inherit' });
      }
      logger.info('Vector DB cleared');
    } catch (err) {
      logger.error('Drop vector DB failed:', err);
      throw err;
    }
  }

  async syncFromDB() {
    const end = syncDuration.startTimer();
    const { HochschuhlABC } = require('../controllers/db.cjs');
    if (!this.store) return;

    const docs = [];
    let headlineCount = 0;
    let pdfCount = 0;
    let imageCount = 0;
    let docxCount = 0, mdCount = 0, odtCount = 0, xlsxCount = 0, odpCount = 0, odsCount = 0;

    // Fetch changed headlines
    const changedHeadlines = await HochschuhlABC.findMany({ where: { updated_at: { gt: this.lastSync } }, select: { id: true, article: true, description: true, active: true, access_level: true } });
    for (const h of changedHeadlines) {
      if (h.active) {
        // Delete old vectors
        await this.store.delete({ filter: { $and: [{ source: 'headline' }, { id: h.id }] } });
        // Add new
        let pageContent = sanitizeHtml(`${h.article}\n${h.description}`);
        const chunks = this.useSemanticChunking
          ? await this.semanticSplitter.splitText(pageContent, h.article)
          : await this.splitter.splitText(pageContent);
        for (let i = 0; i < chunks.length; i++) {
          docs.push(new Document({
            pageContent: chunks[i],
            metadata: {
              source: 'headline',
              id: h.id,
              access_level: h.access_level || 'employee',
              chunkIndex: i
            }
          }));
        }
        headlineCount++;
      } else {
        // Delete
        await this.store.delete({ filter: { $and: [{ source: 'headline' }, { id: h.id }] } });
      }
    }

    // Fetch changed documents
    const changedDocuments = await prisma.documents.findMany({
      where: { updated_at: { gt: this.lastSync } },
      include: { hochschuhl_abc: true }
    });
    for (const doc of changedDocuments) {
      // Delete old
      await this.store.delete({ filter: { $and: [{ source: 'document' }, { documentId: doc.id }] } });
      // Add new if supported type
      const fullPath = path.join(__dirname, '..', '..', 'uploads', 'documents', doc.filepath);
      let loader;
      if (doc.file_type === 'pdf') {
        const loadedDocs = await this.loadPDF(fullPath);
        pdfCount++;
        // Process loadedDocs similar to other loaders
        for (const d of loadedDocs) {
          let pageContent = d.pageContent;
          if (doc.hochschuhl_abc && doc.hochschuhl_abc.active) {
            pageContent = `${doc.hochschuhl_abc.article}\n${doc.hochschuhl_abc.description || ''}\n${pageContent}`;
          }
          pageContent = sanitizeHtml(pageContent);
          if (pageContent.trim() === '') continue; // Skip empty
          const contextPrefix = doc.hochschuhl_abc?.article || `Seite ${d.metadata?.page || '?'}`;
          const chunks = this.useSemanticChunking
            ? await this.pdfSemanticSplitter.splitText(pageContent, contextPrefix)
            : await this.pdfSplitter.splitText(pageContent);
          for (let i = 0; i < chunks.length; i++) {
            docs.push(new Document({
              pageContent: chunks[i],
              metadata: {
                ...d.metadata,
                source: 'document',
                articleId: doc.article_id,
                documentId: doc.id,
                fileType: doc.file_type,
                access_level: doc.access_level || 'employee',
                chunkIndex: i
              }
            }));
          }
        }
      } else
        if (doc.file_type === 'docx') {
          loader = new DocxLoader(fullPath);
          docxCount++;
        } else if (doc.file_type === 'md') {
          loader = new UnstructuredLoader(fullPath);
          mdCount++;
        } else if (['odt', 'ods', 'odp'].includes(doc.file_type)) {
          loader = new UnstructuredLoader(fullPath);
          if (doc.file_type === 'odt') odtCount++;
          else if (doc.file_type === 'ods') odsCount++;
          else odpCount++;
        } else if (doc.file_type === 'xlsx') {
          loader = new UnstructuredLoader(fullPath);
          xlsxCount++;
        } else {
          continue; // unsupported
        }
      if (loader) {
        try {
          const loadedDocs = await loader.load();
          for (const d of loadedDocs) {
            let pageContent = d.pageContent;
            if (doc.hochschuhl_abc && doc.hochschuhl_abc.active) {
              pageContent = `${doc.hochschuhl_abc.article}\n${doc.hochschuhl_abc.description || ''}\n${pageContent}`;
            }
            pageContent = sanitizeHtml(pageContent);
            const contextPrefix = doc.hochschuhl_abc?.article || doc.filepath;
            const chunks = this.useSemanticChunking
              ? await this.semanticSplitter.splitText(pageContent, contextPrefix)
              : await this.pdfSplitter.splitText(pageContent);
            for (let i = 0; i < chunks.length; i++) {
              docs.push(new Document({
                pageContent: chunks[i],
                metadata: {
                  ...d.metadata,
                  source: 'document',
                  articleId: doc.article_id,
                  documentId: doc.id,
                  fileType: doc.file_type,
                  access_level: doc.access_level || 'employee',
                  chunkIndex: i
                }
              }));
            }
          }
        } catch (err) {
          logger.error(`Failed to load document ${doc.id}: ${err.message}`);
        }
      }
    }

    // Fetch changed images
    const changedImages = await prisma.images.findMany({ where: { updated_at: { gt: this.lastSync } } });
    for (const img of changedImages) {
      // Delete old
      await this.store.delete({ filter: { $and: [{ source: 'image' }, { id: img.id }] } });
      // Add new
      let pageContent = `${img.filename}\n${img.description || ''}`;
      docs.push(new Document({
        pageContent,
        metadata: { source: 'image', id: img.id }
      }));
      imageCount++;
    }

    // Embed and store in batches
    const batchSize = parseInt(process.env.SYNC_BATCH) || 100;
    for (let i = 0; i < docs.length; i += batchSize) {
      await this.store.addDocuments(docs.slice(i, i + batchSize));
    }

    // Populate BM25 index for hybrid search
    if (this.useHybridSearch) {
      for (const doc of docs) {
        this.bm25Index.addDocument({
          pageContent: doc.pageContent,
          metadata: doc.metadata,
        });
      }
      logger.info(`BM25 index updated with ${docs.length} documents (total: ${this.bm25Index.documents.length})`);
    }

    // Build graph if enabled
    if (process.env.ENABLE_GRAPHRAG === 'true') {
      this.graphData = await this.buildSimpleGraph(docs);
    }

    const stats = {
      headlines: headlineCount,
      pdfs: pdfCount,
      images: imageCount,
      docx: docxCount,
      // pptx: pptxCount, // Disabled
      md: mdCount,
      odt: odtCount,
      ods: odsCount,
      odp: odpCount,
      xlsx: xlsxCount,
      chunks: docs.length
    };
    logger.info(`Synced ${stats.chunks} chunks from ${stats.headlines} headlines, ${stats.pdfs} PDFs, ${stats.images} images, ${stats.docx} DOCX, ${stats.md} MD, ${stats.odt} ODT, ${stats.ods} ODS, ${stats.odp} ODP, ${stats.xlsx} XLSX`);
    // Update last sync
    fs.writeFileSync('.vectordb_last_sync', new Date().toISOString());
    end();
    return stats;
  }

  async similaritySearch(query, k = parseInt(process.env.RETRIEVE_K) || 3, filter = undefined) {
    const end = retrievalDuration.startTimer();
    if (!this.store) return [];
    try {
      if (filter && process.env.VECTOR_DB_TYPE === 'chroma') {
        // Chroma requires distinct filter syntax if passing $in
        // But langchainjs might handle it. Let's assume passed filter is compatible or we construct it.
      }
      const results = await this.store.similaritySearchWithScore(query, k, filter);
      const minSimilarity = parseFloat(process.env.MIN_SIMILARITY) || 0.7;
      const filtered = results.filter(([doc, score]) => score >= minSimilarity).map(([doc, score]) => ({ ...doc, score }));
      end();
      return filtered;
    } catch (err) {
      logger.error('Similarity search failed:', err);
      end();
      return [];
    }
  }

  /**
   * Hybrid search combining vector similarity and BM25 keyword matching
   * using Reciprocal Rank Fusion (RRF).
   * Falls back to pure vector search if hybrid is disabled or BM25 index is empty.
   */
  async hybridSearch(query, k = parseInt(process.env.RETRIEVE_K) || 3, filter = undefined) {
    if (!this.useHybridSearch || this.bm25Index.documents.length === 0) {
      return this.similaritySearch(query, k, filter);
    }

    const end = retrievalDuration.startTimer();
    try {
      const candidateCount = Math.max(k * 3, 10);

      // 1. Vector search
      const vectorResults = await this.similaritySearch(query, candidateCount, filter);

      // 2. BM25 search
      const bm25Results = this.bm25Index.search(query, candidateCount, filter);

      // 3. Reciprocal Rank Fusion
      const rrfK = this.hybridRrfK;
      const scoreMap = new Map(); // pageContent → { doc, score }

      vectorResults.forEach((doc, rank) => {
        const key = doc.pageContent;
        const existing = scoreMap.get(key) || { doc, score: 0 };
        existing.score += 1 / (rank + rrfK);
        scoreMap.set(key, existing);
      });

      bm25Results.forEach((doc, rank) => {
        const key = doc.pageContent;
        const existing = scoreMap.get(key) || { doc: { pageContent: doc.pageContent, metadata: doc.metadata }, score: 0 };
        existing.score += 1 / (rank + rrfK);
        scoreMap.set(key, existing);
      });

      const fused = Array.from(scoreMap.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, k)
        .map(entry => ({ ...entry.doc, score: entry.score }));

      end();
      logger.info(`Hybrid search: ${vectorResults.length} vector + ${bm25Results.length} BM25 → ${fused.length} fused results`);
      return fused;
    } catch (err) {
      logger.error('Hybrid search failed, falling back to vector search:', err);
      end();
      return this.similaritySearch(query, k, filter);
    }
  }

  async getImageChunks(query = '', k = 50) {
    if (!this.store) return [];
    try {
      // If query is empty, use a broad search term for all images
      const searchQuery = query || 'image';
      const results = await this.similaritySearch(searchQuery, k);
      // Filter for chunks that start with "Image:"
      const imageChunks = results
        .filter(result => result.pageContent.startsWith('Image:'))
        .map(result => result.pageContent);
      return imageChunks;
    } catch (err) {
      logger.error('Image chunks search failed:', err);
      return [];
    }
  }

  async buildSimpleGraph(docs) {
    const { ChatOpenAI } = require("@langchain/openai");
    // Use current AI provider system - prefer OpenAI-specific key, fallback to general AI key
    const apiKey = process.env.AI_OPENAI_API_KEY || process.env.AI_API_KEY;
    const baseURL = process.env.AI_BASE_URL || 'https://chat-ai.academiccloud.de/v1';

    if (!apiKey) {
      throw new Error('AI_OPENAI_API_KEY or AI_API_KEY environment variable not set for GraphRAG.');
    }

    const llm = new ChatOpenAI({
      model: process.env.EMBEDDING_MODEL || 'gpt-3.5-turbo',
      openAIApiKey: apiKey,
      configuration: { baseURL }
    });
    const prompt = `Extract entities (e.g., Headline, Group) and relations (e.g., related_to) from: ${docs.map(d => d.pageContent).join('\n')}. Output JSON: {nodes: [{id, type, name}], edges: [{from, to, relation}]}`;
    const response = await llm.invoke(prompt);
    return JSON.parse(response.content);
  }

  async getGraphSummary(query, graph) {
    const relevantEdges = graph.edges.filter(e => e.relation.includes(query.toLowerCase()));
    return relevantEdges.map(e => `${graph.nodes.find(n => n.id === e.from).name} ${e.relation} ${graph.nodes.find(n => n.id === e.to).name}`).join('; ');
  }
}

module.exports = new VectorStoreManager();