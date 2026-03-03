import '../styles/tailwind-backend.css';

class DashboardManager {
    constructor() {
        this.charts = {};
        this.refreshInterval = null;
        this.init();
    }

    async init() {
        await this.loadDashboard();
        this.setupEventListeners();
        this.startAutoRefresh();
    }

    setupEventListeners() {
        const refreshButton = document.getElementById('refresh-btn');
        const mobileMenuButton = document.getElementById('mobile-menu-button');
        const mobileMenu = document.getElementById('mobile-menu');
        const refreshButtonMobile = document.getElementById('refresh-btn-mobile');

        const handleRefresh = () => {
            this.loadDashboard();

            // Disable buttons and start cooldown
            const buttons = [refreshButton, refreshButtonMobile];
            buttons.forEach(button => {
                if (button) {
                    button.disabled = true;
                    button.classList.add('bg-gray-400', 'cursor-not-allowed');
                    button.classList.remove('bg-orange-600', 'hover:bg-orange-700');
                }
            });

            let countdown = 10;
            const updateButtonText = () => {
                buttons.forEach(button => {
                    if (button) {
                        button.innerHTML = `<i class="fas fa-clock mr-2"></i>Bitte warten (${countdown}s)`;
                    }
                });
            };

            updateButtonText();

            const interval = setInterval(() => {
                countdown--;
                updateButtonText();
                if (countdown <= 0) {
                    clearInterval(interval);
                    buttons.forEach(button => {
                        if (button) {
                            button.disabled = false;
                            button.innerHTML = '<i class="fas fa-refresh mr-2"></i>Aktualisieren';
                            button.classList.remove('bg-gray-400', 'cursor-not-allowed');
                            button.classList.add('bg-orange-600', 'hover:bg-orange-700');
                        }
                    });
                }
            }, 1000);
        };

        if (refreshButton) {
            refreshButton.addEventListener('click', handleRefresh);
        }
        if (refreshButtonMobile) {
            refreshButtonMobile.addEventListener('click', handleRefresh);
        }

        if (mobileMenuButton && mobileMenu) {
            mobileMenuButton.addEventListener('click', () => {
                mobileMenu.classList.toggle('hidden');
            });
        }


        // Add manual analysis trigger button for frequent questions
        const triggerButton = document.getElementById('trigger-analysis-btn');
        if (triggerButton) {
            triggerButton.addEventListener('click', async () => {
                await this.handleManualAnalysis();
            });
        }

        // Add manual analysis trigger button for unanswered questions
        const triggerUnansweredButton = document.getElementById('trigger-unanswered-analysis-btn');
        if (triggerUnansweredButton) {
            triggerUnansweredButton.addEventListener('click', async () => {
                await this.handleManualUnansweredAnalysis();
            });
        }

        // Load initial analysis status
        this.loadAnalysisStatus();

        // Auto-refresh every 2 minutes
        this.startAutoRefresh();
    }

    startAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
        
        this.refreshInterval = setInterval(() => {
            this.loadDashboard(false); // Silent refresh
        }, 300000); // Refresh every 5 minutes (300 seconds)
    }


    async loadDashboard(showLoading = true) {
        try {
            if (showLoading) {
                this.showLoading();
            }

            // Get current limit settings from dropdowns
            const categoryLimit = 5;
            const languageLimit = 5;
            const messagesLimit = 5;
            const questionsLimit = 5;
            const unansweredLimit = 5;

            // Load all data in parallel
            const [kpis, recentFeedback, sessions, mostViewedArticles, feedbackStats, contentStats, topQuestions, categoryStats, languageStats, frequentMessages, frequentQuestions, unansweredQuestionsData] = await Promise.all([
                this.fetchKpis(),
                this.fetchRecentFeedback(),
                this.fetchSessions(),
                this.fetchMostViewedArticles(),
                this.fetchFeedbackStats(),
                this.fetchContentStats(),
                this.fetchTopQuestions(),
                this.fetchCategoryStats(categoryLimit),
                this.fetchLanguageStats(languageLimit),
                this.fetchFrequentMessages(messagesLimit),
                this.fetchFrequentQuestions(questionsLimit),
                this.fetchUnansweredQuestions(unansweredLimit)
            ]);

            // Render all components
            this.renderKpis(kpis);
            this.renderRecentFeedback(recentFeedback);
            this.renderSessionsChart(sessions);
            this.renderMostViewedArticles(mostViewedArticles);
            this.renderFeedbackStats(feedbackStats);
            this.renderContentStats(contentStats);
            this.renderTopQuestions(topQuestions);
            this.renderCategoryStats(categoryStats);
            this.renderLanguageStats(languageStats);
            this.renderFrequentMessages(frequentMessages);
            this.renderFrequentQuestions(frequentQuestions);
            this.renderUnansweredQuestionsData(unansweredQuestionsData);

            this.updateLastRefresh();
            this.hideLoading();

        } catch (error) {
            console.error('❌ Fehler beim Laden des Dashboards:', error);
            
            // Check if it's a session error
            if (error.message.includes('401') || error.message.includes('Session expired')) {
                this.showError('Session abgelaufen. Seite wird neu geladen...', 'warning');
                setTimeout(() => {
                    window.location.reload();
                }, 2000);
            } else if (error.message.includes('429') || error.message.includes('Too Many Requests')) {
                this.showError('Zu viele Anfragen. Auto-Refresh pausiert für 5 Minuten.', 'warning');
                // Pause auto-refresh for 5 minutes
                if (this.refreshInterval) {
                    clearInterval(this.refreshInterval);
                    setTimeout(() => {
                        this.startAutoRefresh();
                    }, 300000); // 5 minutes
                }
            } else {
                this.showError('Fehler beim Laden der Dashboard-Daten. Bitte versuchen Sie es später erneut.');
            }
            this.hideLoading();
        }
    }

    // API Fetch Methods
    async fetchKpis() {
        const response = await fetch('/api/dashboard/kpis');
        if (!response.ok) {
            if (response.status === 429) {
                throw new Error('429 Too Many Requests');
            }
            throw new Error('KPI fetch failed');
        }
        return response.json();
    }

    async fetchUnansweredQuestions() {
        const response = await fetch('/api/dashboard/unanswered-questions');
        if (!response.ok) throw new Error('Unanswered questions fetch failed');
        return response.json();
    }

    async fetchRecentFeedback() {
        const response = await fetch('/api/dashboard/recent-feedback');
        if (!response.ok) throw new Error('Recent feedback fetch failed');
        return response.json();
    }

    async fetchSessions() {
        const response = await fetch('/api/dashboard/sessions');
        if (!response.ok) throw new Error('Sessions fetch failed');
        return response.json();
    }

    async fetchMostViewedArticles() {
        const response = await fetch('/api/dashboard/most-viewed-articles');
        if (!response.ok) throw new Error('Most viewed articles fetch failed');
        return response.json();
    }

    async fetchFeedbackStats() {
        const response = await fetch('/api/dashboard/feedback-stats');
        if (!response.ok) throw new Error('Feedback stats fetch failed');
        return response.json();
    }

    async fetchContentStats() {
        const response = await fetch('/api/dashboard/content-stats');
        if (!response.ok) throw new Error('Content stats fetch failed');
        return response.json();
    }

    async fetchTopQuestions() {
        const response = await fetch('/api/dashboard/top-questions');
        if (!response.ok) throw new Error('Top questions fetch failed');
        return response.json();
    }

    async fetchCategoryStats(limit = 5) {
        const response = await fetch(`/api/dashboard/category-stats?limit=${limit}`);
        if (!response.ok) throw new Error('Category stats fetch failed');
        return response.json();
    }

    async fetchLanguageStats(limit = 5) {
        const response = await fetch(`/api/dashboard/language-stats?limit=${limit}`);
        if (!response.ok) throw new Error('Language stats fetch failed');
        return response.json();
    }

    async fetchFrequentMessages(limit = 5) {
        const response = await fetch(`/api/dashboard/frequent-messages?limit=${limit}`);
        if (!response.ok) throw new Error('Frequent messages fetch failed');
        return response.json();
    }

    async fetchFrequentQuestions(limit = 5) {
        const response = await fetch(`/api/dashboard/frequent-questions?limit=${limit}`);
        if (!response.ok) throw new Error('Frequent questions fetch failed');
        return response.json();
    }

    async fetchUnansweredQuestions(limit = 5) {
        const response = await fetch(`/api/dashboard/unanswered-questions?limit=${limit}`);
        if (!response.ok) throw new Error('Unanswered questions fetch failed');
        return response.json();
    }

    async fetchAnalysisStatus() {
        const response = await fetch('/api/dashboard/analysis-status');
        if (!response.ok) throw new Error('Analysis status fetch failed');
        return response.json();
    }

    async triggerManualAnalysis() {
        const response = await fetch('/api/dashboard/trigger-analysis', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return response.json();
    }

    // Render Methods
    renderKpis(kpis) {
        const totalSessions = document.getElementById('total-sessions');
        const todaySessions = document.getElementById('today-sessions');
        const successRate = document.getElementById('success-rate');
        const openQuestions = document.getElementById('open-questions');
        
        if (totalSessions) totalSessions.textContent = kpis.totalSessions || 0;
        if (todaySessions) todaySessions.textContent = kpis.todaySessions || 0;
        if (successRate) successRate.textContent = `${kpis.successRate || 0}%`;
        if (openQuestions) openQuestions.textContent = kpis.openQuestions || 0;
    }

    renderUnansweredQuestions(questions) {
        const container = document.getElementById('unanswered-questions');
        if (!container) return;
        
        // Always show Under Construction for now
        container.innerHTML = `
            <div class="text-center">
                <i class="fas fa-tools text-orange-600 text-2xl mb-2"></i>
                <p class="text-orange-600 font-semibold">Under Construction</p>
            </div>
        `;
        return;

        container.innerHTML = questions.map((q, index) => `
            <div class="question-item">
                <div class="flex justify-between items-start">
                    <div class="flex items-start space-x-3 flex-1">
                        <div class="bg-orange-100 text-orange-600 rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">
                            ${index + 1}
                        </div>
                        <div class="flex-1">
                            <p class="text-gray-800 font-medium leading-relaxed">${this.escapeHtml(q.question)}</p>
                            ${q.similar_questions && q.similar_questions.length > 1 ? 
                                `<div class="mt-2">
                                    <p class="text-xs text-gray-400 mb-1">Ähnliche Varianten:</p>
                                    <div class="text-xs text-gray-600 space-y-1">
                                        ${q.similar_questions.slice(0, 3).map(sq => 
                                            `<div class="bg-gray-50 px-2 py-1 rounded">${this.escapeHtml(sq)}</div>`
                                        ).join('')}
                                        ${q.similar_questions.length > 3 ? 
                                            `<div class="text-xs text-gray-400">... und ${q.similar_questions.length - 3} weitere</div>` : ''
                                        }
                                    </div>
                                </div>` : ''
                            }
                        </div>
                    </div>
                    <div class="flex flex-col items-center ml-3">
                        <span class="question-badge">${q.count}×</span>
                        <span class="text-xs text-gray-400 mt-1">mal gefragt</span>
                    </div>
                </div>
            </div>
        `).join('');
    }

    renderRecentFeedback(feedback) {
        const container = document.getElementById('recent-feedback');
        
        if (!feedback || feedback.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-comment-slash text-gray-400"></i>
                    <p>Noch kein Feedback vorhanden</p>
                </div>
            `;
            return;
        }

        container.innerHTML = feedback.map(item => `
            <div class="feedback-item">
                <p class="text-gray-700 text-sm mb-2 leading-relaxed">
                    ${this.truncateText(this.escapeHtml(item.feedback_text), 150)}
                </p>
                <div class="flex justify-between items-center text-xs text-gray-500">
                    <span>${this.formatDate(item.timestamp)}</span>
                    <i class="fas fa-quote-right opacity-50"></i>
                </div>
            </div>
        `).join('');
    }

    renderSessionsChart(sessions) {
        const container = document.getElementById('sessions-bars');
        
        if (!sessions || sessions.length === 0) {
            container.innerHTML = `
                <div class="text-gray-500 text-center w-full">
                    <i class="fas fa-chart-bar text-4xl mb-4 opacity-50"></i>
                    <p>Keine Session-Daten der letzten 7 Tage</p>
                    <p class="text-sm">Starte ein paar Chat-Sessions um Daten zu sammeln!</p>
                </div>
            `;
            return;
        }

        const maxCount = Math.max(...sessions.map(s => s.count), 1);
        
        container.innerHTML = sessions.map((session, index) => {
            const percentage = maxCount > 0 ? (session.count / maxCount) * 100 : 0;
            const height = Math.max(percentage, session.count > 0 ? 15 : 5); // Minimum height for data
            const isToday = new Date(session.date).toDateString() === new Date().toDateString();
            
            return `
                <div class="flex flex-col items-center flex-1 group relative cursor-pointer session-bar" 
                     data-date="${session.date}" data-count="${session.count}">
                    <!-- Value label -->
                    <div class="text-xs font-bold text-gray-800 mb-1 ${session.count === 0 ? 'text-gray-400' : ''}">${session.count}</div>
                    
                    <!-- Bar -->
                    <div class="relative w-12 flex flex-col justify-end bg-gray-100 rounded-lg overflow-hidden shadow-inner" 
                         style="height: 120px;" 
                         title="Klicken für Stundenansicht - ${this.formatDateShort(session.date)}: ${session.count} Sessions">
                        <div class="w-full ${session.count === 0 ? 'bg-gray-300' : 'bg-linear-to-t from-orange-600 via-orange-500 to-orange-400'} 
                                    transition-all duration-500 ease-out hover:brightness-110 rounded-t-lg" 
                             style="height: ${height}%;">
                        </div>
                        ${isToday ? '<div class="absolute -top-1 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>' : ''}
                    </div>
                    
                    <!-- Date label -->
                    <div class="text-xs text-gray-600 mt-2 font-medium ${isToday ? 'text-green-700 font-bold' : ''}">
                        ${isToday ? 'Heute' : this.formatDateShort(session.date)}
                    </div>
                    
                    <!-- Hover effect -->
                    <div class="absolute inset-0 bg-orange-100 opacity-0 group-hover:opacity-20 transition-opacity duration-200 rounded-lg"></div>
                    
                    <!-- Click indicator -->
                    <div class="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <i class="fas fa-clock text-xs text-orange-600"></i>
                    </div>
                </div>
            `;
        }).join('');

        // Add event listeners for session bars after rendering
        setTimeout(() => {
            const sessionBars = document.querySelectorAll('.session-bar');
            sessionBars.forEach(bar => {
                bar.addEventListener('click', (e) => {
                    const date = bar.dataset.date;
                    const count = parseInt(bar.dataset.count);
                    this.showHourlyView(date, count);
                });
            });
        }, 0);
    }

    renderMostViewedArticles(articles) {
        const container = document.getElementById('most-viewed-articles');
        if (!container) return; // Element was removed
        
        if (!articles || articles.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-file-alt text-gray-400"></i>
                    <p>Noch keine Artikel-Aufrufe</p>
                </div>
            `;
            return;
        }

        container.innerHTML = articles.map((article, index) => `
            <div class="article-item">
                <div class="flex items-center">
                    <div class="shrink-0 w-8 h-8 bg-linear-to-br from-orange-400 to-red-500 rounded-full flex items-center justify-center text-white font-bold text-sm mr-3">
                        ${index + 1}
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="text-gray-900 font-medium truncate">${this.escapeHtml(article.article)}</p>
                    </div>
                </div>
                <span class="article-views">${article.views} Views</span>
            </div>
        `).join('');
    }

    renderFeedbackStats(stats) {
        // These elements were removed from HTML, so skip this
    }

    renderContentStats(stats) {
        // These elements were removed from HTML, so skip this
    }

    renderTopQuestions(questions) {
        const container = document.getElementById('top-questions');
        if (!container) return;
        
        // Always show Under Construction for now
        container.innerHTML = `
            <div class="text-center">
                <i class="fas fa-tools text-orange-600 text-2xl mb-2"></i>
                <p class="text-orange-600 font-semibold">Under Construction</p>
            </div>
        `;
        return;

        container.innerHTML = questions.map((q, index) => `
            <div class="question-item ${q.is_answered ? 'border-green-200 bg-green-50' : 'border-gray-200'}">
                <div class="flex justify-between items-start">
                    <div class="flex items-start space-x-3 flex-1">
                        <div class="bg-blue-100 text-blue-600 rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">
                            ${index + 1}
                        </div>
                        <div class="flex-1">
                            <p class="text-gray-800 font-medium leading-relaxed">${this.escapeHtml(q.question)}</p>
                            <div class="flex items-center space-x-4 mt-2 text-xs">
                                ${q.is_answered ? 
                                    `<span class="bg-green-100 text-green-700 px-2 py-1 rounded-full">
                                        <i class="fas fa-check mr-1"></i>Beantwortet
                                    </span>` : 
                                    `<span class="bg-orange-100 text-orange-700 px-2 py-1 rounded-full">
                                        <i class="fas fa-clock mr-1"></i>Offen
                                    </span>`
                                }
                                ${q.answered_count > 0 ? `<span class="text-green-600">${q.answered_count}× beantwortet</span>` : ''}
                                ${q.unanswered_count > 0 ? `<span class="text-orange-600">${q.unanswered_count}× offen</span>` : ''}
                            </div>
                            ${q.similar_questions && q.similar_questions.length > 1 ? 
                                `<div class="mt-2">
                                    <p class="text-xs text-gray-400 mb-1">Varianten (${q.similar_questions.length}):</p>
                                    <div class="text-xs text-gray-600">
                                        ${q.similar_questions.slice(0, 2).map(sq => 
                                            `<span class="inline-block bg-gray-100 px-2 py-1 rounded mr-1 mb-1">${this.escapeHtml(sq)}</span>`
                                        ).join('')}
                                        ${q.similar_questions.length > 2 ? 
                                            `<span class="text-xs text-gray-400">+${q.similar_questions.length - 2} weitere</span>` : ''
                                        }
                                    </div>
                                </div>` : ''
                            }
                        </div>
                    </div>
                    <div class="flex flex-col items-center ml-3">
                        <span class="question-badge">${q.count}×</span>
                        <span class="text-xs text-gray-400 mt-1">gesamt</span>
                    </div>
                </div>
            </div>
        `).join('');
    }

    renderCategoryStats(categoryStats) {
        const container = document.getElementById('category-stats');
        if (!container) return;

        if (!categoryStats || categoryStats.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-tags text-gray-400"></i>
                    <p>Keine Kategorien-Daten verfügbar</p>
                </div>
            `;
            return;
        }

        // Clear container first to ensure clean transition
        container.innerHTML = '';
        
        // Add new content
        const wrapper = document.createElement('div');
        wrapper.className = 'space-y-3';
        wrapper.innerHTML = categoryStats.map((cat, index) => `
            <div class="category-item flex items-center justify-between p-3 bg-white rounded-lg border border-gray-100 hover:shadow-sm transition-shadow">
                <div class="flex items-center space-x-3">
                    <div class="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-gray-600 font-bold text-sm">
                        ${index + 1}
                    </div>
                    <div>
                        <p class="font-medium text-gray-900">${this.escapeHtml(cat.category)}</p>
                        <div class="flex items-center space-x-2 text-xs text-gray-500">
                            <span>${cat.percentage}% der Gespräche</span>
                            ${cat.today_count > 0 ? `<span class="bg-green-100 text-green-700 px-2 py-1 rounded">+${cat.today_count} heute</span>` : ''}
                        </div>
                    </div>
                </div>
                <div class="text-right">
                    <div class="text-lg font-bold text-gray-900">${cat.count}</div>
                    <div class="text-xs text-gray-500">Gespräche</div>
                </div>
            </div>
        `).join('');
        
        container.appendChild(wrapper);
    }

    renderLanguageStats(languageStats) {
        const container = document.getElementById('language-stats');
        if (!container) return;

        if (!languageStats || languageStats.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-language text-gray-400"></i>
                    <p>Keine Sprach-Daten verfügbar</p>
                </div>
            `;
            return;
        }

        const languageInfo = {
            'german': { name: 'Deutsch', flag: '🇩🇪' },
            'english': { name: 'English', flag: '🇺🇸' },
            'chinese': { name: '中文', flag: '🇨🇳' },
            'spanish': { name: 'Español', flag: '🇪🇸' },
            'french': { name: 'Français', flag: '🇫🇷' },
            'italian': { name: 'Italiano', flag: '🇮🇹' },
            'portuguese': { name: 'Português', flag: '🇵🇹' },
            'dutch': { name: 'Nederlands', flag: '🇳🇱' },
            'polish': { name: 'Polski', flag: '🇵🇱' },
            'turkish': { name: 'Türkçe', flag: '🇹🇷' },
            'arabic': { name: 'العربية', flag: '🇸🇦' },
            'russian': { name: 'Русский', flag: '🇷🇺' },
            'japanese': { name: '日本語', flag: '🇯🇵' },
            'korean': { name: '한국어', flag: '🇰🇷' },
            'thai': { name: 'ไทย', flag: '🇹🇭' },
            'hindi': { name: 'हिन्दी', flag: '🇮🇳' },
            'unknown': { name: 'Unbekannt', flag: '❓' }
        };

        // Clear container first to ensure clean transition
        container.innerHTML = '';
        
        // Add new content
        const wrapper = document.createElement('div');
        wrapper.className = 'space-y-3';
        wrapper.innerHTML = languageStats.map((lang, index) => {
            const info = languageInfo[lang.language] || { name: lang.language, flag: '🏳️' };
            return `
            <div class="language-item flex items-center justify-between p-3 bg-white rounded-lg border border-gray-100 hover:shadow-sm transition-shadow">
                <div class="flex items-center space-x-3">
                    <div class="w-8 h-8 flex items-center justify-center text-2xl">
                        ${info.flag}
                    </div>
                    <div>
                        <p class="font-medium text-gray-900">${info.name}</p>
                        <div class="flex items-center space-x-2 text-xs text-gray-500">
                            <span>${lang.percentage}% der Nachrichten</span>
                            ${lang.today_count > 0 ? `<span class="bg-green-100 text-green-700 px-2 py-1 rounded">+${lang.today_count} heute</span>` : ''}
                        </div>
                    </div>
                </div>
                <div class="text-right">
                    <div class="text-lg font-bold text-gray-900">${lang.count}</div>
                    <div class="text-xs text-gray-500">Nachrichten</div>
                </div>
            </div>
            `;
        }).join('');
        
        container.appendChild(wrapper);
    }

    renderFrequentMessages(messages) {
        const container = document.getElementById('frequent-messages');
        if (!container) return;

        if (!messages || messages.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-comments text-gray-400"></i>
                    <p>Keine häufigen Nachrichten verfügbar</p>
                </div>
            `;
            return;
        }

        // Clear container first to ensure clean transition
        container.innerHTML = '';
        
        // Add new content
        const wrapper = document.createElement('div');
        wrapper.className = 'space-y-3';
        wrapper.innerHTML = messages.map((msg, index) => `
            <div class="message-item flex items-start justify-between p-3 bg-white rounded-lg border border-gray-100 hover:shadow-sm transition-shadow">
                <div class="flex items-start space-x-3 flex-1">
                    <div class="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-sm shrink-0">
                        ${index + 1}
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="font-medium text-gray-900 mb-1 break-words">${this.escapeHtml(msg.message)}</p>
                        ${msg.examples.length > 1 ? `
                            <div class="mb-2">
                                <p class="text-xs text-gray-400 mb-1">Weitere Varianten:</p>
                                <div class="flex flex-wrap gap-1">
                                    ${msg.examples.slice(1, 3).map(example => 
                                        `<span class="inline-block bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs">${this.escapeHtml(example)}</span>`
                                    ).join('')}
                                    ${msg.examples.length > 3 ? `<span class="text-xs text-gray-400">+${msg.examples.length - 3} weitere</span>` : ''}
                                </div>
                            </div>
                        ` : ''}
                        <div class="flex items-center space-x-2 text-xs text-gray-500">
                            <span>Zuletzt: ${this.formatDate(msg.last_seen)}</span>
                        </div>
                    </div>
                </div>
                <div class="text-right shrink-0 ml-3">
                    <div class="text-lg font-bold text-gray-900">${msg.count}×</div>
                    <div class="text-xs text-gray-500">gefragt</div>
                </div>
            </div>
        `).join('');
        
        container.appendChild(wrapper);
    }

    renderFrequentQuestions(data) {
        const container = document.getElementById('frequent-questions');
        if (!container) return;

        // Handle both old format (array) and new format (object)
        const questions = Array.isArray(data) ? data : (data?.questions || []);
        const isProcessing = data?.isProcessing || false;
        const progress = data?.progress || 100;
        const message = data?.message || '';

        if (!questions || questions.length === 0) {
            if (isProcessing) {
                container.innerHTML = `
                    <div class="processing-state text-center py-6">
                        <div class="animate-spin inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mb-3"></div>
                        <p class="text-gray-600 font-medium">Daten werden noch ausgewertet, bitte warten</p>
                    </div>
                `;
            } else {
                container.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-question-circle text-gray-400"></i>
                        <p>Keine häufigen Fragen verfügbar</p>
                        <p class="text-xs text-gray-400 mt-1">Fragen werden automatisch gruppiert und analysiert</p>
                    </div>
                `;
            }
            
            // Auto-refresh if processing
            if (isProcessing) {
                setTimeout(() => this.refreshFrequentQuestions(), 3000);
            }
            return;
        }

        // Clear container first to ensure clean transition
        container.innerHTML = '';
        
        // Create main content wrapper
        const mainWrapper = document.createElement('div');
        mainWrapper.className = 'space-y-4';
        mainWrapper.innerHTML = questions.map((q, index) => `
            <div class="question-item p-4 bg-linear-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-100">
                <div class="flex items-start justify-between">
                    <div class="flex items-start space-x-3 flex-1">
                        <div class="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0">
                            ${index + 1}
                        </div>
                        <div class="flex-1 min-w-0">
                            <h4 class="font-semibold text-gray-900 mb-2 break-words">${this.escapeHtml(q.question)}</h4>
                            
                            <div class="flex flex-wrap items-center gap-2 mb-2">
                                <span class="inline-block bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-medium">
                                    📊 ${q.count}× gefragt
                                </span>
                                <span class="inline-block bg-purple-100 text-purple-700 px-2 py-1 rounded text-xs">
                                    ${q.topic}
                                </span>
                                ${q.multilingual ? `
                                    <span class="inline-block bg-green-100 text-green-700 px-2 py-1 rounded text-xs">
                                        🌍 ${q.languages.length} Sprachen
                                    </span>
                                ` : ''}
                            </div>
                            
                            ${q.examples && q.examples.length > 1 ? `
                                <div class="mt-3">
                                    <p class="text-xs text-gray-500 mb-2">Ähnliche Formulierungen:</p>
                                    <div class="space-y-1">
                                        ${q.examples.slice(1, 3).map(example => `
                                            <div class="bg-white bg-opacity-70 px-3 py-2 rounded text-sm text-gray-700">
                                                "${this.escapeHtml(example)}"
                                            </div>
                                        `).join('')}
                                        ${q.examples.length > 3 ? `
                                            <div class="text-xs text-gray-500 italic">
                                                +${q.examples.length - 3} weitere Varianten
                                            </div>
                                        ` : ''}
                                    </div>
                                </div>
                            ` : ''}
                            
                            ${q.languages && q.languages.length > 1 ? `
                                <div class="mt-3">
                                    <p class="text-xs text-gray-500 mb-1">Sprachen:</p>
                                    <div class="flex flex-wrap gap-1">
                                        ${q.languages.map(lang => `
                                            <span class="inline-block bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs">
                                                ${lang}
                                            </span>
                                        `).join('')}
                                    </div>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
        
        container.appendChild(mainWrapper);
        
        // Add processing indicator if needed
        if (isProcessing) {
            const processingDiv = document.createElement('div');
            processingDiv.className = 'mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg';
            processingDiv.innerHTML = `
                <div class="flex items-center">
                    <div class="animate-spin inline-block w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full mr-2"></div>
                    <span class="text-sm text-blue-800 font-medium">Daten werden noch ausgewertet, bitte warten</span>
                </div>
            `;
            container.appendChild(processingDiv);
        }
        
        // Auto-refresh if still processing
        if (isProcessing) {
            setTimeout(() => this.refreshFrequentQuestions(), 5000);
        }
    }

    async refreshFrequentQuestions() {
        try {
            const data = await this.fetchFrequentQuestions();
            this.renderFrequentQuestions(data);
        } catch (error) {
            console.error('Error refreshing frequent questions:', error);
        }
    }

    // Utility Methods
    showLoading() {
        document.getElementById('loading').classList.remove('hidden');
        document.getElementById('dashboard').classList.add('hidden');
    }

    hideLoading() {
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('dashboard').classList.remove('hidden');
    }

    showError(message) {
        // Create error banner if doesn't exist
        let errorBanner = document.getElementById('error-banner');
        if (!errorBanner) {
            errorBanner = document.createElement('div');
            errorBanner.id = 'error-banner';
            errorBanner.className = 'alert alert-error';
            document.querySelector('main').prepend(errorBanner);
        }
        
        errorBanner.innerHTML = `
            <div class="flex items-center">
                <i class="fas fa-exclamation-triangle mr-2"></i>
                <span>${message}</span>
                <button onclick="this.parentElement.parentElement.remove()" class="ml-auto text-lg">&times;</button>
            </div>
        `;
    }

    updateLastRefresh() {
        document.getElementById('last-update').textContent = new Date().toLocaleString('de-DE');
    }

    async showHourlyView(date, dayTotal) {
        try {
            // Fetch hourly data for the specific date
            const response = await fetch(`/api/dashboard/sessions/hourly?date=${date}`);
            if (!response.ok) {
                throw new Error('Failed to load hourly data');
            }
            
            const hourlyData = await response.json();
            this.renderHourlyModal(date, dayTotal, hourlyData);
            
        } catch (error) {
            console.error('❌ Fehler beim Laden der Stunden-Daten:', error);
            // Show modal with error message
            this.renderHourlyModal(date, dayTotal, null, error.message);
        }
    }

    renderHourlyModal(date, dayTotal, hourlyData, errorMessage = null) {
        // Remove existing modal if any
        const existingModal = document.getElementById('hourly-modal');
        if (existingModal) {
            existingModal.remove();
        }

        const formattedDate = new Date(date).toLocaleDateString('de-DE', {
            weekday: 'long',
            year: 'numeric',
            month: 'long', 
            day: 'numeric'
        });

        let modalContent = '';
        
        if (errorMessage) {
            modalContent = `
                <div class="text-center py-8">
                    <i class="fas fa-exclamation-triangle text-orange-500 text-3xl mb-4"></i>
                    <p class="text-gray-600 mb-2">Stunden-Daten konnten nicht geladen werden</p>
                    <p class="text-sm text-gray-500">${errorMessage}</p>
                </div>
            `;
        } else if (!hourlyData || hourlyData.length === 0) {
            modalContent = `
                <div class="text-center py-8">
                    <i class="fas fa-calendar-times text-gray-400 text-3xl mb-4"></i>
                    <p class="text-gray-600 mb-2">Keine Sessions an diesem Tag</p>
                    <p class="text-sm text-gray-500">Für diesen Tag wurden keine Session-Daten gefunden.</p>
                </div>
            `;
        } else {
            // Create hourly chart
            const maxHourlyCount = Math.max(...hourlyData.map(h => h.count), 1);
            
            modalContent = `
                <div class="mb-6">
                    <div class="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-12 gap-2">
                        ${hourlyData.map(hour => {
                            const percentage = maxHourlyCount > 0 ? (hour.count / maxHourlyCount) * 100 : 0;
                            const height = Math.max(percentage, hour.count > 0 ? 20 : 10);
                            
                            return `
                                <div class="flex flex-col items-center">
                                    <div class="text-xs font-bold text-gray-800 mb-1">${hour.count}</div>
                                    <div class="w-8 bg-gray-100 rounded overflow-hidden flex flex-col justify-end" style="height: 80px;">
                                        <div class="w-full ${hour.count === 0 ? 'bg-gray-300' : 'bg-linear-to-t from-blue-600 via-blue-500 to-blue-400'} rounded-t" 
                                             style="height: ${height}%;" 
                                             title="${hour.hour.toString().padStart(2, '0')}:00 Uhr - ${hour.count} Sessions"></div>
                                    </div>
                                    <div class="text-xs text-gray-600 mt-1 font-medium">${hour.hour.toString().padStart(2, '0')}:00 Uhr</div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
                
                <div class="bg-gray-50 rounded-lg p-4">
                    <h4 class="font-semibold text-gray-900 mb-3">Zusammenfassung</h4>
                    <div class="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <span class="text-gray-600">Gesamt Sessions:</span>
                            <span class="font-semibold ml-2">${dayTotal}</span>
                        </div>
                        <div>
                            <span class="text-gray-600">Aktivste Stunde:</span>
                            <span class="font-semibold ml-2">${this.getPeakHour(hourlyData)}</span>
                        </div>
                    </div>
                </div>
            `;
        }

        const modal = document.createElement('div');
        modal.id = 'hourly-modal';
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';
        modal.innerHTML = `
            <div class="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                <div class="p-6 border-b border-gray-200">
                    <div class="flex justify-between items-center">
                        <div>
                            <h3 class="text-xl font-semibold text-gray-900">Sessions nach Uhrzeit</h3>
                            <p class="text-gray-600 mt-1">${formattedDate}</p>
                        </div>
                        <button id="close-hourly-modal" class="text-gray-400 hover:text-gray-600 transition-colors">
                            <i class="fas fa-times text-xl"></i>
                        </button>
                    </div>
                </div>
                <div class="p-6">
                    ${modalContent}
                </div>
            </div>
        `;

        // Add event listeners after appending to DOM
        document.body.appendChild(modal);
        
        // Close modal on background click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });

        // Close modal on close button click
        const closeButton = modal.querySelector('#close-hourly-modal');
        if (closeButton) {
            closeButton.addEventListener('click', () => {
                modal.remove();
            });
        }
    }

    getPeakHour(hourlyData) {
        if (!hourlyData || hourlyData.length === 0) return 'N/A';
        
        const peak = hourlyData.reduce((max, hour) => 
            hour.count > max.count ? hour : max, hourlyData[0]
        );
        
        return peak.count > 0 ? `${peak.hour.toString().padStart(2, '0')}:00 Uhr (${peak.count})` : 'Keine Sessions';
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    truncateText(text, maxLength) {
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    }

    formatDate(dateString) {
        return new Date(dateString).toLocaleString('de-DE', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    formatDateShort(dateString) {
        return new Date(dateString).toLocaleDateString('de-DE', {
            day: '2-digit',
            month: '2-digit'
        });
    }

    renderUnansweredQuestionsData(data) {
        const container = document.getElementById('unanswered-questions');
        if (!container) return;

        // Handle both old format (array) and new format (object)
        const questions = Array.isArray(data) ? data : (data?.questions || []);
        const isProcessing = data?.isProcessing || false;
        const message = data?.message || '';

        if (!questions || questions.length === 0) {
            if (isProcessing) {
                container.innerHTML = `
                    <div class="processing-state text-center py-6">
                        <div class="animate-spin inline-block w-8 h-8 border-4 border-orange-600 border-t-transparent rounded-full mb-3"></div>
                        <p class="text-gray-600 font-medium">Daten werden noch ausgewertet, bitte warten</p>
                    </div>
                `;
            } else {
                container.innerHTML = `
                    <div class="empty-state text-center py-6">
                        <i class="fas fa-check-circle text-green-500 text-3xl mb-3"></i>
                        <p class="text-gray-600 font-medium">Keine unbeantworteten Fragen</p>
                        <p class="text-sm text-gray-500 mt-1">${message || 'Alle häufig gestellten Fragen wurden erfolgreich beantwortet'}</p>
                    </div>
                `;
            }
            return;
        }

        // Clear container first to ensure clean transition
        container.innerHTML = '';
        
        // Create main content wrapper
        const mainWrapper = document.createElement('div');
        mainWrapper.className = 'space-y-4';
        mainWrapper.innerHTML = questions.map((q, index) => `
            <div class="question-item p-4 bg-linear-to-r from-orange-50 to-red-50 rounded-lg border border-orange-200">
                <div class="flex items-start justify-between">
                    <div class="flex items-start space-x-3 flex-1">
                        <div class="w-8 h-8 bg-orange-600 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0">
                            ${index + 1}
                        </div>
                        <div class="flex-1 min-w-0">
                            <h4 class="font-semibold text-gray-900 mb-2 break-words">${this.escapeHtml(q.question)}</h4>
                            
                            <div class="flex flex-wrap items-center gap-3 text-sm text-gray-600 mb-2">
                                <span class="flex items-center">
                                    <i class="fas fa-redo text-orange-500 mr-1"></i>
                                    ${q.count}x gefragt
                                </span>
                                <span class="flex items-center">
                                    <i class="fas fa-tag text-purple-500 mr-1"></i>
                                    ${q.topic || 'Unkategorisiert'}
                                </span>
                                ${q.languages && q.languages.length > 0 ? `
                                    <span class="flex items-center">
                                        <i class="fas fa-language text-blue-500 mr-1"></i>
                                        ${q.languages.slice(0, 2).join(', ')}${q.languages.length > 2 ? ` +${q.languages.length - 2}` : ''}
                                    </span>
                                ` : ''}
                                ${q.multilingual ? `
                                    <span class="bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded-full">
                                        <i class="fas fa-globe mr-1"></i>Mehrsprachig
                                    </span>
                                ` : ''}
                            </div>
                            
                            ${q.examples && q.examples.length > 1 ? `
                                <div class="mb-2">
                                    <p class="text-xs text-gray-400 mb-1">Weitere Varianten:</p>
                                    <div class="space-y-1">
                                        ${q.examples.slice(1, 3).map(example => `
                                            <p class="text-xs text-gray-600 bg-gray-50 px-2 py-1 rounded break-words">"${this.escapeHtml(example)}"</p>
                                        `).join('')}
                                    </div>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                    <div class="flex items-center space-x-2 ml-3">
                        <div class="w-3 h-3 bg-orange-500 rounded-full pulse" title="Unbeantwortete Frage"></div>
                    </div>
                </div>
            </div>
        `).join('');
        
        container.appendChild(mainWrapper);
        
        // Add processing indicator if needed
        if (isProcessing) {
            const processingDiv = document.createElement('div');
            processingDiv.className = 'mt-4 p-3 bg-orange-50 border border-orange-200 rounded-lg';
            processingDiv.innerHTML = `
                <div class="flex items-center">
                    <div class="animate-spin inline-block w-4 h-4 border-2 border-orange-600 border-t-transparent rounded-full mr-2"></div>
                    <span class="text-sm text-orange-800 font-medium">Daten werden noch ausgewertet, bitte warten</span>
                </div>
            `;
            container.appendChild(processingDiv);
        }
        
        // Auto-refresh if still processing
        if (isProcessing) {
            setTimeout(() => this.refreshUnansweredQuestions(), 5000);
        }
    }

    async refreshUnansweredQuestions() {
        try {
            const unansweredLimit = 5;
            const data = await this.fetchUnansweredQuestions(unansweredLimit);
            this.renderUnansweredQuestionsData(data);
        } catch (error) {
            console.error('Failed to refresh unanswered questions:', error);
        }
    }

    async loadAnalysisStatus() {
        try {
            const status = await this.fetchAnalysisStatus();
            this.updateAnalysisTooltip(status);
        } catch (error) {
            console.error('Failed to load analysis status:', error);
            this.updateAnalysisTooltip({
                hasData: false,
                status: 'error',
                analysisAvailable: false
            });
        }
    }

    updateAnalysisTooltip(status) {
        // Update frequent questions tooltip
        const tooltipContent = document.getElementById('analysis-tooltip-content');
        if (tooltipContent) {
            let content = '';
            
            if (status.status === 'error') {
                content = 'Fehler beim Laden des Status';
            } else if (!status.analysisAvailable) {
                content = '🤖 <strong>KI-gestützte Fragenanalyse</strong><br>' +
                         'Fragen werden automatisch nach Ähnlichkeit gruppiert<br>' +
                         'Analyse täglich um Mitternacht oder manuell per Button<br>' +
                         '<em>Letzte Aktualisierung: ' + (status.lastUpdated ? new Date(new Date(status.lastUpdated).getTime() + 2*60*60*1000).toLocaleString('de-DE') : 'Noch nicht durchgeführt') + '</em>';
            } else if (status.status === 'no_data') {
                content = '🤖 <strong>KI-gestützte Fragenanalyse</strong><br>' +
                         'Fragen werden automatisch nach Ähnlichkeit gruppiert<br>' +
                         'Analyse täglich um Mitternacht oder manuell per Button<br>' +
                         '<br>Noch keine Analyse durchgeführt<br>Klicke "Analysieren" um zu starten';
            } else if (status.status === 'current') {
                content = '🤖 <strong>KI-gestützte Fragenanalyse</strong><br>' +
                         'Fragen werden automatisch nach Ähnlichkeit gruppiert<br>' +
                         'Analyse täglich um Mitternacht oder manuell per Button<br>' +
                         `<br>✅ Letzte Analyse: Heute<br>${status.questionGroups} Fragengruppen identifiziert`;
            } else if (status.status === 'yesterday') {
                content = '🤖 <strong>KI-gestützte Fragenanalyse</strong><br>' +
                         'Fragen werden automatisch nach Ähnlichkeit gruppiert<br>' +
                         'Analyse täglich um Mitternacht oder manuell per Button<br>' +
                         `<br>⏰ Letzte Analyse: Gestern<br>${status.questionGroups} Fragengruppen<br>Nächste automatische Analyse um Mitternacht`;
            } else if (status.status === 'outdated') {
                content = '🤖 <strong>KI-gestützte Fragenanalyse</strong><br>' +
                         'Fragen werden automatisch nach Ähnlichkeit gruppiert<br>' +
                         'Analyse täglich um Mitternacht oder manuell per Button<br>' +
                         `<br>⚠️ Letzte Analyse: vor ${status.daysSinceAnalysis} Tagen<br>${status.questionGroups} Fragengruppen<br>Neue Analyse empfohlen`;
            } else {
                content = `Letzte Analyse: ${status.lastAnalysis || 'Unbekannt'}`;
            }

            tooltipContent.innerHTML = content;
        }

        // Update unanswered questions tooltip with same information
        const unansweredTooltipContent = document.getElementById('unanswered-analysis-tooltip-content');
        if (unansweredTooltipContent) {
            let content = '';
            
            if (status.status === 'error') {
                content = 'Fehler beim Laden des Status';
            } else if (!status.analysisAvailable) {
                content = '🤖 <strong>KI-gestützte Analyse unbeantworteter Fragen</strong><br>' +
                         'Unbeantwortete Fragen werden nach Ähnlichkeit gruppiert<br>' +
                         'Analyse täglich um Mitternacht oder manuell per Button<br>' +
                         '<em>Letzte Aktualisierung: ' + (status.lastUpdated ? new Date(new Date(status.lastUpdated).getTime() + 2*60*60*1000).toLocaleString('de-DE') : 'Noch nicht durchgeführt') + '</em>';
            } else if (status.status === 'no_data') {
                content = '🤖 <strong>KI-gestützte Analyse unbeantworteter Fragen</strong><br>' +
                         'Unbeantwortete Fragen werden nach Ähnlichkeit gruppiert<br>' +
                         'Analyse täglich um Mitternacht oder manuell per Button<br>' +
                         '<br>Noch keine Analyse durchgeführt<br>Klicke "Analysieren" um zu starten';
            } else if (status.status === 'current') {
                content = '🤖 <strong>KI-gestützte Analyse unbeantworteter Fragen</strong><br>' +
                         'Unbeantwortete Fragen werden nach Ähnlichkeit gruppiert<br>' +
                         'Analyse täglich um Mitternacht oder manuell per Button<br>' +
                         '<br>✅ Letzte Analyse: Heute<br>Unbeantwortete Fragen gruppiert nach Ähnlichkeit';
            } else if (status.status === 'yesterday') {
                content = '🤖 <strong>KI-gestützte Analyse unbeantworteter Fragen</strong><br>' +
                         'Unbeantwortete Fragen werden nach Ähnlichkeit gruppiert<br>' +
                         'Analyse täglich um Mitternacht oder manuell per Button<br>' +
                         '<br>⏰ Letzte Analyse: Gestern<br>Unbeantwortete Fragen gruppiert<br>Nächste automatische Analyse um Mitternacht';
            } else if (status.status === 'outdated') {
                content = '🤖 <strong>KI-gestützte Analyse unbeantworteter Fragen</strong><br>' +
                         'Unbeantwortete Fragen werden nach Ähnlichkeit gruppiert<br>' +
                         'Analyse täglich um Mitternacht oder manuell per Button<br>' +
                         '<br>⚠️ Letzte Analyse: vor ' + status.daysSinceAnalysis + ' Tagen<br>Neue Analyse empfohlen';
            } else {
                content = `Letzte Analyse: ${status.lastAnalysis || 'Unbekannt'}`;
            }

            unansweredTooltipContent.innerHTML = content;
        }

        // Update visible status displays
        this.updateVisibleStatusDisplays(status);
    }

    updateVisibleStatusDisplays(status) {
        // Update frequent questions status display
        const frequentQuestionsStatusText = document.getElementById('frequent-questions-status-text');
        if (frequentQuestionsStatusText) {
            let statusText = '';
            
            if (status.status === 'error') {
                statusText = 'Fehler beim Laden des Analyse-Status';
            } else if (!status.analysisAvailable) {
                statusText = '🤖 KI-gestützte Fragenanalyse - Fragen werden nach Ähnlichkeit gruppiert - Täglich um Mitternacht oder manuell' + (status.lastUpdated ? ' (Aktualisiert: ' + new Date(new Date(status.lastUpdated).getTime() + 2*60*60*1000).toLocaleString('de-DE') + ')' : '');
            } else if (status.status === 'no_data') {
                statusText = 'Noch keine Analyse durchgeführt - Klicke "Analysieren" um zu starten';
            } else if (status.status === 'current') {
                statusText = `✅ Letzte Analyse: Heute (${status.questionGroups} Fragengruppen) - Cache aktiv`;
            } else if (status.status === 'yesterday') {
                statusText = `⏰ Letzte Analyse: Gestern (${status.questionGroups} Fragengruppen) - Nächste Analyse um Mitternacht`;
            } else if (status.status === 'outdated') {
                statusText = `⚠️ Letzte Analyse: vor ${status.daysSinceAnalysis} Tagen - Neue Analyse empfohlen`;
            } else {
                statusText = `📋 Status: ${status.lastAnalysis || 'Unbekannt'}`;
            }

            frequentQuestionsStatusText.textContent = statusText;
        }

        // Update unanswered questions status display
        const unansweredQuestionsStatusText = document.getElementById('unanswered-questions-status-text');
        if (unansweredQuestionsStatusText) {
            let statusText = '';
            
            if (status.status === 'error') {
                statusText = 'Fehler beim Laden des Analyse-Status';
            } else if (!status.analysisAvailable) {
                statusText = '🤖 KI-gestützte Analyse unbeantworteter Fragen - Nach Ähnlichkeit gruppiert - Täglich um Mitternacht oder manuell' + (status.lastUpdated ? ' (Aktualisiert: ' + new Date(new Date(status.lastUpdated).getTime() + 2*60*60*1000).toLocaleString('de-DE') + ')' : '');
            } else if (status.status === 'no_data') {
                statusText = 'Noch keine Analyse durchgeführt - Klicke "Analysieren" um zu starten';
            } else if (status.status === 'current') {
                statusText = `✅ Letzte Analyse: Heute - Unbeantwortete Fragen gruppiert - Cache aktiv`;
            } else if (status.status === 'yesterday') {
                statusText = `⏰ Letzte Analyse: Gestern - Nächste Analyse um Mitternacht`;
            } else if (status.status === 'outdated') {
                statusText = `⚠️ Letzte Analyse: vor ${status.daysSinceAnalysis} Tagen - Neue Analyse empfohlen`;
            } else {
                statusText = `📋 Status: ${status.lastAnalysis || 'Unbekannt'}`;
            }

            unansweredQuestionsStatusText.textContent = statusText;
        }
    }

    async handleManualAnalysis() {
        const button = document.getElementById('trigger-analysis-btn');
        if (!button) return;

        // Disable button and show loading state
        const originalContent = button.innerHTML;
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Analysiere...';
        button.classList.remove('bg-green-600', 'hover:bg-green-700');
        button.classList.add('bg-gray-400', 'cursor-not-allowed');

        try {
            const result = await this.triggerManualAnalysis();
            
            if (result.success) {
                // Show success feedback
                button.innerHTML = '<i class="fas fa-check mr-1"></i>Abgeschlossen';
                button.classList.remove('bg-gray-400');
                button.classList.add('bg-green-500');

                // Show success message (optional)
                this.showTemporaryMessage(result.message, 'success');

                // Reload dashboard to show new data
                setTimeout(() => {
                    this.loadDashboard(false);
                    this.loadAnalysisStatus();
                }, 1000);

                // Reset button after 3 seconds
                setTimeout(() => {
                    button.disabled = false;
                    button.innerHTML = originalContent;
                    button.classList.remove('bg-green-500', 'cursor-not-allowed');
                    button.classList.add('bg-green-600', 'hover:bg-green-700');
                }, 3000);
            } else {
                // Show error state
                button.innerHTML = '<i class="fas fa-exclamation-triangle mr-1"></i>Fehler';
                button.classList.remove('bg-gray-400');
                button.classList.add('bg-red-500');
                
                this.showTemporaryMessage(result.message || 'Analyse fehlgeschlagen', 'error');

                // Reset button after 3 seconds
                setTimeout(() => {
                    button.disabled = false;
                    button.innerHTML = originalContent;
                    button.classList.remove('bg-red-500', 'cursor-not-allowed');
                    button.classList.add('bg-green-600', 'hover:bg-green-700');
                }, 3000);
            }
        } catch (error) {
            console.error('Manual analysis failed:', error);
            
            // Show error state
            button.innerHTML = '<i class="fas fa-exclamation-triangle mr-1"></i>Fehler';
            button.classList.remove('bg-gray-400');
            button.classList.add('bg-red-500');

            this.showTemporaryMessage('Netzwerkfehler bei der Analyse', 'error');

            // Reset button after 3 seconds
            setTimeout(() => {
                button.disabled = false;
                button.innerHTML = originalContent;
                button.classList.remove('bg-red-500', 'cursor-not-allowed');
                button.classList.add('bg-green-600', 'hover:bg-green-700');
            }, 3000);
        }
    }

    async handleManualUnansweredAnalysis() {
        const button = document.getElementById('trigger-unanswered-analysis-btn');
        if (!button) return;

        // Disable button and show loading state
        const originalContent = button.innerHTML;
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Analysiere...';
        button.classList.remove('bg-orange-600', 'hover:bg-orange-700');
        button.classList.add('bg-gray-400', 'cursor-not-allowed');

        try {
            const result = await this.triggerManualAnalysis();
            
            if (result.success) {
                // Show success feedback
                button.innerHTML = '<i class="fas fa-check mr-1"></i>Abgeschlossen';
                button.classList.remove('bg-gray-400');
                button.classList.add('bg-green-500');

                // Show success message (optional)
                this.showTemporaryMessage(result.message, 'success');

                // Reload dashboard to show new data
                setTimeout(() => {
                    this.loadDashboard(false);
                    this.loadAnalysisStatus();
                }, 1000);

                // Reset button after 3 seconds
                setTimeout(() => {
                    button.disabled = false;
                    button.innerHTML = originalContent;
                    button.classList.remove('bg-green-500', 'cursor-not-allowed');
                    button.classList.add('bg-orange-600', 'hover:bg-orange-700');
                }, 3000);
            } else {
                // Show error state
                button.innerHTML = '<i class="fas fa-exclamation-triangle mr-1"></i>Fehler';
                button.classList.remove('bg-gray-400');
                button.classList.add('bg-red-500');
                
                this.showTemporaryMessage(result.message || 'Analyse fehlgeschlagen', 'error');

                // Reset button after 3 seconds
                setTimeout(() => {
                    button.disabled = false;
                    button.innerHTML = originalContent;
                    button.classList.remove('bg-red-500', 'cursor-not-allowed');
                    button.classList.add('bg-orange-600', 'hover:bg-orange-700');
                }, 3000);
            }
        } catch (error) {
            console.error('Manual unanswered analysis failed:', error);
            
            // Show error state
            button.innerHTML = '<i class="fas fa-exclamation-triangle mr-1"></i>Fehler';
            button.classList.remove('bg-gray-400');
            button.classList.add('bg-red-500');

            this.showTemporaryMessage('Netzwerkfehler bei der Analyse', 'error');

            // Reset button after 3 seconds
            setTimeout(() => {
                button.disabled = false;
                button.innerHTML = originalContent;
                button.classList.remove('bg-red-500', 'cursor-not-allowed');
                button.classList.add('bg-orange-600', 'hover:bg-orange-700');
            }, 3000);
        }
    }

    showTemporaryMessage(message, type = 'info') {
        // Create or update message element
        let messageEl = document.getElementById('temp-message');
        if (!messageEl) {
            messageEl = document.createElement('div');
            messageEl.id = 'temp-message';
            messageEl.className = 'fixed top-20 right-4 z-50 max-w-sm p-4 rounded-lg shadow-lg transform translate-x-full transition-transform duration-300';
            document.body.appendChild(messageEl);
        }

        // Set message content and style
        const colors = {
            success: 'bg-green-100 border-green-500 text-green-800',
            error: 'bg-red-100 border-red-500 text-red-800',
            info: 'bg-blue-100 border-blue-500 text-blue-800'
        };

        messageEl.className = `fixed top-20 right-4 z-50 max-w-sm p-4 rounded-lg shadow-lg border-l-4 ${colors[type]} transform translate-x-0 transition-transform duration-300`;
        messageEl.innerHTML = `
            <div class="flex items-center">
                <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-triangle' : 'info-circle'} mr-2"></i>
                <span>${message}</span>
            </div>
        `;

        // Auto-hide after 4 seconds
        setTimeout(() => {
            messageEl.classList.add('translate-x-full');
            setTimeout(() => {
                if (messageEl.parentNode) {
                    messageEl.parentNode.removeChild(messageEl);
                }
            }, 300);
        }, 4000);
    }
}

// Initialize Dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    // Validate session before proceeding
    try {
        const res = await fetch('/api/admin/validate');
        if (!res.ok) {
            console.log('Session invalid, redirecting to login...');
            window.location.href = '/login/';
            return;
        }
    } catch (err) {
        console.error('Session validation error:', err);
        window.location.href = '/login/';
        return;
    }

    window.dashboard = new DashboardManager();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (window.dashboard && window.dashboard.refreshInterval) {
        clearInterval(window.dashboard.refreshInterval);
    }
});