const express = require('express');
const { HochschuhlABC } = require('../db.cjs');
const { chatCompletion } = require('../../utils/aiProvider');
const vectorStore = require('../../lib/vectorStore');

module.exports = (authMiddleware) => {
  const router = express.Router();

  router.post('/sync-vector-db', authMiddleware, async (req, res) => {
    try {
      const stats = await vectorStore.syncVectorDB();
      res.json({ success: true, stats });
    } catch (error) {
      console.error('Vector DB Sync failed:', error);
      res.status(500).json({ error: 'Sync failed: ' + error.message });
    }
  });

  const hasServerKey = Boolean(process.env.AI_API_KEY);
  if (!hasServerKey) {
    console.error('AI_API_KEY is not set. The AI feature will not work.');
    router.post('/analyze-text', authMiddleware, (req, res) => {
      res.status(500).json({ error: 'AI feature is not configured on the server.' });
    });
    router.post('/improve-text', authMiddleware, (req, res) => {
      res.status(500).json({ error: 'AI feature is not configured on the server.' });
    });
    return router;
  }





  router.post('/analyze-text', authMiddleware, async (req, res) => {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'No text provided' });
    }

    try {
      const allArticles = await HochschuhlABC.findMany({
        select: { article: true, description: true },
        where: { active: true },
      });
      const context = allArticles.map(a => `Überschrift: ${a.article}\nText: ${a.description}`).join('\n\n---\n\n');

      const prompt = `Du bist ein Lektor für die Wissensdatenbank einer Hochschule. Analysiere den folgenden Text und gib deine Antwort AUSSCHLIESSLICH als valides JSON-Objekt mit dem Schema {"correctedText": "", "corrections": [{"original": "", "corrected": "", "reason": ""}], "suggestions": [{"suggestion": "", "reason": ""}], "contradictions": [{"contradiction": "", "reason": ""}]}.\n\nText:\n---\n${text}\n---\n\nKontext aus bestehenden Artikeln:\n---\n${context}\n---`;

      const result = await chatCompletion([
        { role: 'system', content: 'Du bist ein akribischer Lektor. Antworte ausschließlich mit gültigem JSON.' },
        { role: 'user', content: prompt },
      ], { temperature: 0.2, maxTokens: 2000, backend: true });

      const raw = result.content?.trim();
      if (!raw) {
        throw new Error('Empty response from model');
      }

      const cleanedText = raw.replace(/^```json\s*|```\s*$/g, '');
      const analysis = JSON.parse(cleanedText);

      res.json(analysis);
    } catch (error) {
      console.error('Error analyzing text with AI:', error);
      res.status(500).json({ error: 'Failed to analyze text' });
    }
  });

  router.post('/improve-text', authMiddleware, async (req, res) => {
    const { text, suggestion } = req.body;

    if (!text || !suggestion) {
      return res.status(400).json({ error: 'Text and suggestion are required' });
    }

    try {
      const result = await chatCompletion([
        { role: 'system', content: 'Du verbesserst Texte basierend auf konkreten Anweisungen. Gib ausschließlich den optimierten Text im Markdown-Format zurück.' },
        { role: 'user', content: `Anweisung: "${suggestion}"\n\nText:\n---\n${text}\n---` },
      ], { temperature: 0.4, maxTokens: 800, backend: true });

      const improvedText = result.content?.trim();
      if (!improvedText) {
        throw new Error('Empty response from model');
      }

      res.json({ improvedText });
    } catch (error) {
      console.error('Error improving text with AI:', error);
      res.status(500).json({ error: 'Failed to improve text' });
    }
  });

  return router;
};
