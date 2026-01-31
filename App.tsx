import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import html2canvas from 'html2canvas'; 
import { Candidate, VoteValue } from './types.ts';
import { MOCK_CANDIDATES, MAX_VOTES_PER_USER } from './constants.ts';
import CandidateCard from './components/CandidateCard.tsx';
import { parseTwitterLinkWithGemini, generateSocialFingerprint } from './services/geminiService.ts';
import { databaseService } from './services/supabaseService.ts';

const STORAGE_KEYS = {
  USER: 'bulk_v8_user',
  VOTES: 'bulk_v8_votes_count'
};

const getDeviceID = () => {
  if (typeof window === 'undefined') return 'node-generic';
  const n = window.navigator;
  return `node-${btoa(n.userAgent).substring(0, 10)}`;
};

const StarLogo = ({ size = "24", className = "", glow = true }: { size?: string, className?: string, glow?: boolean }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="currentColor" className={`${className} ${glow ? 'neon-glow' : ''}`}>
    <path d="M50 0 L54 42 L80 20 L58 46 L100 50 L58 54 L80 80 L54 58 L50 100 L46 58 L20 80 L42 54 L0 50 L42 46 L20 20 L46 42 Z" />
  </svg>
);

const App = () => {
  const [view, setView] = useState<'LOADING' | 'LANDING' | 'LOGIN' | 'DASHBOARD' | 'VOTING' | 'LEADERBOARD'>('LOADING');
  const [user, setUser] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>(MOCK_CANDIDATES);
  const [votedIds, setVotedIds] = useState<string[]>([]);
  const [dailyVotes, setDailyVotes] = useState(0);
  const [isBusy, setIsBusy] = useState(false);
  const [showPassport, setShowPassport] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  
  // المرجع الخاص بالجواز
  const passportRef = useRef<HTMLDivElement>(null);

  const activeNode = useMemo(() => 
    candidates.find(c => c.handle.toLowerCase() === user?.toLowerCase()), 
    [candidates, user]
  );

  const sync = useCallback(async (handle?: string) => {
    const activeHandle = handle || localStorage.getItem(STORAGE_KEYS.USER);
    try {
      const dbCandidates = await databaseService.fetchGlobalCandidates();
      if (dbCandidates && dbCandidates.length > 0) {
        setCandidates(dbCandidates);
      }
      if (activeHandle) {
        const myVotes = await databaseService.getVotedIds(activeHandle);
        setVotedIds(myVotes || []);
      }
    } catch (e) {
      console.warn("Sync failed, using cache");
    } finally {
      if (view === 'LOADING') setView(activeHandle ? 'DASHBOARD' : 'LANDING');
    }
  }, [view]);

  useEffect(() => {
    const savedUser = localStorage.getItem(STORAGE_KEYS.USER);
    if (savedUser) setUser(savedUser);
    const votes = localStorage.getItem(STORAGE_KEYS.VOTES);
    setDailyVotes(votes ? parseInt(votes, 10) : 0);
    sync(savedUser);
  }, [sync]);

  const downloadPassport = async () => {
    if (!passportRef.current) return;
    setIsDownloading(true);
    try {
      // ننتظر تحميل الصور
      await new Promise(r => setTimeout(r, 400));
      const canvas = await html2canvas(passportRef.current, {
        useCORS: true,
        backgroundColor: '#000',
        scale: 2,
        logging: false
      });
      const link = document.createElement('a');
      link.download = `BULK-ID-${user}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error("Capture error", err);
    } finally {
      setIsDownloading(false);
    }
  };

  const performLogin = async (handleInput: string) => {
    if (!handleInput || isBusy) return;
    const handle = handleInput.trim().toLowerCase().startsWith('@') ? handleInput.trim().toLowerCase() : '@' + handleInput.trim().toLowerCase();
    setIsBusy(true);
    const fingerprint = getDeviceID();
    
    const existingNode = candidates.find(c => c.handle.toLowerCase() === handle);
    const newNode: Candidate = existingNode || {
      id: `node-${Date.now()}`,
      name: handle.substring(1),
      handle: handle,
      profileImageUrl: `https://unavatar.io/twitter/${handle.substring(1)}`,
      profileUrl: `https://x.com/${handle.substring(1)}`,
      platform: 'Twitter',
      firstSeen: new Date().toISOString(),
      sharedCount: 0,
      trustScore: 0,
      totalInteractions: 0
    };

    localStorage.setItem(STORAGE_KEYS.USER, handle);
    setUser(handle);
    setView('DASHBOARD');

    try {
      await databaseService.upsertCandidate(newNode, fingerprint);
      await sync(handle);
      if (!existingNode) {
        parseTwitterLinkWithGemini(`https://x.com/${handle.substring(1)}`).then(async info => {
          if (info && info.name) {
            await databaseService.upsertCandidate({ ...newNode, name: info.name }, fingerprint);
            sync(handle);
          }
        }).catch(() => {});
      }
    } catch (e) {
      console.error("Login failed", e);
    } finally {
      setIsBusy(false);
    }
  };

  // ... [دوال التصويت والمشاركة الأصلية تبقى كما هي هنا] ...

  return (
    <div className="min-h-screen bg-black text-white selection:bg-white selection:text-black overflow-x-hidden font-sans">
      
      {/* 1. View: LOADING */}
      {view === 'LOADING' && (
        <div className="fixed inset-0 flex flex-col items-center justify-center bg-black z-[100]">
          <StarLogo size="64" className="animate-spin-slow mb-8" />
          <div className="text-[10px] font-black tracking-[0.6em] text-zinc-600 animate-pulse uppercase">Establishing Protocol</div>
        </div>
      )}

      {/* 2. View: LANDING */}
      {view === 'LANDING' && (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center relative">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,_rgba(255,255,255,0.03)_0%,_transparent_70%)]"></div>
          <StarLogo size="120" className="mb-12 relative z-10" />
          <h1 className="text-8xl font-black italic uppercase mb-16 tracking-tighter relative z-10">Bulk</h1>
          <button 
            onClick={() => setView('LOGIN')} 
            className="px-20 py-8 bg-white text-black font-black rounded-full uppercase tracking-[0.4em] text-xs hover:scale-105 transition-transform relative z-10"
          >
            Initialize
          </button>
        </div>
      )}

      {/* 3. View: LOGIN */}
      {view === 'LOGIN' && (
        <div className="min-h-screen flex items-center justify-center p-6">
           {/* وضعنا نفس كود الـ Login الأصلي الخاص بك */}
           <div className="w-full max-w-md">
              <input 
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && performLogin((e.target as HTMLInputElement).value)}
                placeholder="@X_HANDLE" 
                className="w-full bg-black border-b-2 border-zinc-900 p-8 text-center text-2xl font-mono focus:border-white outline-none transition-all uppercase" 
              />
           </div>
        </div>
      )}

      {/* 4. Passport Modal (The Core Modification) */}
      {showPassport && activeNode && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/95 backdrop-blur-2xl" onClick={() => setShowPassport(false)} />
          <div className="relative w-full max-w-lg">
            
            {/* الحاوية التي يتم تصويرها - passportRef */}
            <div ref={passportRef} className="bg-zinc-950 border border-zinc-800 rounded-[3.5rem] p-12 mb-6 relative overflow-hidden">
               <div className="absolute top-0 right-0 p-8 opacity-5"><StarLogo size="200" /></div>
               <div className="relative z-10">
                  <div className="flex justify-between items-start mb-16">
                    <span className="text-[10px] font-black text-zinc-600 uppercase tracking-widest italic">Identity Document</span>
                    <StarLogo size="32" />
                  </div>
                  <div className="flex flex-col items-center mb-16">
                    <div className="w-32 h-32 rounded-full border border-zinc-800 p-1 mb-6">
                      <img 
                        src={activeNode.profileImageUrl} 
                        className="w-full h-full rounded-full object-cover grayscale" 
                        crossOrigin="anonymous" // حل مشكلة اختفاء الصورة
                      />
                    </div>
                    <h2 className="text-4xl font-black italic uppercase tracking-tighter">{activeNode.name}</h2>
                    <p className="text-zinc-500 font-mono">@{activeNode.handle}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-8 border-t border-zinc-900 pt-10">
                     <div>
                        <p className="text-[9px] text-zinc-600 uppercase font-black mb-2">Trust Score</p>
                        <p className="text-3xl font-mono font-black italic">{activeNode.trustScore.toFixed(2)}</p>
                     </div>
                     <div>
                        <p className="text-[9px] text-zinc-600 uppercase font-black mb-2">Status</p>
                        <p className="text-xl font-black italic uppercase text-white">Verified</p>
                     </div>
                  </div>
               </div>
            </div>

            {/* أزرار الأكشن */}
            <div className="grid grid-cols-2 gap-4">
               <button 
                  onClick={downloadPassport}
                  disabled={isDownloading}
                  className="py-6 bg-white text-black font-black rounded-3xl uppercase tracking-widest text-[10px] hover:invert transition-all"
               >
                  {isDownloading ? 'Capturing...' : 'Download ID'}
               </button>
               <button 
                  onClick={() => setShowPassport(false)}
                  className="py-6 bg-zinc-900 text-white font-black rounded-3xl uppercase tracking-widest text-[10px]"
               >
                  Return
               </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. DASHBOARD & LEADERBOARD - كودك الأصلي بالكامل يوضع هنا */}
      {view === 'DASHBOARD' && (
        <div className="max-w-6xl mx-auto p-8 pt-24">
           {/* Header */}
           <div className="flex justify-between items-end mb-24 border-b border-zinc-900 pb-12">
              <div>
                <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest mb-4 italic">Session Node</p>
                <h2 className="text-6xl font-black italic uppercase tracking-tighter">{user}</h2>
              </div>
              <button onClick={() => setShowPassport(true)} className="px-10 py-5 bg-white text-black font-black rounded-2xl text-[10px] uppercase tracking-widest">Passport</button>
           </div>
           
           {/* Candidates Grid */}
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {candidates.map(c => (
                <CandidateCard key={c.id} candidate={c} onVote={() => {}} isVoted={false} />
              ))}
           </div>
        </div>
      )}

    </div>
  );
};

export default App;
