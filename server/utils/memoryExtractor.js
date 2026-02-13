const { chatCompletion } = require('./aiProvider');

const MAX_MEMORIES = parseInt(process.env.USER_MEMORY_MAX_ENTRIES) || 20;

/**
 * Analyzes a completed conversation and extracts persistent facts about the user.
 * Only extracts explicitly stated, stable information — not assumptions or temporary states.
 *
 * @param {Array<{text: string, isUser: boolean}>} messages - Conversation messages
 * @param {Array<{fact: string, category: string}>} existingMemories - Already known facts
 * @returns {Promise<Array<{fact: string, category: string}>>} New facts (empty if none found)
 */
async function extractMemories(messages, existingMemories = []) {
  const conversation = messages
    .map(m => `${m.isUser ? 'User' : 'Assistant'}: ${m.text}`)
    .join('\n');

  // Skip very short conversations (likely no useful facts)
  if (messages.filter(m => m.isUser).length < 2) return [];

  const existingFacts = existingMemories.length > 0
    ? existingMemories.map(m => `- ${m.fact}`).join('\n')
    : 'None';

  const prompt = `Analyze this conversation and extract NEW personal facts about the user.

Rules:
- Only extract facts EXPLICITLY stated by the user (never assume)
- Only stable/persistent facts (study program, semester, preferences — not temporary moods)
- Keep facts concise (one sentence each)
- Categories: studium, preferences, personal, campus
- Do NOT repeat already known facts

Already known facts:
${existingFacts}

Conversation:
${conversation}

Respond with a JSON array of new facts, or [] if none found.
Example: [{"fact": "Studiert Informatik im 3. Semester", "category": "studium"}]`;

  try {
    const result = await chatCompletion([
      { role: 'system', content: 'You extract user facts from conversations. Respond only with a JSON array.' },
      { role: 'user', content: prompt }
    ], { backend: true, temperature: 0, maxTokens: 500 });

    let content = result.content?.trim() || '[]';
    // Handle markdown code blocks
    content = content.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    const newFacts = JSON.parse(content);

    if (!Array.isArray(newFacts)) return [];
    // Validate structure
    return newFacts.filter(f =>
      f && typeof f.fact === 'string' && f.fact.length > 0 &&
      typeof f.category === 'string'
    );
  } catch (error) {
    console.error('Memory extraction failed:', error.message);
    return [];
  }
}

/**
 * Merge new memories into existing ones, respecting the max limit.
 * Newest memories are kept when trimming.
 *
 * @param {Array} existing - Current memories
 * @param {Array} newMemories - New memories to add
 * @param {string} conversationId - Source conversation
 * @returns {Array} Merged and trimmed memory array
 */
function mergeMemories(existing, newMemories, conversationId) {
  const now = new Date().toISOString();
  const additions = newMemories.map(m => ({
    fact: m.fact,
    category: m.category,
    source_conversation: conversationId,
    created_at: now,
  }));

  const merged = [...existing, ...additions];
  // Keep newest entries if over limit
  return merged.slice(-MAX_MEMORIES);
}

module.exports = { extractMemories, mergeMemories };
