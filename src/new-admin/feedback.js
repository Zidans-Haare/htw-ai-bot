export function setupFeedback(userRole) {
    const feedbackView = document.getElementById('feedback-view');
    const listContainer = document.getElementById('feedback-list-container');
    const detailContainer = document.getElementById('feedback-detail-container');
    const feedbackList = document.getElementById('feedback-list');
    let feedbackOffset = 0;

    async function loadFeedbackList(append = false) {
        if (!append) {
            feedbackOffset = 0;
            feedbackList.innerHTML = '';
        }
        try {
            const response = await fetch(`/api/admin/feedback?offset=${feedbackOffset}`);
            if (!response.ok) throw new Error('Failed to fetch feedback');
            const feedbackData = await response.json();
            renderFeedbackList(feedbackData, append);
            feedbackOffset += 100;
            if (feedbackData.length === 100) {
                let loadMoreBtn = document.getElementById('load-more-feedback');
                if (!loadMoreBtn) {
                    loadMoreBtn = document.createElement('div');
                    loadMoreBtn.id = 'load-more-feedback';
                    loadMoreBtn.className = 'text-center mt-4';
                    loadMoreBtn.innerHTML = '<button class="px-4 py-2 bg-(--accent-color) text-white rounded hover:bg-opacity-80">Mehr laden</button>';
                    loadMoreBtn.querySelector('button').addEventListener('click', () => loadFeedbackList(true));
                    feedbackList.appendChild(loadMoreBtn);
                }
            } else {
                const loadMoreBtn = document.getElementById('load-more-feedback');
                if (loadMoreBtn) loadMoreBtn.remove();
            }
        } catch (error) {
            console.error('Error loading feedback list:', error);
            if (!append) feedbackList.innerHTML = '<p class="text-red-500">Error loading feedback.</p>';
        }
    }

    function renderFeedbackList(feedbackData, append = false) {
        if (!feedbackData || feedbackData.length === 0) {
            if (!append) feedbackList.innerHTML = '<p>No feedback yet.</p>';
            return;
        }

        const html = feedbackData.map(item => `
            <div class="p-4 bg-white rounded shadow-md mb-4 cursor-pointer hover:shadow-lg transition-shadow" data-id="${item.id}">
                <p class="text-gray-800 truncate">${item.text}</p>
                <div class="text-sm text-gray-500 mt-2">
                    <span>${new Date(item.submitted_at).toLocaleString()}</span>
                    ${item.email ? `| <span>${item.email}</span>` : ''}
                </div>
            </div>
        `).join('');

        if (append) {
            const loadMoreBtn = document.getElementById('load-more-feedback');
            if (loadMoreBtn) {
                loadMoreBtn.insertAdjacentHTML('beforebegin', html);
            } else {
                feedbackList.insertAdjacentHTML('beforeend', html);
            }
        } else {
            feedbackList.innerHTML = html;
        }

        feedbackList.querySelectorAll('[data-id]').forEach(element => {
            element.addEventListener('click', () => showDetailView(element.dataset.id));
        });
    }

    async function showDetailView(id) {
        listContainer.classList.add('hidden');
        detailContainer.classList.remove('hidden');
        detailContainer.innerHTML = '<p>Loading...</p>';

        try {
            const response = await fetch(`/api/admin/feedback/${id}`);
            if (!response.ok) throw new Error('Failed to fetch feedback details');
            const item = await response.json();
            renderFeedbackDetail(item);
        } catch (error) {
            console.error('Error loading feedback details:', error);
            detailContainer.innerHTML = '<p class="text-red-500">Error loading details.</p>';
        }
    }

    function renderFeedbackDetail(item) {
        detailContainer.innerHTML = `
            <div class="flex justify-between items-center mb-4">
                <button id="back-to-list" class="btn-secondary px-4 py-2 rounded-md">
                    <i class="fas fa-arrow-left mr-2"></i>Zurück zur Übersicht
                </button>
                <button id="delete-feedback" class="text-red-500 hover:text-red-700">
                    <i class="fas fa-trash mr-2"></i>Diesen Fall löschen
                </button>
            </div>
             <div class="p-4 bg-white rounded shadow-md">
                 <div class="text-sm text-gray-600 mb-4">
                     <p><strong>Zeitstempel:</strong> ${new Date(item.submitted_at).toLocaleString()}</p>
                     ${item.email ? `<p><strong>Email:</strong> ${item.email}</p>` : ''}
                     ${item.conversation_id ? `<p><strong>Conversation ID:</strong> ${item.conversation_id}</p>` : ''}
                 </div>
                 <hr class="my-4">
                 <h3 class="text-lg font-semibold mb-2">Feedback</h3>
                 <p class="text-gray-800 mb-4">${item.text}</p>
                
                ${item.attached_chat_history ? `
                    <h3 class="text-lg font-semibold mb-2">Angehängter Chat-Verlauf</h3>
                    <div id="chat-history-content" class="mt-2 p-2 bg-gray-100 rounded text-sm whitespace-pre-wrap"></div>
                ` : ''}
            </div>
        `;

        // --- New logic to display chat history as plain text ---
         if (item.attached_chat_history) {
             const chatContainer = document.getElementById('chat-history-content');
             if (chatContainer) {
                 // Display as plain text, no markdown parsing
                 chatContainer.textContent = item.attached_chat_history;
             }
         }
        // --- End of new logic ---

        document.getElementById('back-to-list').addEventListener('click', showListView);
        document.getElementById('delete-feedback').addEventListener('click', () => deleteFeedback(item.id));
    }

    function showListView() {
        detailContainer.classList.add('hidden');
        listContainer.classList.remove('hidden');
        loadFeedbackList();
    }

    async function deleteFeedback(id) {
        if (confirm('Soll dieser Feedback-Eintrag wirklich endgültig gelöscht werden?')) {
            try {
                const response = await fetch(`/api/admin/feedback/${id}`, { method: 'DELETE' });
                if (response.ok) {
                    showListView();
                } else {
                    alert('Löschen fehlgeschlagen.');
                }
            } catch (error) {
                console.error('Error deleting feedback:', error);
                alert('Fehler beim Löschen.');
            }
        }
    }

    // Initial load
    loadFeedbackList();
}