
import { AppSettings, User } from './types';

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'light',
  accentColor: '#171717',
  fontSize: 16,
  density: 'standard',
  sendWithEnter: true,
  timestampFormat: '24h',
  autoScroll: true,
  linkPreviews: false,
  highContrast: false,
  reduceMotion: false,
  textToSpeech: false,
  speechRate: 1.0,
  temperature: 0.7,
  maxTokens: 2048,
  thinkingMode: false,
  workspacePrefs: ['Software Engineering'],
};

export const MOCK_USER: User = {
  id: 'user_1',
  name: 'Alex Morgan',
  email: 'alex@nexus-internal.com',
  accessLevel: 'Internal',
  avatar: 'https://picsum.photos/seed/alex/100/100'
};

export const AVATAR_OPTIONS = [
  { id: 'faranto', name: 'Team Faranto', src: '/assets/images/smoky_klein.png' },
  { id: 'stura', name: 'Team StuRa', src: '/assets/images/stu_klein.png' },
  { id: 'both', name: 'Team Beide', src: '/assets/images/FarantoStura.png' },
];

export const GUEST_USER: User = {
  id: 'guest',
  name: 'Gast',
  email: '',
  accessLevel: 'Student',
  avatar: '/assets/images/smoky_klein.png',
};

export const INITIAL_PROMPTS = [
  { id: 'p1', title: 'Data Analysis', desc: 'Synthesize internal reports', icon: 'analytics' },
  { id: 'p2', title: 'Project Plan', desc: 'Draft Q3 roadmap', icon: 'assignment' },
  { id: 'p3', title: 'Code Review', desc: 'Audit repository changes', icon: 'code' }
];
