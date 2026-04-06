import { GoogleGenAI } from '@google/genai';
import { User } from '../types';
import { getGeminiApiKey } from '../constants';

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
