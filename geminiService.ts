
import { GoogleGenAI, Type, GenerateContentParameters } from "@google/genai";

const MAX_RETRIES = 1;
const INITIAL_BACKOFF = 1000;

const getCachedResponse = (key: string) => localStorage.getItem(`bulk_cache_${key}`);
const setCachedResponse = (key: string, value: string) => localStorage.setItem(`bulk_cache_${key}`, value);

const localAI = {
  getInsight: (name: string) => {
    const templates = [
      `${name} is a high-signal contributor within the decentralized recognition shard.`,
      `Node ${name} demonstrates consistent alignment with protocol governance.`,
      `Identity verified: ${name} is mapping critical trust pathways.`,
      `Strategic actor ${name} exhibits high synchronization with peer-to-peer standards.`,
      `${name} acts as a vital bridge in the social architecture of this network.`
    ];
    return templates[Math.abs(name.length) % templates.length];
  },
  getFingerprint: (handle: string, votes: number) => {
    return `Protocol Analysis: Node ${handle} is established with ${votes} verified connections. This identity is currently synchronized with the global trust graph and maintains a stable reputation within the Alpha Shard.`;
  }
};

async function callGeminiWithRetry(params: GenerateContentParameters, cacheKey?: string, retries = 0): Promise<any> {
  if (cacheKey) {
    const cached = getCachedResponse(cacheKey);
    if (cached) return { text: cached, fromCache: true };
  }

  if (!process.env.API_KEY) throw new Error("API_KEY_MISSING");
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  try {
    const response = await ai.models.generateContent(params);
    const text = response.text;
    if (cacheKey && text) setCachedResponse(cacheKey, text);
    return response;
  } catch (error: any) {
    if (retries < MAX_RETRIES) {
      await new Promise(resolve => setTimeout(resolve, INITIAL_BACKOFF));
      return callGeminiWithRetry(params, cacheKey, retries + 1);
    }
    throw error;
  }
}

export const parseTwitterLinkWithGemini = async (url: string) => {
  const handlePart = url.split('/').pop()?.split('?')[0] || 'user';
  try {
    const response = await callGeminiWithRetry({
      model: "gemini-3-flash-preview",
      contents: `Extract real name and handle from: ${url}. Return JSON: {"name": "Name", "handle": "@user"}.`,
      config: { responseMimeType: "application/json" }
    }, `parse_${handlePart}`);
    return typeof response.text === 'string' ? JSON.parse(response.text) : response.text;
  } catch (e) {
    return { name: handlePart, handle: `@${handlePart}` };
  }
};

export const generateRecognitionInsight = async (candidateName: string) => {
  try {
    const response = await callGeminiWithRetry({
      model: "gemini-3-flash-preview",
      contents: `Write 1 short high-tech social insight for "${candidateName}" in a Web3 context.`
    }, `insight_${candidateName.replace(/\W/g, '_')}`);
    return response.text.trim();
  } catch (e) {
    return localAI.getInsight(candidateName);
  }
};

export const generateSocialFingerprint = async (handle: string, votesCount: number) => {
  try {
    const response = await callGeminiWithRetry({
      model: "gemini-3-flash-preview",
      contents: `Create a 2-sentence professional "Social Fingerprint" for node ${handle} who has ${votesCount} trust points. Use graph theory terms.`
    }, `fingerprint_${handle.replace(/\W/g, '_')}`);
    return response.text.trim();
  } catch (e) {
    return localAI.getFingerprint(handle, votesCount);
  }
};
