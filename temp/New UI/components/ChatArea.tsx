
import React, { useState, useRef, useEffect } from 'react';
import { ChatSession, Message, AppSettings } from '../types';
import { INITIAL_PROMPTS } from '../constants';

interface Props {
  chat?: ChatSession;
  isLoading: boolean;
  onSendMessage: (content: string) => void;
  settings: AppSettings;
  onToggleThinking: (val: boolean) => void;
  onOpenMenu: () => void;
  onDeleteChat: (id: string) => void;
  onToggleFavorite: (id: string) => void;
}

const ChatArea: React.FC<Props> = ({ chat, isLoading, onSendMessage, settings, onToggleThinking, onOpenMenu, onDeleteChat, onToggleFavorite }) => {
  const [inputValue, setInputValue] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Typewriter effect state
  const [displayedText, setDisplayedText] = useState('');
  const [wordIndex, setWordIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const words = ["Collaborator", "Marketing Expert", "Software Engineer", "Creative Designer", "Strategist", "Researcher"];
  const typingSpeed = 150;
  const deletingSpeed = 75;
  const pauseTime = 2000;

  useEffect(() => {
    const handleType = () => {
      const currentWord = words[wordIndex];
      if (isDeleting) {
        setDisplayedText(prev => prev.substring(0, prev.length - 1));
        if (displayedText === '') {
          setIsDeleting(false);
          setWordIndex(prev => (prev + 1) % words.length);
        }
      } else {
        setDisplayedText(currentWord.substring(0, displayedText.length + 1));
        if (displayedText === currentWord) {
          setTimeout(() => setIsDeleting(true), pauseTime);
        }
      }
    };

    const timer = setTimeout(handleType, isDeleting ? deletingSpeed : typingSpeed);
    return () => clearTimeout(timer);
  }, [displayedText, isDeleting, wordIndex]);

  useEffect(() => {
    if (settings.autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chat?.messages, isLoading, settings.autoScroll]);

  const filteredMessages = chat?.messages.filter(m => 
    m.content.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const handleSend = () => {
    if (!inputValue.trim() || isLoading) return;
    onSendMessage(inputValue);
    setInputValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (settings.sendWithEnter) {
        if (!e.shiftKey) {
          e.preventDefault();
          handleSend();
        }
      } else if (e.metaKey || e.ctrlKey) {
        e.preventDefault();
        handleSend();
      }
    }
  };

  return (
    <div className="flex-1 flex flex-col relative h-full bg-white dark:bg-slate-950 overflow-hidden">
      {/* Header - Fixed Height */}
      <header className="h-16 flex items-center justify-between px-4 md:px-6 border-b border-slate-100 dark:border-slate-800 bg-white/50 dark:bg-slate-950/50 backdrop-blur-md sticky top-0 z-20 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={onOpenMenu} className="md:hidden p-2 text-slate-500 hover:bg-slate-100 rounded-full transition-colors shrink-0">
            <span className="material-symbols-outlined">menu</span>
          </button>
          
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white truncate max-w-[120px] sm:max-w-[300px] md:max-w-[400px]">
                {chat?.title || 'Nexus Assistant'}
              </h2>
              <div className="relative flex h-2 w-2 shrink-0 mb-0.5">
                <span className="animate-radar absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </div>
            </div>
            {settings.thinkingMode && (
              <span className="text-[8px] sm:text-[9px] font-bold text-indigo-500 uppercase tracking-tighter truncate">Deep Reason Enabled</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {isSearchOpen ? (
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-full px-2 py-1 animate-fade-in-up border border-slate-200 dark:border-slate-700">
              <input 
                autoFocus
                placeholder="Find..." 
                className="bg-transparent border-none text-[11px] focus:ring-0 w-24 md:w-48 text-slate-700 dark:text-white"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <button onClick={() => { setIsSearchOpen(false); setSearchQuery(''); }}><span className="material-symbols-outlined text-sm">close</span></button>
            </div>
          ) : (
            <button onClick={() => setIsSearchOpen(true)} className="p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"><span className="material-symbols-outlined">search</span></button>
          )}

          <div className="relative">
            <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"><span className="material-symbols-outlined">more_vert</span></button>
            {isMenuOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-100 dark:border-slate-700 py-1 z-50 animate-fade-in-up">
                <button onClick={() => { if(chat) onToggleFavorite(chat.id); setIsMenuOpen(false); }} className="w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-3 transition-colors">
                  <span className="material-symbols-outlined text-[18px]">{chat?.isFavorite ? 'push_pin' : 'push_pin'}</span>
                  {chat?.isFavorite ? 'Unpin thread' : 'Pin thread'}
                </button>
                <button onClick={() => { if(chat) onDeleteChat(chat.id); setIsMenuOpen(false); }} className="w-full text-left px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-3 transition-colors">
                  <span className="material-symbols-outlined text-[18px]">delete</span>
                  Delete thread
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Messages - Flex Fill and Internal Scroll Only */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 md:py-6 scroll-smooth">
        <div className="max-w-[800px] mx-auto flex flex-col gap-6 md:gap-8">
          {!chat || chat.messages.length === 0 ? (
            <div className="py-10 md:py-20 flex flex-col items-center text-center">
              <h1 className="text-2xl md:text-5xl font-extrabold text-slate-900 dark:text-white mb-4 md:mb-6">
                Nexus <span className="text-slate-400 min-w-[140px] md:min-w-[200px] inline-block">{displayedText}<span className="animate-pulse">|</span></span>
              </h1>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 w-full mt-6 md:mt-10">
                {INITIAL_PROMPTS.map(p => (
                  <button key={p.id} onClick={() => onSendMessage(p.title)} className="p-4 md:p-6 text-left glass-panel rounded-2xl hover:translate-y-[-4px] transition-all border border-slate-100 dark:border-slate-800 shadow-sm">
                    <span className="material-symbols-outlined mb-2 md:mb-4 text-slate-500 dark:text-slate-400">{p.icon}</span>
                    <h3 className="font-bold text-xs md:text-sm mb-1">{p.title}</h3>
                    <p className="text-[10px] md:text-xs text-slate-500 leading-relaxed">{p.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            (searchQuery ? filteredMessages : chat.messages).map(msg => (
              <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in-up`}>
                {msg.role === 'assistant' && (
                  <div className={`size-7 md:size-8 rounded-lg flex items-center justify-center shrink-0 shadow-md ${msg.isThinking ? 'bg-indigo-600' : 'bg-slate-900 dark:bg-white'} text-white dark:text-slate-900`}>
                    <span className="material-symbols-outlined text-[16px] md:text-[18px]">{msg.isThinking ? 'psychology' : 'smart_toy'}</span>
                  </div>
                )}
                <div className={`max-w-[90%] md:max-w-[85%] p-3 md:p-4 rounded-2xl shadow-sm ${msg.role === 'user' ? 'bg-slate-900 text-white rounded-tr-sm' : 'bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-tl-sm'}`}>
                  {msg.isThinking && msg.role === 'assistant' && (
                    <div className="text-[9px] font-bold text-indigo-500 mb-2 flex items-center gap-1 uppercase tracking-widest">
                      <span className="material-symbols-outlined text-[10px] md:text-[12px]">verified</span> Reasoned Output
                    </div>
                  )}
                  <p className="text-[13px] md:text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))
          )}
          {isLoading && <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-xl w-24 flex justify-center gap-1.5"><div className="size-1.5 bg-slate-300 rounded-full animate-bounce"></div><div className="size-1.5 bg-slate-300 rounded-full animate-bounce delay-75"></div><div className="size-1.5 bg-slate-300 rounded-full animate-bounce delay-150"></div></div>}
        </div>
      </div>

      {/* Input - Sticky Bottom with constrained padding */}
      <div className="px-4 pb-4 pt-2 md:pb-8 max-w-[850px] mx-auto w-full shrink-0">
        <div className={`flex items-end bg-white dark:bg-slate-900 border rounded-[2rem] p-1.5 md:p-2 pl-4 md:pl-5 shadow-2xl transition-all duration-300 ${settings.thinkingMode ? 'border-indigo-400 ring-4 ring-indigo-50 dark:ring-indigo-900/20' : 'border-slate-200 dark:border-slate-800 focus-within:border-slate-400'}`}>
          <textarea 
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={settings.thinkingMode ? "Deep analysis..." : "Message Nexus..."}
            rows={1}
            className="flex-1 bg-transparent border-none focus:ring-0 text-[13px] md:text-sm py-2.5 md:py-3 resize-none max-h-32 md:max-h-40 text-slate-800 dark:text-white"
          />
          <div className="flex items-center gap-1 pr-1 pb-1">
            <button 
              onClick={() => onToggleThinking(!settings.thinkingMode)}
              className={`p-2 md:p-2.5 rounded-xl transition-all active:scale-90 ${settings.thinkingMode ? 'bg-indigo-500 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
              title="Toggle Thinking Mode"
            >
              <span className={`material-symbols-outlined text-[18px] md:text-[20px] ${settings.thinkingMode ? 'animate-pulse' : ''}`}>psychology</span>
            </button>
            <button 
              onClick={handleSend}
              disabled={!inputValue.trim() || isLoading}
              className={`size-9 md:size-11 rounded-2xl flex items-center justify-center transition-all shadow-lg active:scale-90 ${settings.thinkingMode ? 'bg-indigo-600' : 'bg-slate-900 dark:bg-white'} text-white dark:text-slate-900 disabled:opacity-50`}
            >
              <span className="material-symbols-outlined text-[20px]">send</span>
            </button>
          </div>
        </div>
        <p className="text-center text-[8px] md:text-[10px] text-slate-400 mt-2 md:mt-4 tracking-tight uppercase font-bold opacity-60">Nexus Enterprise • Corporate AI System</p>
      </div>
    </div>
  );
};

export default ChatArea;
