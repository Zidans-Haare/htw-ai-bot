
import { ChatSession } from '../types';

export const historyService = {
    async fetchHistory(anonymousUserId: string): Promise<ChatSession[]> {
        try {
            const res = await fetch(`/api/history?anonymousUserId=${anonymousUserId}`, {
                method: 'GET',
                credentials: 'include'
            });

            if (!res.ok) return [];

            const data = await res.json();
            if (!Array.isArray(data)) return [];

            return data.map((chat: any) => ({
                id: chat.id,
                title: chat.title || 'New Chat',
                lastUpdated: new Date(chat.updatedAt).getTime(),
                messages: chat.messages.map((msg: any) => ({
                    id: msg.timestamp,
                    role: msg.isUser ? 'user' : 'assistant',
                    content: msg.text,
                    timestamp: msg.timestamp
                }))
            }));
        } catch {
            return [];
        }
    },

    async deleteChat(id: string): Promise<void> {
        // Placeholder for now as backend delete endpoint wasn't strictly requested but good to have
        // await fetch(`/api/history/${id}`, { method: 'DELETE' });
    }
};
