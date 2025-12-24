const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');
const express = require("express");
const dotenv = require("dotenv");
const rateLimit = require("express-rate-limit");
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const sharp = require('sharp');
const Joi = require('joi');
const { program } = require('commander');
const winston = require('winston');
const promClient = require('prom-client');
const bcrypt = require('bcryptjs');
const { execSync } = require('child_process');



// --- Initializations ---
dotenv.config();

const UPLOAD_LIMIT_MB = parseInt(process.env.UPLOAD_LIMIT_MB) || 10;

// Env validation
const envSchema = Joi.object({
  VECTOR_DB_TYPE: Joi.string().valid('none', 'chroma', 'weaviate').default('none'),
  CHUNK_SIZE: Joi.number().integer().min(200).max(1000).default(500),
  CHUNK_OVERLAP: Joi.number().integer().min(0).max(200).default(50),
  RETRIEVE_K: Joi.number().integer().min(1).max(10).default(3),
  MIN_SIMILARITY: Joi.number().min(0).max(1).default(0.7),
  SYNC_ON_START: Joi.string().valid('true', 'false').default('false'),
  ENABLE_GRAPHRAG: Joi.string().valid('true', 'false').default('false'),
  CHROMA_URL: Joi.string().when('VECTOR_DB_TYPE', { is: 'chroma', then: Joi.required() }),
  CHROMA_COLLECTION: Joi.string().when('VECTOR_DB_TYPE', { is: 'chroma', then: Joi.required() }),
  WEAVIATE_URL: Joi.string().when('VECTOR_DB_TYPE', { is: 'weaviate', then: Joi.required() }),
  WEAVIATE_COLLECTION: Joi.string().when('VECTOR_DB_TYPE', { is: 'weaviate', then: Joi.required() }),
  PDF_CHUNK_SIZE: Joi.number().integer().min(100).max(1000).default(300),
  PDF_EXTRACT_TEXT_ONLY: Joi.string().valid('true', 'false').default('false'),
  SYNC_BATCH: Joi.number().integer().min(10).max(500).default(100),
  DISPLAY_TOKEN_USED_FOR_QUERY: Joi.string().valid('true', 'false').default('false'),
  EMBEDDING_LIBRARY: Joi.string().valid('xenova', 'huggingface').default('xenova'),
  SESSION_INACTIVITY_TIMEOUT_MINUTES: Joi.number().integer().min(1).max(10080).default(1440),  // 1 min to 1 week
  SESSION_MAX_DURATION_MINUTES: Joi.number().integer().min(1).max(525600).default(43200),  // 1 min to 1 year

  BACKUP_PATH: Joi.string().default('backups'),
  UPLOAD_LIMIT_MB: Joi.number().integer().min(1).max(1000).default(10)
}).unknown(true);

const { error } = envSchema.validate(process.env);
if (error) {
  console.error('Env validation failed:', error.details[0].message);
  process.exit(1);
}

const { prisma } = require('./controllers/db.cjs');

// --- Graceful Shutdown ---
// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await prisma.$disconnect();  // Closes pool connections
  process.exit(0);
});

process.on('SIGINT', async () => {  // Ctrl+C
  console.log('SIGINT received, shutting down gracefully');
  await prisma.$disconnect();
  process.exit(0);
});

// Also handle uncaught errors
process.on('uncaughtException', async (err) => {
  console.error('Uncaught Exception:', err);
  await prisma.$disconnect();
  process.exit(1);
});

// --- Controller Imports (after dotenv) ---
const { streamChat, getSuggestions, testApiKey } = require('./controllers/aiController.cjs');
const feedbackController = require('./controllers/feedbackController.cjs');
const adminController = require('./controllers/adminController.cjs');
const auth = require('./controllers/authController.cjs');
const ADMIN_COOKIE_NAME = auth.ADMIN_SESSION_COOKIE || 'admin_session_token';
const USER_COOKIE_NAME = auth.USER_SESSION_COOKIE || 'session_token';
const ADMIN_ALLOWED_ROLES = auth.ADMIN_ALLOWED_ROLES || new Set(['admin', 'editor', 'entwickler']);
const ADMIN_TOKEN_PREFIX = auth.ADMIN_TOKEN_PREFIX || 'admin:';
const viewController = require('./controllers/viewController.cjs');
const dashboardController = require('./controllers/dashboardController.cjs');
const imageController = require('./controllers/imageController.cjs');
const { swaggerUi, specs } = require('./swagger.js');
const app = express();
// Trust proxy layers for correct client IP detection (default 2: Cloudflare -> Nginx -> Node.js)
app.set('trust proxy', process.env.TRUST_PROXY_COUNT || 2);
const port = process.env.PORT || 3000;

// Set body parser limits
app.use(express.json({ limit: `${UPLOAD_LIMIT_MB}mb` }));
app.use(express.urlencoded({ limit: `${UPLOAD_LIMIT_MB}mb` }));
const useHttps = process.argv.includes('-https');
const isTest = process.argv.includes('--test');
const isDev = process.argv.includes('-dev');

const STATIC_ASSET_MAX_AGE_SECONDS = 60 * 60 * 24 * 14; // 14 days
const staticCacheControl = (res, filePath) => {
  if (filePath.endsWith('.html')) {
    res.set('Cache-Control', 'no-cache, must-revalidate');
  } else {
    res.set('Cache-Control', `public, max-age=${STATIC_ASSET_MAX_AGE_SECONDS}, immutable`);
  }
};
const staticAssetOptions = { setHeaders: staticCacheControl };
const setHtmlNoCache = (res) => {
  res.set('Cache-Control', 'no-cache, must-revalidate');
};

// CLI options
program
  .option('--init-vectordb', 'Initialize/populate vector DB from current articles')
  .option('--sync-vectordb', 'Sync vector DB with recent changes')
  .option('--drop-vectordb', 'Drop/clear vector DB collections');

let options = {};
let cliMode = false;
if (process.argv.some(arg => arg.startsWith('--init') || arg.startsWith('--sync') || arg.startsWith('--drop'))) {
  program.parse();
  options = program.opts();
  cliMode = options.initVectordb || options.dropVectordb || options.syncVectordb;
}
if (options.initVectordb) {
  (async () => {
    try {
      // Ensure DB connection
      await prisma.$connect();
      console.log('DB connected for CLI');
      console.log('Initializing vector DB...');
      const vectorStore = require('./lib/vectorStore');
      const stats = await vectorStore.initVectorDB();
      console.log(`Vector DB initialized successfully: ${stats.chunks} chunks from ${stats.headlines} articles, ${stats.pdfs} PDFs, ${stats.images} images, ${stats.docx} DOCX, ${stats.md} MD, ${stats.odt} ODT, ${stats.ods} ODS, ${stats.odp} ODP, ${stats.xlsx} XLSX synced`);
      process.exit(0);
    } catch (err) {
      console.error('Vector DB initialization failed:', err);
      process.exit(1);
    }
  })();
}
if (options.syncVectordb) {
  (async () => {
    try {
      // Ensure DB connection
      await prisma.$connect();
      console.log('DB connected for CLI');
      console.log('Syncing vector DB...');
      const vectorStore = require('./lib/vectorStore');
      const stats = await vectorStore.syncVectorDB();
      console.log(`Vector DB synced successfully: ${stats.chunks} chunks from ${stats.headlines} articles, ${stats.pdfs} PDFs, ${stats.images} images, ${stats.docx} DOCX, ${stats.md} MD, ${stats.odt} ODT, ${stats.ods} ODS, ${stats.odp} ODP, ${stats.xlsx} XLSX synced`);
      process.exit(0);
    } catch (err) {
      console.error('Vector DB sync failed:', err);
      process.exit(1);
    }
  })();
}
if (options.dropVectordb) {
  (async () => {
    try {
      console.log('Dropping vector DB...');
      const vectorStore = require('./lib/vectorStore');
      await vectorStore.dropVectorDB();
      console.log('Vector DB dropped successfully');
      process.exit(0);
    } catch (err) {
      console.error('Vector DB drop failed:', err);
      process.exit(1);
    }
  })();
}

// --- Logging ---
const logDir = path.resolve(__dirname, 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}
const auditLog = path.resolve(__dirname, 'logs/audit.log');
function logAction(user, action) {
  const line = `[${new Date().toISOString()}] ${user} ${action}\n`;
  fs.appendFile(auditLog, line, (err) => {
    if (err) console.error('Audit log error:', err);
  });
}

// --- Security & Rate Limiting ---
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 600,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/validate' || req.path === '/admin/validate',
});

const dashboardLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Higher limit for dashboard API calls
  standardHeaders: true,
  legacyHeaders: false,
});

const loginLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  message: { error: "Too many login attempts from this IP, please try again after an hour" },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Only count failed login attempts
});

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net", "https://cdn.tailwindcss.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "https://picsum.photos"],
      connectSrc: ["'self'", "https://fonts.googleapis.com", "https://fonts.gstatic.com"],
      fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"]
    }
  }
}));
app.use(cookieParser());
app.use(express.json());


// Attach image controller routes
imageController(app);

// --- Middleware ---
if (isDev) {
  app.use((req, res, next) => {
    if (req.path.match(/\.(js|css|html)$/)) {
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
    }
    next();
  });
}

// --- Static Files ---
// IMPORTANT: Serve static files before any protection middleware
app.use((req, res, next) => {
  if (req.url.startsWith('/admin') || req.url.startsWith('/dash')) {
    return next();
  }
  express.static(path.join(__dirname, '..', 'dist'), staticAssetOptions)(req, res, next);
});

// Serve main bot page
app.get('/', (req, res) => {
  setHtmlNoCache(res);
  if (process.env.USE_NEW_UI === 'true') {
    res.sendFile(path.join(__dirname, '..', 'dist', 'src', 'new-ui', 'index.html'));
  } else {
    res.sendFile(path.join(__dirname, '..', 'dist', 'src', 'bot', 'index.html'));
  }
});

// --- Protection Middleware ---
const requireAuth = (loginPath) => async (req, res, next) => {
  try {
    const token = req.cookies[USER_COOKIE_NAME];
    if (!token) {
      // Not logged in
      if (req.url.startsWith('/api/')) {
        return res.status(401).json({ error: 'Session expired. Please log in.' });
      }
      return res.redirect(loginPath);
    }
    const session = await auth.getSession(token);
    if (session) {
      req.session = session;
      return next();
    } else {
      // Not logged in or expired
      if (req.url.startsWith('/api/')) {
        return res.status(401).json({ error: 'Session expired. Please log in.' });
      }
      return res.redirect(loginPath);
    }
  } catch (err) {
    console.error('Auth error:', err);
    if (req.url.startsWith('/api/')) {
      return res.status(401).json({ error: 'Session error. Please log in.' });
    }
    return res.redirect('/login/');
  }
};

const requireRole = (role, insufficientPath) => async (req, res, next) => {
  try {
    const originalUrl = req.originalUrl || req.baseUrl || req.url;
    const isDocsRoute = originalUrl.startsWith('/api/docs');
    const isApiRoute = originalUrl.startsWith('/api/');
    const redirectToLogin = () => res.redirect(`/login/?redirect=${encodeURIComponent(originalUrl)}`);
    let token = req.cookies[ADMIN_COOKIE_NAME];
    if (!token && ADMIN_TOKEN_PREFIX) {
      const legacy = req.cookies[USER_COOKIE_NAME];
      if (legacy && legacy.startsWith(ADMIN_TOKEN_PREFIX)) {
        token = legacy;
      }
    }

    if (!token) {
      // Not logged in
      if (isApiRoute && !isDocsRoute) {
        return res.status(401).json({ error: 'Session expired. Please log in.' });
      }
      return redirectToLogin();
    }
    const session = await auth.getSession(token);
    if (session) {
      if (session.role === role) {
        req.session = session;
        return next();
      } else {
        // Insufficient permissions
        if (isApiRoute && !isDocsRoute) {
          return res.status(403).json({ error: 'Insufficient permissions. Please log in as a different user.' });
        }
        return res.redirect(insufficientPath);
      }
    } else {
      // Not logged in or expired
      if (isApiRoute && !isDocsRoute) {
        return res.status(401).json({ error: 'Session expired. Please log in.' });
      }
      return redirectToLogin();
    }
  } catch (err) {
    console.error('Auth error:', err);
    const originalUrl = req.originalUrl || req.baseUrl || req.url;
    const isDocsRoute = originalUrl.startsWith('/api/docs');
    if (originalUrl.startsWith('/api/') && !isDocsRoute) {
      return res.status(401).json({ error: 'Session error. Please log in.' });
    }
    return res.redirect(`/login/?redirect=${encodeURIComponent(originalUrl)}`);
  }
};

const protect = (req, res, next) => {
  // Allow access to login pages and insufficient permissions page
  if (req.url.startsWith('/login') || req.url.startsWith('/insufficient-permissions')) {
    return next();
  }

  // Dashboard routes require admin role
  if (req.url.startsWith('/dash') || req.url.startsWith('/api/dashboard')) {
    let token = req.cookies[ADMIN_COOKIE_NAME];
    if (!token && ADMIN_TOKEN_PREFIX) {
      const legacy = req.cookies[USER_COOKIE_NAME];
      if (legacy && legacy.startsWith(ADMIN_TOKEN_PREFIX)) {
        token = legacy;
      }
    }
    if (!token) {
      return res.redirect('/login/?redirect=' + encodeURIComponent(req.originalUrl));
    }
    auth.getSession(token).then(session => {
      if (session && session.role === 'admin') {
        req.session = session;
        next();
      } else {
        res.redirect('/insufficient-permissions');
      }
    }).catch(err => {
      console.error('Auth error:', err);
      res.redirect('/login/');
    });
    return;
  }

  // Admin routes require authentication
  if (req.url.startsWith('/admin')) {
    let token = req.cookies[ADMIN_COOKIE_NAME];
    if (!token && ADMIN_TOKEN_PREFIX) {
      const legacy = req.cookies[USER_COOKIE_NAME];
      if (legacy && legacy.startsWith(ADMIN_TOKEN_PREFIX)) {
        token = legacy;
      }
    }
    if (!token) {
      return res.redirect('/login/?redirect=' + encodeURIComponent(req.originalUrl));
    }
    auth.getSession(token).then(session => {
      if (session && ADMIN_ALLOWED_ROLES.has(session.role)) {
        req.session = session;
        next();
      } else {
        res.redirect('/insufficient-permissions');
      }
    }).catch(err => {
      console.error('Auth error:', err);
      res.redirect('/login/?redirect=' + encodeURIComponent(req.originalUrl));
    });
    return;
  }

  // Allow other routes
  return next();
};
app.use(protect);

// --- Dashboard Routes ---

// --- Static Files ---

// --- API Routes ---
app.use('/api/dashboard', dashboardLimiter); // Dashboard limiter FIRST
// app.use('/api/login', loginLimiter); // Disabled for testing
// app.use('/api', apiLimiter); // General limiter LAST

// API Documentation (admin only)
app.use('/api/docs', requireRole('admin', '/insufficient-permissions'), swaggerUi.serve, swaggerUi.setup(specs));

// --- API Routes ---
app.use('/api/dashboard', dashboardLimiter); // Dashboard limiter FIRST
app.use('/api/login', loginLimiter); // Login limiter
app.use('/api/admin/login', loginLimiter); // Admin login limiter
app.use('/api', apiLimiter); // General limiter LAST

app.post('/api/chat', streamChat);
app.post('/api/test-api-key', testApiKey);
app.get('/api/suggestions', getSuggestions);
app.use('/api/feedback', feedbackController);
app.use('/api', auth.router);
app.use('/api', adminController(auth.getSession, logAction, {
  adminCookieName: ADMIN_COOKIE_NAME,
  adminRoles: ADMIN_ALLOWED_ROLES,
  adminTokenPrefix: ADMIN_TOKEN_PREFIX,
}));
app.use('/api/dashboard', dashboardController);
app.get("/api/view/articles", viewController.getPublishedArticles);

// --- Dashboard Routes ---
app.use('/dash', express.static(path.join(__dirname, '..', 'dist', 'src', 'dash'), staticAssetOptions));
app.get('/dash', async (req, res) => {
  let token = req.cookies[ADMIN_COOKIE_NAME];
  if (!token && ADMIN_TOKEN_PREFIX) {
    const legacy = req.cookies[USER_COOKIE_NAME];
    if (legacy && legacy.startsWith(ADMIN_TOKEN_PREFIX)) {
      token = legacy;
    }
  }
  const session = token && await auth.getSession(token);
  if (!session || session.role !== 'admin') {
    return res.redirect('/login/?redirect=' + encodeURIComponent(req.originalUrl));
  }
  setHtmlNoCache(res);
  res.sendFile(path.join(__dirname, '..', 'dist', 'src', 'dash', 'index.html'));
});

// --- Admin Routes ---
app.get('/login', (req, res) => {
  setHtmlNoCache(res);
  res.sendFile(path.join(__dirname, '..', 'dist', 'src', 'login', 'index.html'));
});
app.get('/admin', async (req, res) => {
  let token = req.cookies[ADMIN_COOKIE_NAME];
  if (!token && ADMIN_TOKEN_PREFIX) {
    const legacy = req.cookies[USER_COOKIE_NAME];
    if (legacy && legacy.startsWith(ADMIN_TOKEN_PREFIX)) {
      token = legacy;
    }
  }
  const session = token && await auth.getSession(token);
  if (!session || !ADMIN_ALLOWED_ROLES.has(session.role)) {
    return res.redirect('/login/?redirect=' + encodeURIComponent(req.originalUrl));
  }
  setHtmlNoCache(res);
  res.sendFile(path.join(__dirname, '..', 'dist', 'src', 'admin', 'index.html'));
});

// --- Insufficient Permissions Route ---
app.get('/insufficient-permissions', (req, res) => {
  res.redirect('/login/');
});

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Server-Status überprüfen
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Server ist gesund
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 */
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * @swagger
 * /api/vector-health:
 *   get:
 *     summary: Vector Database Status überprüfen
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Vector DB ist verfügbar
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 connected:
 *                   type: boolean
 *       500:
 *         description: Vector DB Fehler
 */
app.get('/api/vector-health', async (req, res) => {
  try {
    const vectorStore = require('./lib/vectorStore');
    if (vectorStore.store) {
      const test = await vectorStore.similaritySearch('test', 1);
      res.json({ status: 'ok', connected: true });
    } else {
      res.json({ status: 'disabled' });
    }
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// --- Prometheus Metrics ---
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});



// --- Protected Static Files ---
app.use('/admin', async (req, res, next) => {
  let token = req.cookies[ADMIN_COOKIE_NAME];
  if (!token && ADMIN_TOKEN_PREFIX) {
    const legacy = req.cookies[USER_COOKIE_NAME];
    if (legacy && legacy.startsWith(ADMIN_TOKEN_PREFIX)) {
      token = legacy;
    }
  }
  const session = token && await auth.getSession(token);
  if (session && ADMIN_ALLOWED_ROLES.has(session.role)) {
    return next();
  }
  // Redirect to the login route so Express can serve the page (dist/src/login/index.html)
  res.redirect('/login/');
}, express.static(path.join(__dirname, '..', 'dist', 'src', 'admin'), staticAssetOptions));

// --- Uploads Static ---
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
app.use('/uploads/images', express.static(path.join(__dirname, '..', 'uploads', 'images')));

// --- Backup Static ---
app.use('/backup', async (req, res, next) => {
  let token = req.cookies[ADMIN_COOKIE_NAME];
  if (!token && ADMIN_TOKEN_PREFIX) {
    const legacy = req.cookies[USER_COOKIE_NAME];
    if (legacy && legacy.startsWith(ADMIN_TOKEN_PREFIX)) {
      token = legacy;
    }
  }
  const session = token && await auth.getSession(token);
  if (session && session.role === 'admin') {
    return next();
  }
  res.status(403).json({ error: 'Forbidden' });
}, express.static(path.join(__dirname, '..', process.env.BACKUP_PATH || 'backups')));

// --- Favicon & 404 ---
app.get('/favicon.ico', (req, res) => res.status(204).end());

module.exports = app;

// --- Server Start ---
const serverCallback = async () => {
  // Auth sessions and dashboard tables are now handled by Prisma schema
  // Removed manual table creation scripts as Prisma manages the schema

  // Check DB and apply migrations if needed
  const currentVersion = require('../package.json').version;

  // Connect to database and check version
  try {
    await prisma.$connect();
    console.log('✓ Database connection established');

    // Check app version
    let latestVersion;
    try {
      latestVersion = await prisma.app_versions.findFirst({ orderBy: { id: 'desc' } });
    } catch (e) {
      console.log('\n\nDatabase tables not yet initialized (expected on first run), creating them now...\n\n');
      // If table doesn't exist, latestVersion remains undefined, will trigger db push
    }
    if (!latestVersion) {
      // First run on empty DB, use db push
      console.log('Initializing database with schema...');
      execSync('npx prisma db push', { stdio: 'inherit' });
      console.log('✓ Database initialized');
    } else if (latestVersion.version !== currentVersion) {
      // Version change, use migrate deploy
      console.log('App version changed, applying migrations...');
      execSync('npx prisma migrate deploy', { stdio: 'inherit' });
      console.log('✓ Migrations applied');
    }
  } catch (error) {
    console.log('Database not found or connection failed, initializing with schema push...');
    execSync('npx prisma db push', { stdio: 'inherit' });
    console.log('✓ Database initialized with schema push');
  }

  // Sync auto-increment sequences if PostgreSQL
  if (process.env.DATABASE_URL.startsWith('postgres')) {
    console.log('Syncing auto-increment sequences...');
    try {
      const tables = [
        'hochschuhl_abc', 'questions', 'messages', 'feedback', 'documents', 'images',
        'article_views', 'page_views', 'daily_question_stats', 'daily_unanswered_stats', 'question_analysis_cache',
        'token_usage', 'user_sessions', 'chat_interactions', 'users'
      ];
      for (const table of tables) {
        try {
          const result = await prisma.$queryRawUnsafe(`SELECT MAX(id) as max_id FROM ${table}`);
          const maxId = result[0]?.max_id || 0;
          if (typeof maxId === 'number' && maxId >= 0) {
            await prisma.$queryRawUnsafe(`ALTER SEQUENCE ${table}_id_seq RESTART WITH ${maxId + 1}`);
            console.log(`✓ Synced sequence for ${table} to ${maxId + 1}`);
          } else {
            console.log(`⚠ Skipped ${table}: invalid max_id ${maxId}`);
          }
        } catch (err) {
          console.log(`⚠ Failed to sync ${table}: ${err.message}`);
        }
      }
      console.log('✓ Auto-increment sequences synced');
    } catch (err) {
      console.warn('Sequence sync failed (may not be critical):', err.message);
    }
  }

  // Update app version
  try {
    await prisma.app_versions.upsert({
      where: { version: currentVersion },
      update: {},
      create: { version: currentVersion }
    });
  } catch (error) {
    console.error('Warning: Could not update app version:', error.message);
  }

  // Create default admin user if no users exist
  const userCount = await prisma.users.count();
  if (userCount === 0) {
    const hashedPassword = await bcrypt.hash('admin', 10);
    await prisma.users.create({
      data: {
        username: 'admin',
        password: hashedPassword,
        role: 'admin',
      },
    });
    console.log('✓ Default admin user created (username: admin, password: admin)');
  }

  // Sync vector DB if enabled
  if (process.env.SYNC_ON_START === 'true') {
    try {
      const vectorStore = require('./lib/vectorStore');
      await vectorStore.syncFromDB();
      console.log('✓ Vector DB synced on startup');
    } catch (error) {
      console.error('Warning: Could not sync vector DB:', error.message);
    }
  }

  // Cleanup expired sessions on startup
  try {
    await auth.cleanupExpiredSessions();
    console.log('✓ Expired sessions cleaned up');
  } catch (error) {
    console.error('Warning: Could not cleanup sessions:', error.message);
  }

  // Periodic cleanup every hour
  setInterval(async () => {
    try {
      await auth.cleanupExpiredSessions();
    } catch (error) {
      console.error('Periodic session cleanup error:', error);
    }
  }, 60 * 60 * 1000); // 1 hour

  console.log(`Server is running with ${useHttps ? 'HTTPS' : 'HTTP'} on port ${port}`);
};

const startServer = () => {
  if (!cliMode && !isTest && process.env.NODE_ENV !== 'test') {
    if (useHttps) {
      try {
        const httpsOptions = {
          key: fs.readFileSync(path.join(os.homedir(), '.ssh', 'key.pem')),
          cert: fs.readFileSync(path.join(os.homedir(), '.ssh', 'cert.pem'))
        };
        https.createServer(httpsOptions, app).listen(port, serverCallback);
      } catch (e) {
        console.error("Could not start HTTPS server. Do you have key.pem and cert.pem in your .ssh directory?", e);
        process.exit(1);
      }
    } else {
      app.listen(port, serverCallback);
    }
  }
};

startServer();
