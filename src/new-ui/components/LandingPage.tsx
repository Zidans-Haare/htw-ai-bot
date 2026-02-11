
import React from 'react';

interface Props {
  onGetStarted: () => void;
}

const LandingPage: React.FC<Props> = ({ onGetStarted }) => {
  return (
    <div className="font-display bg-slate-50 text-slate-900 h-screen w-full overflow-hidden relative flex items-center justify-center p-4">
      <div className="absolute inset-0 z-0 opacity-20 pointer-events-none">
        <img alt="BG" className="w-full h-full object-cover grayscale brightness-150" src="https://picsum.photos/1920/1080?grayscale&blur=10"/>
      </div>
      
      <div className="relative z-10 flex w-full max-w-[520px] flex-col overflow-hidden rounded-3xl border border-white/60 bg-white/70 shadow-2xl backdrop-blur-2xl ring-1 ring-black/5 animate-fade-in-up">
        <div className="flex flex-col items-center p-10 md:p-14 text-center">
          <div className="relative mb-10">
            <div className="relative flex h-24 w-auto items-center justify-center rounded-[2rem] bg-white p-4 shadow-2xl">
              <img src="/assets/images/HTW.svg" alt="HTW Dresden" className="h-16" />
            </div>
          </div>
          
          <div className="space-y-4 mb-10">
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900">HTW Assistent</h1>
            <p className="text-slate-500 text-lg leading-relaxed max-w-sm mx-auto">
              Intelligence refined. Experience the future of collaborative conversation.
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-3 mb-12 opacity-80">
            <span className="px-3 py-1.5 rounded-full bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-600 border border-slate-200">
              HTW Assistent v2
            </span>
            <span className="px-3 py-1.5 rounded-full bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-600 border border-slate-200">
              Thinking v1.2
            </span>
          </div>

          <button 
            onClick={onGetStarted}
            className="group relative w-full rounded-full bg-slate-900 py-4 text-white shadow-xl hover:bg-black transition-all duration-300 active:scale-95"
          >
            <span className="flex items-center justify-center gap-2 font-bold text-lg">
              Launch Assistant
              <span className="material-symbols-outlined text-[22px] transition-transform group-hover:translate-x-1">arrow_forward</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default LandingPage;
