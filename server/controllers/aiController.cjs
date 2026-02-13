const { HochschuhlABC, Questions, Images, Conversation, Message, UserProfiles } = require('./db.cjs');
const auth = require('./authController.cjs');
const { getImageList } = require('../utils/imageProvider.js');
const { estimateTokens, isWithinTokenLimit } = require('../utils/tokenizer');
const { summarizeConversation } = require('../utils/summarizer');
const { trackSession, trackChatInteraction, trackArticleView, extractArticleIds } = require('../utils/analytics');
const { chatCompletion, chatCompletionStream } = require('../utils/aiProvider');
const vectorStore = require('../lib/vectorStore');
const { buildOpenMensaContext, shouldHandleOpenMensa } = require('../utils/openmensa');
const { getMcpTools, executeMcpTool } = require('../utils/mcpTools');
const { rerankDocuments } = require('../utils/reranker');
const { extractMemories, mergeMemories } = require('../utils/memoryExtractor');

// Lazy import to avoid immediate API key check
let categorizeConversation = null;

function loadCategorizer() {
  if (!categorizeConversation) {
    const categorizer = require('../utils/categorizer');
    categorizeConversation = categorizer.categorizeConversation;
  }
  return categorizeConversation;
}

function parseImageEntries(imageListString) {
  if (!imageListString) return [];
  return imageListString
    .split(/\n{2,}/)
    .map(entry => entry.trim())
    .filter(Boolean)
    .map(entry => {
      const [namePart, ...descriptionParts] = entry.split(/description:/i);
      if (!namePart) {
        return null;
      }
      const filename = namePart.replace(/image_name:/i, '').trim();
      const description = descriptionParts.join('description:').trim();
      if (!filename) {
        return null;
      }
      return {
        filename,
        description,
      };
    })
    .filter(Boolean);
}

function buildImageBaseUrl(req) {
  const forwardedProto = req.headers['x-forwarded-proto'];
  const protocol = forwardedProto ? forwardedProto.split(',')[0].trim() : req.protocol;
  const host = req.get('host');
  if (!host) {
    return null;
  }
  return `${protocol}://${host}/uploads/images/`;
}

const ACCESS_LEVEL_HIERARCHY = {
  'admin': ['public', 'intern', 'employee', 'manager', 'admin'],
  'manager': ['public', 'intern', 'employee', 'manager'],
  'entwickler': ['public', 'intern', 'employee', 'manager', 'admin'], // Devs see all
  'employee': ['public', 'intern', 'employee'],
  'editor': ['public', 'intern', 'employee'], // Editors see same as employees by default? Or more?
  'intern': ['public', 'intern'],
  'public': ['public']
};

function getAllowedAccessLevels(role) {
  return ACCESS_LEVEL_HIERARCHY[role] || ['public'];
}

// Removed runChatCompletion, using chatCompletion directly

async function logUnansweredQuestion(newQuestion) {
  try {
    const unansweredQuestions = await Questions.findMany({
      where: { answered: false, spam: false, deleted: false },
      select: { question: true },
    });

    if (unansweredQuestions.length > 0) {
      const questionList = unansweredQuestions.map(q => q.question).join('\n - ');
      const duplicatePrompt = `
        Here is a list of unanswered questions:
        - ${questionList}

        Is the following new question a duplicate of any in the list above?
        New question: "${newQuestion}"

        Answer with only "yes" or "no".
      `;

      const duplicateAnswer = (await chatCompletion([
        { role: 'system', content: 'You determine whether a new question is a duplicate of previous unanswered questions.' },
        { role: 'user', content: duplicatePrompt },
      ])).content.toLowerCase();
      if (duplicateAnswer === 'yes') {
        console.log(`Duplicate question not logged: "${newQuestion}"`);
        return;
      }
    }

    const translatePrompt = `Translate the following text to German. If it is already in German, answer with "no".\nText: "${newQuestion}"`;
    const translatedQuestion = (await chatCompletion([
      { role: 'system', content: 'You translate user inputs to German when they are not already in German.' },
      { role: 'user', content: translatePrompt },
    ])).content;

    let translationToStore = null;
    if (translatedQuestion.toLowerCase() !== 'no') {
      translationToStore = translatedQuestion;
    }

    await Questions.create({
      data: {
        question: newQuestion,
        translation: translationToStore,
        answered: false,
        archived: false,
        deleted: false,
        spam: false,
      },
    });
    console.log('Unanswered question logged to database');
  } catch (error) {
    console.error('Fehler beim Protokollieren der offenen Frage:', error.message);
  }
}

/**
 * @swagger
 * /api/chat:
 *   post:
 *     summary: Chat-Antwort vom AI-Backend abrufen
 *     tags: [AI]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - prompt
 *             properties:
 *               prompt:
 *                 type: string
 *                 description: Die Nachricht des Benutzers
 *               conversationId:
 *                 type: string
 *                 description: Optionale Konversations-ID
 *               anonymousUserId:
 *                 type: string
 *                 description: Optionale anonyme Benutzer-ID
 *               timezoneOffset:
 *                 type: number
 *                 description: Zeitzonen-Offset in Minuten
 *     responses:
 *       200:
 *         description: JSON-Antwort mit generierter AI-Nachricht
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 conversationId:
 *                   type: string
 *                 response:
 *                   type: string
 *                 tokens:
 *                   type: object
 *                   properties:
 *                     sent:
 *                       type: integer
 *                     received:
 *                       type: integer
 *                 images:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       filename:
 *                         type: string
 *                       description:
 *                         type: string
 *                       url:
 *                         type: string
 *                         format: uri
 *                 imageBaseUrl:
 *                   type: string
 *       400:
 *         description: Fehlender Prompt
 *       500:
 *         description: Serverfehler
 */
async function streamChat(req, res) {
  const startTime = Date.now();
  let sessionId = null;

  try {
    const { prompt, conversationId, anonymousUserId, timezoneOffset, profilePreferences = null, userDisplayName = null, images = [] } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt ist erforderlich' });
    }

    // Process uploaded images
    const fs = require('fs');
    const path = require('path');
    const processedImages = [];
    const imagesDir = path.resolve(__dirname, '..', '..', 'uploads', 'images');

    // Ensure directory exists
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true });
    }

    for (const img of images) {
      if (img.data && img.mimeType) {
        try {
          const base64Data = img.data.replace(/^data:image\/\w+;base64,/, "");
          const buffer = Buffer.from(base64Data, 'base64');
          const timestamp = Date.now();
          const randomId = Math.random().toString(36).substring(2, 8);
          const extension = img.mimeType.split('/')[1] || 'png';
          const filename = `upload_${timestamp}_${randomId}.${extension}`;
          const filepath = path.join(imagesDir, filename);

          fs.writeFileSync(filepath, buffer);

          // Save to DB
          await Images.create({
            data: {
              filename: filename,
              description: 'User uploaded image',
              source: 'user_upload'
            }
          });

          processedImages.push({
            inlineData: {
              data: base64Data,
              mimeType: img.mimeType
            },
            filename: filename // Keep track for response
          });

          console.log(`Saved uploaded image: ${filename}`);
        } catch (e) {
          console.error("Failed to save uploaded image:", e);
        }
      }
    }

    const userApiKey = req.headers['x-user-api-key'];

    // Track session
    sessionId = await trackSession(req);
    req.res = res;

    const convoId = conversationId || new Date().toISOString() + Math.random().toString(36).slice(2);
    console.log(`Processing conversationId: ${convoId}`);

    const conversation = await Conversation.upsert({
      where: { id: convoId },
      update: {},
      create: {
        id: convoId,
        anonymous_user_id: anonymousUserId || 'unknown',
        category: 'Unkategorisiert',
        ai_confidence: 0.0,
        created_at: new Date(),
      },
    });
    console.log(`Processed conversation in DB: ${convoId}`);

    await Message.create({
      data: {
        conversation_id: conversation.id,
        role: 'user',
        content: prompt,
        created_at: new Date(),
      },
    });
    console.log(`Saved user message to DB: ${prompt}`);

    const history = await Message.findMany({
      where: { conversation_id: conversation.id },
      orderBy: { created_at: 'asc' },
    });

    let messages = history.map(msg => ({
      text: msg.content,
      isUser: msg.role === 'user',
    }));

    let hochschulContent = '';

    // Determine user role and allowed access levels
    let userRole = 'public';
    let userId = null;
    try {
      const token = req.cookies[auth.ADMIN_SESSION_COOKIE] || req.cookies[auth.USER_SESSION_COOKIE];
      if (token) {
        const session = await auth.getSession(token);
        if (session) {
          userRole = session.role;
          userId = session.userId || session.user_id || null;
        }
      }
    } catch (e) { console.error('Auth check in chat failed', e); }

    // Load user memory if available
    let userMemory = [];
    if (userId && process.env.USER_MEMORY_ENABLED === 'true') {
      try {
        const profile = await UserProfiles.findUnique({ where: { user_id: userId } });
        if (profile?.memory) {
          userMemory = typeof profile.memory === 'string'
            ? JSON.parse(profile.memory)
            : profile.memory;
          if (!Array.isArray(userMemory)) userMemory = [];
        }
      } catch (e) { console.error('Failed to load user memory:', e.message); }
    }

    const allowedLevels = getAllowedAccessLevels(userRole);
    // Simple $in filter for Chroma (LangChain translates or Chroma accepts)
    // For Weaviate this might need specific handling, but we start with generic object filter
    const accessFilter = { access_level: { $in: allowedLevels } };

    if (vectorStore.store) {
      const retrieveK = parseInt(process.env.RETRIEVE_K) || 3;
      const rerankerEnabled = process.env.RERANKER_ENABLED === 'true';
      const rerankerCandidates = parseInt(process.env.RERANKER_CANDIDATES) || 10;
      const candidates = await vectorStore.hybridSearch(
        prompt,
        rerankerEnabled ? rerankerCandidates : retrieveK,
        accessFilter
      );
      const relevantDocs = rerankerEnabled
        ? await rerankDocuments(prompt, candidates, retrieveK)
        : candidates;
      hochschulContent = relevantDocs.map(doc => doc.pageContent).join('\n\n');
      if (vectorStore.graphData) {
        const graphContext = await vectorStore.getGraphSummary(prompt, vectorStore.graphData);
        hochschulContent += `\nGraph Summary: ${graphContext}`;
      }
    } else {
      // Fallback to full DB if vector DB not enabled
      const entries = await HochschuhlABC.findMany({
        where: { active: true, archived: null },
        orderBy: { article: 'desc' },
        select: { article: true, description: true },
      });
      hochschulContent = entries.map(entry => `## ${entry.article}\n\n${entry.description}\n\n`).join('');
    }

    const imageList = await getImageList({
      mode: process.env.USE_VECTOR_IMAGES || 'static',
      query: prompt
    });
    const imageEntries = parseImageEntries(imageList);
    const imageBaseUrl = buildImageBaseUrl(req);
    const imageInstructionBase = imageBaseUrl ? imageBaseUrl.replace(/\/+$/, '') : '/uploads/images';

    let openMensaSection = '';
    let openMensaMetadata = null;
    if (process.env.OPENMENSA_ENABLED !== 'false') {
      let useOpenMensa = shouldHandleOpenMensa(prompt);
      if (!useOpenMensa) {
        try {
          const categorizer = loadCategorizer();
          const categorizeInput = history
            .map(msg => ({ role: msg.role === 'model' ? 'assistant' : msg.role, content: msg.content }))
            .concat({ role: 'user', content: prompt });
          const classification = await categorizer(categorizeInput);
          const categoryName = (classification && classification.category) ? classification.category : '';
          if (categoryName.toLowerCase().includes('mensa')) {
            useOpenMensa = true;
          } else if (classification && classification.category === 'Campus-Leben & Mensa') {
            const confidence = typeof classification.confidence === 'number' ? classification.confidence : 0;
            if (confidence >= 0.05) {
              useOpenMensa = true;
            }
          }
        } catch (err) {
          console.warn('OpenMensa categorization failed:', err.message);
        }
      }

      if (useOpenMensa) {
        try {
          const mensaContext = await buildOpenMensaContext({ prompt, force: true, preferences: profilePreferences });
          if (mensaContext && mensaContext.contextText) {
            openMensaMetadata = mensaContext;
            openMensaSection = `

      **Aktuelle Mensa-Angebote (OpenMensa)**:
      ${mensaContext.contextText}

      Antworte bei Fragen zum Essen oder zur Mensa bevorzugt mit diesen aktuellen Daten. Sag klar, wenn keine Daten vorliegen oder die Mensa geschlossen ist.`;
          }
        } catch (err) {
          console.warn('OpenMensa integration failed:', err.message);
        }
      }
    }

    const historyText = messages.map(m => `${m.isUser ? 'User' : 'Assistant'}: ${m.text}`).join('\n');
    const fullTextForTokenCheck = `**Inhalt des Hochschul ABC (2025)**:\n${hochschulContent}\n\n**Gesprächsverlauf**:\n${historyText}\n\nBenutzerfrage: ${prompt}`;

    if (!isWithinTokenLimit(fullTextForTokenCheck, 6000)) {
      messages = await summarizeConversation(messages);
      console.log(`Summarized conversation, new message count: ${messages.length}`);
    }

    const now = new Date();
    const dateAndTime = `Current date and time in Dresden, Germany is ${now.toLocaleString('en-GB', {
      timeZone: 'Europe/Berlin',
      dateStyle: 'full',
      timeStyle: 'long',
    })}`;

    let timezoneInfo = '';
    try {
      const germanOffsetString = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Europe/Berlin',
        timeZoneName: 'shortOffset',
      }).format(now);
      const gmtMatch = germanOffsetString.match(/GMT([+-]\d+)/);
      if (!gmtMatch) throw new Error('Could not parse German timezone offset.');

      const germanOffsetHours = parseInt(gmtMatch[1], 10);
      const germanOffsetMinutes = germanOffsetHours * 60;
      const userOffsetMinutes = -timezoneOffset;
      const offsetDifferenceHours = (userOffsetMinutes - germanOffsetMinutes) / 60;

      if (Math.abs(offsetDifferenceHours) > 0) {
        const direction = offsetDifferenceHours > 0 ? 'ahead of' : 'behind';
        timezoneInfo = `The user's timezone is ${Math.abs(offsetDifferenceHours)} hours ${direction} German time. When answering questions about time, state the time in the user's local time and mention the difference.`;
      }
    } catch (e) {
      console.error('Could not determine timezone offset:', e.message);
    }

    const systemPrompt = `
      --system prompt--
      You are a customer support agent dedicated to answering questions, resolving issues,
      and providing helpful solutions promptly. Maintain a friendly and professional tone in all interactions.

      Ensure responses are concise, clear, and directly address the user's concerns. Try to answer to the point and be super helpful and positive.
      Escalate complex issues to human agents when necessary to ensure customer satisfaction.
      Keep responses compact (ideally under 150 German words), use short paragraphs or bullet lists, and highlight the key next steps.
      Offer the user a follow-up option instead of overloading them with details (e.g. frage nach, ob mehr Infos gewünscht sind).
      ${userDisplayName ? `Wenn bekannt, sprich den Nutzer mit dem Namen "${userDisplayName}" an.` : ''}
      ${userMemory.length > 0 ? `
      **Known facts about this user** (from previous conversations):
      ${userMemory.map(m => `- ${m.fact}`).join('\n      ')}
      Use these facts to personalize your responses naturally, without explicitly referencing that you "remember" them unless the user asks.
      ` : ''}

      ${dateAndTime}.
      ${timezoneInfo}

      Contact data includes Name, Responsibility, Email, Phone number, Room, and talking hours.
      Whenever you recommend a contact or advise to contact someone, provide complete contact data
      for all relevant individuals, including: Name, Responsibility, Email, Phone number, Room, and talking hours.

      If multiple persons are responsible, briefly explain the difference between them and provide full contact data for each.

      If there are diverging Answers for long and short term students, and the user did not specify their status,
      ask for clarification and point out the difference.

      **IMPORTANT: Use available tools when needed**
      You have access to various tools that can help you provide accurate, up-to-date information. When a user asks about:
      - Mensa menus, canteen information, or food services: Use the OpenMensa tools to get current data
      - Library resources or documentation: Use Context7 tools to find relevant docs
      - Any external data or services: Check if appropriate tools are available

      Always use tools when they can provide more accurate or current information than your training data.

      **Knowledgebase of the HTW Dresden**:
      ${hochschulContent}

      **Image List**:
      ${imageList}

      If an image is in the Image List, that helps to answer the user question, add the image link to the answer.
      Use the base URL "${imageInstructionBase}" and format the url in markdown as absolute path, for example: "\\n\\n ![](${imageInstructionBase}/<image_name>) \\n\\n"
      ${openMensaSection}

      --

      If you can not answer a question about the HTW Dresden from the Knowledgebase, available tools, or the OpenMensa data,
      add the chars "<+>" at the end of the answer. If you can explain that there are currently keine Daten or the Mensa is closed and offer guidance, do NOT append "<+>".

      --
    `;

    // Log token count for system prompt
    const systemTokens = estimateTokens(systemPrompt);
    console.log(`System prompt tokens: ${systemTokens}, Image mode: ${process.env.USE_VECTOR_IMAGES || 'static'}`);

    const openAIHistory = messages.map(m => ({
      role: m.isUser ? 'user' : 'assistant',
      content: m.text,
    }));

    const messagesPayload = [
      { role: 'system', content: systemPrompt },
      ...openAIHistory,
      {
        role: 'user',
        parts: [
          { text: prompt },
          ...processedImages.map(img => ({ inlineData: img.inlineData }))
        ]
      },
    ];

    // Get MCP tools
    const mcpTools = await getMcpTools();
    const tools = mcpTools.map(t => t.tool);
    console.log(`Loaded ${tools.length} MCP tools: ${tools.map(t => t.function.name).join(', ')}`);

    // Check if AI provider supports tool calls
    const { supportsToolCalls } = require('../utils/aiProvider');
    const toolCallsSupported = await supportsToolCalls();
    if (tools.length > 0 && !toolCallsSupported) {
      console.log('AI model does not support tool calls, skipping MCP tools');
      tools.length = 0; // Clear tools array
    }

    let fullResponseText = '';
    let lastAiContent = ''; // Store the last meaningful AI response
    let finalMessages = messagesPayload;

    // Tool calling loop
    const toolStatuses = [];
    for (let i = 0; i < 5; i++) {
      console.log(`Tool calling loop iteration ${i + 1}, messages count: ${finalMessages.length}`);

      const response = await chatCompletion(finalMessages, {
        apiKey: userApiKey,
        temperature: 0.2,
        tools: tools.length > 0 ? tools : undefined,
      });

      console.log(`AI response - content length: ${response.content?.length || 0}, tool calls: ${response.tool_calls?.length || 0}, finish_reason: ${response.finish_reason}`);

      // Store any content from AI as potential response
      if (response.content && response.content.trim()) {
        lastAiContent = response.content;
        console.log(`Stored AI content as potential response: ${lastAiContent.substring(0, 50)}...`);
      }

      if (response.tool_calls && response.tool_calls.length > 0) {
        console.log(`AI made ${response.tool_calls.length} tool calls`);

        // Collect tool status for frontend
        for (const toolCall of response.tool_calls) {
          const tool = mcpTools.find(t => t.tool.function.name === toolCall.function.name);
          if (tool) {
            toolStatuses.push(`Using Tool: ${tool.tool.function.name}...`);
            console.log(`Added tool status: Using Tool: ${tool.tool.function.name}...`);
          }
        }

        // Execute tools
        finalMessages.push({ role: 'assistant', content: response.content, tool_calls: response.tool_calls });
        for (const toolCall of response.tool_calls) {
          try {
            console.log(`Executing tool: ${toolCall.function.name} with args: ${toolCall.function.arguments}`);
            const result = await executeMcpTool(toolCall, mcpTools);
            console.log(`Tool result length: ${result.content.length}`);
            finalMessages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              function_name: toolCall.function.name, // For Google provider compatibility
              content: result.content
            });
            console.log(`Added tool result to messages, new count: ${finalMessages.length}`);
          } catch (error) {
            console.error('Tool execution error:', error);
            finalMessages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              function_name: toolCall.function.name, // For Google provider compatibility
              content: `Error: ${error.message}`
            });
          }
        }
      } else {
        fullResponseText = response.content || '';
        console.log(`No more tool calls, final response: ${fullResponseText.substring(0, 100)}...`);
        break;
      }
    }

    // Set final response - use last AI content if no final response was generated
    if (!fullResponseText && lastAiContent) {
      console.log(`Using last AI content as final response since no proper final response was generated`);
      fullResponseText = lastAiContent;
    } else if (!fullResponseText) {
      fullResponseText = 'No response generated.';
    }

    // Save AI message to DB
    await Message.create({
      data: {
        conversation_id: conversation.id,
        role: 'assistant',
        content: fullResponseText,
        created_at: new Date(),
      },
    });
    console.log(`Saved AI message to DB: ${fullResponseText}`);

    if (openMensaMetadata && /<\+>\s*$/.test(fullResponseText)) {
      fullResponseText = fullResponseText.replace(/\s*<\+>\s*$/, '').trimEnd();
    }

    await Message.create({
      data: {
        conversation_id: convoId,
        role: 'model',
        content: fullResponseText,
        created_at: new Date(),
      },
    });
    console.log(`Saved AI response to DB: ${fullResponseText.slice(0, 50)}...`);

    const responseTime = Date.now() - startTime;
    const tokensUsed = estimateTokens(fullResponseText);
    let sentTokens = 0;
    if (process.env.DISPLAY_TOKEN_USED_FOR_QUERY === 'true') {
      const promptText = messagesPayload.map(m => m.content).join(' ');
      sentTokens = estimateTokens(promptText);
    }
    const wasSuccessful = !fullResponseText.includes('<+>');

    if (fullResponseText.includes('<+>')) {
      logUnansweredQuestion(prompt);
    }

    await trackChatInteraction(sessionId, prompt, fullResponseText, wasSuccessful, responseTime, tokensUsed);

    // Extract and save user memories asynchronously (fire-and-forget)
    if (userId && process.env.USER_MEMORY_ENABLED === 'true') {
      extractMemories(messages, userMemory)
        .then(async (newFacts) => {
          if (newFacts.length > 0) {
            const updated = mergeMemories(userMemory, newFacts, convoId);
            await UserProfiles.update({
              where: { user_id: userId },
              data: { memory: updated }
            });
            console.log(`Saved ${newFacts.length} new memories for user ${userId}`);
          }
        })
        .catch(err => console.error('Memory extraction failed:', err.message));
    }

    const referencedArticleIds = extractArticleIds(fullResponseText);
    for (const articleId of referencedArticleIds) {
      await trackArticleView(articleId, sessionId, prompt);
    }

    const normalizedImageBaseUrl = imageBaseUrl ? imageBaseUrl.replace(/\/+$/, '') : '/uploads/images';
    
    // Filter images: Only include those that are actually referenced in the response text
    const referencedImageEntries = imageEntries.filter(entry => 
      fullResponseText.includes(entry.filename)
    );

    const imagesForPayload = referencedImageEntries.map(entry => {
      let url;
      try {
        url = imageBaseUrl ? new URL(entry.filename, imageBaseUrl).toString() : `/uploads/images/${entry.filename}`;
      } catch (err) {
        url = `/uploads/images/${entry.filename}`;
      }
      return {
        filename: entry.filename,
        description: entry.description,
        url,
      };
    }).concat(processedImages.map(img => ({
      filename: img.filename,
      description: 'User uploaded',
      url: imageBaseUrl ? new URL(img.filename, imageBaseUrl).toString() : `/uploads/images/${img.filename}`
    })));

    const responsePayload = {
      conversationId: convoId,
      response: fullResponseText,
      images: imagesForPayload,
      imageBaseUrl: normalizedImageBaseUrl,
    };

    if (toolStatuses.length > 0) {
      responsePayload.toolStatuses = toolStatuses;
    }

    if (openMensaMetadata) {
      responsePayload.openMensa = openMensaMetadata;
    }

    if (process.env.DISPLAY_TOKEN_USED_FOR_QUERY === 'true') {
      responsePayload.tokens = { sent: sentTokens, received: tokensUsed };
    }

    res.json(responsePayload);
  } catch (error) {
    console.error('Error in streamChat:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}

const backendTranslations = {
  de: {
    api_key_required: 'API-Schlüssel ist erforderlich.',
    api_key_valid: 'API-Schlüssel ist gültig.',
    unknown_error: 'Ein unbekannter Fehler ist bei der Validierung aufgetreten.',
    invalid_api_key: 'Der API-Schlüssel ist ungültig. Bitte überprüfen Sie Ihren Schlüssel und versuchen Sie es erneut.',
    quota_exceeded: 'API-Kontingent überschritten. Bitte versuchen Sie es später erneut.',
    network_error: 'Netzwerkfehler. Bitte überprüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.',
  },
  en: {
    api_key_required: 'API key is required.',
    api_key_valid: 'API key is valid.',
    unknown_error: 'An unknown error occurred during validation.',
    invalid_api_key: 'The API key is invalid. Please check your key and try again.',
    quota_exceeded: 'API quota exceeded. Please try again later.',
    network_error: 'Network error. Please check your internet connection and try again.',
  },
};

/**
 * @swagger
 * /api/test-api-key:
 *   post:
 *     summary: API-Schlüssel für Google AI testen
 *     tags: [AI]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - apiKey
 *             properties:
 *               apiKey:
 *                 type: string
 *                 description: Der zu testende API-Schlüssel
 *               language:
 *                 type: string
 *                 enum: [de, en]
 *                 default: de
 *                 description: Sprache für Fehlermeldungen
 *     responses:
 *       200:
 *         description: API-Schlüssel ist gültig
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       400:
 *         description: API-Schlüssel fehlt oder ungültig
 *       500:
 *         description: Serverfehler
 */
async function testApiKey(req, res) {
  const { apiKey, language = 'de' } = req.body;
  const trans = backendTranslations[language] || backendTranslations.de;

  if (!apiKey) {
    return res.status(400).json({ message: trans.api_key_required });
  }

  try {
    await chatCompletion([
      { role: 'system', content: 'You are a key validation assistant.' },
      { role: 'user', content: 'hello' },
    ], { apiKey, maxTokens: 5, temperature: 0 });

    res.status(200).json({ message: trans.api_key_valid });
  } catch (error) {
    console.error('API-Schlüssel-Validierungsfehler:', error);

    let clientMessage = trans.unknown_error;
    let statusCode = 500;

    const errorType = error?.error?.type || error?.type || '';
    const errorMessage = (error?.error?.message || error?.message || '').toLowerCase();

    if (errorType === 'invalid_api_key' || errorMessage.includes('invalid api key')) {
      clientMessage = trans.invalid_api_key;
      statusCode = 400;
    } else if (errorType === 'insufficient_quota' || errorMessage.includes('insufficient_quota') || errorMessage.includes('quota')) {
      clientMessage = trans.quota_exceeded;
      statusCode = 429;
    } else if (errorType === 'rate_limit_exceeded' || errorMessage.includes('rate limit')) {
      clientMessage = trans.quota_exceeded;
      statusCode = 429;
    } else if (errorType === 'api_connection_error' || errorMessage.includes('network') || errorMessage.includes('timeout')) {
      clientMessage = trans.network_error;
      statusCode = 503;
    }

    res.status(statusCode).json({ message: clientMessage });
  }
}

/**
 * @swagger
 * /api/suggestions:
 *   get:
 *     summary: Chat-Vorschläge abrufen
 *     tags: [AI]
 *     responses:
 *       200:
 *         description: Liste der Vorschläge
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: string
 *       500:
 *         description: Serverfehler
 */
async function getSuggestions(req, res) {
  try {
    const suggestions = await HochschuhlABC.findMany({
      where: { active: true, archived: null },
      select: { article: true, description: true },
      orderBy: { article: 'asc' },
      take: 10,
    });

    const formattedSuggestions = suggestions.map(s => ({
      article: s.article,
      description: s.description.substring(0, 100) + (s.description.length > 100 ? '...' : ''),
    }));

    res.json(formattedSuggestions);
  } catch (error) {
    console.error('Fehler beim Abrufen der Vorschläge:', error.message);
    res.status(500).json({ error: 'Vorschläge konnten nicht geladen werden' });
  }
}

/**
 * @swagger
 * /api/history:
 *   get:
 *     summary: Chat-Verlauf abrufen
 *     tags: [AI]
 *     parameters:
 *       - in: query
 *         name: anonymousUserId
 *         schema:
 *           type: string
 *         description: Anonyme Benutzer-ID
 *     responses:
 *       200:
 *         description: Liste der Chats
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                   title:
 *                     type: string
 *                   messages:
 *                     type: array
 *       500:
 *         description: Serverfehler
 */
async function getChatHistory(req, res) {
  try {
    const userId = req.session?.user?.id;
    const anonymousUserId = req.query.anonymousUserId;

    if (!userId && !anonymousUserId) {
      return res.json([]);
    }

    const whereClause = userId
      ? { user_id: userId }
      : { anonymous_user_id: anonymousUserId };

    const conversations = await Conversation.findMany({
      where: whereClause,
      orderBy: { created_at: 'desc' },
      take: 50,
      include: {
        messages: {
          orderBy: { created_at: 'asc' }
        }
      }
    });

    const formattedHistory = conversations.map(convo => {
      // Create a title from the first user message if possible
      const firstUserMsg = convo.messages.find(m => m.role === 'user');
      const title = firstUserMsg
        ? (firstUserMsg.content.length > 40 ? firstUserMsg.content.substring(0, 40) + '...' : firstUserMsg.content)
        : 'Neue Konversation';

      return {
        id: convo.id,
        title: title,
        updatedAt: convo.created_at,
        messages: convo.messages.map(msg => ({
          text: msg.content,
          isUser: msg.role === 'user',
          timestamp: msg.created_at
        }))
      };
    });

    res.json(formattedHistory);
  } catch (error) {
    console.error('Error fetching chat history:', error);
    res.status(500).json({ error: 'Failed to fetch chat history' });
  }
}

module.exports = { streamChat, getSuggestions, testApiKey, getChatHistory };
