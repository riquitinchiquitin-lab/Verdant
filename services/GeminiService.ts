import { GoogleGenAI } from '@google/genai';
import { User } from '../types';
import { getGeminiApiKey } from '../constants';
import { fetchWithAuth } from './api';

let geminiClient: GoogleGenAI | null = null;

export const getGeminiClient = (user: User | null): GoogleGenAI | null => {
  const apiKey = user?.personalAiKey || getGeminiApiKey();
  if (!apiKey) {
    return null;
  }

  if (!geminiClient) {
    geminiClient = new GoogleGenAI({ apiKey });
  }

  return geminiClient;
};

export async function generateGeminiContent(params: {
  model?: string;
  contents: any;
  config?: any;
  personalApiKey?: string;
}): Promise<{ text: string; usageMetadata?: any }> {
  const token = localStorage.getItem('verdant_token') || '';
  if (token) {
    const res = await fetchWithAuth('/api/proxy/gemini', token, {
      method: 'POST',
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.details || err.error || 'GEMINI_PROXY_FAULT');
    }
    return res.json();
  }

  // Fallback only if user explicitly supplied a personal key without a session
  const apiKey = params.personalApiKey || getGeminiApiKey();
  if (!apiKey) throw new Error('GEMINI_API_KEY_MISSING');
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: params.model || 'gemini-2.5-flash',
    contents: params.contents,
    config: params.config,
  });
  return {
    text: response.text || '',
    usageMetadata: response.usageMetadata,
  };
}
