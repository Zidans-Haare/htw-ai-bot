const { chatCompletion } = require('./aiProvider');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => `${timestamp} [${level}]: ${message}`)
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/reranker.log' })
  ]
});

/**
 * LLM-based reranker: scores each candidate document's relevance to the query.
 * Uses the backend AI provider (typically a cheaper/faster model).
 *
 * @param {string} query - The user's search query
 * @param {object[]} documents - Candidate documents with pageContent and metadata
 * @param {number} topK - Number of top results to return
 * @returns {Promise<object[]>} Top-K documents sorted by relevance
 */
async function rerankDocuments(query, documents, topK = 3) {
  if (documents.length <= topK) return documents;

  try {
    // Build compact document list (truncate to 300 chars each to keep prompt small)
    const docList = documents.map((doc, i) => {
      const content = (doc.pageContent || '').substring(0, 300);
      return `[${i}] ${content}`;
    }).join('\n\n');

    const prompt = `Rate each document's relevance to the query on a scale of 0-10.
Query: "${query}"

Documents:
${docList}

Respond ONLY with a JSON array of integer scores, one per document. Example: [8, 3, 9, 1, 5]`;

    const result = await chatCompletion([
      { role: 'system', content: 'You are a relevance scoring system. Respond only with a JSON array of integers.' },
      { role: 'user', content: prompt }
    ], { backend: true, temperature: 0, maxTokens: 200 });

    // Parse scores — handle potential markdown code blocks
    let content = result.content?.trim() || '[]';
    content = content.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    const scores = JSON.parse(content);

    if (!Array.isArray(scores) || scores.length !== documents.length) {
      logger.warn(`Reranker returned ${scores?.length} scores for ${documents.length} documents, falling back`);
      return documents.slice(0, topK);
    }

    const scored = documents.map((doc, i) => ({
      ...doc,
      rerankScore: typeof scores[i] === 'number' ? scores[i] : 0
    }));

    const reranked = scored
      .sort((a, b) => b.rerankScore - a.rerankScore)
      .slice(0, topK);

    logger.info(`Reranked ${documents.length} candidates → top ${topK}, scores: [${reranked.map(d => d.rerankScore).join(', ')}]`);
    return reranked;
  } catch (error) {
    logger.error(`Reranker failed: ${error.message}, returning original top-${topK}`);
    return documents.slice(0, topK);
  }
}

module.exports = { rerankDocuments };
