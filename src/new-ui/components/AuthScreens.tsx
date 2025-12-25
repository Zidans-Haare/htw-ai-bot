
import React, { useState } from 'react';
import { AuthState } from '../types';


interface Props {
  state: AuthState;
  setState: (s: AuthState) => void;
  onLogin?: (email: string, pass: string) => void;
}

const AuthScreens: React.FC<Props> = ({ state, setState, onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  if (state === 'login') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 font-display">
        <div className="w-full max-w-[480px] bg-white/70 backdrop-blur-xl border border-white/60 shadow-2xl rounded-2xl p-8 sm:p-10 animate-fade-in-up">
          <div className="flex flex-col items-center gap-4 text-center mb-8">
            <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-slate-900 text-white mb-2 shadow-lg">
              <span className="material-symbols-outlined text-[32px]">smart_toy</span>
            </div>
            <h1 className="text-slate-900 text-3xl font-bold tracking-tight">Nexus Assistant</h1>
            <p className="text-slate-500 text-sm font-medium">Internal Corporate Access • Secure Login</p>
          </div>

          <form className="space-y-5" onSubmit={(e) => {
            e.preventDefault();
            if (onLogin) onLogin(email, password);
            else setState('authenticated');
          }}>
            <div className="space-y-2">
              <label className="text-slate-900 text-sm font-semibold ml-1">Work Identity</label>
              <div className="relative flex items-center">
                <span className="absolute left-4 text-slate-400 material-symbols-outlined text-[20px]">person</span>
                <input
                  type="text"
                  className="w-full rounded-lg border border-slate-200 bg-slate-50/50 h-12 pl-11 pr-4 focus:ring-slate-900 focus:border-slate-900 transition-all"
                  placeholder="employee@nexus.internal"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center ml-1">
                <label className="text-slate-900 text-sm font-semibold">Password</label>
                <button
                  type="button"
                  onClick={() => setState('forgot-password')}
                  className="text-slate-500 text-xs font-medium hover:text-slate-900"
                >
                  Forgot?
                </button>
              </div>
              <div className="relative flex items-center">
                <span className="absolute left-4 text-slate-400 material-symbols-outlined text-[20px]">lock</span>
                <input
                  type="password"
                  className="w-full rounded-lg border border-slate-200 bg-slate-50/50 h-12 pl-11 pr-4 focus:ring-slate-900 focus:border-slate-900 transition-all"
                  placeholder="••••••••"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            <button className="w-full h-12 rounded-lg bg-slate-900 hover:bg-black text-white font-bold transition-all shadow-lg active:scale-95">
              Enter Workspace
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-slate-100 flex justify-center gap-1 text-sm">
            <p className="text-slate-500">Need access?</p>
            <button onClick={() => setState('register')} className="text-slate-900 font-semibold hover:underline">Create Account</button>
          </div>
        </div>
      </div>
    );
  }

  if (state === 'register') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 font-display">
        <div className="w-full max-w-[480px] bg-white/70 backdrop-blur-xl border border-white/60 shadow-2xl rounded-2xl p-8 sm:p-10 animate-fade-in-up">
          <div className="flex flex-col items-center gap-4 text-center mb-8">
            <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-slate-900 text-white mb-2 shadow-lg">
              <span className="material-symbols-outlined text-[32px]">person_add</span>
            </div>
            <h1 className="text-slate-900 text-3xl font-bold tracking-tight">Join Nexus</h1>
            <p className="text-slate-500 text-sm font-medium">Create your secure workspace account.</p>
          </div>

          <form className="space-y-5" onSubmit={async (e) => {
            e.preventDefault();
            setIsLoading(true);
            try {
              await import('../services/authService').then(m => m.authService.register(email, password, displayName));
              // Log in automatically after register
              if (onLogin) onLogin(email, password);
            } catch (err: any) {
              alert(err.message || 'Registration failed');
            } finally {
              setIsLoading(false);
            }
          }}>
            <div className="space-y-2">
              <label className="text-slate-900 text-sm font-semibold ml-1">Display Name</label>
              <div className="relative flex items-center">
                <span className="absolute left-4 text-slate-400 material-symbols-outlined text-[20px]">badge</span>
                <input
                  type="text"
                  className="w-full rounded-lg border border-slate-200 bg-slate-50/50 h-12 pl-11 pr-4 focus:ring-slate-900 focus:border-slate-900 transition-all"
                  placeholder="John Doe"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-slate-900 text-sm font-semibold ml-1">Work Email</label>
              <div className="relative flex items-center">
                <span className="absolute left-4 text-slate-400 material-symbols-outlined text-[20px]">mail</span>
                <input
                  type="email"
                  className="w-full rounded-lg border border-slate-200 bg-slate-50/50 h-12 pl-11 pr-4 focus:ring-slate-900 focus:border-slate-900 transition-all"
                  placeholder="name@company.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-slate-900 text-sm font-semibold ml-1">Password</label>
              <div className="relative flex items-center">
                <span className="absolute left-4 text-slate-400 material-symbols-outlined text-[20px]">key</span>
                <input
                  type="password"
                  className="w-full rounded-lg border border-slate-200 bg-slate-50/50 h-12 pl-11 pr-4 focus:ring-slate-900 focus:border-slate-900 transition-all"
                  placeholder="Min. 8 characters"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            <button disabled={isLoading} className="w-full h-12 rounded-lg bg-slate-900 hover:bg-black text-white font-bold transition-all shadow-lg active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed">
              {isLoading ? 'Creating Account...' : 'Create Account'}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-slate-100 flex justify-center gap-1 text-sm">
            <p className="text-slate-500">Already have an account?</p>
            <button onClick={() => setState('login')} className="text-slate-900 font-semibold hover:underline">Log In</button>
          </div>
        </div>
      </div>
    );
  }

  if (state === 'forgot-password') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 font-display">
        <div className="w-full max-w-[480px] bg-white/70 backdrop-blur-xl border border-white/60 shadow-2xl rounded-2xl p-8 sm:p-10 animate-fade-in-up">
          <div className="flex flex-col items-center gap-4 text-center mb-8">
            <div className="h-14 w-14 rounded-2xl bg-slate-900 text-white flex items-center justify-center shadow-lg">
              <span className="material-symbols-outlined text-[28px]">lock_reset</span>
            </div>
            <h1 className="text-slate-900 text-2xl font-bold tracking-tight">Forgot Password?</h1>
            <p className="text-slate-500 text-sm">Enter your work email to receive a reset link.</p>
          </div>

          <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); setState('reset-success'); }}>
            <div className="space-y-2">
              <label className="text-slate-900 text-sm font-semibold ml-1">Email Address</label>
              <div className="relative group">
                <input
                  type="email"
                  className="w-full rounded-xl border border-slate-200 h-12 px-4 pr-10 focus:ring-slate-900 transition-all"
                  placeholder="employee@nexus.internal"
                  required
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 material-symbols-outlined">mail</span>
              </div>
            </div>
            <button className="w-full h-12 rounded-full bg-slate-900 text-white font-semibold hover:bg-black transition-all flex items-center justify-center gap-2">
              Send Reset Link
              <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
            </button>
          </form>

          <div className="mt-8 text-center">
            <button onClick={() => setState('login')} className="text-sm font-medium text-slate-500 hover:text-slate-900 inline-flex items-center gap-1">
              <span className="material-symbols-outlined text-[18px]">arrow_back</span>
              Back to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (state === 'reset-success') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 font-display">
        <div className="w-full max-w-[480px] bg-white/70 backdrop-blur-xl border border-white/60 shadow-2xl rounded-2xl p-10 sm:p-14 text-center animate-fade-in-up">
          <div className="flex items-center justify-center size-20 rounded-full bg-slate-900 text-white mx-auto mb-8 shadow-xl">
            <span className="material-symbols-outlined text-[40px]">check</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-3">Check Your Email</h1>
          <p className="text-sm text-slate-500 max-w-[320px] mx-auto mb-10 leading-relaxed">
            We've sent a password reset link to your email. Please check your inbox and follow the instructions.
          </p>
          <button
            onClick={() => setState('login')}
            className="w-full h-12 bg-slate-900 hover:bg-black text-white font-bold rounded-lg shadow-lg active:scale-95 transition-all"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return null;
};

export default AuthScreens;
