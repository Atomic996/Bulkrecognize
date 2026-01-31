
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

const App: React.FC = () => {
  const [view, setView] = useState<'LOADING' | 'LANDING' | 'LOGIN' | 'DASHBOARD' | 'VOTING' | 'LEADERBOARD'>('LOADING');
  const [user, setUser] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>(MOCK_CANDIDATES);
  const [votedIds, setVotedIds] = useState<string[]>([]);
  const [dailyVotes, setDailyVotes] = useState(0);
  const [isBusy, setIsBusy] = useState(false);
  
  const [showPassport, setShowPassport] = useState(false);
  const [passportData, setPassportData] = useState({ analysis: '' });
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
      console.warn("Sync failed, staying on local data.");
    } finally {
      if (view === 'LOADING') {
        setView(activeHandle ? 'DASHBOARD' : 'LANDING');
      }
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
      console.error("Background sync failed:", e);
    } finally {
      setIsBusy(false);
    }
  };

  const handleVote = async (val: VoteValue) => {
    const target = queue[0];
    if (!target || !user || dailyVotes >= MAX_VOTES_PER_USER) return;

    setVotedIds(prev => [...prev, target.id]);
    const nextVotes = dailyVotes + 1;
    setDailyVotes(nextVotes);
    localStorage.setItem(STORAGE_KEYS.VOTES, nextVotes.toString());

    try {
      if (val === VoteValue.KNOW) databaseService.incrementTrust(target.id);
      databaseService.recordVote(user, target.id);
    } catch (e) {
      console.error("Background vote fail");
    }

    if (nextVotes >= MAX_VOTES_PER_USER || queue.length <= 1) {
      setView('DASHBOARD');
      sync(user);
    }
  };

  const createPassport = async () => {
    if (!user || !activeNode) return;
    setIsBusy(true);
    const currentScore = activeNode.trustScore || 0;
    try {
      const analysis = await generateSocialFingerprint(user, currentScore);
      setPassportData({ analysis: analysis || "Identity mapped in the bulk recognition graph." });
      setShowPassport(true);
    } catch (e) {
      setPassportData({ analysis: "Identity verified within the recognition shard." });
      setShowPassport(true);
    } finally {
      setIsBusy(false);
    }
  };

  const shareToX = () => {
    if (!activeNode) return;
    const score = activeNode.trustScore || 0;
    const text = `Verified Node established on @bulktrade \n\nIdentity: ${activeNode.name}\nTrust Weight: ${score} points\nShard Level: ALPHA\n\nMap the graph: https://bulkrecognize-kappa.vercel.app/\n\n#BulkProtocol #Web3 #SocialID`;
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  if (view === 'LOADING') {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-[#050505]">
        <StarLogo size="60" className="text-[#00f2ff] animate-pulse" />
        <div className="mt-8 text-[10px] font-black uppercase tracking-[0.8em] text-[#00f2ff]/60 animate-pulse">Syncing_Graph</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white selection:bg-[#00f2ff] selection:text-black page-fade">
      {view !== 'LANDING' && view !== 'LOGIN' && (
        <nav className="fixed top-0 w-full z-50 px-6 sm:px-8 py-6 sm:py-10 flex justify-between items-center glass border-none">
          <div className="flex items-center gap-3 cursor-pointer group" onClick={() => setView('DASHBOARD')}>
            <StarLogo size="24" className="text-[#00f2ff] group-hover:rotate-90 transition-all duration-1000" />
            <span className="font-black italic text-xl sm:text-2xl uppercase tracking-tighter">Bulk.</span>
          </div>
          <div className="flex gap-6 sm:gap-10 items-center">
            <button onClick={() => setView('LEADERBOARD')} className={`text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] transition-colors ${view === 'LEADERBOARD' ? 'text-[#00f2ff]' : 'text-white/40 hover:text-white'}`}>Graph_Rank</button>
            <div className="h-2 w-2 rounded-full bg-[#00f2ff] shadow-[0_0_15px_#00f2ff]"></div>
          </div>
        </nav>
      )}

      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-24 sm:pt-36 pb-12 sm:pb-24">
        {view === 'LANDING' && (
          <div className="h-[75vh] flex flex-col items-center justify-center text-center space-y-10 px-4">
            <div className="relative">
              <div className="absolute inset-0 bg-[#00f2ff] blur-[100px] opacity-10 animate-pulse"></div>
              <StarLogo size="120" className="text-[#00f2ff] mb-4 animate-status relative z-10" />
            </div>
            <h1 className="text-6xl md:text-[11rem] font-black italic tracking-tighter leading-none uppercase">Bulk<br/><span className="text-[#00f2ff] drop-shadow-[0_0_30px_rgba(0,242,255,0.4)]">Graph.</span></h1>
            <p className="max-w-xs sm:max-w-md text-white/30 text-[10px] font-black uppercase tracking-[0.5em] leading-relaxed">Map the decentralized trust nodes of high-performance communities.</p>
            <button onClick={() => setView('LOGIN')} className="w-full sm:w-auto px-16 py-6 bg-white text-black font-black uppercase tracking-[0.4em] text-[11px] hover:bg-[#00f2ff] transition-all hover:scale-105 active:scale-95 shadow-[0_20px_40px_-10px_rgba(255,255,255,0.2)] rounded-2xl">Establish Node</button>
          </div>
        )}

        {view === 'LOGIN' && (
          <div className="max-w-md mx-auto mt-6 sm:mt-10 p-8 sm:p-14 glass rounded-[3.5rem] sm:rounded-[5rem] shadow-2xl space-y-10 sm:space-y-14 border border-white/5 relative">
            <div className="text-center space-y-4">
              <h3 className="text-4xl sm:text-5xl font-black italic uppercase tracking-tighter">Node Auth</h3>
              <p className="text-[9px] text-white/30 uppercase tracking-[0.5em]">Identity verification required</p>
            </div>
            <div className="space-y-6">
              <input 
                type="text" 
                placeholder="@twitter_handle" 
                autoFocus
                className="w-full bg-white/5 border border-white/10 rounded-2xl sm:rounded-3xl p-6 sm:p-8 text-xl sm:text-2xl font-black focus:border-[#00f2ff] outline-none transition-all placeholder:text-white/5 uppercase"
                onKeyDown={(e) => e.key === 'Enter' && performLogin((e.target as HTMLInputElement).value)}
                id="login-field"
              />
              <button 
                onClick={() => performLogin((document.getElementById('login-field') as HTMLInputElement).value)} 
                disabled={isBusy}
                className="w-full py-6 sm:py-8 bg-[#00f2ff] text-black font-black uppercase tracking-[0.4em] text-[12px] sm:text-[13px] rounded-2xl sm:rounded-3xl hover:bg-white transition-all active:scale-95 shadow-[0_25px_50px_-12px_rgba(0,242,255,0.4)]"
              >
                {isBusy ? 'Establishing...' : 'Connect Identity'}
              </button>
              <button onClick={() => setView('LANDING')} className="w-full text-[9px] font-black uppercase text-white/20 tracking-[0.3em] pt-2">Abort Access</button>
            </div>
          </div>
        )}

        {view === 'DASHBOARD' && (
          <div className="flex flex-col lg:grid lg:grid-cols-12 gap-8 sm:gap-10">
            {/* Main Profile Node Section */}
            <div className="lg:col-span-8 glass rounded-[3rem] sm:rounded-[4.5rem] p-8 sm:p-12 relative overflow-hidden group min-h-[500px] sm:min-h-[600px] flex flex-col border border-white/5 shadow-2xl">
              <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-[#00f2ff]/5 blur-[100px] -mr-24 -mt-24"></div>
              
              {/* Header Info */}
              <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-12 sm:mb-16">
                 <div className="flex flex-col sm:flex-row items-center sm:items-center gap-6 sm:gap-8 text-center sm:text-left">
                    <div className="relative">
                      <div className="absolute inset-0 bg-[#00f2ff] blur-2xl opacity-10"></div>
                      <img src={`https://unavatar.io/twitter/${user?.substring(1)}`} className="w-24 h-24 sm:w-32 sm:h-32 rounded-[2.5rem] sm:rounded-[3rem] border-2 border-white/10 bg-black object-cover relative z-10 shadow-2xl mx-auto" alt="" />
                      <div className="absolute -bottom-1 -right-1 bg-[#00f2ff] w-6 h-6 sm:w-8 sm:h-8 rounded-full border-4 border-[#0a0a0a] flex items-center justify-center shadow-lg">
                         <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-black animate-pulse"></div>
                      </div>
                    </div>
                    <div>
                      <h2 className="text-4xl sm:text-6xl font-black italic uppercase tracking-tighter leading-none mb-3 truncate max-w-[280px] sm:max-w-none">{activeNode?.name || user?.substring(1)}</h2>
                      <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 sm:gap-3">
                         <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.3em] text-white/30">{user}</span>
                         <span className="hidden sm:inline w-1 h-1 rounded-full bg-white/10"></span>
                         <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.1em] text-[#00f2ff]">Alpha_Shard_Verified</span>
                      </div>
                    </div>
                 </div>
                 
                 <div className="flex flex-col items-center sm:items-end gap-1">
                    <span className="text-[8px] font-black uppercase text-white/20 tracking-[0.3em]">Node_Status</span>
                    <div className="px-5 py-1.5 bg-green-500/10 border border-green-500/20 rounded-full">
                       <span className="text-[9px] font-black text-green-400 uppercase tracking-widest">Synchronized</span>
                    </div>
                 </div>
              </div>

              {/* AI Insight Box */}
              <div className="flex-grow flex flex-col justify-center max-w-2xl relative z-10 mx-auto sm:mx-0 text-center sm:text-left">
                <div className="space-y-3 mb-4 flex items-center justify-center sm:justify-start gap-3">
                   <div className="w-1 h-8 bg-[#00f2ff]"></div>
                   <span className="text-[10px] font-black uppercase tracking-[0.4em] text-white/20">Social_Diagnostic</span>
                </div>
                <div className="p-8 sm:p-12 bg-white/[0.02] border border-white/5 rounded-[2.5rem] sm:rounded-[3.5rem] backdrop-blur-3xl relative overflow-hidden group/box hover:bg-white/[0.04] transition-all">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#00f2ff]/20 to-transparent"></div>
                  <p className="text-xl sm:text-2xl md:text-3xl font-medium italic text-white/60 leading-snug sm:leading-[1.4] relative z-10">
                    {passportData.analysis || "The decentralized graph is monitoring your social weight. Trust nodes acceleration detected."}
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 mt-12 sm:mt-16 relative z-10">
                <button onClick={() => setView('VOTING')} className="w-full sm:w-auto group relative overflow-hidden px-10 py-5 sm:py-7 bg-[#00f2ff] text-black font-black uppercase tracking-[0.4em] text-[11px] sm:text-[12px] rounded-[1.5rem] sm:rounded-[2rem] hover:scale-105 active:scale-95 transition-all shadow-lg">
                  <span className="relative z-10">recognize</span>
                </button>
                <button onClick={createPassport} disabled={isBusy} className="w-full sm:w-auto px-10 py-5 sm:py-7 bg-white/5 text-white font-black uppercase tracking-[0.4em] text-[11px] sm:text-[12px] rounded-[1.5rem] sm:rounded-[2rem] border border-white/10 hover:bg-white/10 transition-all active:scale-95 backdrop-blur-xl">
                  {isBusy ? 'Mapping...' : 'Social Passport'}
                </button>
              </div>
            </div>

            {/* Sidebar Stats Section */}
            <div className="lg:col-span-4 flex flex-col sm:grid sm:grid-cols-2 lg:flex lg:flex-col gap-6 sm:gap-8 lg:gap-10">
              {/* Trust Score Card */}
              <div className="bg-[#00f2ff] text-black rounded-[2.5rem] sm:rounded-[4rem] p-8 sm:p-10 flex flex-col justify-between min-h-[240px] sm:min-h-[300px] shadow-xl relative overflow-hidden group">
                <div className="absolute -right-20 -bottom-20 opacity-5 group-hover:scale-110 transition-transform duration-1000">
                   <StarLogo size="250" glow={false} />
                </div>
                <div className="relative z-10 flex flex-col justify-between h-full">
                   <div>
                      <span className="text-[10px] font-black uppercase tracking-[0.3em] opacity-40 block mb-2">Identity_Weight</span>
                      <div className="w-8 h-1 bg-black/20"></div>
                   </div>
                   <h4 className="text-[8rem] sm:text-[10rem] lg:text-[12rem] font-black italic tracking-tighter leading-none">{activeNode?.trustScore || 0}</h4>
                   <div className="flex items-center gap-2">
                      <span className="text-[8px] font-black uppercase tracking-widest opacity-60">Ranking</span>
                      <span className="px-2 py-0.5 bg-black/10 rounded-md text-[9px] font-bold italic">Top 3%</span>
                   </div>
                </div>
              </div>

              {/* Daily Capacity Card */}
              <div className="glass rounded-[2.5rem] sm:rounded-[4rem] p-8 sm:p-10 border border-white/5 shadow-lg space-y-8 sm:space-y-10">
                <div className="flex justify-between items-start">
                   <div className="space-y-1">
                      <span className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30">Shard_Sync</span>
                      <h5 className="text-xl sm:text-2xl font-black italic uppercase tracking-tighter">Capacity</h5>
                   </div>
                   <div className="text-right">
                      <span className="text-3xl sm:text-4xl font-black tracking-tighter">{dailyVotes}</span>
                      <span className="text-white/20 text-lg font-bold ml-1">/10</span>
                   </div>
                </div>

                <div className="space-y-3">
                  <div className="w-full bg-white/5 h-3 sm:h-4 rounded-full overflow-hidden p-1 border border-white/5">
                    <div className="bg-[#00f2ff] h-full rounded-full transition-all duration-1000" style={{ width: `${(dailyVotes/10)*100}%` }}></div>
                  </div>
                  <div className="flex justify-between items-center text-[7px] font-black uppercase tracking-[0.1em] text-white/20 px-1">
                     <span>Min</span>
                     <span>Operational_Peak</span>
                  </div>
                </div>

                <div className="pt-2 grid grid-cols-2 gap-3 sm:gap-4">
                   <div className="p-3 sm:p-4 bg-white/[0.03] border border-white/5 rounded-2xl text-center">
                      <span className="block text-[7px] font-black uppercase text-white/20 tracking-widest mb-1">Latency</span>
                      <span className="text-[10px] font-bold italic text-white/60">24ms</span>
                   </div>
                   <div className="p-3 sm:p-4 bg-white/[0.03] border border-white/5 rounded-2xl text-center">
                      <span className="block text-[7px] font-black uppercase text-white/20 tracking-widest mb-1">Peer_ID</span>
                      <span className="text-[10px] font-bold italic text-white/60">#8.5A</span>
                   </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {view === 'VOTING' && (
          <div className="max-w-2xl mx-auto pt-4 sm:pt-10">
            {queue.length > 0 ? (
              <CandidateCard candidate={queue[0]} onVote={handleVote} disabled={dailyVotes >= MAX_VOTES_PER_USER} />
            ) : (
              <div className="text-center py-24 sm:py-48 glass rounded-[4rem] sm:rounded-[7rem] border border-white/5 shadow-2xl relative overflow-hidden">
                <div className="absolute inset-0 bg-[#00f2ff]/5 blur-[80px]"></div>
                <StarLogo size="80" className="text-white/10 mx-auto mb-8 sm:mb-12 relative z-10" glow={false} />
                <h3 className="text-5xl sm:text-7xl font-black italic mb-8 sm:mb-10 uppercase tracking-tighter relative z-10 leading-none px-4">Shard<br/>Depleted</h3>
                <button onClick={() => setView('DASHBOARD')} className="px-12 py-5 sm:px-16 sm:py-8 bg-white text-black font-black uppercase text-[11px] sm:text-[12px] rounded-2xl sm:rounded-3xl tracking-[0.4em] hover:bg-[#00f2ff] transition-all relative z-10">Back to Dashboard</button>
              </div>
            )}
          </div>
        )}

        {view === 'LEADERBOARD' && (
          <div className="max-w-4xl mx-auto flex flex-col items-stretch space-y-12 sm:space-y-16">
            <header className="flex flex-col md:flex-row md:items-end justify-between gap-8 sm:gap-10 border-b border-white/5 pb-10 sm:pb-12 px-2">
               <div className="space-y-4 text-center sm:text-left">
                  <div className="flex items-center justify-center sm:justify-start gap-3">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#00f2ff] shadow-[0_0_10px_#00f2ff]"></span>
                    <span className="text-[9px] font-black uppercase tracking-[0.4em] text-[#00f2ff]">Network_Live</span>
                  </div>
                  <h2 className="text-5xl sm:text-7xl md:text-8xl font-black italic uppercase tracking-tighter leading-none">Protocol<br/>Registry</h2>
               </div>
               
               <div className="grid grid-cols-3 gap-4 sm:gap-10 bg-white/[0.02] border border-white/5 p-5 sm:p-8 rounded-[1.5rem] sm:rounded-[2.5rem] backdrop-blur-xl">
                  <div className="text-center sm:text-left">
                    <span className="text-[7px] sm:text-[9px] font-black uppercase text-white/30 tracking-widest block mb-1">Global_Sync</span>
                    <div className="text-xl sm:text-3xl font-black italic text-[#00f2ff]">98.4<span className="text-[10px] ml-0.5">%</span></div>
                  </div>
                  <div className="text-center sm:text-left border-x border-white/5 px-4 sm:px-8">
                    <span className="text-[7px] sm:text-[9px] font-black uppercase text-white/30 tracking-widest block mb-1">Nodes</span>
                    <div className="text-xl sm:text-3xl font-black italic">{candidates.length}</div>
                  </div>
                  <div className="text-center sm:text-left">
                    <span className="text-[7px] sm:text-[9px] font-black uppercase text-white/30 tracking-widest block mb-1">State</span>
                    <div className="text-[10px] sm:text-xl font-black italic text-green-400">STABLE</div>
                  </div>
               </div>
            </header>

            <div className="space-y-3 px-2">
              {[...candidates].sort((a,b) => b.trustScore - a.trustScore).map((c, i) => (
                <div key={c.id} className="group relative">
                  <div className="glass flex flex-col sm:flex-row items-center justify-between p-5 sm:p-6 sm:px-10 rounded-[1.5rem] sm:rounded-[2rem] border border-white/5 hover:border-[#00f2ff]/30 transition-all hover:bg-white/[0.03] relative overflow-hidden">
                    
                    <div className="flex items-center gap-6 sm:gap-8 w-full sm:w-auto mb-4 sm:mb-0">
                      <div className={`text-2xl sm:text-4xl font-black italic tracking-tighter w-8 sm:w-14 ${i < 3 ? 'text-[#00f2ff]' : 'text-white/10'}`}>
                        {String(i+1).padStart(2, '0')}
                      </div>
                      
                      <div className="flex items-center gap-4 sm:gap-6 border-l border-white/5 pl-4 sm:pl-8">
                        <div className="relative flex-shrink-0">
                          <img src={`https://unavatar.io/twitter/${c.handle.replace('@','')}`} className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl border border-white/10 bg-black object-cover" alt="" />
                          {i < 3 && <div className="absolute -top-1 -right-1 w-3 h-3 bg-[#00f2ff] border-2 border-[#050505] rounded-full"></div>}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <h5 className="text-lg sm:text-2xl font-black italic uppercase tracking-tighter group-hover:text-[#00f2ff] transition-colors truncate">{c.name}</h5>
                          <span className="text-[8px] sm:text-[10px] font-mono text-white/30 uppercase tracking-tighter truncate">{c.handle}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-6 sm:gap-10 w-full sm:w-auto pt-4 sm:pt-0 border-t sm:border-t-0 border-white/5">
                       <div className="flex flex-col items-start sm:items-end">
                          <span className="text-[7px] sm:text-[8px] font-black uppercase text-white/20 tracking-[0.3em] mb-1">Rank_Type</span>
                          <span className={`text-[8px] sm:text-[10px] font-black uppercase px-2 py-0.5 rounded-md border ${i < 3 ? 'bg-[#00f2ff]/10 border-[#00f2ff]/30 text-[#00f2ff]' : 'border-white/10 text-white/30'}`}>
                             {i === 0 ? 'Alpha' : i < 3 ? 'Elite' : 'Registry'}
                          </span>
                       </div>
                       
                       <div className="flex items-end gap-1 sm:gap-2">
                          <div className="text-3xl sm:text-5xl font-black italic tracking-tighter leading-none">{c.trustScore}</div>
                          <div className="flex flex-col items-start mb-0.5 sm:mb-1">
                             <span className="text-[7px] sm:text-[9px] font-black uppercase text-[#00f2ff] tracking-[0.1em] leading-none">WEIGHT</span>
                          </div>
                       </div>
                    </div>

                  </div>
                </div>
              ))}
            </div>
            
            <footer className="pt-12 sm:pt-20 pb-10 flex flex-col items-center gap-4 opacity-20 px-4">
               <StarLogo size="24" glow={false} />
               <div className="text-[8px] font-black uppercase tracking-[1em] text-center">Bulk_v1.5_Registry</div>
            </footer>
          </div>
        )}
      </main>

      {showPassport && (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-[40px] flex items-center justify-center p-4 sm:p-8 page-fade overflow-y-auto">
          <div className="max-w-3xl w-full my-auto space-y-10">
            {/* Standard Advanced Passport Design */}
            <div 
              ref={passportRef} 
              className="relative aspect-[0.7/1] sm:aspect-[1.6/1] w-full bg-[#050505] rounded-[3rem] sm:rounded-[4.5rem] p-8 sm:p-14 flex flex-col justify-between overflow-hidden shadow-[0_40px_100px_rgba(0,0,0,0.8)] border border-white/10"
            >
              {/* Complex Background Elements */}
              <div className="absolute inset-0 pointer-events-none">
                 {/* Iridescent Glows */}
                 <div className="absolute -top-24 -left-24 w-[400px] h-[400px] bg-gradient-to-br from-[#00f2ff]/20 via-blue-500/5 to-transparent blur-[120px]"></div>
                 <div className="absolute -bottom-24 -right-24 w-[400px] h-[400px] bg-gradient-to-tl from-purple-500/10 via-[#00f2ff]/5 to-transparent blur-[120px]"></div>
                 
                 {/* Dot Matrix Mesh */}
                 <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle, #00f2ff 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>
                 
                 {/* Protocol Watermark Seal */}
                 <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-[0.02] rotate-12">
                    <StarLogo size="600" glow={false} />
                 </div>
              </div>

              {/* Passport Header */}
              <div className="relative z-10 flex justify-between items-start gap-4">
                 <div className="flex items-center gap-4 sm:gap-7">
                    <div className="p-3 sm:p-4 bg-white/[0.03] border border-white/10 rounded-2xl sm:rounded-3xl backdrop-blur-md shadow-2xl">
                       <StarLogo size="32" className="text-[#00f2ff]" />
                    </div>
                    <div>
                       <h6 className="text-[10px] sm:text-[12px] font-black text-white/30 uppercase tracking-[0.4em] leading-none mb-2">Protocol_Identity</h6>
                       <span className="text-xl sm:text-3xl font-black italic uppercase tracking-tighter block leading-none">Bulk card</span>
                    </div>
                 </div>
                 
                 <div className="flex flex-col items-end gap-2">
                    <div className="px-4 py-1.5 sm:px-6 sm:py-2 bg-[#00f2ff]/10 border border-[#00f2ff]/30 rounded-full backdrop-blur-xl">
                       <span className="text-[14px] sm:text-[30px] font-black text-[#00f2ff] uppercase tracking-widest">Verified</span>
                    </div>
                    <span className="text-[8px] font-mono text-white/45 uppercase tracking-tighter">ID: {getDeviceID().replace('node-','')}</span>
                 </div>
              </div>

              {/* Passport Content - Centered Name & Insight */}
              <div className="relative z-10 flex flex-col sm:flex-row items-center sm:items-center gap-8 sm:gap-12 mt-4 sm:mt-0">
                 <div className="relative flex-shrink-0 group">
                    <div className="absolute inset-0 bg-[#00f2ff] rounded-[3rem] blur-2xl opacity-10 group-hover:opacity-20 transition-opacity"></div>
                    <img 
                      src={`https://unavatar.io/twitter/${user?.substring(1)}`} 
                      className="w-32 h-32 sm:w-44 sm:h-44 rounded-[3.5rem] border border-white/10 bg-black relative z-10 object-cover shadow-2xl" 
                      alt="" 
                    />
                    <div className="absolute -bottom-2 -right-2 bg-black border border-white/10 rounded-2xl p-2 z-20 shadow-xl flex items-center gap-1.5 px-3">
                       <div className="w-2 h-2 rounded-full bg-green-400"></div>
                       <span className="text-[8px] font-black text-green-400/80 uppercase tracking-widest">Alive</span>
                    </div>
                 </div>
                 
                 <div className="flex-grow space-y-4 sm:space-y-6 text-center sm:text-left min-w-0">
                    <div className="space-y-1">
                       <h2 className="text-4xl sm:text-7xl font-black italic uppercase tracking-tighter leading-none text-white truncate">
                          {activeNode?.name || user?.substring(1)}
                       </h2>
                       <span className="text-[10px] sm:text-[12px] font-black text-[#00f2ff]/60 uppercase tracking-[0.4em]">{user}</span>
                    </div>
                    
                    <div className="p-6 sm:p-8 bg-white/[0.02] border border-white/5 rounded-[2rem] sm:rounded-[2.5rem] backdrop-blur-xl relative group-hover:bg-white/[0.04] transition-all">
                       <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-[#00f2ff]/20 to-transparent"></div>
                       <p className="text-xs sm:text-sm font-medium italic text-white/50 leading-relaxed font-mono">
                          {passportData.analysis || "Synchronization successful. Node identity established within the graph parameters."}
                       </p>
                    </div>
                 </div>
              </div>

              {/* Passport Footer - Technical Stats */}
              <div className="relative z-10 flex flex-col sm:flex-row justify-between items-stretch sm:items-end gap-6 sm:gap-0 border-t border-white/5 pt-8 sm:pt-10">
                 <div className="grid grid-cols-2 sm:flex sm:gap-16">
                    <div className="space-y-2">
                       <span className="text-[9px] font-black text-white/20 uppercase tracking-widest block">Network_Weight</span>
                       <div className="flex items-end gap-1">
                          <span className="text-4xl sm:text-6xl font-black italic leading-none">{activeNode?.trustScore || 0}</span>
                          <span className="text-[9px] font-black text-[#00f2ff] uppercase mb-1">pts</span>
                       </div>
                    </div>
                    <div className="space-y-2 sm:border-l sm:border-white/5 sm:pl-16">
                       <span className="text-[9px] font-black text-white/20 uppercase tracking-widest block">Shard_Level</span>
                       <div className="flex items-center gap-2">
                          <span className="text-3xl sm:text-5xl font-black italic text-[#00f2ff] leading-none">ALPHA</span>
                          <div className="flex gap-0.5">
                             {[1,2,3].map(i => <div key={i} className={`w-1 h-4 rounded-full ${i <= 2 ? 'bg-[#00f2ff]' : 'bg-white/10'}`}></div>)}
                          </div>
                       </div>
                    </div>
                 </div>
                 
                 <div className="flex items-center justify-between sm:justify-end gap-8 bg-white/[0.02] border border-white/10 rounded-3xl p-4 sm:px-8">
                    <div className="text-right flex flex-col items-end">
                       <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.2em] mb-1">Block_Registry</span>
                       <span className="text-[10px] font-mono text-white/40 tracking-tighter">B-8.5.GRPH-001</span>
                    </div>
                    <div className="w-12 h-12 bg-white/5 rounded-xl border border-white/10 flex items-center justify-center grayscale opacity-30">
                       <svg width="24" height="24" viewBox="0 0 100 100" fill="white">
                          <rect x="0" y="0" width="20" height="20" /><rect x="40" y="0" width="20" height="20" /><rect x="80" y="0" width="20" height="20" />
                          <rect x="20" y="20" width="20" height="20" /><rect x="60" y="20" width="20" height="20" />
                          <rect x="0" y="40" width="20" height="20" /><rect x="40" y="40" width="20" height="20" /><rect x="80" y="40" width="20" height="20" />
                       </svg>
                    </div>
                 </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 px-2">
              <button 
                onClick={shareToX} 
                className="py-6 sm:py-8 bg-[#1DA1F2] text-white font-black uppercase tracking-[0.4em] text-[11px] sm:text-[12px] rounded-3xl hover:bg-white hover:text-black transition-all shadow-2xl flex items-center justify-center gap-3"
              >
                <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"></path>
                </svg>
                Share to Graph
              </button>
              <button 
                onClick={() => setShowPassport(false)} 
                className="py-6 sm:py-8 bg-white/5 text-white font-black uppercase tracking-[0.4em] text-[11px] sm:text-[12px] rounded-3xl border border-white/10 hover:bg-white/10 transition-all backdrop-blur-xl"
              >
                Close Terminal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
