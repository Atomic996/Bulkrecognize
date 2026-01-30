
import { createClient } from '@supabase/supabase-js';
import { Candidate } from '../types';

const SUPABASE_URL = 'https://qjoixgkwpqnkmzqbsrct.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqb2l4Z2t3cHFua216cWJzcmN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3NDM0NzAsImV4cCI6MjA4NTMxOTQ3MH0.QcjUVEAlOlQuF1xQ49ln73RtD_w_vQkz4VMLOv-n3Go';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const databaseService = {
  async fetchGlobalCandidates(): Promise<Candidate[]> {
    try {
      const { data, error } = await supabase
        .from('candidates')
        .select('*')
        .order('trust_score', { ascending: false });
      
      if (error) throw error;
      return (data || []).map((item: any) => ({
        id: String(item.id),
        name: item.name || 'Member',
        handle: item.handle || '@member',
        profileImageUrl: `https://unavatar.io/twitter/${(item.handle || '').replace('@','')}`,
        profileUrl: `https://x.com/${(item.handle || '').replace('@','')}`,
        platform: 'Twitter',
        firstSeen: item.created_at || new Date().toISOString(),
        sharedCount: 0,
        trustScore: Math.max(0, parseInt(item.trust_score || 0, 10)),
        totalInteractions: 0
      }));
    } catch (e) {
      console.error("Supabase Fetch Error:", e);
      return [];
    }
  },

  async getVotedIds(voterHandle: string): Promise<string[]> {
    try {
      const { data, error } = await supabase
        .from('votes')
        .select('candidate_id')
        .eq('voter_handle', voterHandle.toLowerCase());
      if (error) return [];
      return data.map(v => String(v.candidate_id));
    } catch { return []; }
  },

  async recordVote(voterHandle: string, candidateId: string): Promise<boolean> {
    try {
      const { error } = await supabase.from('votes').insert({ 
        voter_handle: voterHandle.toLowerCase(), 
        candidate_id: candidateId 
      });
      return !error;
    } catch { return false; }
  },

  async upsertCandidate(candidate: Candidate, fingerprint: string): Promise<boolean> {
    try {
      const handleLower = candidate.handle.toLowerCase();
      
      // 1. البحث عن مستخدم موجود بنفس الـ handle
      const { data: existing } = await supabase
        .from('candidates')
        .select('id')
        .eq('handle', handleLower)
        .maybeSingle();

      const payload: any = {
        name: candidate.name,
        handle: handleLower,
        trust_score: candidate.trustScore || 0
      };

      if (existing) {
        // تحديث السجل الموجود باستخدام معرفه الحقيقي
        const { error } = await supabase
          .from('candidates')
          .update(payload)
          .eq('id', existing.id);
        
        if (error) console.error("Update Error:", error.message);
        return !error;
      } else {
        // إنشاء سجل جديد
        // بما أن قاعدة البيانات ترفض القيمة null في حقل الـ id، يجب أن نوفر id
        // سنستخدم طابعاً زمنياً (Timestamp) كمعرف عددي فريد
        let numericId = Date.now();
        
        // محاولة استخراج الرقم من المعرف المؤقت إذا كان موجوداً (node-12345)
        if (candidate.id && candidate.id.startsWith('node-')) {
          const extracted = parseInt(candidate.id.replace('node-', ''));
          if (!isNaN(extracted)) numericId = extracted;
        } else if (candidate.id && !isNaN(parseInt(candidate.id))) {
          numericId = parseInt(candidate.id);
        }

        payload.id = numericId;

        const { error } = await supabase.from('candidates').insert(payload);
        if (error) {
          // محاولة أخيرة في حال كان الـ ID مكرراً (نادراً جداً مع الـ Timestamp)
          if (error.message.includes('id')) {
            payload.id = Date.now() + Math.floor(Math.random() * 1000);
            const { error: retryError } = await supabase.from('candidates').insert(payload);
            return !retryError;
          }
          console.error("Insert Error:", error.message);
          return false;
        }
        return true;
      }
    } catch (e) { 
      console.error("Upsert Exception:", e);
      return false; 
    }
  },

  async incrementTrust(candidateId: string): Promise<boolean> {
    try {
      const { data, error: fetchError } = await supabase
        .from('candidates')
        .select('trust_score')
        .eq('id', candidateId)
        .maybeSingle();
      
      if (fetchError || !data) return false;
      
      const { error: updateError } = await supabase
        .from('candidates')
        .update({ trust_score: (data.trust_score || 0) + 1 })
        .eq('id', candidateId);
        
      return !updateError;
    } catch { return false; }
  }
};
