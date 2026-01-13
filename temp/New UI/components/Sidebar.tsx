
import React from 'react';
import { ChatSession, User } from '../types';

interface Props {
  chats: ChatSession[];
  currentChatId: string | null;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
  user: User;
  onOpenSettings: () => void;
  isOpen: boolean;
  onLogout: () => void;
}

const Sidebar: React.FC<Props> = ({ chats, currentChatId, onSelectChat, onNewChat, user, onOpenSettings, isOpen, onLogout }) => {
  const favorites = chats.filter(c => c.isFavorite);
  const others = chats.filter(c => !c.isFavorite);

  return (
    <aside className={`
      fixed inset-y-0 left-0 z-40 w-[280px] md:relative md:w-[300px] flex flex-col h-full 
      bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 transition-transform duration-300
      ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
    `}>
      <div className="p-6">
        <div className="flex items-center gap-3 mb-8">
          <div className="size-8 rounded-xl bg-slate-900 dark:bg-white flex items-center justify-center shadow-lg">
            <span className="material-symbols-outlined text-white dark:text-slate-900 text-[18px] font-bold">smart_toy</span>
          </div>
          <h1 className="text-slate-900 dark:text-white text-lg font-bold tracking-tight">Nexus Assistant</h1>
        </div>
        
        <button 
          onClick={onNewChat}
          className="w-full flex items-center justify-center gap-2 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 py-2.5 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-all active:scale-95"
        >
          <span className="material-symbols-outlined text-[20px]">add</span>
          <span className="text-sm font-bold">New Thread</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-6">
        {favorites.length > 0 && (
          <div>
            <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Pinned</div>
            {favorites.map(chat => (
              <ChatItem key={chat.id} chat={chat} isActive={currentChatId === chat.id} onClick={() => onSelectChat(chat.id)} />
            ))}
          </div>
        )}

        <div>
          <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">History</div>
          {others.length > 0 ? (
            others.map(chat => (
              <ChatItem key={chat.id} chat={chat} isActive={currentChatId === chat.id} onClick={() => onSelectChat(chat.id)} />
            ))
          ) : (
            <div className="px-3 py-4 text-xs text-slate-400 italic">No threads found</div>
          )}
        </div>
      </div>

      <div className="p-4 mt-auto border-t border-slate-100 dark:border-slate-800 space-y-2">
        <button 
          onClick={onOpenSettings}
          className="flex w-full items-center gap-3 rounded-xl p-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <img src={user.avatar} className="size-9 rounded-full border border-slate-200 dark:border-slate-700 shadow-sm object-cover" alt="Avatar" />
          <div className="flex flex-col items-start overflow-hidden text-left">
            <span className="truncate text-sm font-bold text-slate-800 dark:text-white w-full">{user.name}</span>
            <span className="text-[9px] font-bold bg-emerald-500/10 dark:bg-emerald-400/10 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded-full uppercase tracking-tighter">{user.accessLevel}</span>
          </div>
          <span className="material-symbols-outlined ml-auto text-slate-400">settings</span>
        </button>

        <button 
          onClick={onLogout}
          className="flex w-full items-center gap-3 rounded-xl p-2.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
        >
          <span className="material-symbols-outlined ml-1">logout</span>
          <span className="text-sm font-bold">Sign Out</span>
        </button>
      </div>
    </aside>
  );
};

const ChatItem: React.FC<{ chat: ChatSession, isActive: boolean, onClick: () => void }> = ({ chat, isActive, onClick }) => (
  <button 
    onClick={onClick}
    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left mb-1 transition-all ${
      isActive 
        ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-bold shadow-sm' 
        : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-200'
    }`}
  >
    <span className="material-symbols-outlined text-[18px]">
      {chat.isFavorite ? 'push_pin' : 'chat_bubble_outline'}
    </span>
    <span className="truncate text-sm flex-1">{chat.title || 'New Thread'}</span>
  </button>
);

export default Sidebar;
