import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import html2canvas from 'html2canvas'; // تأكد من تثبيتها: npm install html2canvas
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

const App: React.FC = () => {
  const [view, setView] = useState<'LOADING' | 'LANDING' | 'LOGIN' | 'DASHBOARD' | 'VOTING' | 'LEADERBOARD'>('LOADING');
  const [user, setUser] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>(MOCK_CANDIDATES);
  const [votedIds, setVotedIds] = useState<string[]>([]);
  const [dailyVotes, setDailyVotes] = useState(0);
  const [isBusy, setIsBusy] = useState(false);
  const [showPassport, setShowPassport] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  
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
      console.warn("Sync failed");
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

  const queue = useMemo(() => 
    candidates.filter(c => c.handle.toLowerCase() !== user?.toLowerCase() && !votedIds.includes(c.id))
    .sort(() => Math.random() - 0.5),
    [candidates, user, votedIds]
  );

  // دالة تحميل الجواز كصورة مع حل مشكلة الأفاتار
  const handleDownloadPassport = async () => {
    if (!passportRef.current) return;
    setIsDownloading(true);
    try {
      const canvas = await html2canvas(passportRef.current, {
        useCORS: true, // للسماح بتحميل الصور من روابط خارجية (Twitter/Unavatar)
        backgroundColor: '#000',
        scale: 2, // جودة الصورة
        logging: false,
      });
      const link = document.createElement('a');
      link.download = `bulk-passport-${user}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error("Download failed", err);
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
      console.error("Login sync failed", e);
    } finally {
      setIsBusy(false);
    }
  };

  // ... (هنا تضع بقية الدوال: handleVote, shareToX) ...

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-white selection:text-black overflow-x-hidden">
      {/* Views Logic */}
      {view === 'LOADING' && (
        <div className="fixed inset-0 flex flex-col items-center justify-center bg-black z-[100]">
          <StarLogo size="60" className="animate-spin-slow mb-6 text-white" />
          <div className="text-[10px] font-black tracking-[0.6em] text-zinc-500 animate-pulse">ESTABLISHING_CONNECTION</div>
        </div>
      )}

      {/* Passport Modal */}
      {showPassport && activeNode && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
          <div className="absolute inset-0 bg-black/95 backdrop-blur-xl" onClick={() => setShowPassport(false)} />
          <div className="relative w-full max-w-lg animate-in fade-in zoom-in duration-300">
            {/* الجزء الذي سيتم تصويره */}
            <div ref={passportRef} className="bg-zinc-950 border border-zinc-800 rounded-[3rem] p-8 sm:p-12 mb-6 relative overflow-hidden shadow-2xl">
              <div className="flex justify-between items-start mb-12 relative z-10">
                <div className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-500 italic">Network Passport</div>
                <StarLogo size="32" className="text-white" />
              </div>
              
              <div className="flex flex-col items-center text-center relative z-10 mb-10">
                <div className="w-32 h-32 rounded-full border border-zinc-800 p-2 mb-6 bg-black">
                  <img 
                    src={activeNode.profileImageUrl} 
                    className="w-full h-full rounded-full object-cover grayscale" 
                    crossOrigin="anonymous" // مهم جداً لظهور الصورة عند التحميل
                  />
                </div>
                <h2 className="text-4xl font-black uppercase italic tracking-tighter mb-2">{activeNode.name}</h2>
                <div className="font-mono text-zinc-500 text-sm">@{activeNode.handle.replace('@','')}</div>
              </div>

              <div className="grid grid-cols-2 gap-6 border-t border-zinc-900 pt-10 relative z-10">
                <div>
                  <div className="text-[9px] font-black uppercase tracking-widest text-zinc-600 mb-2">Trust Score</div>
                  <div className="text-3xl font-mono font-black">{activeNode.trustScore.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-[9px] font-black uppercase tracking-widest text-zinc-600 mb-2">Node Status</div>
                  <div className="text-xl font-black italic uppercase text-white tracking-tighter">Active_Verified</div>
                </div>
              </div>
            </div>

            {/* أزرار الأكشن */}
            <div className="grid grid-cols-2 gap-4 px-2">
              <button 
                onClick={handleDownloadPassport}
                disabled={isDownloading}
                className="py-6 bg-white text-black font-black uppercase tracking-[0.2em] text-[11px] rounded-3xl hover:invert transition-all flex items-center justify-center gap-2"
              >
                {isDownloading ? 'Processing...' : 'Download JPG'}
              </button>
              <button 
                onClick={() => setShowPassport(false)}
                className="py-6 bg-zinc-900 text-white font-black uppercase tracking-[0.2em] text-[11px] rounded-3xl"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* بقية الواجهات (LANDING, LOGIN, DASHBOARD) كما في كودك الأصلي */}
      {/* ... */}
    </div>
  );
};

export default App;
