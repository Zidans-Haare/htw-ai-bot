const { chatCompletion } = require('./aiProvider');

const CATEGORIES = [
  'Immatrikulation & Bewerbung',
  'Prüfungen & Noten',
  'Bibliothek & Ressourcen',
  'Campus-Leben & Mensa',
  'Organisation & Verwaltung',
  'Technischer Support & IT',
  'Internationales & Auslandssemester',
  'Feedback zum Bot',
  'Sonstiges & Unklares',
];

async function categorizeConversation(messages) {
  console.log('[Categorizer] Starting categorization for conversation...');

  if (!messages || messages.length === 0) {
    console.log('[Categorizer] No messages provided.');
    return null;
  }

  const conversationText = messages
    .map(msg => `${msg.role === 'user' ? 'Nutzer' : 'Assistent'}: ${msg.content}`)
    .join('\n');

  const userPrompt = `Analysiere die folgende Konversation und ordne sie einer der vorgegebenen Kategorien zu. Antworte ausschließlich mit einem JSON-Objekt {"category": "...", "confidence": Zahl}. Die Kategorie muss exakt einer der folgenden Werte sein:\n- ${CATEGORIES.join('\n- ')}\n\nKonversation:\n---\n${conversationText}\n---`;

  try {
    const completionResponse = await chatCompletion([
      { role: 'system', content: 'Du bist ein Assistent, der Gespräche kategorisiert und ausschließlich JSON zurückgibt.' },
      { role: 'user', content: userPrompt },
    ], { model: process.env.AI_MODEL || 'gpt-4o-mini', temperature: 0, maxTokens: 200 });

    const rawText = completionResponse?.content?.trim();
    if (!rawText) {
      console.error('[Categorizer] Empty response from model.');
      return null;
    }

    const cleaned = rawText.replace(/^```json\s*|```\s*$/g, '');
    const data = JSON.parse(cleaned);

    if (data && data.category && typeof data.confidence === 'number') {
      if (CATEGORIES.includes(data.category)) {
        console.log(`[Categorizer] Successfully categorized conversation as '${data.category}' with confidence ${data.confidence}.`);
        return data;
      }
      console.warn(`[Categorizer] Model returned invalid category '${data.category}'. Using fallback.`);
      return { category: 'Sonstiges & Unklares', confidence: data.confidence };
    }

    console.error('[Categorizer] Unexpected model response:', rawText);
    return null;
  } catch (error) {
    console.error('[Categorizer] Error during API call:', error.message);
    return null;
  }
}

module.exports = { categorizeConversation };

