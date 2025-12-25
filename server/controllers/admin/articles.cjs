const express = require('express');
const router = express.Router();
const { HochschuhlABC, Questions } = require('../db.cjs');

module.exports = (adminAuth) => {
  router.post('/move', adminAuth, async (req, res) => {
    const { question, answer, articleId, newArticle } = req.body;
    if (!question || !answer || (!articleId && !newArticle)) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
      let entry;
      if (newArticle) {
        entry = await HochschuhlABC.create({
          data: {
            article: newArticle,
            description: `**${question}**\n${answer}`,
            editor: req.user.username,
            active: true,
            access_level: 'employee',
            archived: null
          }
        });
      } else {
        entry = await HochschuhlABC.findUnique({ where: { id: parseInt(articleId) } });
        if (!entry) {
          return res.status(404).json({ error: 'Article not found' });
        }
        await HochschuhlABC.update({
          where: { id: parseInt(articleId) },
          data: {
            description: entry.description + `\n\n**${question}**\n${answer}`,
            editor: req.user.username
          }
        });
        entry.id = articleId; // for return
      }

      await Questions.updateMany({
        where: { question },
        data: { archived: true }
      });

      res.json({ success: true, entryId: entry.id });
    } catch (err) {
      console.error('Failed to move question:', err);
      res.status(500).json({ error: 'Failed to move question' });
    }
  });

  router.get('/articles', adminAuth, async (req, res) => {
    try {
      const where = { active: true };
      const { q } = req.query;
      if (q) {
        where.OR = [
          { article: { contains: q } },
          { description: { contains: q } },
          { editor: { contains: q } }
        ];
      }
      const offset = parseInt(req.query.offset) || 0;
      const articles = await HochschuhlABC.findMany({
        select: { id: true, article: true, description: true, access_level: true },
        where,
        orderBy: { updated_at: 'desc' },
        take: 100,
        skip: offset
      });
      res.json(articles);
    } catch (err) {
      console.error('Failed to load articles:', err);
      res.status(500).json({ error: 'Failed to load articles' });
    }
  });

  router.get('/entries/:id', adminAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid ID' });
    }
    try {
      const entry = await HochschuhlABC.findUnique({ where: { id } });
      if (!entry) return res.status(404).json({ error: 'Entry not found' });
      res.json(entry);
    } catch (err) {
      console.error('Failed to load entry:', err);
      res.status(500).json({ error: 'Failed to load entry' });
    }
  });

  router.post('/entries', adminAuth, async (req, res) => {
    const { article, description, active } = req.body;
    if (!article || !description) {
      return res.status(400).json({ error: 'Article and description are required' });
    }
    try {
      const entry = await HochschuhlABC.create({
        data: {
          article,
          description,
          editor: req.user,
          active: active !== false,
          access_level: req.body.access_level || 'employee',
          archived: null
        }
      });
      res.status(201).json(entry);
    } catch (err) {
      console.error('Failed to create entry:', err);
      res.status(500).json({ error: 'Failed to create entry' });
    }
  });

  router.put('/entries/:id', adminAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid ID' });
    }
    const { article, description, active } = req.body;
    if (!article || !description) {
      return res.status(400).json({ error: 'Article and description are required' });
    }
    try {
      const oldEntry = await HochschuhlABC.findUnique({ where: { id } });
      if (!oldEntry) return res.status(404).json({ error: 'Entry not found' });
      await HochschuhlABC.update({
        where: { id },
        data: { active: false, archived: new Date() }
      });
      const newEntry = await HochschuhlABC.create({
        data: {
          article,
          description,
          editor: req.user,
          active: active !== false,
          access_level: req.body.access_level || 'employee',
          archived: null
        }
      });
      res.json(newEntry);
    } catch (err) {
      console.error('Failed to update entry:', err);
      res.status(500).json({ error: 'Failed to update entry' });
    }
  });

  router.delete('/entries/:id', adminAuth, async (req, res) => {
    try {
      const entry = await HochschuhlABC.findUnique({ where: { id: parseInt(req.params.id) } });
      if (!entry) return res.status(404).json({ error: 'Entry not found' });
      await HochschuhlABC.update({
        where: { id: parseInt(req.params.id) },
        data: { active: false, archived: new Date() }
      });
      res.json({ success: true });
    } catch (err) {
      console.error('Failed to delete entry:', err);
      res.status(500).json({ error: 'Failed to delete entry' });
    }
  });

  return router;
};
