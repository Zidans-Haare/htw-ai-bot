const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const Joi = require('joi');
const { User, AuthSession, UserProfiles } = require('./db.cjs');

const USER_SESSION_COOKIE = 'session_token';
const ADMIN_SESSION_COOKIE = 'admin_session_token';
const ADMIN_COOKIE_NAME = process.env.ADMIN_COOKIE_NAME || 'admin_session_token';
const ADMIN_TOKEN_PREFIX = 'admin:';
const ADMIN_ALLOWED_ROLES = new Set(['admin', 'manager', 'editor', 'entwickler']);

// Session timeout configurations (in milliseconds)
const SESSION_INACTIVITY_TIMEOUT_MS = (parseInt(process.env.SESSION_INACTIVITY_TIMEOUT_MINUTES) || 1440) * 60 * 1000;
const SESSION_MAX_DURATION_MS = (parseInt(process.env.SESSION_MAX_DURATION_MINUTES) || 43200) * 60 * 1000;

function buildSessionToken(scope = 'user') {
  const raw = crypto.randomBytes(32).toString('hex');
  return scope === 'admin' ? `${ADMIN_TOKEN_PREFIX}${raw}` : raw;
}

function setSessionCookie(res, name, token) {
  const secureCookie = true;
  const sameSite = 'strict';
  res.cookie(name, token, {
    httpOnly: true,
    secure: secureCookie,
    maxAge: SESSION_INACTIVITY_TIMEOUT_MS,
    sameSite,
    path: '/',
  });
}

function clearSessionCookie(res, name) {
  res.clearCookie(name, { httpOnly: true, secure: true, sameSite: 'strict', path: '/' });
}

async function createSession(userId, options = {}) {
  const scope = options.scope || 'user';
  const token = buildSessionToken(scope);
  const expiresAt = new Date(Date.now() + SESSION_MAX_DURATION_MS);
  try {
    await AuthSession.create({
      data: {
        user_id: userId,
        token,
        expires_at: expiresAt
      }
    });
    return token;
  } catch (err) {
    console.error('Create session error:', err);
    throw err;
  }
}

async function destroySession(token) {
  try {
    await AuthSession.deleteMany({ where: { token } });
  } catch (err) {
    console.error('Destroy session error:', err);
  }
}

async function getSession(token) {
  try {
    const session = await AuthSession.findFirst({
      where: { token },
      include: { user: { select: { id: true, username: true, role: true, permissions: true } } }
    });
    if (!session) {
      return null;
    }

    const now = new Date();
    const updatedAt = new Date(session.updated_at);
    const createdAt = new Date(session.created_at);

    // Check inactivity (using updated_at as last activity)
    if (now.getTime() - updatedAt.getTime() > SESSION_INACTIVITY_TIMEOUT_MS) {
      await AuthSession.deleteMany({ where: { token } });
      return null;
    }

    // Check max usage
    if (now.getTime() - createdAt.getTime() > SESSION_MAX_DURATION_MS) {
      await AuthSession.deleteMany({ where: { token } });
      return null;
    }

    // Check expiration
    const expiresAt = new Date(session.expires_at);
    if (now > expiresAt) {
      await AuthSession.deleteMany({ where: { token } });
      return null;
    }

    // Update last activity (updated_at)
    await AuthSession.updateMany({
      where: { token },
      data: {}
    }); // updated_at auto-updates

    return {
      userId: session.user.id,
      username: session.user.username,
      role: session.user.role,
      permissions: session.user.permissions
    };
  } catch (err) {
    console.error('Get session error:', err);
    return null;
  }
}

async function cleanupExpiredSessions() {
  try {
    const now = new Date();
    const result = await AuthSession.deleteMany({
      where: {
        OR: [
          { expires_at: { lt: now } },
          { updated_at: { lt: new Date(now.getTime() - SESSION_INACTIVITY_TIMEOUT_MS) } },
          { created_at: { lt: new Date(now.getTime() - SESSION_MAX_DURATION_MS) } }
        ]
      }
    });
  } catch (err) {
    console.error('Cleanup sessions error:', err);
  }
}

async function verifyUser(username, password) {
  try {
    const user = await User.findFirst({ where: { username } });
    if (!user) return null;
    const match = await bcrypt.compare(password, user.password);
    if (!match) return null;
    return { id: user.id, username: user.username, role: user.role, permissions: user.permissions };
  } catch (err) {
    console.error('Verify user error:', err);
    throw err;
  }
}

async function createUser(username, password, role = 'user', permissions = []) {
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({ data: { username, password: hashedPassword, role, permissions } });
    await ensureUserProfile(user.id);
    return { id: user.id, username: user.username, role: user.role, permissions: user.permissions };
  } catch (err) {
    console.error('Create user error:', err);
    throw err;
  }
}

async function ensureUserProfile(userId) {
  let profile = await UserProfiles.findUnique({ where: { user_id: userId } });
  if (!profile) {
    profile = await UserProfiles.create({
      data: {
        user_id: userId,
        mensa_preferences: {
          vegetarian: false,
          vegan: false,
          glutenFree: false,
          favoriteCanteens: []
        },
        favorite_prompts: [],
        shortcuts: [],
        ui_settings: {}
      }
    });
  }
  return profile;
}

async function getUserProfile(userId) {
  return ensureUserProfile(userId);
}

const profileUpdateSchema = Joi.object({
  display_name: Joi.string().max(120).allow(null, ''),
  mensa_preferences: Joi.object({
    vegetarian: Joi.boolean().default(false),
    vegan: Joi.boolean().default(false),
    glutenFree: Joi.boolean().default(false),
    favoriteCanteens: Joi.array().items(Joi.number().integer()).max(10).default([])
  }).default({}),
  favorite_prompts: Joi.array().items(
    Joi.object({
      title: Joi.string().max(80).required(),
      prompt: Joi.string().max(500).required()
    })
  ).max(12).default([]),
  ui_settings: Joi.object().unknown(true).default({})
});

function requireAuth(req, res, next) {
  const token = req.cookies[USER_SESSION_COOKIE];
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  getSession(token).then(session => {
    if (!session) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    req.auth = session;
    next();
  }).catch(err => {
    console.error('Session check failed:', err);
    res.status(500).json({ error: 'Session validation failed' });
  });
}

async function listUsers(offset = 0) {
  try {
    const users = await User.findMany({
      select: { id: true, username: true, role: true, permissions: true, created_at: true },
      take: 100,
      skip: offset,
      orderBy: { created_at: 'desc' }
    });
    return users;
  } catch (err) {
    console.error('List users error:', err);
    throw err;
  }
}

async function updateUserPassword(username, newPassword) {
  try {
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await User.updateMany({
      where: { username },
      data: { password: hashedPassword }
    });
  } catch (err) {
    console.error('Update user password error:', err);
    throw err;
  }
}

async function deleteUser(username) {
  try {
    await User.deleteMany({ where: { username } });
  } catch (err) {
    console.error('Delete user error:', err);
    throw err;
  }
}

async function updateUserPermissions(userId, role, permissions) {
  try {
    const data = {};
    if (role) data.role = role;
    if (permissions) data.permissions = permissions;

    const user = await User.update({
      where: { id: userId },
      data
    });
    return { id: user.id, username: user.username, role: user.role, permissions: user.permissions };
  } catch (err) {
    console.error('Update user permissions error:', err);
    throw err;
  }
}

/**
 * @swagger
 * /api/login:
 *   post:
 *     summary: Benutzer anmelden
 *     tags: [Authentifizierung]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Erfolgreiche Anmeldung
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 role:
 *                   type: string
 *       400:
 *         description: Fehlende Anmeldedaten
 *       401:
 *         description: Ungültige Anmeldedaten
 *       500:
 *         description: Serverfehler
 */
router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Missing credentials' });
  }
  try {
    const user = await verifyUser(username, password);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = await createSession(user.id, { scope: 'user' });
    setSessionCookie(res, USER_SESSION_COOKIE, token);
    // Do not touch admin cookie here to allow parallel sessions
    const profile = await getUserProfile(user.id);
    res.json({ role: user.role, permissions: user.permissions, profile: serializeProfile(profile) });
  } catch (err) {
    console.error('Login failed:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

router.post('/admin/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Missing credentials' });
  }
  try {
    const user = await verifyUser(username, password);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    if (!ADMIN_ALLOWED_ROLES.has(user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions for admin login' });
    }
    const token = await createSession(user.id, { scope: 'admin' });
    setSessionCookie(res, ADMIN_SESSION_COOKIE, token);
    // Ensure bot/login session does not leak admin rights
    clearSessionCookie(res, USER_SESSION_COOKIE);
    const profile = await getUserProfile(user.id);
    res.json({ role: user.role, permissions: user.permissions, profile: serializeProfile(profile) });
  } catch (err) {
    console.error('Admin login failed:', err);
    res.status(500).json({ error: 'Admin login failed' });
  }
});

const registrationSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).max(100).required(),
  displayName: Joi.string().max(120).allow('', null),
});

router.post('/register', async (req, res) => {
  const { error: validationError, value } = registrationSchema.validate(req.body || {});
  if (validationError) {
    return res.status(400).json({ error: 'Invalid registration data', details: validationError.details.map(d => d.message) });
  }

  const username = value.email.toLowerCase();

  try {
    const existing = await User.findFirst({ where: { username } });
    if (existing) {
      return res.status(409).json({ error: 'Benutzer existiert bereits' });
    }

    const user = await createUser(username, value.password, 'user');
    let profile = await getUserProfile(user.id);
    if (value.displayName) {
      profile = await UserProfiles.update({
        where: { user_id: user.id },
        data: { display_name: value.displayName }
      });
    }

    const token = await createSession(user.id, { scope: 'user' });
    setSessionCookie(res, USER_SESSION_COOKIE, token);

    res.status(201).json({ role: user.role, permissions: user.permissions, profile: serializeProfile(profile) });
  } catch (err) {
    console.error('Registration failed:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

/**
 * @swagger
 * /api/validate:
 *   get:
 *     summary: Session validieren
 *     tags: [Authentifizierung]
 *     responses:
 *       200:
 *         description: Session ist gültig
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 valid:
 *                   type: boolean
 *                 username:
 *                   type: string
 *                 role:
 *                   type: string
 *       401:
 *         description: Ungültige oder abgelaufene Session
 */
router.get('/validate', async (req, res) => {
  const token = req.cookies[USER_SESSION_COOKIE];
  const session = token && await getSession(token);
  if (session) {
    const profile = await getUserProfile(session.userId);
    res.json({ valid: true, username: session.username, role: session.role, permissions: session.role, profile: serializeProfile(profile) });
  } else {
    res.status(401).json({ valid: false, error: 'Invalid or expired token' });
  }
});

router.get('/admin/validate', async (req, res) => {
  let token = req.cookies[ADMIN_SESSION_COOKIE];
  if (!token) {
    const legacy = req.cookies[USER_SESSION_COOKIE];
    if (legacy && legacy.startsWith(ADMIN_TOKEN_PREFIX)) {
      token = legacy;
    }
  }
  const session = token && await getSession(token);
  if (session && ADMIN_ALLOWED_ROLES.has(session.role)) {
    const profile = await getUserProfile(session.userId);
    res.json({ valid: true, username: session.username, role: session.role, permissions: session.permissions, profile: serializeProfile(profile) });
  } else {
    res.status(401).json({ valid: false, error: 'Invalid or expired token' });
  }
});

router.get('/profile', requireAuth, async (req, res) => {
  try {
    const profile = await getUserProfile(req.auth.userId);
    res.json({ profile: serializeProfile(profile) });
  } catch (err) {
    console.error('Fetch profile failed:', err);
    res.status(500).json({ error: 'Profil konnte nicht geladen werden' });
  }
});

router.put('/profile', requireAuth, async (req, res) => {
  const { error: validationError, value } = profileUpdateSchema.validate(req.body || {}, { abortEarly: false });
  if (validationError) {
    return res.status(400).json({ error: 'Ungültige Profildaten', details: validationError.details.map(d => d.message) });
  }

  const updateData = {
    display_name: value.display_name || null,
    mensa_preferences: value.mensa_preferences,
    favorite_prompts: value.favorite_prompts,
    ui_settings: value.ui_settings,
  };

  try {
    const profile = await UserProfiles.update({
      where: { user_id: req.auth.userId },
      data: updateData,
    });
    res.json({ profile: serializeProfile(profile) });
  } catch (err) {
    console.error('Update profile failed:', err);
    res.status(500).json({ error: 'Profil konnte nicht gespeichert werden' });
  }
});

/**
 * @swagger
 * /api/logout:
 *   post:
 *     summary: Benutzer abmelden
 *     tags: [Authentifizierung]
 *     responses:
 *       200:
 *         description: Erfolgreiche Abmeldung
 */
router.post('/logout', async (req, res) => {
  const token = req.cookies[USER_SESSION_COOKIE];
  if (token) {
    await destroySession(token);
  }
  clearSessionCookie(res, USER_SESSION_COOKIE);
  res.json({ success: true });
});

router.post('/admin/logout', async (req, res) => {
  let token = req.cookies[ADMIN_SESSION_COOKIE];
  if (!token) {
    const legacy = req.cookies[USER_SESSION_COOKIE];
    if (legacy && legacy.startsWith(ADMIN_TOKEN_PREFIX)) {
      token = legacy;
    }
  }
  if (token) {
    await destroySession(token);
  }
  clearSessionCookie(res, ADMIN_SESSION_COOKIE);
  res.json({ success: true });
});

function serializeProfile(profile) {
  if (!profile) return null;
  const mensaPreferences = profile.mensa_preferences || {};
  const favoritePrompts = Array.isArray(profile.favorite_prompts) ? profile.favorite_prompts : [];
  const uiSettings = profile.ui_settings || {};

  return {
    displayName: profile.display_name || null,
    mensaPreferences,
    favoritePrompts,
    uiSettings,
  };
}

module.exports = {
  router,
  getSession,
  createSession,
  verifyUser,
  createUser,
  listUsers,
  updateUserPassword,
  updateUserPermissions,
  deleteUser,
  cleanupExpiredSessions,
  getUserProfile,
  requireAuth,
  ensureUserProfile,
  USER_SESSION_COOKIE,
  ADMIN_SESSION_COOKIE,
  ADMIN_ALLOWED_ROLES,
  ADMIN_TOKEN_PREFIX
};
