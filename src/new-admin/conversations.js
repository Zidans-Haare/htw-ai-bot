// conversations.js - im alten Stil, ohne Module
import { renderMarkup } from '../components/markup.js';

let allConversations = [];
let currentFilter = 'All';
let conversationsOffset = 0;

const CATEGORIES = [
    "All", "Unkategorisiert", "Immatrikulation & Bewerbung", "Prüfungen & Noten", 
    "Bibliothek & Ressourcen", "Campus-Leben & Mensa", "Organisation & Verwaltung", 
    "Technischer Support & IT", "Internationales & Auslandssemester", "Feedback zum Bot", "Sonstiges & Unklares"
];

window.initConversations = function(showConversationsCallback) {
    const conversationsNav = document.getElementById('btn-conversations');
    const mobileConversationsNav = document.getElementById('mobile-btn-conversations');
    const mobileMenu = document.getElementById('mobile-menu');

    const handleClick = (e) => {
        e.preventDefault();
        if (typeof showConversationsCallback === 'function') {
            showConversationsCallback();
        }
        fetchConversations();
        // Close mobile menu if open
        if (mobileMenu) mobileMenu.classList.add('hidden');
    };
    
    if (conversationsNav) {
        conversationsNav.addEventListener('click', handleClick);
    }
    if (mobileConversationsNav) {
        mobileConversationsNav.addEventListener('click', handleClick);
    }

    // Back button
    const backBtn = document.getElementById('conversations-back-btn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            const listContainer = document.getElementById('conversations-list-container');
            const detailContainer = document.getElementById('conversations-detail-container');
            detailContainer.classList.add('hidden');
            listContainer.classList.remove('hidden');
        });
    }
}

async function fetchConversations(append = false) {
    if (!append) {
        allConversations = [];
        conversationsOffset = 0;
    }
    try {
        const category = currentFilter !== 'All' ? currentFilter : '';
        const response = await fetch(`/api/admin/conversations?offset=${conversationsOffset}&category=${encodeURIComponent(category)}`);
        if (!response.ok) throw new Error('Failed to fetch conversations');
        const conversations = await response.json();
        if (append) {
            allConversations = allConversations.concat(conversations);
        } else {
            allConversations = conversations;
        }
        renderFilterButtons();
        renderConversations();
        conversationsOffset += 100;
        if (conversations.length === 100) {
            let loadMoreBtn = document.getElementById('load-more-conversations');
            if (!loadMoreBtn) {
                loadMoreBtn = document.createElement('div');
                loadMoreBtn.id = 'load-more-conversations';
                loadMoreBtn.className = 'text-center mt-4';
                loadMoreBtn.innerHTML = '<button class="px-4 py-2 bg-(--accent-color) text-white rounded hover:bg-opacity-80">Mehr laden</button>';
                loadMoreBtn.querySelector('button').addEventListener('click', () => fetchConversations(true));
                document.getElementById('conversations-list').appendChild(loadMoreBtn);
            }
        } else {
            const loadMoreBtn = document.getElementById('load-more-conversations');
            if (loadMoreBtn) loadMoreBtn.remove();
        }
    } catch (error) {
        console.error('Error fetching conversations:', error);
    }
}

async function fetchAndDisplayMessages(conversationId) {
    // Toggle to detail view
    const listContainer = document.getElementById('conversations-list-container');
    const detailContainer = document.getElementById('conversations-detail-container');
    listContainer.classList.add('hidden');
    detailContainer.classList.remove('hidden');

    const messagesContainer = document.getElementById('conversation-detail-messages');
    const titleContainer = document.getElementById('conversation-detail-title');
    messagesContainer.innerHTML = '<p>Loading messages...</p>';
    titleContainer.textContent = `Conversation ${conversationId.substring(0, 8)}...`;

    try {
        const response = await fetch(`/api/admin/conversations/${encodeURIComponent(conversationId)}`);
        if (!response.ok) throw new Error('Failed to fetch messages');
        const messages = await response.json();
        console.log('Received messages from API:', messages);
        renderMessages(messages);
    } catch (error) {
        console.error(`Error fetching messages for ${conversationId}:`, error);
        messagesContainer.innerHTML = '<p class="text-red-500">Failed to load messages.</p>';
    }
}

function renderFilterButtons() {
    const filterContainer = document.getElementById('conversation-filter-container');
    if (!filterContainer) return;

    filterContainer.innerHTML = '';
    CATEGORIES.forEach(category => {
        const button = document.createElement('button');
        button.textContent = category;
        button.className = `px-2 py-1 text-xs rounded-md border ${currentFilter === category ? 'bg-(--accent-color) text-white border-(--accent-color)' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'}`;
        button.addEventListener('click', () => {
            currentFilter = category;
            renderFilterButtons();
            fetchConversations(false);
        });
        filterContainer.appendChild(button);
    });
}

function renderConversations(selectedConversationId) {
    const listContainer = document.getElementById('conversations-list');
    if (!listContainer) return;

    const filteredConversations = allConversations.filter(c =>
        currentFilter === 'All' || c.category === currentFilter
    );

    listContainer.innerHTML = '';
    filteredConversations.forEach(conv => {
        const div = document.createElement('div');
        div.className = `p-3 rounded-lg cursor-pointer border ${selectedConversationId === conv.id ? 'bg-blue-100 border-blue-300' : 'bg-gray-50 hover:bg-gray-100 border-gray-200'}`;
        
        const date = new Date(conv.created_at).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'medium' });
        const categoryTag = conv.category ? `<span class="text-xs font-semibold px-2 py-1 bg-gray-200 text-gray-700 rounded-full">${conv.category}</span>` : '';

        div.innerHTML = `
            <div class="flex justify-between items-center">
                <div>
                    <p class="font-semibold text-sm">ID: ${conv.id.substring(0, 8)}...</p>
                    <p class="text-xs text-gray-500">User: ${conv.anonymous_user_id.substring(0, 8)}...</p>
                    <p class="text-xs text-gray-500 mt-1">${date}</p>
                </div>
                ${categoryTag}
            </div>
        `;
        div.addEventListener('click', () => fetchAndDisplayMessages(conv.id));
        listContainer.appendChild(div);
    });
}

function renderMessages(messages) {
    console.log('Rendering messages:', messages);
    try {
        const messagesContainer = document.getElementById('conversation-detail-messages');
        if (!messagesContainer) {
            console.error('messagesContainer not found');
            return;
        }
        messagesContainer.innerHTML = '';
        if (messages.length === 0) {
            messagesContainer.innerHTML = '<p>No messages in this conversation.</p>';
            return;
        }

        messages.forEach(msg => {
        const bubble = document.createElement('div');
        const isUser = msg.role === 'user';
        
        const content = document.createElement('div');
        // content.textContent = msg.content; // OLD
        if (isUser) {
            content.textContent = msg.content;
        } else {
            // For bot messages, parse markdown and sanitize
            content.innerHTML = renderMarkup(msg.content);
            content.querySelectorAll('img').forEach(img => {
                img.classList.add('max-w-full', 'h-auto', 'rounded-lg', 'mt-2');
            });
        }
        
        const timestamp = document.createElement('p');
        timestamp.className = 'text-xs mt-1';
        timestamp.textContent = new Date(msg.created_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

        bubble.className = 'p-3 rounded-lg max-w-xl';
        bubble.appendChild(content);
        bubble.appendChild(timestamp);

        if (isUser) {
            bubble.style.backgroundColor = 'var(--accent-color)';
            bubble.classList.add('text-white');
            timestamp.classList.add('text-gray-200');
        } else {
            bubble.classList.add('bg-gray-200', 'text-gray-800');
            timestamp.classList.add('text-gray-500');
        }
        
        const wrapper = document.createElement('div');
        wrapper.className = `flex mb-2 ${isUser ? 'justify-end' : 'justify-start'}`;
        wrapper.appendChild(bubble);

        messagesContainer.appendChild(wrapper);
    });
    } catch (error) {
        console.error('Error rendering messages:', error);
        const messagesContainer = document.getElementById('conversation-detail-messages');
        if (messagesContainer) {
            messagesContainer.innerHTML = '<p class="text-red-500">Error rendering messages.</p>';
        }
    }
}