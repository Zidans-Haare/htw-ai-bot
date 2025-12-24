
export type AuthState = 'loading' | 'landing' | 'login' | 'forgot-password' | 'reset-success' | 'authenticated';

export interface User {
  id: string;
  name: string;
  email: string;
  accessLevel: 'Internal' | 'Admin';
  avatar?: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isThinking?: boolean;
}

export interface ChatSession {
  id: string;
  title: string;
  lastUpdated: number;
  messages: Message[];
  isFavorite: boolean;
}

export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  accentColor: string;
  fontSize: number;
  density: 'standard' | 'compact';
  sendWithEnter: boolean;
  timestampFormat: '12h' | '24h';
  autoScroll: boolean;
  linkPreviews: boolean;
  highContrast: boolean;
  reduceMotion: boolean;
  textToSpeech: boolean;
  speechRate: number;
  temperature: number;
  maxTokens: number;
  thinkingMode: boolean;
  workspacePrefs: string[];
}
