#!/usr/bin/env node

/**
 * HTW Website MCP Server
 * Provides tools for fetching current information from htw-dresden.de:
 * - News/Nachrichten
 * - Semester dates / academic calendar
 * - Contact information for departments
 *
 * Uses only built-in Node.js modules (no external dependencies).
 */

const https = require('https');

// Simple in-memory cache: { key: { data, expires } }
const cache = {};
const CACHE_TTL_NEWS = 60 * 60 * 1000;          // 1 hour
const CACHE_TTL_SEMESTER = 24 * 60 * 60 * 1000;  // 24 hours
const CACHE_TTL_CONTACT = 24 * 60 * 60 * 1000;   // 24 hours

function getCached(key) {
  const entry = cache[key];
  if (entry && entry.expires > Date.now()) return entry.data;
  return null;
}

function setCache(key, data, ttl) {
  cache[key] = { data, expires: Date.now() + ttl };
}

/**
 * Fetch a URL and return the HTML as string.
 */
function fetchPage(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'HTW-AI-Bot/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirect = res.headers.location.startsWith('http')
          ? res.headers.location
          : `https://www.htw-dresden.de${res.headers.location}`;
        return fetchPage(redirect).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

/**
 * Strip HTML tags and decode common entities.
 */
function stripHtml(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── Tool Implementations ───────────────────────────────────────────────────

async function getHtwNews(args) {
  const cacheKey = 'htw_news';
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const html = await fetchPage('https://www.htw-dresden.de/hochschule/aktuelles');

  // News articles live under /news/<slug>
  const linkRegex = /<a[^>]+href="(\/news\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const articles = [];
  const seen = new Set();
  let match;

  while ((match = linkRegex.exec(html)) !== null) {
    const href = match[1].replace(/\/$/, '');
    if (seen.has(href)) continue;
    seen.add(href);

    const title = stripHtml(match[2]);
    if (!title || title.length < 10) continue;

    articles.push({
      title,
      url: `https://www.htw-dresden.de${href}`
    });

    if (articles.length >= (args.count || 5)) break;
  }

  const result = articles.length > 0
    ? `Aktuelle Nachrichten der HTW Dresden:\n\n${articles.map((a, i) => `${i + 1}. ${a.title}\n   ${a.url}`).join('\n\n')}`
    : 'Keine aktuellen Nachrichten gefunden auf htw-dresden.de/hochschule/aktuelles.';

  setCache(cacheKey, result, CACHE_TTL_NEWS);
  return result;
}

async function getSemesterDates(args) {
  const cacheKey = 'semester_dates';
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const html = await fetchPage('https://www.htw-dresden.de/studium/im-studium');

  // Extract links to Studienjahresablaufplan and related documents
  const linkRegex = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const relevantLinks = [];
  let match;

  while ((match = linkRegex.exec(html)) !== null) {
    const href = match[1];
    const text = stripHtml(match[2]);
    const lower = text.toLowerCase();

    if (lower.includes('studienjahresablauf') || lower.includes('semestertermin') ||
        lower.includes('prüfungsplan') || lower.includes('prüfungszeit') ||
        lower.includes('vorlesungszeit') || lower.includes('akademisch')) {
      const fullUrl = href.startsWith('http') ? href : `https://www.htw-dresden.de${href}`;
      relevantLinks.push({ text, url: fullUrl });
    }
  }

  // Extract date-like text from page body
  const bodyText = stripHtml(html);
  const datePatterns = [];
  const dateRegex = /(?:Vorlesungszeit|Prüfungszeit|Semesterbeginn|Rückmeldung|Einschreibung|Immatrikulation)[^.]{0,150}?\d{1,2}\.\d{1,2}\.\d{4}[^.]*/gi;
  let dateMatch;
  while ((dateMatch = dateRegex.exec(bodyText)) !== null) {
    datePatterns.push(dateMatch[0].trim());
  }

  let result = 'Semestertermine und Studienjahresablauf der HTW Dresden:\n\n';

  if (datePatterns.length > 0) {
    result += 'Gefundene Termine:\n' + datePatterns.map(d => `- ${d}`).join('\n') + '\n\n';
  }

  if (relevantLinks.length > 0) {
    result += 'Relevante Dokumente und Links:\n' + relevantLinks.map(l => `- ${l.text}: ${l.url}`).join('\n');
  }

  if (datePatterns.length === 0 && relevantLinks.length === 0) {
    result = 'Keine konkreten Semestertermine auf der Website gefunden. Relevante Seite: https://www.htw-dresden.de/studium/im-studium — dort gibt es den Studienjahresablaufplan als PDF-Download.';
  }

  setCache(cacheKey, result, CACHE_TTL_SEMESTER);
  return result;
}

async function getContactInfo(args) {
  const query = (args.department || args.query || '').toLowerCase();
  const cacheKey = `contact_${query}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const html = await fetchPage('https://www.htw-dresden.de/hochschule/kontakt-und-anfahrt/kontakt');
  const bodyText = stripHtml(html);

  // Build base contact info
  let result = 'Kontaktinformationen der HTW Dresden:\n\n';
  result += 'Adresse: Friedrich-List-Platz 1, 01069 Dresden\n';
  result += 'Telefon: +49 (0)351 462-0\n';
  result += 'E-Mail: info@htw-dresden.de\n';
  result += 'Website: https://www.htw-dresden.de\n\n';

  // Extract emails and phones from page
  const emails = [...new Set((bodyText.match(/[\w.-]+@[\w.-]+\.\w+/g) || []))];
  const phones = [...new Set((bodyText.match(/\+?\d[\d\s/()-]{6,}/g) || []).map(p => p.trim()))];

  if (query) {
    // Search for query-relevant lines
    const sentences = bodyText.split(/[.;]\s+/).map(l => l.trim()).filter(Boolean);
    const relevant = sentences.filter(l => l.toLowerCase().includes(query));

    if (relevant.length > 0) {
      result += `Ergebnisse für "${args.department || args.query}":\n`;
      const uniqueLines = [...new Set(relevant)].slice(0, 8);
      result += uniqueLines.map(l => `- ${l}`).join('\n');
    } else {
      result += `Keine spezifischen Kontaktdaten für "${args.department || args.query}" auf der Kontaktseite gefunden.\n`;
      result += 'Tipp: Die Fakultätsseiten oder das Campusportal (https://campus.htw-dresden.de) haben detailliertere Kontaktdaten.';
    }
  } else {
    if (emails.length > 0) {
      result += `E-Mail-Adressen auf der Kontaktseite: ${emails.slice(0, 8).join(', ')}\n`;
    }
    if (phones.length > 0) {
      result += `Telefonnummern: ${phones.slice(0, 5).join(', ')}`;
    }
  }

  setCache(cacheKey, result, CACHE_TTL_CONTACT);
  return result;
}

// ─── MCP Server Boilerplate ─────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'get_htw_news',
    description: 'Get current news and announcements from HTW Dresden website. Use when users ask about recent events, announcements, or university news.',
    inputSchema: {
      type: 'object',
      properties: {
        count: {
          type: 'number',
          description: 'Number of news items to return (default: 5, max: 10)'
        }
      },
      required: []
    }
  },
  {
    name: 'get_semester_dates',
    description: 'Get semester dates, academic calendar, exam periods, and lecture times from HTW Dresden. Use when users ask about semester start/end, exam periods, or registration deadlines.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'get_contact_info',
    description: 'Get contact information for HTW Dresden departments, offices, or services. Use when users ask for phone numbers, emails, addresses, or how to reach specific departments.',
    inputSchema: {
      type: 'object',
      properties: {
        department: {
          type: 'string',
          description: 'Name of the department or service to look up (e.g., "Studierendenservice", "Bibliothek", "Prüfungsamt", "Dekanat Informatik")'
        },
        query: {
          type: 'string',
          description: 'General search query for contact information'
        }
      },
      required: []
    }
  }
];

async function handleToolCall(name, args) {
  switch (name) {
    case 'get_htw_news': return await getHtwNews(args || {});
    case 'get_semester_dates': return await getSemesterDates(args || {});
    case 'get_contact_info': return await getContactInfo(args || {});
    default: throw new Error(`Unknown tool: ${name}`);
  }
}

async function handleRequest(request) {
  const { id, method, params } = request;

  if (method === 'tools/list') {
    sendResponse({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
  } else if (method === 'tools/call') {
    const { name, arguments: args } = params;
    try {
      const text = await handleToolCall(name, args);
      sendResponse({
        jsonrpc: '2.0', id,
        result: { content: [{ type: 'text', text }] }
      });
    } catch (error) {
      sendResponse({
        jsonrpc: '2.0', id,
        error: { code: -32000, message: error.message }
      });
    }
  }
}

function sendResponse(response) {
  process.stdout.write(JSON.stringify(response) + '\n');
}

async function main() {
  console.error('HTW Website MCP Server starting...');
  process.stdin.setEncoding('utf8');

  let buffer = '';
  process.stdin.on('data', async (chunk) => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const request = JSON.parse(line);
        await handleRequest(request);
      } catch (error) {
        console.error('Error processing request:', error);
      }
    }
  });
}

main().catch(console.error);
