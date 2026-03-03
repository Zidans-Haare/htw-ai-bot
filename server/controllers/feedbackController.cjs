const express = require('express');
const router = express.Router();
const { Feedback } = require('./db.cjs');

/**
 * @swagger
 * /api/feedback:
 *   post:
 *     summary: Feedback senden
 *     tags: [Feedback]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - text
 *               - captcha
 *               - expected_captcha
 *             properties:
 *               text:
 *                 type: string
 *                 description: Der Feedback-Text
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Optionale E-Mail-Adresse
 *               conversation_id:
 *                 type: string
 *                 description: Optionale Konversations-ID
 *               captcha:
 *                 type: number
 *                 description: CAPTCHA-Antwort
 *               expected_captcha:
 *                 type: number
 *                 description: Erwartete CAPTCHA-Antwort
 *               attached_chat_history:
 *                 type: string
 *                 description: Optionale angehängte Chat-Historie
 *     responses:
 *       200:
 *         description: Feedback erfolgreich gesendet
 *       400:
 *         description: Ungültige Eingabe oder CAPTCHA-Fehler
 *       500:
 *         description: Serverfehler
 */
router.post('/', async (req, res) => {
    const { text, email, conversation_id, captcha, expected_captcha, attached_chat_history } = req.body;

    if (!text || typeof text !== 'string' || text.trim() === '') {
        return res.status(400).json({ message: 'Feedback text is required.' });
    }

    if (!captcha || !expected_captcha || parseInt(captcha, 10) !== expected_captcha) {
        return res.status(400).json({ message: 'Captcha-Validierung fehlgeschlagen.' });
    }

    console.log(`Received feedback: ${text}`);

    try {
        await Feedback.create({
            data: {
                text: text,
                email: email,
                conversation_id: conversation_id,
                attached_chat_history: attached_chat_history
            }
        });
        res.sendStatus(200);
    } catch (err) {
        console.error(err.message);
        res.status(500).send(err.message);
    }
});

/**
 * @swagger
 * /api/feedback/rate:
 *   post:
 *     summary: Quick-Rating (Daumen hoch/runter) ohne Captcha
 *     tags: [Feedback]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - rating
 *             properties:
 *               rating:
 *                 type: integer
 *                 enum: [1, -1]
 *                 description: 1 = positiv, -1 = negativ
 *               conversation_id:
 *                 type: string
 *               message_id:
 *                 type: string
 *     responses:
 *       200:
 *         description: Rating gespeichert
 *       400:
 *         description: Ungültiges Rating
 */
router.post('/rate', async (req, res) => {
    const { rating, conversation_id, message_id } = req.body;

    if (rating !== 1 && rating !== -1) {
        return res.status(400).json({ message: 'Rating must be 1 or -1.' });
    }

    try {
        await Feedback.create({
            data: {
                text: rating === 1 ? 'Positive Bewertung' : 'Negative Bewertung',
                rating: rating,
                conversation_id: conversation_id || null,
                attached_chat_history: message_id ? `Message-ID: ${message_id}` : null
            }
        });
        res.sendStatus(200);
    } catch (err) {
        console.error('Rating error:', err.message);
        res.status(500).json({ message: 'Rating konnte nicht gespeichert werden.' });
    }
});

module.exports = router;
