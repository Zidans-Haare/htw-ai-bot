const express = require('express');
const { prisma, UserSessions, ChatInteractions, ArticleViews, HochschuhlABC, Questions, Feedback, Conversation, Message, QuestionAnalysisCache, DailyQuestionStats, DailyUnansweredStats } = require('./db.cjs');
const { getGermanNow, toGermanTime, getGermanDateString, getGermanDaysAgo, groupByGermanDate, groupByGermanHour, groupFeedbackByGermanDate, groupFeedbackByGermanHour } = require('../utils/timezone');
const { raw_sql_wrapper } = require('../utils/sql_wrapper');

// Optional import for question grouper (requires server-side OpenAI-compatible API key)
let groupSimilarQuestions, extractQuestions;
try {
    const questionGrouper = require('../utils/questionGrouper');
    groupSimilarQuestions = questionGrouper.groupSimilarQuestions;
    extractQuestions = questionGrouper.extractQuestions;
} catch (error) {
    console.warn('Question grouper not available (AI_API_KEY not set)');
    groupSimilarQuestions = null;
    extractQuestions = null;
}

const router = express.Router();

router.get('/kpis', async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayEnd = new Date(today);
        todayEnd.setHours(23, 59, 59, 999);

        // Total Sessions
        const totalSessions = await UserSessions.count();

        // Today's Sessions
        const todaySessions = await UserSessions.count({
            where: {
                started_at: {
                    gte: today,
                    lte: todayEnd
                }
            }
        });

        // Success Rate - fallback to Questions table if ChatInteractions is empty
        let totalInteractions = await ChatInteractions.count();
        let successfulInteractions = await ChatInteractions.count({
            where: { was_successful: true }
        });
        
        // Fallback to Questions table if ChatInteractions is empty
        if (totalInteractions === 0) {
            const totalQuestions = await Questions.count({
                where: { spam: false, deleted: false }
            });
            const answeredQuestions = await Questions.count({
                where: { answered: true, spam: false, deleted: false }
            });
            
            totalInteractions = totalQuestions;
            successfulInteractions = answeredQuestions;
        }
        
        const successRate = totalInteractions > 0 
            ? Math.round((successfulInteractions / totalInteractions) * 100) 
            : 0;

        // Open Questions (unanswered questions)
        const openQuestions = await Questions.count({
            where: { 
                answered: false,
                spam: false,
                deleted: false
            }
        });

        res.json({
            totalSessions,
            todaySessions,
            successRate,
            openQuestions
        });
    } catch (error) {
        console.error('Error fetching KPIs:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Old duplicate endpoint removed - using the new AI-powered one below at line ~838

router.get('/recent-feedback', async (req, res) => {
    try {
        const recentFeedback = await Feedback.findMany({
            orderBy: { submitted_at: 'desc' },
            take: 10,
            select: { text: true, submitted_at: true, rating: true, email: true }
        });

        res.json(recentFeedback);
    } catch (error) {
        console.error('Error fetching recent feedback:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/sessions', async (req, res) => {
    try {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        // First try user_sessions, then fallback to feedback data as proxy for activity
        // Use German timezone for date grouping
        const sevenDaysAgoGerman = getGermanDaysAgo(7);

        // Get user sessions from the last 7 days
        let userSessions = await UserSessions.findMany({
            where: {
                started_at: {
                    not: null
                }
            },
            select: {
                started_at: true
            }
        });

        let sessions = groupByGermanDate(userSessions, 'started_at', sevenDaysAgoGerman);

        // If no user_sessions data, use feedback as activity proxy
        if (sessions.length === 0) {
            const feedback = await Feedback.findMany({
                select: {
                    submitted_at: true,
                    conversation_id: true
                }
            });

            sessions = groupFeedbackByGermanDate(feedback, sevenDaysAgoGerman);
        }

        // If still no data, use questions as activity proxy
        if (sessions.length === 0) {
            const questions = await Questions.findMany({
                where: {
                    spam: false,
                    deleted: false
                },
                select: {
                    updated_at: true
                }
            });

            sessions = groupByGermanDate(questions, 'updated_at', sevenDaysAgoGerman);
        }

        // Fill missing days with 0
        const result = [];
        for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            
            const existingSession = sessions.find(s => s.date === dateStr);
            result.push({
                date: dateStr,
                count: existingSession ? parseInt(existingSession.count) : 0
            });
        }

        res.json(result);
    } catch (error) {
        console.error('Error fetching sessions:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/sessions/hourly', async (req, res) => {
    try {
        const { date } = req.query;
        
        if (!date) {
            return res.status(400).json({ error: 'Date parameter is required (YYYY-MM-DD format)' });
        }

        // Parse the date and create start/end of day in local timezone
        const targetDate = new Date(date + 'T00:00:00');
        const nextDay = new Date(date + 'T23:59:59.999');

        // First try user_sessions for hourly data (German timezone)
        
        // Get user sessions for the specified date in German timezone
        let userSessions = await UserSessions.findMany({
            where: {
                started_at: {
                    not: null
                }
            },
            select: {
                started_at: true
            }
        });

        let hourlyData = groupByGermanHour(userSessions, 'started_at', date);

        // If no user_sessions data, use feedback as activity proxy
        if (hourlyData.length === 0) {
            const feedback = await Feedback.findMany({
                where: {
                    submitted_at: {
                        not: null
                    }
                },
                select: {
                    submitted_at: true,
                    conversation_id: true
                }
            });

            hourlyData = groupFeedbackByGermanHour(feedback, date);
        }

        // If still no data, use questions as activity proxy
        if (hourlyData.length === 0) {
            const questions = await Questions.findMany({
                where: {
                    updated_at: {
                        not: null
                    },
                    spam: false,
                    deleted: false
                },
                select: {
                    updated_at: true
                }
            });

            hourlyData = groupByGermanHour(questions, 'updated_at', date);
        }

        // Fill missing hours with 0 (0-23)
        const result = [];
        for (let hour = 0; hour < 24; hour++) {
            const existingHour = hourlyData.find(h => parseInt(h.hour) === hour);
            result.push({
                hour: hour,
                count: existingHour ? parseInt(existingHour.count) : 0
            });
        }

        res.json(result);
    } catch (error) {
        console.error('Error fetching hourly sessions:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/most-viewed-articles', async (req, res) => {
    try {
        const articles = await HochschuhlABC.findMany({
            where: { active: true },
            include: {
                article_views: {
                    select: { id: true }
                }
            }
        });

        const articlesWithViews = articles
            .map(article => ({
                article: article.article,
                views: article.article_views.length
            }))
            .filter(article => article.views > 0)
            .sort((a, b) => b.views - a.views)
            .slice(0, 5);

        res.json(articlesWithViews);
    } catch (error) {
        console.error('Error fetching most viewed articles:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/feedback-stats', async (req, res) => {
    try {
        const [positive, negative, total] = await Promise.all([
            Feedback.count({ where: { rating: 1 } }),
            Feedback.count({ where: { rating: -1 } }),
            Feedback.count()
        ]);

        const unrated = total - positive - negative;

        res.json({
            positive,
            negative,
            unrated,
            total
        });
    } catch (error) {
        console.error('Error fetching feedback stats:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/content-stats', async (req, res) => {
    try {
        const activeArticles = await HochschuhlABC.count({
            where: { active: true }
        });

        const archivedArticles = await HochschuhlABC.count({
            where: { active: false }
        });

        res.json({
            activeArticles,
            archivedArticles
        });
    } catch (error) {
        console.error('Error fetching content stats:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

 router.get('/top-questions', async (req, res) => {
      try {
          // Query with raw SQL
          const sql = raw_sql_wrapper('get_top_questions');
          const questions = await prisma.$queryRawUnsafe(sql);

         const formattedQuestions = questions.map(q => ({
             question: q.question,
             count: Number(q.count),
             answered_count: Number(q.answered_count) || 0,
             unanswered_count: Number(q.unanswered_count) || 0,
             is_answered: q.answered_count > 0,
             similar_questions: q.similar_questions ? q.similar_questions.split(',').filter(sq => sq.trim()) : [q.question]
         }));

         res.json(formattedQuestions);
     } catch (error) {
         console.error('Error fetching top questions:', error);
         res.status(500).json({ error: 'Internal server error' });
     }
 });

// Function to detect language of text
function detectLanguage(text) {
    if (!text || typeof text !== 'string') return 'unknown';
    
    const normalizedText = text.toLowerCase().trim();
    
    // Pattern-based detection for non-Latin scripts
    const chinesePattern = /[\u4e00-\u9fff]/;
    const arabicPattern = /[\u0600-\u06ff]/;
    const russianPattern = /[\u0400-\u04ff]/;
    const japanesePattern = /[\u3040-\u309f\u30a0-\u30ff]/;
    const koreanPattern = /[\uac00-\ud7af]/;
    const thaiPattern = /[\u0e00-\u0e7f]/;
    const hindiPattern = /[\u0900-\u097f]/;
    
    if (chinesePattern.test(normalizedText)) return 'chinese';
    if (arabicPattern.test(normalizedText)) return 'arabic';
    if (russianPattern.test(normalizedText)) return 'russian';
    if (japanesePattern.test(normalizedText)) return 'japanese';
    if (koreanPattern.test(normalizedText)) return 'korean';
    if (thaiPattern.test(normalizedText)) return 'thai';
    if (hindiPattern.test(normalizedText)) return 'hindi';
    
    const words = normalizedText.split(/\s+/);
    
    // Language word indicators
    const languageWords = {
        german: ['ist', 'das', 'die', 'der', 'wie', 'wo', 'was', 'wann', 'ich', 'und', 'oder', 'mit', 'von', 'zu', 'im', 'am', 'für', 'sind', 'haben', 'kann', 'mensa', 'bibliothek', 'studium', 'vorlesung', 'prüfung'],
        english: ['is', 'the', 'and', 'how', 'what', 'where', 'when', 'can', 'library', 'study', 'exam', 'lecture', 'university', 'campus', 'student', 'hello', 'thank', 'please'],
        spanish: ['es', 'el', 'la', 'y', 'como', 'que', 'donde', 'cuando', 'puedo', 'biblioteca', 'estudio', 'examen', 'universidad', 'hola', 'gracias', 'por favor'],
        french: ['est', 'le', 'la', 'et', 'comment', 'que', 'où', 'quand', 'puis', 'bibliothèque', 'étude', 'examen', 'université', 'bonjour', 'merci', 'sil vous plaît'],
        italian: ['è', 'il', 'la', 'e', 'come', 'che', 'dove', 'quando', 'posso', 'biblioteca', 'studio', 'esame', 'università', 'ciao', 'grazie', 'per favore'],
        portuguese: ['é', 'o', 'a', 'e', 'como', 'que', 'onde', 'quando', 'posso', 'biblioteca', 'estudo', 'exame', 'universidade', 'olá', 'obrigado', 'por favor'],
        dutch: ['is', 'de', 'het', 'en', 'hoe', 'wat', 'waar', 'wanneer', 'kan', 'bibliotheek', 'studie', 'examen', 'universiteit', 'hallo', 'dank', 'alstublieft'],
        polish: ['jest', 'to', 'i', 'jak', 'co', 'gdzie', 'kiedy', 'mogę', 'biblioteka', 'nauka', 'egzamin', 'uniwersytet', 'cześć', 'dziękuję', 'proszę'],
        turkish: ['bu', 've', 'nasıl', 'ne', 'nerede', 'ne zaman', 'kütüphane', 'çalışma', 'sınav', 'üniversite', 'merhaba', 'teşekkür', 'lütfen']
    };
    
    const scores = {};
    Object.keys(languageWords).forEach(lang => {
        scores[lang] = 0;
        words.forEach(word => {
            if (languageWords[lang].includes(word)) {
                scores[lang]++;
            }
        });
    });
    
    const maxScore = Math.max(...Object.values(scores));
    if (maxScore === 0) return 'unknown';
    
    const detectedLang = Object.keys(scores).find(lang => scores[lang] === maxScore);
    return detectedLang || 'unknown';
}

router.get('/category-stats', async (req, res) => {
    try {
        // Get limit parameter, default to 5
        const limit = parseInt(req.query.limit) || 5;
        
        // Get category distribution from conversations
        // Use German timezone for proper "today" calculation
        const germanNow = getGermanNow();
        const germanToday = germanNow.toISODate();

        const conversations = await Conversation.findMany({
            where: {
                category: {
                    not: null
                }
            },
            select: {
                category: true,
                created_at: true
            }
        });

        // Group by category
        const categoryMap = {};
        conversations.forEach(conv => {
            const cat = conv.category || 'Unkategorisiert';
            if (!categoryMap[cat]) {
                categoryMap[cat] = { count: 0, today_count: 0 };
            }
            categoryMap[cat].count++;

            // Check if created today in German timezone
            const convGermanDate = getGermanDateString(conv.created_at);
            if (convGermanDate === germanToday) {
                categoryMap[cat].today_count++;
            }
        });

        // Get total conversations for percentage calculation
        const totalConversations = conversations.length;

        const categoryStats = Object.entries(categoryMap)
            .map(([category, stats]) => ({
                category,
                count: stats.count,
                today_count: stats.today_count,
                percentage: totalConversations > 0 ? Math.round((stats.count / totalConversations) * 100) : 0
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, limit);

        res.json(categoryStats);
    } catch (error) {
        console.error('Error fetching category stats:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/language-stats', async (req, res) => {
    try {
        // Get limit parameter, default to 5
        const limit = parseInt(req.query.limit) || 5;
        
        // Get recent messages (user messages only) and detect their language
        const recentMessages = await Message.findMany({
            where: {
                role: 'user'
            },
            orderBy: { created_at: 'desc' },
            take: 1000 // Analyze last 1000 user messages for language detection
        });

        const languageCount = {};
        const languageToday = {};
        const today = new Date().toISOString().split('T')[0];

        recentMessages.forEach(message => {
            const language = detectLanguage(message.content);
            const messageDate = message.created_at.toISOString().split('T')[0];

            languageCount[language] = (languageCount[language] || 0) + 1;

            if (messageDate === today) {
                languageToday[language] = (languageToday[language] || 0) + 1;
            }
        });

        // Convert to array and sort by count
        const languageStats = Object.keys(languageCount)
            .map(lang => ({
                language: lang,
                count: languageCount[lang],
                today_count: languageToday[lang] || 0,
                percentage: recentMessages.length > 0 ? Math.round((languageCount[lang] / recentMessages.length) * 100) : 0
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, limit);

        res.json(languageStats);
    } catch (error) {
        console.error('Error fetching language stats:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/frequent-messages', async (req, res) => {
    try {
        // Get limit parameter, default to 5
        const limit = parseInt(req.query.limit) || 5;
        
        // Get most frequent user messages - simplified approach
        const messages = await Message.findMany({
            where: {
                role: 'user',
                content: {
                    not: {
                        contains: '<'
                    },
                    not: {
                        contains: 'undefined'
                    }
                }
            },
            select: {
                content: true,
                created_at: true
            }
        });

        // Filter and group messages
        const messageGroups = {};
        messages.forEach(msg => {
            const trimmed = msg.content.trim();
            if (trimmed.length <= 3) return;

            const normalized = trimmed.toLowerCase();
            if (!messageGroups[normalized]) {
                messageGroups[normalized] = {
                    content: trimmed,
                    count: 0,
                    first_seen: msg.created_at,
                    last_seen: msg.created_at,
                    examples: []
                };
            }
            messageGroups[normalized].count++;
            messageGroups[normalized].last_seen = msg.created_at > messageGroups[normalized].last_seen ? msg.created_at : messageGroups[normalized].last_seen;
            messageGroups[normalized].first_seen = msg.created_at < messageGroups[normalized].first_seen ? msg.created_at : messageGroups[normalized].first_seen;
            if (messageGroups[normalized].examples.length < 3) {
                messageGroups[normalized].examples.push(trimmed);
            }
        });

        const frequentMessages = Object.values(messageGroups)
            .filter(group => group.count > 1)
            .sort((a, b) => b.count - a.count || b.last_seen.getTime() - a.last_seen.getTime())
            .slice(0, limit);

        // Simple post-processing for similar messages
        const processedMessages = [];
        const seenNormalized = new Set();

        for (const msg of frequentMessages) {
            // Basic normalization
            let normalized = msg.content.toLowerCase().trim()
                .replace(/[?.!]/g, '')
                .replace(/\s+/g, ' ')
                .replace(/where is/g, 'wo ist')
                .replace(/what is/g, 'was ist')
                .replace(/canteen/g, 'mensa')
                .replace(/library/g, 'bibliothek');

            if (!seenNormalized.has(normalized)) {
                seenNormalized.add(normalized);
                 processedMessages.push({
                     message: msg.content,
                     count: Number(msg.count),
                     first_seen: msg.first_seen.toString(),
                     last_seen: msg.last_seen.toString(),
                     examples: msg.examples
                 });
            }
        }

        res.json(processedMessages);
    } catch (error) {
        console.error('Error fetching frequent messages:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/frequent-questions', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 5;

        // Try to get pre-computed daily statistics first (fast path)
        const today = new Date().toISOString().split('T')[0];
        
        try {
            const dailyStats = await DailyQuestionStats.findMany({
                where: { analysis_date: today },
                orderBy: { question_count: 'desc' },
                take: limit,
                select: {
                    normalized_question: true,
                    question_count: true,
                    topic: true,
                    languages_detected: true,
                    original_questions: true
                }
            });

            if (dailyStats && dailyStats.length > 0) {
                // Use pre-computed statistics (fast!)
                const formattedQuestions = dailyStats.map(stat => ({
                    question: stat.normalized_question,
                    count: Number(stat.question_count),
                    topic: stat.topic,
                    languages: JSON.parse(stat.languages_detected || '[]'),
                    examples: JSON.parse(stat.original_questions || '[]').slice(0, 3).map(q => {
                        return q.replace(/^\d+\.\s*/, '');
                    }),
                    multilingual: JSON.parse(stat.languages_detected || '[]').length > 1
                }));

                console.log(`[Dashboard] Using pre-computed daily statistics: ${formattedQuestions.length} questions`);

                return res.json({
                    questions: formattedQuestions.map(q => ({ ...q, count: Number(q.count) })),
                    isProcessing: false,
                    progress: 100,
                    message: `Vorberechnete Analyse von ${today}`,
                    updated_at: today,
                    source: 'daily_cache'
                });
            }
        } catch (err) {
            console.log('[Dashboard] No daily statistics available, falling back to real-time analysis');
        }

        // Fallback to real-time analysis (slower, but still works)
        // Check if question grouper is available
        if (!groupSimilarQuestions || !extractQuestions) {
            return res.json({
                questions: [],
                isProcessing: false,
                progress: 100,
                message: 'Tägliche Analyse läuft um Mitternacht. Manuelle Analyse nicht verfügbar (AI_API_KEY nicht konfiguriert)',
                source: 'unavailable'
            });
        }

        console.log('[Dashboard] Starting real-time frequent questions analysis...');
        
        // Get recent user messages (limit to avoid performance issues)
        const recentMessages = await Message.findMany({
            where: {
                role: 'user',
                created_at: {
                    gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Reduce to 7 days for real-time
                }
            },
            select: { content: true, role: true, created_at: true },
            orderBy: { created_at: 'desc' },
            take: 200 // Reduce limit for real-time analysis
        });

        console.log(`[Dashboard] Found ${recentMessages.length} recent messages`);

        // Extract questions from messages
        const questions = extractQuestions(recentMessages);
        
        if (questions.length === 0) {
            return res.json({
                questions: [],
                isProcessing: false,
                progress: 100,
                message: 'Keine Fragen in den letzten 7 Tagen gefunden',
                source: 'realtime_empty'
            });
        }

        console.log(`[Dashboard] Extracted ${questions.length} questions`);

        // Group similar questions using AI with caching
        const groupingResult = await groupSimilarQuestions(questions, true);
        
        if (!groupingResult) {
            return res.status(500).json({ error: 'Failed to group questions' });
        }
        
        // Format for frontend
        const formattedQuestions = groupingResult.results
            .filter(group => group.question_count > 1) // Only show questions asked multiple times
            .slice(0, limit) // Use dynamic limit
            .map(group => ({
                question: group.normalized_question,
                count: Number(group.question_count),
                topic: group.topic,
                languages: group.languages_detected,
                examples: group.original_questions.slice(0, 3).map(q => {
                    // Remove the numbering from examples
                    return q.replace(/^\d+\.\s*/, '');
                }),
                multilingual: group.languages_detected.length > 1
            }));

        console.log(`[Dashboard] Returning ${formattedQuestions.length} grouped questions (processing: ${groupingResult.isProcessing})`);
        
        res.json({
            questions: formattedQuestions,
            isProcessing: groupingResult.isProcessing,
            progress: groupingResult.progress,
            message: groupingResult.isProcessing ? 'Daten werden noch ausgewertet, bitte warten' : (formattedQuestions.length > 0 ? 'Real-time Analyse der letzten 7 Tage' : ''),
            source: 'realtime'
        });
    } catch (error) {
        console.error('Error fetching frequent questions:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/unanswered-questions', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 5;

        // Try to get pre-computed unanswered statistics first (fast path)
        const today = new Date().toISOString().split('T')[0];

        try {
            const dailyStats = await DailyUnansweredStats.findMany({
                where: { analysis_date: today },
                orderBy: { question_count: 'desc' },
                take: limit,
                select: {
                    normalized_question: true,
                    question_count: true,
                    topic: true,
                    languages_detected: true,
                    original_questions: true
                }
            });

            if (dailyStats && dailyStats.length > 0) {
                // Use pre-computed statistics (fast!)
                const formattedQuestions = dailyStats.map(stat => ({
                    question: stat.normalized_question,
                    count: Number(stat.question_count),
                    topic: stat.topic,
                    languages: JSON.parse(stat.languages_detected || '[]'),
                    examples: JSON.parse(stat.original_questions || '[]').slice(0, 3).map(q => {
                        return q.replace(/^\d+\.\s*/, '');
                    }),
                    multilingual: JSON.parse(stat.languages_detected || '[]').length > 1
                }));

                console.log(`[Dashboard] Using pre-computed unanswered statistics: ${formattedQuestions.length} questions`);
                
                return res.json({
                    questions: formattedQuestions,
                    isProcessing: false,
                    progress: 100,
                    message: `Vorberechnete Analyse von ${today}`,
                    updated_at: today,
                    source: 'daily_cache'
                });
            }
        } catch (err) {
            console.log('[Dashboard] No daily unanswered statistics available, falling back to real-time analysis');
        }

        // Fallback to real-time analysis
         // First get potentially unanswered messages using raw SQL
         const sql = raw_sql_wrapper('get_unanswered_questions');
         const potentialUnanswered = await prisma.$queryRawUnsafe(sql);

        if (potentialUnanswered.length === 0) {
            return res.json({
                questions: [],
                isProcessing: false,
                progress: 100,
                message: 'Keine unbeantworteten Fragen in den letzten 7 Tagen',
                source: 'realtime_empty'
            });
        }

        // Check if question grouper is available for intelligent analysis
        if (!groupSimilarQuestions || !extractQuestions) {
            // Fallback to simple grouping
            const simpleGroups = {};
            potentialUnanswered.forEach(msg => {
                const key = msg.content.toLowerCase().trim();
                if (!simpleGroups[key]) {
                    simpleGroups[key] = {
                        question: msg.content,
                        count: 0,
                        category: msg.category || 'Unkategorisiert',
                        examples: []
                    };
                }
                simpleGroups[key].count++;
                if (simpleGroups[key].examples.length < 3) {
                    simpleGroups[key].examples.push(msg.content);
                }
            });

            const simpleResult = Object.values(simpleGroups)
                .filter(group => group.count > 1)
                .sort((a, b) => b.count - a.count)
                .slice(0, limit)
                .map(group => ({
                    question: group.question,
                    count: group.count,
                    topic: group.category,
                    languages: ['deutsch'], // Default assumption
                    examples: group.examples,
                    multilingual: false
                }));

            return res.json({
                questions: simpleResult,
                isProcessing: false,
                progress: 100,
                message: 'Einfache Gruppierung (KI-Analyse nicht verfügbar)',
                source: 'simple_grouping'
            });
        }

        console.log(`[Dashboard] Starting intelligent unanswered questions analysis for ${potentialUnanswered.length} messages`);

        // Convert to format expected by question grouper
        const messagesForGrouper = potentialUnanswered.map(msg => ({
            content: msg.content,
            role: 'user',
            created_at: msg.created_at
        }));

        // Extract questions using the same logic as frequent questions
        const questions = extractQuestions(messagesForGrouper);
        
        if (questions.length === 0) {
            return res.json({
                questions: [],
                isProcessing: false,
                progress: 100,
                message: 'Keine Fragen in unbeantworteten Nachrichten gefunden',
                source: 'no_questions'
            });
        }

        // Group similar questions using AI with caching
        const groupingResult = await groupSimilarQuestions(questions, true);
        
        if (!groupingResult) {
            return res.status(500).json({ error: 'Failed to group unanswered questions' });
        }
        
        // Format for frontend
        const formattedQuestions = groupingResult.results
            .filter(group => group.question_count > 1) // Only show questions asked multiple times
            .slice(0, limit) // Use dynamic limit
            .map(group => ({
                question: group.normalized_question,
                count: Number(group.question_count),
                topic: group.topic,
                languages: group.languages_detected,
                examples: group.original_questions.slice(0, 3).map(q => {
                    // Remove the numbering from examples
                    return q.replace(/^\d+\.\s*/, '');
                }),
                multilingual: group.languages_detected.length > 1
            }));

        console.log(`[Dashboard] Returning ${formattedQuestions.length} grouped unanswered questions (processing: ${groupingResult.isProcessing})`);
        
        res.json({
            questions: formattedQuestions,
            isProcessing: groupingResult.isProcessing,
            progress: groupingResult.progress,
            message: groupingResult.isProcessing ? 'Daten werden noch ausgewertet, bitte warten' : (formattedQuestions.length > 0 ? 'Intelligente Analyse unbeantworteter Fragen (7 Tage)' : ''),
            source: 'realtime_ai'
        });
    } catch (error) {
        console.error('Error fetching unanswered questions:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/trigger-analysis', async (req, res) => {
    try {
        // Check if question grouper is available
        if (!groupSimilarQuestions || !extractQuestions) {
            return res.status(400).json({ 
                error: 'Question analysis not available (AI_API_KEY not configured)',
                success: false
            });
        }

        // Get recent messages for analysis
        const recentMessages = await Message.findMany({
            where: {
                role: 'user',
                created_at: {
                    gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
                }
            },
            select: { content: true, role: true, created_at: true },
            orderBy: { created_at: 'desc' }
        });

        if (recentMessages.length === 0) {
            return res.json({
                success: false,
                message: 'Keine Nachrichten zum Analysieren gefunden'
            });
        }

        // Extract questions
        const questions = extractQuestions(recentMessages);
        
        if (questions.length === 0) {
            return res.json({
                success: false,
                message: 'Keine Fragen in den Nachrichten gefunden'
            });
        }

        console.log(`[Manual Analysis] Processing ${questions.length} questions from ${recentMessages.length} messages`);

        // Force fresh analysis (no cache)
        const groupingResult = await groupSimilarQuestions(questions, false);
        
        if (!groupingResult || !groupingResult.results) {
            return res.status(500).json({ 
                error: 'Analysis failed',
                success: false
            });
        }

        // Store results in daily statistics table
        const today = new Date().toISOString().split('T')[0];
        
        // Clear today's statistics
        await DailyQuestionStats.deleteMany({ where: { analysis_date: today } });

        // Insert new statistics
        const statsData = groupingResult.results.map(group => ({
            analysis_date: today,
            normalized_question: group.normalized_question,
            question_count: group.question_count,
            topic: group.topic,
            languages_detected: JSON.stringify(group.languages_detected),
            original_questions: JSON.stringify(group.original_questions)
        }));

        if (statsData.length > 0) {
            await DailyQuestionStats.createMany({
                data: statsData
            });
        }

        console.log(`[Manual Analysis] Completed: ${statsData.length} question groups stored`);

        res.json({
            success: true,
            message: `Analyse abgeschlossen: ${statsData.length} Fragengruppen identifiziert`,
            questionsProcessed: questions.length,
            groupsFound: statsData.length,
            analysisDate: today
        });

    } catch (error) {
        console.error('Manual analysis failed:', error);
        res.status(500).json({ 
            error: 'Analysis failed: ' + error.message,
            success: false
        });
    }
});

router.get('/analysis-status', async (req, res) => {
    try {
        // Check when last analysis was performed
        const stats = await DailyQuestionStats.findMany({
            select: {
                analysis_date: true,
                created_at: true
            },
            orderBy: {
                analysis_date: 'desc'
            }
        });

        // Group by analysis_date
        const analysisGroups = {};
        stats.forEach(stat => {
            if (!analysisGroups[stat.analysis_date]) {
                analysisGroups[stat.analysis_date] = {
                    analysis_date: stat.analysis_date,
                    question_groups: 0,
                    updated_at: stat.created_at
                };
            }
            analysisGroups[stat.analysis_date].question_groups++;
            if (stat.created_at > analysisGroups[stat.analysis_date].updated_at) {
                analysisGroups[stat.analysis_date].updated_at = stat.created_at;
            }
        });

        const latestAnalysis = Object.values(analysisGroups)
            .sort((a, b) => b.analysis_date.localeCompare(a.analysis_date))
            .slice(0, 1);

        const analysisAvailable = groupSimilarQuestions && extractQuestions;

        if (latestAnalysis.length > 0) {
            const latest = latestAnalysis[0];
            const analysisDate = new Date(latest.analysis_date);
            const today = new Date();
            const daysDiff = Math.floor((today - analysisDate) / (1000 * 60 * 60 * 24));

            res.json({
                hasData: true,
                lastAnalysis: latest.analysis_date,
                updated_at: latest.updated_at,
                questionGroups: latest.question_groups,
                daysSinceAnalysis: daysDiff,
                isToday: daysDiff === 0,
                analysisAvailable,
                status: daysDiff === 0 ? 'current' : daysDiff === 1 ? 'yesterday' : 'outdated'
            });
        } else {
            res.json({
                hasData: false,
                lastAnalysis: null,
                updated_at: null,
                questionGroups: 0,
                daysSinceAnalysis: null,
                isToday: false,
                analysisAvailable,
                status: 'no_data'
            });
        }
    } catch (error) {
        console.error('Error fetching analysis status:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
