
import React, { useState, useRef, useEffect } from 'react';
import { AppSettings, User } from '../types';
import { DEFAULT_SETTINGS, MOCK_USER, AVATAR_OPTIONS } from '../constants';

interface SystemStatus {
  status: 'online' | 'degraded' | 'offline';
  latencyMs: number;
  ai: { provider: string; model: string };
  vectorDb: string;
  mcpServers: string[];
  usage: { monthlyChats: number; totalConversations: number };
  features: { hybridSearch: boolean; reranker: boolean; userMemory: boolean; semanticChunking: boolean };
  uptime: number;
}

interface Props {
  settings: AppSettings;
  user: User;
  onUpdateUser: (u: Partial<User>) => void;
  onSave: (s: AppSettings) => void;
  onClose: () => void;
}

type Tab = 'Profile' | 'Appearance' | 'Behavior' | 'Accessibility' | 'API';

const SettingsModal: React.FC<Props> = ({ settings, user, onUpdateUser, onSave, onClose }) => {
  const [activeTab, setActiveTab] = useState<Tab>('Profile');
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);
  const [localUser, setLocalUser] = useState<User>(user);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);

  useEffect(() => {
    if (activeTab === 'API') {
      fetch('/api/system-status')
        .then(r => r.json())
        .then(data => setSystemStatus(data))
        .catch(() => setSystemStatus({ status: 'offline', latencyMs: 0, ai: { provider: '?', model: '?' }, vectorDb: 'none', mcpServers: [], usage: { monthlyChats: 0, totalConversations: 0 }, features: { hybridSearch: false, reranker: false, userMemory: false, semanticChunking: false }, uptime: 0 }));
    }
  }, [activeTab]);

  const update = <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => {
    setLocalSettings(prev => ({ ...prev, [k]: v }));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setLocalUser(prev => ({ ...prev, avatar: base64String }));
      };
      reader.readAsDataURL(file);
    }
  };

  const toggleWorkspacePref = (p: string) => {
    setLocalSettings(prev => {
      const exists = prev.workspacePrefs.includes(p);
      return {
        ...prev,
        workspacePrefs: exists
          ? prev.workspacePrefs.filter(item => item !== p)
          : [...prev.workspacePrefs, p]
      };
    });
  };

  const handleReset = () => {
    if (window.confirm('Möchten Sie alle Einstellungen und Ihr Profil auf die Standardwerte zurücksetzen?')) {
      setLocalSettings(DEFAULT_SETTINGS);
      setLocalSettings(DEFAULT_SETTINGS);
      setLocalUser(prev => ({
        ...prev,
        name: user.email.split('@')[0] || 'User',
        avatar: undefined
      }));
    }
  };

  const handleSaveAll = () => {
    onSave(localSettings);
    onUpdateUser(localUser);
    onClose();
  };

  const tabs: { id: Tab, icon: string }[] = [
    { id: 'Profile', icon: 'person' },
    { id: 'Appearance', icon: 'palette' },
    { id: 'Behavior', icon: 'tune' },
    { id: 'Accessibility', icon: 'accessibility_new' },
    { id: 'API', icon: 'api' },
  ];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-0 md:p-8 bg-black/60 backdrop-blur-md animate-fade-in-up">
      <div className="w-full h-full max-h-[850px] max-w-6xl flex flex-col md:flex-row bg-white dark:bg-slate-900 overflow-hidden md:rounded-3xl shadow-[0_35px_60px_-15px_rgba(0,0,0,0.3)] border border-white/20 relative">
        <button onClick={onClose} className="absolute right-6 top-6 z-[70] size-10 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white transition-all shadow-sm active:scale-90"><span className="material-symbols-outlined text-xl">close</span></button>

        {/* Navigation Sidebar */}
        <div className="w-full md:w-72 shrink-0 border-r border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 p-6 flex flex-col z-10">
          <div className="mb-6 md:mb-10 pl-2">
            <h1 className="text-xl font-bold flex items-center gap-2 dark:text-white">
              <span className="material-symbols-outlined text-slate-900 dark:text-white">smart_toy</span>
              HTW Assistent
            </h1>
            <p className="text-[9px] text-slate-500 mt-1 pl-8 font-bold uppercase tracking-[0.2em]">Internal Config v2.4</p>
          </div>

          <nav className="flex md:flex-col gap-1 overflow-x-auto md:overflow-x-visible pb-4 md:pb-0 no-scrollbar">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-3 px-5 py-3 rounded-full text-xs md:text-sm font-bold transition-all whitespace-nowrap shrink-0 md:shrink ${activeTab === t.id ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xl' : 'text-slate-500 hover:bg-white dark:hover:bg-slate-800'}`}
              >
                <span className="material-symbols-outlined text-[18px] md:text-[20px]">{t.icon}</span>
                {t.id}
              </button>
            ))}
          </nav>
        </div>

        {/* Content Area */}
        <div className="flex-1 flex flex-col relative bg-white dark:bg-slate-900 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 md:p-12 relative">
            <div className="mb-10 border-b border-slate-100 dark:border-slate-800 pb-8">
              <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 dark:text-white mb-2 tracking-tight">{activeTab} Settings</h2>
              <p className="text-slate-500 text-sm md:text-base font-medium">Internal configuration for enterprise collaborative tools.</p>
            </div>

            <div className="max-w-3xl space-y-10 pb-10">
              {activeTab === 'Profile' && (
                <div className="space-y-12 animate-fade-in-up">
                  <section className="space-y-6">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Anzeigename</label>
                      <input
                        className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 px-5 py-3 text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-slate-900 outline-none transition-all"
                        value={localUser.name}
                        onChange={(e) => setLocalUser(prev => ({ ...prev, name: e.target.value }))}
                      />
                    </div>
                  </section>

                  <section className="space-y-6">
                    <h3 className="text-lg font-bold flex items-center gap-3 dark:text-white"><span className="material-symbols-outlined text-slate-400">pets</span> Wähle dein Team</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {AVATAR_OPTIONS.map(opt => (
                        <button
                          key={opt.id}
                          onClick={() => setLocalUser(prev => ({ ...prev, avatar: opt.src }))}
                          className={`flex flex-col items-center gap-3 p-6 rounded-3xl border-2 transition-all ${localUser.avatar === opt.src ? 'border-slate-900 dark:border-white bg-white dark:bg-slate-800 shadow-xl' : 'border-slate-100 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-600'}`}
                        >
                          <img src={opt.src} alt={opt.name} className="size-20 rounded-full object-cover shadow-lg" />
                          <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{opt.name}</span>
                        </button>
                      ))}
                    </div>
                  </section>
                </div>
              )}

              {activeTab === 'Appearance' && (
                <div className="space-y-12 animate-fade-in-up">
                  <section className="space-y-6">
                    <h3 className="text-lg font-bold dark:text-white">Global Theme</h3>
                    <div className="flex w-full max-w-lg rounded-3xl bg-slate-100 dark:bg-slate-800 p-2 shadow-inner">
                      {(['light', 'dark', 'system'] as const).map(t => (
                        <button key={t} onClick={() => update('theme', t)} className={`flex-1 py-3 text-xs font-bold rounded-2xl transition-all capitalize ${localSettings.theme === t ? 'bg-white dark:bg-slate-700 shadow-xl text-slate-900 dark:text-white' : 'text-slate-500'}`}>{t}</button>
                      ))}
                    </div>
                  </section>

                  <section className="grid grid-cols-1 gap-12">
                    <div className="space-y-6">
                      <div className="flex justify-between items-center"><h3 className="text-lg font-bold dark:text-white">Interface Scale</h3><span className="text-xs font-bold text-slate-400 px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded-full">{localSettings.fontSize}px</span></div>
                      <div className="p-8 rounded-[2.5rem] bg-slate-50 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-800">
                        <input type="range" min="12" max="24" value={localSettings.fontSize} onChange={(e) => update('fontSize', parseInt(e.target.value))} className="w-full h-2 accent-slate-900 dark:accent-white appearance-none bg-slate-200 dark:bg-slate-700 rounded-full" />
                      </div>
                    </div>
                    <div className="space-y-6">
                      <h3 className="text-lg font-bold dark:text-white">Layout Mode</h3>
                      <div className="grid grid-cols-2 gap-4">
                        {(['standard', 'compact'] as const).map(d => (
                          <button key={d} onClick={() => update('density', d)} className={`p-6 rounded-3xl border-2 transition-all flex flex-col gap-2 ${localSettings.density === d ? 'border-slate-900 dark:border-white bg-white dark:bg-slate-800 shadow-xl' : 'border-slate-100 dark:border-slate-800 text-slate-400'}`}>
                            <span className="text-sm font-bold">{d.toUpperCase()}</span>
                            <span className="text-[10px] opacity-60">{d === 'standard' ? 'Balanced spacing' : 'Maximum information density'}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </section>
                </div>
              )}

              {activeTab === 'Behavior' && (
                <div className="space-y-6 animate-fade-in-up">
                  {[
                    { id: 'sendWithEnter', label: 'Primary Send Logic', desc: 'Trigger message dispatch on Enter key press.' },
                    { id: 'autoScroll', label: 'Viewport Anchoring', desc: 'Keep conversation focused on active output.' },
                    { id: 'linkPreviews', label: 'Semantic Previews', desc: 'Fetch rich metadata for shared URI endpoints.' },
                  ].map(item => (
                    <div key={item.id} className="flex items-center justify-between p-6 rounded-[2rem] bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-800 shadow-sm transition-all hover:shadow-md">
                      <div className="flex flex-col gap-1 pr-4">
                        <span className="text-sm font-bold text-slate-900 dark:text-white">{item.label}</span>
                        <span className="text-xs text-slate-500 font-medium">{item.desc}</span>
                      </div>
                      <label className="relative inline-flex cursor-pointer shrink-0">
                        <input type="checkbox" className="sr-only peer" checked={localSettings[item.id as keyof AppSettings] as boolean} onChange={(e) => update(item.id as any, e.target.checked)} />
                        <div className="w-14 h-7 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-7 peer-checked:bg-slate-900 dark:peer-checked:bg-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white dark:after:bg-slate-800 after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
                      </label>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 'Accessibility' && (
                <div className="space-y-6 animate-fade-in-up">
                  {[
                    { id: 'highContrast', label: 'High Contrast Mode', desc: 'Force high luminosity contrast for interface elements.' },
                    { id: 'reduceMotion', label: 'Reduced Motion', desc: 'Minimize UI transitions for sensory comfort.' },
                    { id: 'textToSpeech', label: 'Audio Response', desc: 'Sprachausgabe für Assistent-Antworten aktivieren.' },
                  ].map(item => (
                    <div key={item.id} className="flex items-center justify-between p-6 rounded-[2rem] bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-800 shadow-sm transition-all hover:shadow-md">
                      <div className="flex flex-col gap-1 pr-4">
                        <span className="text-sm font-bold text-slate-900 dark:text-white">{item.label}</span>
                        <span className="text-xs text-slate-500 font-medium">{item.desc}</span>
                      </div>
                      <label className="relative inline-flex cursor-pointer shrink-0">
                        <input type="checkbox" className="sr-only peer" checked={localSettings[item.id as keyof AppSettings] as boolean} onChange={(e) => update(item.id as any, e.target.checked)} />
                        <div className="w-14 h-7 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-7 peer-checked:bg-slate-900 dark:peer-checked:bg-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white dark:after:bg-slate-800 after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
                      </label>
                    </div>
                  ))}

                  {localSettings.textToSpeech && (
                    <div className="p-6 rounded-[2rem] bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 space-y-4 animate-fade-in-up">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-bold text-slate-900 dark:text-white">Speech Rate</span>
                        <span className="text-xs font-mono font-bold text-slate-500">{localSettings.speechRate}x</span>
                      </div>
                      <input
                        type="range"
                        min="0.5"
                        max="2.0"
                        step="0.1"
                        value={localSettings.speechRate}
                        onChange={(e) => update('speechRate', parseFloat(e.target.value))}
                        className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-slate-900 dark:accent-white"
                      />
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'API' && (
                <div className="space-y-8 animate-fade-in-up">
                  <section className="flex flex-col gap-4">
                    <div className="flex items-center justify-between rounded-3xl border border-white dark:border-slate-800 bg-white/50 dark:bg-slate-800/50 p-6 shadow-sm backdrop-blur-sm">
                      <div className="flex items-center gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 text-slate-900 dark:text-white">
                          <span className="material-symbols-outlined text-2xl">hub</span>
                        </div>
                        <div>
                          <h3 className="text-base font-bold text-slate-900 dark:text-white">System Status</h3>
                          <div className="flex items-center gap-2 mt-1">
                            {systemStatus ? (
                              <>
                                <span className="relative flex h-2.5 w-2.5">
                                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${systemStatus.status === 'online' ? 'bg-emerald-400' : 'bg-amber-400'} opacity-75`}></span>
                                  <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${systemStatus.status === 'online' ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                                </span>
                                <span className={`text-xs font-bold ${systemStatus.status === 'online' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                                  {systemStatus.ai.provider === 'google' ? 'Google Gemini' : systemStatus.ai.provider === 'openai' ? 'OpenAI' : systemStatus.ai.provider === 'claude' ? 'Anthropic Claude' : systemStatus.ai.provider} &middot; {systemStatus.ai.model}
                                </span>
                              </>
                            ) : (
                              <span className="text-xs text-slate-400 font-bold">Verbindung wird geprüft...</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="block text-[10px] text-slate-400 uppercase tracking-widest font-bold">Latency</span>
                        <span className="text-sm font-bold text-slate-900 dark:text-white font-mono">{systemStatus ? `${systemStatus.latencyMs}ms` : '...'}</span>
                      </div>
                    </div>
                    {systemStatus && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-1">
                        <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-800 p-4 text-center shadow-sm">
                          <span className="block text-lg font-bold text-slate-900 dark:text-white">{systemStatus.mcpServers.length}</span>
                          <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Tools</span>
                        </div>
                        <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-800 p-4 text-center shadow-sm">
                          <span className="block text-lg font-bold text-slate-900 dark:text-white">{systemStatus.usage.totalConversations}</span>
                          <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Chats</span>
                        </div>
                        <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-800 p-4 text-center shadow-sm">
                          <span className="block text-lg font-bold text-slate-900 dark:text-white">{systemStatus.vectorDb === 'none' ? 'Aus' : systemStatus.vectorDb}</span>
                          <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">VectorDB</span>
                        </div>
                        <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-800 p-4 text-center shadow-sm">
                          <span className="block text-lg font-bold text-slate-900 dark:text-white">{Math.floor(systemStatus.uptime / 60)}m</span>
                          <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Uptime</span>
                        </div>
                      </div>
                    )}
                  </section>

                  <section className="flex flex-col gap-5">
                    <div className="flex items-center justify-between px-2">
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <span className="material-symbols-outlined text-slate-400">key</span>
                        API Keys
                      </h3>
                    </div>
                    <div className="rounded-3xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-800 p-6 shadow-sm flex flex-col gap-6">
                      <div className="flex flex-col gap-2">
                        <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Active API Key</label>
                        <div className="flex flex-col sm:flex-row gap-3">
                          <div className="relative flex-1">
                            <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400">
                              <span className="material-symbols-outlined text-[20px]">vpn_key</span>
                            </span>
                            <input
                              className="w-full rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 pl-11 pr-5 py-3 text-slate-600 dark:text-slate-400 font-mono text-sm focus:border-slate-400 focus:outline-none focus:ring-0 shadow-inner"
                              type="password"
                              placeholder="sk-..."
                              value={localSettings.apiKey || ''}
                              onChange={(e) => update('apiKey', e.target.value)}
                            />
                          </div>
                          {/* 
                          <button className="shrink-0 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-6 py-3 text-sm font-bold text-slate-900 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-700 transition-all shadow-sm active:scale-95">
                            Validate
                          </button> 
                          */}
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1 font-medium italic">
                          {localSettings.apiKey ? 'Key configured locally' : 'Using server-side environment key'}
                        </p>
                      </div>

                      <div className="h-px w-full bg-slate-100 dark:bg-slate-700"></div>

                      <div className="flex flex-col gap-4">
                        <div className="flex justify-between items-center">
                          <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Nutzung diesen Monat</label>
                          <span className="text-xs font-bold text-slate-500">{systemStatus ? `${systemStatus.usage.monthlyChats} Anfragen` : '...'}</span>
                        </div>
                        {systemStatus && (
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(systemStatus.features).map(([key, enabled]) => (
                              <span key={key} className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${enabled ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'}`}>
                                <span className="material-symbols-outlined text-[12px]">{enabled ? 'check_circle' : 'cancel'}</span>
                                {key === 'hybridSearch' ? 'Hybrid Search' : key === 'reranker' ? 'Reranker' : key === 'userMemory' ? 'User Memory' : key === 'semanticChunking' ? 'Semantic Chunking' : key}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </section>

                  <section className="flex flex-col gap-5">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2 px-2">
                      <span className="material-symbols-outlined text-slate-400">tune</span>
                      Model Parameters
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-800 p-6 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-center mb-4">
                          <label className="text-sm font-bold text-slate-900 dark:text-white">Temperature</label>
                          <span className="text-xs font-mono font-bold bg-slate-100 dark:bg-slate-900 px-2 py-1 rounded text-slate-600 dark:text-slate-300">{localSettings.temperature}</span>
                        </div>
                        <input
                          className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-slate-900 dark:accent-white"
                          max="1"
                          min="0"
                          step="0.1"
                          type="range"
                          value={localSettings.temperature}
                          onChange={(e) => update('temperature', parseFloat(e.target.value))}
                        />
                        <p className="text-[10px] text-slate-400 mt-4 font-medium leading-tight">Controls randomness: Lower values make responses more focused and deterministic.</p>
                      </div>

                      <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-800 p-6 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-center mb-4">
                          <label className="text-sm font-bold text-slate-900 dark:text-white">Max Tokens</label>
                          <span className="text-xs font-mono font-bold bg-slate-100 dark:bg-slate-900 px-2 py-1 rounded text-slate-600 dark:text-slate-300">{localSettings.maxTokens}</span>
                        </div>
                        <input
                          className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-slate-900 dark:accent-white"
                          max="4096"
                          min="256"
                          step="256"
                          type="range"
                          value={localSettings.maxTokens}
                          onChange={(e) => update('maxTokens', parseInt(e.target.value))}
                        />
                        <p className="text-[10px] text-slate-400 mt-4 font-medium leading-tight">Limits the total length of the generated response to manage latency and cost.</p>
                      </div>
                    </div>
                  </section>
                </div>
              )}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="w-full p-6 md:px-12 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between z-[70] shrink-0">
            <button
              onClick={handleReset}
              className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-full transition-all active:scale-95"
            >
              <span className="material-symbols-outlined text-sm">restart_alt</span>
              Auf Standard zurücksetzen
            </button>
            <div className="flex gap-2 sm:gap-4">
              <button onClick={onClose} className="px-4 sm:px-8 py-3 text-sm font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors active:scale-95">Cancel</button>
              <button onClick={handleSaveAll} className="px-6 sm:px-12 py-3 text-sm font-bold text-white bg-slate-900 dark:bg-white dark:text-slate-900 rounded-full shadow-2xl hover:scale-[1.05] active:scale-95 transition-all">Save Changes</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
