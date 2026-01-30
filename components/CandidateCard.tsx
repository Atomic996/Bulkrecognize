
import React, { useState, useEffect, useRef } from 'react';
import { Candidate, VoteValue } from '../types';
import { generateRecognitionInsight } from '../services/geminiService';

interface CandidateCardProps {
  candidate: Candidate;
  onVote: (value: VoteValue) => void;
  disabled?: boolean;
}

const CandidateCard: React.FC<CandidateCardProps> = ({ candidate, onVote, disabled }) => {
  const [animationClass, setAnimationClass] = useState('card-animation-active');
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [isInsightLoading, setIsInsightLoading] = useState(false);
  
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [offsetX, setOffsetX] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setAnimationClass('card-animation-active');
    setOffsetX(0);
    
    const fetchInsight = async () => {
      setIsInsightLoading(true);
      try {
        const insight = await generateRecognitionInsight(candidate.name);
        setAiInsight(insight);
      } catch (e) {
        setAiInsight("Node detected in the decentralized trust graph.");
      } finally {
        setIsInsightLoading(false);
      }
    };

    fetchInsight();
  }, [candidate.id, candidate.name]);

  const handleVoteAction = (value: VoteValue) => {
    if (disabled) return;
    const exitClass = value === VoteValue.KNOW ? 'card-swipe-right' : 'card-swipe-left';
    setAnimationClass(exitClass);
    setTimeout(() => onVote(value), 450);
  };

  const onStart = (e: React.TouchEvent | React.MouseEvent) => {
    if (disabled) return;
    const x = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    setTouchStart(x);
  };

  const onMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (touchStart === null || disabled) return;
    const x = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const delta = x - touchStart;
    setOffsetX(delta);
  };

  const onEnd = () => {
    if (disabled) return;
    if (offsetX > 150) {
      handleVoteAction(VoteValue.KNOW);
    } else if (offsetX < -150) {
      handleVoteAction(VoteValue.DONT_KNOW);
    } else {
      setOffsetX(0);
    }
    setTouchStart(null);
  };

  const profileImg = `https://unavatar.io/twitter/${candidate.handle.replace('@','')}`;

  return (
    <div 
      ref={cardRef}
      onMouseDown={onStart}
      onMouseMove={onMove}
      onMouseUp={onEnd}
      onMouseLeave={onEnd}
      onTouchStart={onStart}
      onTouchMove={onMove}
      onTouchEnd={onEnd}
      style={{ 
        transform: `translateX(${offsetX}px) rotate(${offsetX * 0.04}deg)`,
        transition: touchStart === null ? 'transform 0.6s cubic-bezier(0.23, 1, 0.32, 1)' : 'none',
        cursor: touchStart !== null ? 'grabbing' : 'grab'
      }}
      className={`w-full max-w-xl mx-auto bg-[#0a0a0a] border border-white/10 rounded-[4.5rem] p-12 sm:p-16 shadow-[0_50px_120px_rgba(0,0,0,0.9)] relative overflow-hidden group select-none ${animationClass}`}
    >
      {/* Overlay indicators for swipe */}
      <div className={`absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity duration-300 z-50 ${offsetX > 80 ? 'opacity-40' : 'opacity-0'}`}>
         <div className="bg-[#00f2ff] text-black px-12 py-8 rounded-full font-black text-4xl italic uppercase tracking-tighter shadow-[0_0_50px_#00f2ff]">Recognize</div>
      </div>
      <div className={`absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity duration-300 z-50 ${offsetX < -80 ? 'opacity-40' : 'opacity-0'}`}>
         <div className="bg-white/10 text-white px-12 py-8 rounded-full font-black text-4xl italic uppercase tracking-tighter backdrop-blur-md">Skip</div>
      </div>

      <div className="flex flex-col items-center text-center space-y-10 relative z-10">
        <div className="relative">
          <div className="absolute inset-0 bg-[#00f2ff] rounded-[4rem] blur-[80px] opacity-10 animate-pulse"></div>
          <div className="relative w-56 h-56 sm:w-64 sm:h-64 rounded-[4rem] p-1.5 bg-gradient-to-tr from-[#00f2ff]/30 to-white/10 group-hover:scale-[1.05] transition-transform duration-700">
            <img 
              src={profileImg} 
              className="w-full h-full rounded-[3.8rem] object-cover bg-black border-4 border-[#050505] relative z-10" 
              draggable="false"
              alt={candidate.name}
              onError={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${candidate.name}&background=00f2ff&color=000`; }}
            />
          </div>
        </div>

        <div className="w-full bg-white/[0.03] border border-white/5 rounded-[3rem] p-8 relative overflow-hidden min-h-[110px] flex items-center justify-center backdrop-blur-xl">
          <div className="absolute top-3 left-8 flex items-center gap-2">
            <span className="text-[8px] font-black uppercase tracking-[0.4em] text-[#00f2ff]/40">Node_Insight</span>
            <span className="w-1 h-1 rounded-full bg-[#00f2ff]/40 animate-pulse"></span>
          </div>
          <p className="text-sm font-medium italic text-white/60 leading-relaxed pt-3 px-2">
            {isInsightLoading && !aiInsight ? (
              <span className="animate-pulse opacity-40 italic">Decoding shard metadata...</span>
            ) : (aiInsight)}
          </p>
        </div>

        <div className="space-y-6">
          <div className="space-y-2">
            <h4 className="text-5xl sm:text-6xl font-black italic uppercase tracking-tighter leading-none truncate max-w-sm">{candidate.name}</h4>
            <span className="text-[#00f2ff] font-black text-[13px] uppercase tracking-[0.5em] pt-3 inline-block opacity-80 shadow-[0_0_15px_rgba(0,242,255,0.2)]">
              {candidate.handle}
            </span>
          </div>
          <div className="flex items-center justify-center gap-10 py-4 bg-white/5 rounded-[2.5rem] border border-white/5 mx-auto px-10">
             <div className="text-center">
                <span className="block text-3xl font-black italic">{candidate.trustScore}</span>
                <span className="text-[9px] font-black uppercase text-white/20 tracking-[0.3em]">Trust_Score</span>
             </div>
             <div className="w-px h-10 bg-white/10"></div>
             <div className="text-center">
                <span className="block text-3xl font-black italic text-[#00f2ff]">ALPHA</span>
                <span className="text-[9px] font-black uppercase text-white/20 tracking-[0.3em]">Shard</span>
             </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 w-full gap-6 pt-6">
          <button
            onClick={() => handleVoteAction(VoteValue.DONT_KNOW)}
            disabled={disabled}
            className="group/btn py-8 rounded-3xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all active:scale-95 backdrop-blur-xl"
          >
            <span className="text-[11px] font-black text-white/40 uppercase tracking-[0.5em]">Skip Node</span>
          </button>

          <button
            onClick={() => handleVoteAction(VoteValue.KNOW)}
            disabled={disabled}
            className="py-8 rounded-3xl bg-[#00f2ff] text-black font-black hover:bg-white transition-all active:scale-95 shadow-[0_20px_40px_rgba(0,242,255,0.3)]"
          >
            <span className="text-[11px] uppercase tracking-[0.5em]">Verify Trust</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default CandidateCard;
