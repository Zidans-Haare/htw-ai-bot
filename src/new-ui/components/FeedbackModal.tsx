
import React, { useState, useMemo } from 'react';
import { ChatSession } from '../types';

interface Props {
  conversationId?: string;
  messageId?: string;
  chat?: ChatSession;
  onClose: () => void;
}

const FeedbackModal: React.FC<Props> = ({ conversationId, messageId, chat, onClose }) => {
  const [text, setText] = useState('');
  const [email, setEmail] = useState('');
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  // Generate simple math captcha
  const captcha = useMemo(() => {
    const a = Math.floor(Math.random() * 10) + 1;
    const b = Math.floor(Math.random() * 10) + 1;
    return { a, b, expected: a + b };
  }, []);

  const buildChatHistory = (): string => {
    if (!chat?.messages?.length) return '';
    return chat.messages.map(msg => {
      const prefix = msg.role === 'user' ? 'User' : 'Assistant';
      return `${prefix}: ${msg.content}`;
    }).join('\n\n');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!text.trim()) return;

    if (parseInt(captchaAnswer, 10) !== captcha.expected) {
      setErrorMsg('Falsche Antwort auf die Sicherheitsfrage.');
      return;
    }

    setStatus('sending');
    setErrorMsg('');

    try {
      const payload = {
        text: text.trim(),
        email: email.trim() || undefined,
        conversation_id: conversationId || chat?.id,
        message_id: messageId,
        captcha: captchaAnswer,
        expected_captcha: captcha.expected,
        attached_chat_history: buildChatHistory(),
      };

      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        setStatus('success');
        setTimeout(onClose, 1500);
      } else {
        const data = await response.json().catch(() => ({}));
        setErrorMsg(data.message || 'Feedback konnte nicht gesendet werden.');
        setStatus('error');
      }
    } catch {
      setErrorMsg('Ein Netzwerkfehler ist aufgetreten.');
      setStatus('error');
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in-up" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-white/20 relative overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-2">
          <h2 className="text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <span className="material-symbols-outlined text-slate-400">feedback</span>
            Feedback senden
          </h2>
          <button
            onClick={onClose}
            className="size-9 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white transition-all active:scale-90"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        {status === 'success' ? (
          <div className="p-8 text-center">
            <span className="material-symbols-outlined text-5xl text-emerald-500 mb-3 block">check_circle</span>
            <p className="text-sm font-bold text-slate-900 dark:text-white">Vielen Dank!</p>
            <p className="text-xs text-slate-500 mt-1">Ihr Feedback wurde gesendet.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 pt-4 flex flex-col gap-4">
            {/* Feedback text */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
                Ihr Feedback *
              </label>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Was hat gut funktioniert? Was kann verbessert werden?"
                rows={4}
                required
                className="w-full rounded-2xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 px-4 py-3 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-slate-900 dark:focus:ring-white outline-none transition-all resize-none"
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
                E-Mail (optional)
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ihre@email.de"
                className="w-full rounded-2xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 px-4 py-3 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-slate-900 dark:focus:ring-white outline-none transition-all"
              />
            </div>

            {/* Captcha */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
                Sicherheitsfrage: Was ist {captcha.a} + {captcha.b}?
              </label>
              <input
                type="number"
                value={captchaAnswer}
                onChange={(e) => setCaptchaAnswer(e.target.value)}
                placeholder="Antwort"
                required
                className="w-full max-w-[120px] rounded-2xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 px-4 py-3 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-slate-900 dark:focus:ring-white outline-none transition-all"
              />
            </div>

            {/* Chat context indicator */}
            {chat && chat.messages.length > 0 && (
              <p className="text-[10px] text-slate-400 flex items-center gap-1">
                <span className="material-symbols-outlined text-[12px]">attach_file</span>
                Chat-Verlauf wird automatisch angehängt ({chat.messages.length} Nachrichten)
              </p>
            )}

            {/* Error message */}
            {errorMsg && (
              <p className="text-xs text-red-500 font-bold">{errorMsg}</p>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2.5 text-sm font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors active:scale-95"
              >
                Abbrechen
              </button>
              <button
                type="submit"
                disabled={!text.trim() || status === 'sending'}
                className="px-8 py-2.5 text-sm font-bold text-white bg-slate-900 dark:bg-white dark:text-slate-900 rounded-full shadow-xl hover:scale-[1.05] active:scale-95 transition-all disabled:opacity-50"
              >
                {status === 'sending' ? (
                  <span className="flex items-center gap-2">
                    <span className="size-3 border-2 border-white/30 border-t-white dark:border-slate-900/30 dark:border-t-slate-900 rounded-full animate-spin" />
                    Senden...
                  </span>
                ) : 'Absenden'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default FeedbackModal;
