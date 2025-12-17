const express = require('express');
const router = express.Router();

// Admin auth middleware factory
const adminAuth = (getSession, logAction, options = {}) => async (req, res, next) => {
  const {
    adminCookieName = 'admin_session_token',
    adminRoles = new Set(['admin', 'editor', 'entwickler']),
    adminTokenPrefix = 'admin:',
  } = options;

  let token = req.cookies[adminCookieName];
  if (!token && adminTokenPrefix) {
    const legacy = req.cookies.session_token;
    if (legacy && legacy.startsWith(adminTokenPrefix)) {
      token = legacy;
    }
  }
  const session = token && await getSession(token);
  if (session && adminRoles.has(session.role)) {
    req.user = session.username;
    req.role = session.role;
    logAction(session.username, `${req.method} ${req.originalUrl}`);
    return next();
  }
  res.status(401).json({ error: 'Unauthorized' });
};

// Factory function to create router with dependencies
module.exports = (getSession, logAction, options = {}) => {
  const authMiddleware = adminAuth(getSession, logAction, options);

  const adminRouter = express.Router();

  adminRouter.use(require('./admin/questions.cjs')(authMiddleware));
  adminRouter.use(require('./admin/articles.cjs')(authMiddleware));
  adminRouter.use(require('./admin/archive.cjs')(authMiddleware));
  adminRouter.use(require('./admin/users.cjs')(authMiddleware));

  adminRouter.use(require('./admin/stats.cjs')(authMiddleware));
  adminRouter.use(require('./admin/feedback.cjs')(authMiddleware));
  adminRouter.use(require('./admin/images.cjs')(authMiddleware));
  adminRouter.use(require('./admin/documents.cjs')(authMiddleware));
   adminRouter.use(require('./admin/ai.cjs')(authMiddleware));
     adminRouter.use('/backup', require('./admin/backup.cjs')(authMiddleware));
    adminRouter.use('/conversations', authMiddleware, require('./admin/conversations.cjs'));
    adminRouter.use('/mcp-servers', require('./admin/mcpServers.cjs')(authMiddleware));

   router.use('/admin', adminRouter);

  return router;
};
