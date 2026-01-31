import React, { useState, useEffect, useCallback, useRef } from 'react';
import html2canvas from 'html2canvas'; 
import { Candidate, VoteValue } from './types.ts';
import { MOCK_CANDIDATES, MAX_VOTES_PER_USER } from './constants.ts';
import CandidateCard from './components/CandidateCard.tsx';
import { parseTwitterLinkWithGemini, generateSocialFingerprint } from './services/geminiService.ts';
import { databaseService } from './services/supabaseService.ts';

const STORAGE_KEYS = { USER: 'bulk_v8_user', VOTES: 'bulk_v8_votes_count' };

const StarLogo = ({ size = "24", className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="currentColor" className={className}>
    <path d="M50 0 L54 42 L80 20 L58 46 L100 50 L58 54 L80 80 L54 58 L50 100 L46 58 L20 80 L42 54 L0 50 L42 46 L20 20 L46 42 Z" />
  </svg>
);

const App = () => {
  const [view, setView] = useState<'LOADING' | 'LANDING' | 'LOGIN' | 'DASHBOARD' | 'PASSPORT'>('LOADING');
  const [candidates, setCandidates] = useState<Candidate[]>(MOCK_CANDIDATES);
  const [user, setUser] = useState<any>(null);
  const [handleInput, setHandleInput] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isSavingImage, setIsSavingImage] = useState(false);
  const passportRef = useRef<HTMLDivElement>(null);

  // دالة المزامنة
  const syncData = useCallback(async () => {
    try {
      const dbCands = await databaseService.getCandidates();
      if (dbCands?.length) setCandidates(dbCands);
    } catch (err) { console.error("Sync error:", err); }
  }, []);

  useEffect(() => {
    const savedUser = localStorage.getItem(STORAGE_KEYS.USER);
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
    syncData();
    // تقليل وقت التحميل للتأكد من سرعة الاستجابة
    const timer = setTimeout(() => setView('LANDING'), 800);
    return () => clearTimeout(timer);
  }, [syncData]);

  const handleEnter = () => {
    // إذا كان المستخدم مسجل سابقاً يذهب للداشبورد، وإلا لصفحة الدخول
    if (user) {
      setView('DASHBOARD');
    } else {
      setView('LOGIN');
    }
  };

  const performLogin = async () => {
    if (!handleInput) return;
    setIsLoggingIn(true);
    try {
      const cleanHandle = handleInput.replace('@', '').trim();
      let existing = candidates.find(c => c.handle.toLowerCase() === cleanHandle.toLowerCase());
      
      if (!existing) {
        const aiData = await parseTwitterLinkWithGemini(cleanHandle);
        existing = await databaseService.addCandidate({ 
          handle: cleanHandle, 
          name: aiData.name, 
          trustScore: 10, 
          bio: aiData.bio 
        });
      }
      
      setUser(existing);
      localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(existing));
      setView('DASHBOARD');
    } catch (err) { 
      alert("Login failed. Check connection.");
    } finally { 
      setIsLoggingIn(false); 
    }
  };

  const savePassportAsImage = async () => {
    if (!passportRef.current) return;
    setIsSavingImage(true);
    try {
      const canvas = await html2canvas(passportRef.current, { useCORS: true, scale: 2, backgroundColor: '#000' });
      const link = document.createElement('a');
      link.download = `BULK-PASSPORT.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (error) { alert("Error saving image"); } finally { setIsSavingImage(false); }
  };

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-white selection:text-black">
      {view === 'LOADING' && (
        <div className="fixed inset-0 flex items-center justify-center bg-black z-[100]">
          <StarLogo size="64" className="animate-pulse" />
        </div>
      )}
      
      {view === 'LANDING' && (
        <div className="min-h-screen flex flex-col items-center justify-center text-center p-6">
          <StarLogo size="80" className="mb-12" />
          <h1 className="text-6xl font-black italic uppercase mb-12 tracking-tighter">Bulk<br/>Protocol</h1>
          <button 
            onClick={handleEnter} 
            className="px-14 py-6 bg-white text-black font-black rounded-full uppercase tracking-widest text-[10px] hover:scale-105 active:scale-95 transition-all shadow-[0_0_30px_rgba(255,255,255,0.2)]"
          >
            Initialize Session
          </button>
        </div>
      )}

      {view === 'LOGIN' && (
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="w-full max-w-sm">
            <h2 className="text-2xl font-black mb-8 uppercase tracking-widest">Identify Node</h2>
            <input 
              value={handleInput} 
              onChange={e => setHandleInput(e.target.value)} 
              placeholder="@X_handle" 
              className="w-full bg-zinc-900 border border-zinc-800 p-6 rounded-2xl mb-4 outline-none focus:border-white transition-all font-mono" 
            />
            <button 
              onClick={performLogin} 
              disabled={isLoggingIn || !handleInput}
              className="w-full py-6 bg-white text-black font-black rounded-2xl uppercase tracking-widest text-[10px] disabled:opacity-50"
            >
              {isLoggingIn ? 'Verifying...' : 'Access Protocol'}
            </button>
          </div>
        </div>
      )}

      {view === 'DASHBOARD' && (
        <div className="max-w-6xl mx-auto p-6 py-12 animate-in fade-in duration-700">
          <div className="flex justify-between items-center mb-20">
            <div className="flex items-center gap-4">
               <img src={`https://unavatar.io/twitter/${user?.handle}`} crossOrigin="anonymous" className="w-14 h-14 rounded-full border border-zinc-800 grayscale" />
               <div>
                  <h2 className="text-xl font-black uppercase leading-none">{user?.name}</h2>
                  <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">Node active</span>
               </div>
            </div>
            <button onClick={() => setView('PASSPORT')} className="px-8 py-4 bg-white text-black rounded-2xl text-[10px] font-black uppercase tracking-widest">Passport</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {candidates.map(c => (
              <CandidateCard key={c.id} candidate={c} onVote={() => {}} isVoted={false} />
            ))}
          </div>
        </div>
      )}

      {view === 'PASSPORT' && (
        <div className="fixed inset-0 z-50 bg-black flex items-center justify-center p-4">
          <div className="max-w-md w-full">
            <div ref={passportRef} className="bg-zinc-950 border border-zinc-800 p-10 rounded-[2.5rem] mb-6 relative">
              <div className="flex justify-between mb-16">
                <span className="text-[10px] font-black uppercase text-zinc-600 tracking-widest italic">Identity Map</span>
                <StarLogo size="24" />
              </div>
              <div className="flex items-center gap-6 mb-12">
                <img src={`https://unavatar.io/twitter/${user?.handle}`} crossOrigin="anonymous" className="w-24 h-24 rounded-full grayscale border border-zinc-800" />
                <div>
                  <div className="text-2xl font-black uppercase tracking-tighter">{user?.name}</div>
                  <div className="text-zinc-500 font-mono text-xs">@{user?.handle}</div>
                </div>
              </div>
              <div className="border-t border-zinc-900 pt-8 mt-8">
                <div className="text-[9px] text-zinc-600 uppercase font-black mb-1">Network Level</div>
                <div className="text-xl font-mono font-black">ALPHA_VERIFIED</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <button onClick={savePassportAsImage} className="py-6 bg-white text-black font-black rounded-3xl text-[10px] uppercase tracking-widest">
                {isSavingImage ? 'Saving...' : 'Save PNG'}
              </button>
              <button onClick={() => setView('DASHBOARD')} className="py-6 bg-zinc-900 text-white font-black rounded-3xl text-[10px] uppercase tracking-widest">Back</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
