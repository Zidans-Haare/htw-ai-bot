import { addMessage, showToast } from './ui.js';
import { renderMarkup } from './markup.js';
import { getChatById } from './history.js';
import { processImagesInBubble } from './imageLightbox.js';

export async function sendMsg(app, promptText) {
    const txt = typeof promptText === 'string' ? promptText : document.getElementById('chat-input').value.trim();
    if (!txt) return;

    const welcomeMessage = document.getElementById('welcome-message');
    if (welcomeMessage) {
        welcomeMessage.remove();
    }
    const suggestions = document.getElementById('prompt-suggestions');
    if (suggestions) {
        suggestions.style.display = 'none';
    }

    const isNewChat = !app.conversationId;
    // Display the user's message immediately in the UI.
    addMessage(txt, true, new Date());

    document.getElementById('chat-input').value = '';
    document.getElementById('chat-input').style.height = 'auto';
    document.getElementById('chat-input').disabled = true;
    document.getElementById('send-btn').disabled = true;
    document.getElementById('typing').style.display = 'flex';

    let aiMessageBubble;
    let fullResponse = '';
    let currentConversationId = app.conversationId;
    let tokensInfo = null;

    function displayAiMessage() {
        const messageWrapper = document.createElement('div');
        messageWrapper.className = 'message ai';
        const avatar = document.createElement('div');
        avatar.className = 'avatar';
        const avatarSrc = app.useFirstAvatar ? '/assets/images/smoky_klein.png' : '/assets/images/stu_klein.png';
        avatar.innerHTML = `<img src="${avatarSrc}" alt="Bot Avatar" />`;
        app.useFirstAvatar = !app.useFirstAvatar;
        messageWrapper.appendChild(avatar);

        aiMessageBubble = document.createElement('div');
        aiMessageBubble.className = 'bubble';
        aiMessageBubble.innerHTML = '<span></span>';
        messageWrapper.appendChild(aiMessageBubble);
        document.getElementById('messages').appendChild(messageWrapper);

        aiMessageBubble.querySelector('span').innerHTML = renderMarkup(fullResponse);
        processImagesInBubble(aiMessageBubble);
        app.scrollToBottom();

        finalizeMessage();
    }

    function finalizeMessage() {
        if (aiMessageBubble) {
            const c = document.createElement('span');
            c.className = 'copy-btn';
            c.innerHTML = '<i class="fas fa-copy"></i>';
            c.addEventListener('click', () => navigator.clipboard.writeText(fullResponse));
            aiMessageBubble.appendChild(c);

            const md = document.createElement('div');
            md.className = 'metadata';
            let metadataText = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
            if (tokensInfo) {
                metadataText += ` | Tokens Sent: ${tokensInfo.sent} | Received: ${tokensInfo.received}`;
            }
            md.textContent = metadataText;
            aiMessageBubble.appendChild(md);
        }

        if (app.settings.saveHistory) {
            // Save both user and AI message at the end of the stream
            app.saveMessageToHistory(currentConversationId, txt, true, fullResponse);
        }
    }

    try {
        const userApiKey = localStorage.getItem('user_api_key');
        const headers = { 'Content-Type': 'application/json' };
        if (userApiKey) headers['X-User-API-Key'] = userApiKey;

        const response = await fetch('/api/chat', {
            method: 'POST',
            headers,
            body: JSON.stringify({
                prompt: txt,
                conversationId: currentConversationId,
                anonymousUserId: app.anonymousUserId,
                timezoneOffset: new Date().getTimezoneOffset(),
                profilePreferences: JSON.stringify(app?.auth?.profile?.mensaPreferences || {}),
                userDisplayName: app?.auth?.profile?.displayName || '',
            })
        });

        if (!response.ok) throw new Error('Network response was not ok');

        const data = await response.json();
        fullResponse = data.response || '';
        tokensInfo = data.tokens || null;
        currentConversationId = data.conversationId || currentConversationId;
        if (isNewChat) {
            app.conversationId = currentConversationId;
        }

        // Show tool usage feedback if tools were called
        if (data.toolStatuses && data.toolStatuses.length > 0) {
            const typingEl = document.getElementById('typing');
            const originalContent = typingEl.innerHTML;

            // Show each tool status message briefly
            let statusIndex = 0;
            const showNextStatus = () => {
                if (statusIndex < data.toolStatuses.length) {
                    const toolMessage = data.toolStatuses[statusIndex];
                    typingEl.innerHTML = `<i class="fas fa-tools"></i> ${toolMessage}`;
                    statusIndex++;

                    // Show next status after 1.5 seconds, or proceed to AI message
                    setTimeout(() => {
                        if (statusIndex < data.toolStatuses.length) {
                            showNextStatus();
                        } else {
                            // All tool statuses shown, now display AI message
                            typingEl.innerHTML = originalContent;
                            displayAiMessage();
                        }
                    }, 1500);
                }
            };

            showNextStatus();
        } else {
            // No tool statuses, display AI message immediately
            displayAiMessage();
        }
    } catch (e) {
        console.error(e);
        const errorMessage = e?.message || 'Fehler bei der Verbindung zum Server.';
        if (fullResponse) {
            finalizeMessage();
            showToast(errorMessage);
        } else {
            addMessage(errorMessage, false, new Date());
        }
    } finally {
        document.getElementById('typing').style.display = 'none';
        document.getElementById('chat-input').disabled = false;
        document.getElementById('send-btn').disabled = false;
        document.getElementById('chat-input').focus();
    }
}

export async function sendFeedback(app) {
    const feedbackText = document.getElementById('feedback-input').value.trim();
    const email = document.getElementById('feedback-email').value.trim();
    const captcha = document.getElementById('captcha-input').value;
    const historySelect = document.getElementById('feedback-chat-history');
    const selectedHistoryId = historySelect.value;

    if (!feedbackText) {
        showToast("Bitte geben Sie Ihr Feedback ein.");
        return;
    }

    if (!captcha || parseInt(captcha, 10) !== app.expectedCaptcha) {
        showToast("Falsche Antwort auf die Sicherheitsfrage.");
        app.expectedCaptcha = app.generateCaptcha();
        return;
    }

    let attachedChatHistory = null;
    if (selectedHistoryId) {
        const chat = getChatById(selectedHistoryId);
        if (chat && chat.messages) {
            attachedChatHistory = chat.messages.map(msg => {
                const prefix = msg.isUser ? 'User' : 'Assistant';
                return `${prefix}: ${msg.text}`;
            }).join('\n\n');
        }
    }

    try {
        const payload = {
            text: feedbackText,
            email: email,
            conversation_id: app.conversationId,
            captcha: captcha,
            expected_captcha: app.expectedCaptcha,
            attached_chat_history: attachedChatHistory
        };

        const response = await fetch('/api/feedback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            showToast("Vielen Dank für Ihr Feedback!");
            app.closeFeedback();
            document.getElementById('feedback-input').value = '';
            document.getElementById('feedback-email').value = '';
            historySelect.value = '';
        } else {
            const errorData = await response.json();
            showToast(`Fehler: ${errorData.message || 'Feedback konnte nicht gesendet werden.'}`);
        }
    } catch (error) {
        console.error('Feedback submission error:', error);
        showToast("Ein Netzwerkfehler ist aufgetreten.");
    }
}
