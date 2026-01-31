import React, { useState, useEffect, useRef } from 'react';
import html2canvas from 'html2canvas'; 
import { Candidate } from './types.ts';
import { MOCK_CANDIDATES } from './constants.ts';
import CandidateCard from './components/CandidateCard.tsx';
import { databaseService } from './services/supabaseService.ts';

const App = () => {
  // الحالة الافتراضية هي LANDING لضمان ظهور الصفحة الأولى فوراً
  const [view, setView] = useState<'LANDING' | 'LOGIN' | 'DASHBOARD' | 'PASSPORT'>('LANDING');
  const [user, setUser] = useState<any>(null);
  const [handleInput, setHandleInput] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isSavingImage, setIsSavingImage] = useState(false);
  const passportRef = useRef<HTMLDivElement>(null);

  // التأكد من وجود مستخدم مسجل مسبقاً
  useEffect(() => {
    const saved = localStorage.getItem('bulk_user');
    if (saved) setUser(JSON.parse(saved));
  }, []);

  // وظيفة الزر الرئيسي في الصفحة الأولى
  const startApp = () => {
    if (user) {
      setView('DASHBOARD');
    } else {
      setView('LOGIN');
    }
  };

  // وظيفة تسجيل الدخول المبسطة جداً لتجنب التعليق
  const handleLogin = async () => {
    if (!handleInput) return;
    setIsLoggingIn(true);
    try {
      const cleanHandle = handleInput.replace('@', '').trim();
      const userData = { 
        handle: cleanHandle, 
        name: cleanHandle.toUpperCase(), 
        trustScore: 10 
      };
      
      setUser(userData);
      localStorage.setItem('bulk_user', JSON.stringify(userData));
      setView('DASHBOARD');
    } catch (e) {
      alert("Error entering");
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-white selection:text-black">
      
      {/* 1. صفحة البداية - LANDING */}
      {view === 'LANDING' && (
        <div className="min-h-screen flex flex-col items-center justify-center text-center p-6">
          <div className="mb-8 animate-bounce">
             <svg width="60" height="60" viewBox="0 0 100 100" fill="white">
                <path d="M50 0 L54 42 L80 20 L58 46 L100 50 L58 54 L80 80 L54 58 L50 100 L46 58 L20 80 L42 54 L0 50 L42 46 L20 20 L46 42 Z" />
             </svg>
          </div>
          <h1 className="text-6xl font-black italic uppercase mb-12 tracking-tighter">Bulk</h1>
          <button 
            onClick={startApp} 
            className="px-16 py-6 bg-white text-black font-black rounded-full uppercase tracking-widest text-xs hover:invert transition-all active:scale-95"
          >
            Enter Protocol
          </button>
        </div>
      )}

      {/* 2. صفحة إدخال الـ Handle */}
      {view === 'LOGIN' && (
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="w-full max-w-sm text-center">
            <h2 className="text-xl font-black mb-8 uppercase tracking-[0.3em]">Identify Node</h2>
            <input 
              autoFocus
              value={handleInput} 
              onChange={e => setHandleInput(e.target.value)} 
              placeholder="@X_handle" 
              className="w-full bg-zinc-900 border border-zinc-800 p-6 rounded-2xl mb-4 outline-none focus:border-white transition-all text-center font-mono" 
            />
            <button 
              onClick={handleLogin} 
              disabled={isLoggingIn}
              className="w-full py-6 bg-white text-black font-black rounded-2xl uppercase tracking-widest text-[10px]"
            >
              {isLoggingIn ? 'Verifying...' : 'Initialize'}
            </button>
          </div>
        </div>
      )}

      {/* 3. الداشبورد */}
      {view === 'DASHBOARD' && (
        <div className="max-w-4xl mx-auto p-6 py-12">
          <div className="flex justify-between items-center mb-16 border-b border-zinc-900 pb-8">
            <div>
              <h2 className="text-2xl font-black uppercase">{user?.name}</h2>
              <p className="text-zinc-500 font-mono text-xs">STATUS: ONLINE</p>
            </div>
            <button onClick={() => setView('PASSPORT')} className="px-8 py-4 bg-white text-black rounded-xl text-[10px] font-black uppercase">Passport</button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {MOCK_CANDIDATES.map(c => (
              <div key={c.id} className="bg-zinc-900 p-6 rounded-3xl border border-zinc-800 opacity-50">
                 <p className="font-black">{c.name}</p>
                 <p className="text-xs text-zinc-500">@{c.handle}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. الجواز وقابلية التحميل */}
      {view === 'PASSPORT' && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center p-4">
          <div ref={passportRef} className="bg-zinc-950 border border-zinc-800 p-10 rounded-[2.5rem] w-full max-w-sm mb-6">
            <div className="flex justify-between mb-12">
              <span className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Bulk Identity</span>
              <div className="w-4 h-4 bg-white rotate-45"></div>
            </div>
            <div className="text-center">
               <div className="w-24 h-24 bg-zinc-900 rounded-full mx-auto mb-6 border border-zinc-800 flex items-center justify-center">
                  <span className="text-4xl">👤</span>
               </div>
               <h2 className="text-3xl font-black uppercase mb-2">{user?.name}</h2>
               <p className="text-zinc-500 font-mono text-sm">@{user?.handle}</p>
            </div>
          </div>
          <div className="flex gap-4 w-full max-w-sm">
            <button 
              onClick={async () => {
                if (!passportRef.current) return;
                setIsSavingImage(true);
                const canvas = await html2canvas(passportRef.current, { backgroundColor: '#000' });
                const link = document.createElement('a');
                link.download = 'passport.png';
                link.href = canvas.toDataURL();
                link.click();
                setIsSavingImage(false);
              }}
              className="flex-1 py-6 bg-white text-black font-black rounded-3xl text-[10px] uppercase"
            >
              {isSavingImage ? 'Generating...' : 'Download'}
            </button>
            <button onClick={() => setView('DASHBOARD')} className="px-8 py-6 bg-zinc-900 text-white font-black rounded-3xl text-[10px] uppercase">Back</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
