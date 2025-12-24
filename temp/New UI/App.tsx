
import React, { useState, useEffect, useCallback } from 'react';
import { AuthState, User, ChatSession, AppSettings, Message } from './types';
import { DEFAULT_SETTINGS, MOCK_USER } from './constants';
import LandingPage from './components/LandingPage';
import AuthScreens from './components/AuthScreens';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import SettingsModal from './components/SettingsModal';
import { gemini } from './services/geminiService';

const App: React.FC = () => {
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [user, setUser] = useState<User>(MOCK_USER);
  const [chats, setChats] = useState<ChatSession[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Initial Boot Sequence
  useEffect(() => {
    const timer = setTimeout(() => {
      setAuthState('landing');
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  // Sync settings with DOM
  useEffect(() => {
    const root = window.document.documentElement;
    const isDark = settings.theme === 'dark' || (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    root.classList.toggle('dark', isDark);
    root.style.fontSize = `${settings.fontSize}px`;

    if (settings.highContrast) root.classList.add('high-contrast');
    else root.classList.remove('high-contrast');

    if (settings.reduceMotion) root.classList.add('reduce-motion');
    else root.classList.remove('reduce-motion');
  }, [settings]);

  const speak = useCallback((text: string) => {
    if (!settings.textToSpeech) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = settings.speechRate || 1.0;
    window.speechSynthesis.speak(utterance);
  }, [settings.textToSpeech, settings.speechRate]);

  const handleSendMessage = useCallback(async (content: string) => {
    if (!content.trim() || !user) return;

    let targetChatId = currentChatId;
    let updatedChats = [...chats];

    if (!targetChatId) {
      targetChatId = `chat_${Date.now()}`;
      const newChat: ChatSession = {
        id: targetChatId,
        title: content.slice(0, 30) + (content.length > 30 ? '...' : ''),
        lastUpdated: Date.now(),
        messages: [],
        isFavorite: false
      };
      updatedChats = [newChat, ...chats];
      setChats(updatedChats);
      setCurrentChatId(targetChatId);
    }

    const newMessage: Message = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content,
      timestamp: Date.now()
    };

    setChats(prev => prev.map(c => c.id === targetChatId ? {
      ...c,
      messages: [...c.messages, newMessage],
      lastUpdated: Date.now()
    } : c));

    setIsLoading(true);

    try {
      const activeChat = updatedChats.find(c => c.id === targetChatId);
      const chatContext = activeChat?.messages.map(m => ({
        role: (m.role === 'assistant' ? 'model' : 'user') as 'model' | 'user',
        parts: [{ text: m.content }]
      })) || [];

      const { text: aiText, conversationId: serverConversationId } = await gemini.generateResponse(content, chatContext, targetChatId, settings.thinkingMode);

      const botMessage: Message = {
        id: `msg_bot_${Date.now()}`,
        role: 'assistant',
        content: aiText,
        timestamp: Date.now(),
        isThinking: settings.thinkingMode
      };

      if (serverConversationId && serverConversationId !== targetChatId) {
        // Update the chat ID if the server assigned a real persistent ID
        setChats(prev => prev.map(c => c.id === targetChatId ? {
          ...c,
          id: serverConversationId, // Update ID to match backend
          messages: [...c.messages, botMessage],
          lastUpdated: Date.now()
        } : c));
        setCurrentChatId(serverConversationId);
      } else {
        setChats(prev => prev.map(c => c.id === targetChatId ? {
          ...c,
          messages: [...c.messages, botMessage],
          lastUpdated: Date.now()
        } : c));
      }

      // Trigger TTS
      if (settings.textToSpeech) {
        speak(aiText);
      }
    } catch (error) {
      console.error("Gemini Error:", error);
    } finally {
      setIsLoading(false);
    }
  }, [currentChatId, chats, user, settings.thinkingMode, settings.textToSpeech, speak]);

  const deleteChat = (id: string) => {
    setChats(prev => prev.filter(c => c.id !== id));
    if (currentChatId === id) setCurrentChatId(null);
  };

  const toggleFavorite = (id: string) => {
    setChats(prev => prev.map(c => c.id === id ? { ...c, isFavorite: !c.isFavorite } : c));
  };

  const logout = () => {
    setAuthState('landing');
    setCurrentChatId(null);
    setIsSidebarOpen(false);
  };

  const handleUpdateUser = (updatedUser: Partial<User>) => {
    setUser(prev => ({ ...prev, ...updatedUser }));
  };

  if (authState === 'loading') return (
    <div className="h-screen w-full flex items-center justify-center bg-slate-50 dark:bg-slate-950">
      <div className="flex flex-col items-center gap-6 animate-pulse-soft">
        <div className="size-20 rounded-3xl bg-slate-900 dark:bg-white flex items-center justify-center shadow-2xl">
          <span className="material-symbols-outlined text-[48px] text-white dark:text-slate-900">smart_toy</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <h1 className="text-xl font-bold dark:text-white tracking-widest uppercase">Nexus</h1>
          <div className="flex gap-1">
            <div className="size-1 rounded-full bg-slate-400 animate-bounce"></div>
            <div className="size-1 rounded-full bg-slate-400 animate-bounce delay-75"></div>
            <div className="size-1 rounded-full bg-slate-400 animate-bounce delay-150"></div>
          </div>
        </div>
      </div>
    </div>
  );

  if (authState === 'landing') return <LandingPage onGetStarted={() => setAuthState('login')} />;
  if (authState !== 'authenticated') return <AuthScreens state={authState} setState={setAuthState} />;

  const currentChat = chats.find(c => c.id === currentChatId);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-50 dark:bg-slate-950">
      {/* Mobile Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-30 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <Sidebar
        chats={chats}
        currentChatId={currentChatId}
        onSelectChat={(id) => { setCurrentChatId(id); setIsSidebarOpen(false); }}
        onNewChat={() => { setCurrentChatId(null); setIsSidebarOpen(false); }}
        user={user}
        onOpenSettings={() => { setIsSettingsOpen(true); setIsSidebarOpen(false); }}
        isOpen={isSidebarOpen}
        onLogout={logout}
      />

      <main className="flex-1 flex flex-col relative h-full w-full">
        <ChatArea
          chat={currentChat}
          isLoading={isLoading}
          onSendMessage={handleSendMessage}
          settings={settings}
          onToggleThinking={(val) => setSettings(prev => ({ ...prev, thinkingMode: val }))}
          onOpenMenu={() => setIsSidebarOpen(true)}
          onDeleteChat={deleteChat}
          onToggleFavorite={toggleFavorite}
        />

        {isSettingsOpen && (
          <SettingsModal
            settings={settings}
            user={user}
            onUpdateUser={handleUpdateUser}
            onSave={setSettings}
            onClose={() => setIsSettingsOpen(false)}
          />
        )}
      </main>
    </div>
  );
};

export default App;
