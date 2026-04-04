
import { GoogleGenAI, Type } from "@google/genai";
import { LocalizedString } from "../types";
import { getGeminiApiKey } from "../constants";

export const TARGET_LANGS = [
  'en', 'zh', 'ja', 'ko', 'es', 'fr', 'pt', 'de', 'id', 'vi', 'tl'
];

// Circuit breaker: prevent calling the API if we recently hit a rate limit
let rateLimitResetTime = 0;
const COOLDOWN_DURATION = 120000; // 2 minutes

// Simple queue to prevent concurrent bursts
let isProcessing = false;
const queue: { text: string; sourceLang: string; resolve: (val: LocalizedString) => void; reject: (err: any) => void; apiKey?: string }[] = [];

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Returns the current health of the API connection.
 */
export const getApiHealth = () => {
  const now = Date.now();
  if (now < rateLimitResetTime) {
    const remaining = rateLimitResetTime - now;
    const percent = Math.round((remaining / COOLDOWN_DURATION) * 100);
    return { status: 'COOLDOWN', percent, secondsLeft: Math.ceil(remaining / 1000) };
  }
  
  const loadPercent = Math.min(20 + (queue.length * 10), 90);
  return { status: 'STABLE', percent: loadPercent, secondsLeft: 0 };
};

const processQueue = async () => {
  if (isProcessing || queue.length === 0) return;
  isProcessing = true;
  
  const { text, sourceLang, resolve, reject, apiKey } = queue.shift()!;
  
  try {
    const result = await executeTranslation(text, sourceLang, apiKey);
    resolve(result);
  } catch (err) {
    reject(err);
  } finally {
    isProcessing = false;
    await sleep(400); 
    processQueue();
  }
};

const executeTranslation = async (text: string, sourceLang: string, apiKey?: string): Promise<LocalizedString> => {
  // Fix: Use provided apiKey or fallback to global getGeminiApiKey()
  const key = apiKey || getGeminiApiKey();
  if (!key) {
    throw new Error("UPLINK_FAULT: Gemini API Key is missing. Please ensure GEMINI_API_KEY is set in your environment variables.");
  }
  const maskedKey = `${key.substring(0, 4)}...${key.substring(key.length - 4)}`;
  const ai = new GoogleGenAI({ apiKey: key });
  const model = 'gemini-3-flash-preview';
  console.log(`[GEMINI] Translating with ${model} (Key: ${maskedKey})...`);
  const prompt = `Translate "${text}" from ${sourceLang} to: ${TARGET_LANGS.join(', ')}`;

  const properties: any = {};
  TARGET_LANGS.forEach(lang => {
    properties[lang] = { type: Type.STRING };
  });

  let retries = 0;
  const maxRetries = 2;

  while (retries <= maxRetries) {
    try {
      const response = await ai.models.generateContent({
        model: model,
        contents: prompt,
        config: {
          systemInstruction: "You are a translation engine. Return valid JSON only with no extra text.",
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties,
            required: TARGET_LANGS
          }
        }
      });

      // Fix: Access .text property directly
      return JSON.parse(response.text || "{}") as LocalizedString;

    } catch (error: any) {
      const errorStr = JSON.stringify(error);
      const isRateLimit = errorStr.includes('429') || errorStr.includes('RESOURCE_EXHAUSTED');

      if (isRateLimit && retries < maxRetries) {
        retries++;
        const delay = Math.pow(4, retries) * 1000; 
        await sleep(delay);
        continue;
      }

      if (isRateLimit) {
        rateLimitResetTime = Date.now() + COOLDOWN_DURATION; 
        throw new Error("RATE_LIMIT");
      }
      throw error;
    }
  }

  throw new Error("MAX_RETRIES");
};

/**
 * Automatically translates a string into all supported languages.
 */
export const translateInput = (text: string, sourceLang: string = 'en', apiKey?: string): Promise<LocalizedString> => {
  return new Promise((resolve, reject) => {
    if (!text || text.trim() === '') {
      return resolve({ en: '' } as LocalizedString);
    }

    if (Date.now() < rateLimitResetTime) {
      const fallback: any = {};
      TARGET_LANGS.forEach(lang => fallback[lang] = text);
      return resolve(fallback as LocalizedString);
    }

    if (/^\d+(\.\d+)?$/.test(text)) {
      const result: any = {};
      TARGET_LANGS.forEach(lang => result[lang] = text);
      return resolve(result as LocalizedString);
    }

    queue.push({ text, sourceLang, resolve, reject, apiKey });
    processQueue();
  });
};

/**
 * Translates an object of strings into all supported languages.
 */
export const translateObjectInput = async (obj: Record<string, string>, sourceLang: string = 'en', apiKey?: string): Promise<Record<string, LocalizedString>> => {
  const keys = Object.keys(obj);
  if (keys.length === 0) return {};
  
  const separator = " ||| ";
  const values = keys.map(k => obj[k]);
  const joined = values.join(separator);
  
  const translated = await translateInput(joined, sourceLang, apiKey);
  
  const result: Record<string, LocalizedString> = {};
  keys.forEach((key, index) => {
    const localized: any = {};
    Object.keys(translated).forEach(lang => {
      const parts = (translated[lang] || '').split(separator);
      localized[lang] = parts[index]?.trim() || '';
    });
    result[key] = localized;
  });
  
  return result;
};

/**
 * Translates an array of strings into all supported languages.
 */
export const translateArrayInput = async (items: string[], sourceLang: string = 'en', apiKey?: string): Promise<any> => {
  if (!items || items.length === 0) return { en: [] };
  const separator = " ||| ";
  const joined = items.join(separator);
  const translated = await translateInput(joined, sourceLang, apiKey);
  const result: any = {};
  Object.keys(translated).forEach(lang => {
    result[lang] = (translated[lang] || '').split(separator).map((s: string) => s.trim());
  });
  return result;
};
