import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import html2canvas from 'html2canvas'; // مكتبة تحويل HTML إلى صورة
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
  const [view, setView] = useState<'LOADING' | 'LANDING' | 'LOGIN' | 'DASHBOARD' | 'PASSPORT'>('LOADING');
  const [candidates, setCandidates] = useState<Candidate[]>(MOCK_CANDIDATES);
  const [user, setUser] = useState<any>(null);
  const [votesCount, setVotesCount] = useState(0);
  const [handleInput, setHandleInput] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [passportData, setPassportData] = useState<any>(null);
  const [isGeneratingPassport, setIsGeneratingPassport] = useState(false);
  const [isSavingImage, setIsSavingImage] = useState(false);
  const [queue, setQueue] = useState<string[]>([]);
  
  const passportRef = useRef<HTMLDivElement>(null);

  // --- المزامنة ---
  const sync = useCallback(async () => {
    try {
      const dbCandidates = await databaseService.getCandidates();
      if (dbCandidates && dbCandidates.length > 0) {
        setCandidates(dbCandidates);
      }
      
      const savedUser = localStorage.getItem(STORAGE_KEYS.USER);
      if (savedUser) {
        const parsed = JSON.parse(savedUser);
        const votes = await databaseService.getUserVotes(parsed.handle);
        setQueue(votes.map(v => v.candidate_id));
      }
    } catch (err) {
      console.warn("Sync warning:", err);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      const savedUser = localStorage.getItem(STORAGE_KEYS.USER);
      const savedVotes = localStorage.getItem(STORAGE_KEYS.VOTES);
      if (savedUser) setUser(JSON.parse(savedUser));
      if (savedVotes) setVotesCount(parseInt(savedVotes));
      await sync();
      setTimeout(() => setView('LANDING'), 2000);
    };
    init();
  }, [sync]);

  // --- العمليات (Actions) ---
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

      const userData = { ...existing, deviceID: getDeviceID() };
      setUser(userData);
      localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(userData));
      setView('DASHBOARD');
      await sync();
    } catch (err) {
      console.error("Login failed", err);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleVote = async (candidateId: string, value: VoteValue) => {
    if (!user || votesCount >= MAX_VOTES_PER_USER || queue.includes(candidateId)) return;

    try {
      await databaseService.vote(user.handle, candidateId, value);
      const newCount = votesCount + 1;
      setVotesCount(newCount);
      localStorage.setItem(STORAGE_KEYS.VOTES, newCount.toString());
      setQueue(prev => [...prev, candidateId]);
      await sync();
    } catch (err) {
      console.error("Vote failed", err);
    }
  };

  const createPassport = async () => {
    if (!user) return;
    setIsGeneratingPassport(true);
    setView('PASSPORT');
    try {
      const fingerprint = await generateSocialFingerprint(user.name, user.trustScore || 0);
      setPassportData({
        fingerprint,
        timestamp: new Date().toLocaleDateString(),
        id: `NODE-${Math.random().toString(36).toUpperCase().substr(2, 6)}`
      });
    } catch (err) {
      setPassportData({ fingerprint: "Identity verified within the recognition graph. Trust parameters active." });
    } finally {
      setIsGeneratingPassport(false);
    }
  };

  const savePassportAsImage = async () => {
    if (!passportRef.current) return;
    setIsSavingImage(true);
    try {
      // الانتظار قليلاً للتأكد من رندر الصور
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const canvas = await html2canvas(passportRef.current, {
        useCORS: true, 
        allowTaint: false,
        backgroundColor: '#000000',
        scale: 3, // دقة عالية جداً للحفظ
        logging: false
      });

      const image = canvas.toDataURL("image/png", 1.0);
      const link = document.createElement('a');
      link.download = `BULK-PASSPORT-${user?.handle?.toUpperCase()}.png`;
      link.href = image;
      link.click();
    } catch (error) {
      console.error("Save error:", error);
      alert("فشل حفظ الصورة، تأكد من اتصالك بالإنترنت.");
    } finally {
      setIsSavingImage(false);
    }
  };

  const shareToX = () => {
    const text = `Verified my digital identity on BULK Protocol.\n\nIdentity: ${user.name}\nTrust Weight: ${user.trustScore}\nLevel: ALPHA SHARD\n\n#BulkProtocol #Web3 #DigitalPassport`;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, '_blank');
  };

  // --- واجهة المستخدم ---
  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-white selection:text-black">
      
      {/* 1. LOADING VIEW */}
      {view === 'LOADING' && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black">
          <StarLogo size="64" className="animate-pulse" />
          <div className="mt-12 w-48 h-[1px] bg-zinc-800 overflow-hidden">
            <div className="h-full bg-white animate-progress" />
          </div>
          <div className="mt-4 font-mono text-[10px] tracking-[0.5em] text-zinc-500 uppercase">Initializing Protocol</div>
        </div>
      )}

      {/* 2. LANDING VIEW */}
      {view === 'LANDING' && (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
          <StarLogo size="80" className="mb-12" />
          <h1 className="text-5xl sm:text-7xl font-black tracking-tighter mb-6 italic">BULK<br/>PROTOCOL</h1>
          <p className="max-w-md text-zinc-500 text-sm sm:text-base leading-relaxed mb-12 font-medium">
            The next generation of trust networks. Build your social weight through peer recognition.
          </p>
          <button 
            onClick={() => setView(user ? 'DASHBOARD' : 'LOGIN')}
            className="group relative px-12 py-5 bg-white text-black font-black uppercase tracking-[0.3em] text-xs rounded-full overflow-hidden transition-all hover:scale-105 active:scale-95"
          >
            <span className="relative z-10">{user ? 'Enter Dashboard' : 'Initialize Identity'}</span>
          </button>
        </div>
      )}

      {/* 3. LOGIN VIEW */}
      {view === 'LOGIN' && (
        <div className="min-h-screen flex flex-col items-center justify-center p-6">
          <div className="w-full max-w-sm">
            <button onClick={() => setView('LANDING')} className="mb-12 text-zinc-600 hover:text-white transition-colors">
              <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </button>
            <h2 className="text-3xl font-black tracking-tighter mb-2">IDENTITY SETUP</h2>
            <p className="text-zinc-500 text-sm mb-8">Enter your X handle to bridge your profile.</p>
            <input 
              type="text"
              value={handleInput}
              onChange={(e) => setHandleInput(e.target.value)}
              placeholder="@username"
              className="w-full bg-zinc-900/50 border border-zinc-800 rounded-2xl px-6 py-5 mb-4 focus:outline-none focus:border-white transition-all font-mono"
            />
            <button 
              onClick={performLogin}
              disabled={isLoggingIn || !handleInput}
              className="w-full py-5 bg-white text-black font-black uppercase tracking-[0.2em] text-xs rounded-2xl disabled:opacity-50"
            >
              {isLoggingIn ? 'Syncing...' : 'Verify Identity'}
            </button>
          </div>
        </div>
      )}

      {/* 4. DASHBOARD VIEW */}
      {view === 'DASHBOARD' && (
        <div className="max-w-6xl mx-auto px-6 py-12">
          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-8 mb-20">
            <div className="flex items-center gap-6">
              <div className="relative">
                <img 
                  src={`https://unavatar.io/twitter/${user?.handle}`} 
                  crossOrigin="anonymous" 
                  className="w-16 h-16 rounded-full border-2 border-zinc-800 grayscale" 
                  alt="" 
                />
                <div className="absolute -bottom-1 -right-1 bg-white text-black text-[8px] font-black px-1.5 py-0.5 rounded">
                  {user?.trustScore}
                </div>
              </div>
              <div>
                <h2 className="text-xl font-black tracking-tight uppercase">{user?.name}</h2>
                <div className="flex gap-4 mt-1">
                  <span className="text-[10px] text-zinc-500 font-mono">NODE: {getDeviceID()}</span>
                  <span className="text-[10px] text-zinc-500 font-mono">VOTES: {MAX_VOTES_PER_USER - votesCount}/{MAX_VOTES_PER_USER}</span>
                </div>
              </div>
            </div>
            <button 
              onClick={createPassport}
              className="px-8 py-4 bg-zinc-900 border border-zinc-800 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-white hover:text-black transition-all"
            >
              Generate Passport
            </button>
          </div>

          {/* Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {candidates
              .filter(c => c.handle !== user?.handle)
              .map(candidate => (
                <CandidateCard 
                  key={candidate.id} 
                  candidate={candidate} 
                  onVote={handleVote}
                  isVoted={queue.includes(candidate.id)}
                  disabled={votesCount >= MAX_VOTES_PER_USER}
                />
              ))}
          </div>
        </div>
      )}

      {/* 5. PASSPORT MODAL */}
      {view === 'PASSPORT' && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-xl p-4 overflow-y-auto">
          <div className="max-w-xl w-full py-10">
            
            {/* بطاقة الجواز - الجزء المخصص للتحميل كصورة */}
            <div 
              ref={passportRef}
              className="relative overflow-hidden bg-black border border-zinc-800 rounded-[2.5rem] p-10 mb-8 shadow-[0_0_50px_rgba(255,255,255,0.05)]"
            >
              {/* زخارف تقنية خلفية */}
              <div className="absolute top-0 right-0 p-8 opacity-10">
                <StarLogo size="120" glow={false} />
              </div>

              <div className="relative z-10">
                <div className="flex justify-between items-start mb-16">
                  <div>
                    <h2 className="text-[10px] tracking-[0.6em] text-zinc-500 uppercase mb-3 font-black">Digital Passport</h2>
                    <div className="text-3xl font-black tracking-tighter italic border-l-4 border-white pl-4">BULK PROTOCOL</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] font-mono text-zinc-600 mb-1">{passportData?.id}</div>
                    <div className="text-[10px] font-mono text-zinc-600">{passportData?.timestamp}</div>
                  </div>
                </div>

                <div className="flex gap-10 mb-16 items-center">
                  <div className="relative">
                    <div className="absolute -inset-4 bg-white/5 rounded-full blur-2xl"></div>
                    <img 
                      src={`https://unavatar.io/twitter/${user?.handle}`}
                      crossOrigin="anonymous" 
                      alt="Identity"
                      className="relative w-32 h-32 rounded-full border border-zinc-800 object-cover grayscale"
                    />
                  </div>
                  <div>
                    <div className="text-3xl font-black uppercase mb-2 tracking-tighter">{user?.name}</div>
                    <div className="font-mono text-zinc-500 text-sm tracking-widest italic">@{user?.handle}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-10 mb-16 border-y border-zinc-900/50 py-10">
                  <div>
                    <div className="text-[9px] uppercase tracking-[0.4em] text-zinc-600 mb-3 font-bold">Trust Weight</div>
                    <div className="text-3xl font-mono font-black tracking-widest text-white">{user?.trustScore || 0}</div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase tracking-[0.4em] text-zinc-600 mb-3 font-bold">Network Status</div>
                    <div className="text-3xl font-mono font-black tracking-widest text-white">ALPHA</div>
                  </div>
                </div>

                <div>
                  <div className="text-[9px] uppercase tracking-[0.4em] text-zinc-600 mb-5 font-black">Social Fingerprint Analysis</div>
                  <p className="text-sm font-mono leading-relaxed text-zinc-400 italic bg-zinc-900/30 p-6 rounded-2xl border border-zinc-800/50">
                    {isGeneratingPassport ? "Deciphering node relations..." : `"${passportData?.fingerprint}"`}
                  </p>
                </div>
              </div>
            </div>

            {/* أزرار التحكم - خارج نطاق الصورة */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 px-2">
              <button 
                onClick={savePassportAsImage}
                disabled={isSavingImage || isGeneratingPassport}
                className="py-6 bg-white text-black font-black uppercase tracking-[0.3em] text-[11px] rounded-3xl hover:scale-[1.02] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSavingImage ? (
                  <>
                    <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                    Processing...
                  </>
                ) : 'Save as Image'}
              </button>
              
              <button 
                onClick={shareToX}
                className="py-6 bg-[#1DA1F2] text-white font-black uppercase tracking-[0.3em] text-[11px] rounded-3xl hover:scale-[1.02] transition-all flex items-center justify-center gap-2"
              >
                Share to X
              </button>

              <button 
                onClick={() => setView('DASHBOARD')}
                className="sm:col-span-2 py-4 text-zinc-500 hover:text-white text-[10px] font-black uppercase tracking-widest transition-colors"
              >
                ← Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default App;
