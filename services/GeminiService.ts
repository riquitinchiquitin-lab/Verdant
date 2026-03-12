import { GoogleGenAI } from '@google/genai';
import { House, User } from '../types';

let geminiClient: GoogleGenAI | null = null;

export const getGeminiClient = (user: User | null): GoogleGenAI | null => {
  if (!user || !user.house || !user.house.googleApiKey) {
    return null;
  }

  if (!geminiClient) {
    geminiClient = new GoogleGenAI({ apiKey: user.house.googleApiKey });
  }

  return geminiClient;
};
