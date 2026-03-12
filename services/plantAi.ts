import { GoogleGenAI, Type } from "@google/genai";
import { API_URL, GEMINI_API_KEY } from '../constants';
import { Plant, LocalizedString, LocalizedArray } from '../types';
import { fetchTrefleData, fetchOpenPlantBookData, fetchPerenualData, searchGroundingData } from './botanicalServices';

const TARGET_LANGS = ['en', 'zh', 'ja', 'ko', 'es', 'fr', 'pt', 'de', 'id', 'vi', 'tl'];

const cleanJson = (text: string): string => {
  return text.replace(/```json\n?|\n?```/g, '').trim();
};

const reportSystemHit = (isError?: boolean) => {
  (window as any).__VERDANT_SYSTEM_HIT?.(isError);
};

/**
 * Robust wrapper for Gemini API calls with exponential backoff retry logic.
 */
const callGeminiWithRetry = async (fn: () => Promise<any>, maxRetries = 3): Promise<any> => {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (e: any) {
      lastError = e;
      const isRetryable = e.message?.includes("503") || 
                          e.message?.includes("high demand") || 
                          e.message?.includes("overloaded") ||
                          e.message?.includes("rate limit");
      
      if (!isRetryable || i === maxRetries - 1) break;
      
      const delay = Math.pow(2, i) * 1000 + Math.random() * 1000;
      console.warn(`Gemini busy (Attempt ${i + 1}/${maxRetries}). Retrying in ${Math.round(delay)}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError;
};

/**
 * Validates an API key connection. 
 */
export const verifyApiKey = async (apiKey?: string): Promise<boolean> => {
    const keyToTest = apiKey || GEMINI_API_KEY;
    if (!keyToTest) return false;
    
    const ai = new GoogleGenAI({ apiKey: keyToTest });
    try {
        await callGeminiWithRetry(() => ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: 'ping',
            config: { maxOutputTokens: 1, thinkingConfig: { thinkingBudget: 0 } }
        }));
        return true;
    } catch (e) {
        console.warn("API Verification Failed:", e);
        return false;
    }
};

/**
 * 1. Primary Identification via Local Proxy (Secure Gateway)
 */
export const identifyPlantWithPlantNet = async (imageBlobs: Blob[]): Promise<any | null> => {
  const targetUrl = `${API_URL}/api/proxy/identify`;
  const formData = new FormData();
  
  imageBlobs.forEach((blob) => {
    formData.append('images', blob, 'specimen.jpg');
  });
  
  try {
    const response = await fetch(targetUrl, { method: 'POST', body: formData });
    if (response.ok) {
        const data = await response.json();
        if (data.results?.[0]) {
            return {
                bestMatch: data.results[0].species.scientificNameWithoutAuthor,
                score: data.results[0].score,
                commonNames: data.results[0].species.commonNames || []
            };
        }
    }
    return null;
  } catch (e) {
    console.warn("Proxy identification fault:", e);
    return null;
  }
};

/**
 * 2. Visual Identification Fallback (Gemini)
 */
export const identifyPlantWithGemini = async (base64: string, apiKey?: string): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey: apiKey || GEMINI_API_KEY });
  const model = 'gemini-3-flash-preview';
  
  try {
    reportSystemHit();
    const res = await callGeminiWithRetry(() => ai.models.generateContent({
      model,
      contents: {
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: base64.split(',')[1] } },
          { text: "Identify this plant species. Return ONLY the scientific name." }
        ]
      }
    }));
    return { bestMatch: res.text?.trim() || "Unknown", score: 0.99 };
  } catch (e) {
    return null;
  }
};

/**
 * 3. Synthesis & Harmonization
 */
export const generatePlantDetails = async (
  scientificName: string, 
  base64Image?: string, 
  onLog?: (msg: string, source: string) => void,
  apiKey?: string
): Promise<Partial<Plant>> => {
  const ai = new GoogleGenAI({ apiKey: apiKey || GEMINI_API_KEY });
  const model = 'gemini-3-flash-preview';

  onLog?.("Accessing global botanical archives...", "NETWORK");
  const [trefle, opb, perenual, grounding] = await Promise.all([
    fetchTrefleData(scientificName).catch(() => null),
    fetchOpenPlantBookData(scientificName).catch(() => null),
    fetchPerenualData(scientificName).catch(() => null),
    searchGroundingData(`how to propagate and repot ${scientificName} successfully`).catch(() => null)
  ]);

  onLog?.("Harmonizing & Localizing data...", "GEMINI");
  
  const translationSchema = {
    type: Type.OBJECT,
    properties: TARGET_LANGS.reduce((a:any, l) => ({...a, [l]: {type: Type.STRING}}), {}),
    required: TARGET_LANGS
  };

  const prompt = `
    Harmonize biological data for "${scientificName}".
    SOURCES: 
    - Trefle: ${JSON.stringify(trefle)}
    - OPB: ${JSON.stringify(opb)}
    - Perenual: ${JSON.stringify(perenual)}
    - Web Grounding: ${JSON.stringify(grounding)}
    
    REQUIREMENTS:
    1. Extract: species, scientificAuthor, rank, family, genus, category, growthRate, maxHeight (cm), avgHeight (cm), flowers (bool), edible (bool), vegetable (bool).
    2. Specs: min/max moisture (%), temp (C), light (Lux), soil EC, humidity (%).
    3. Care: Estimate 'wateringInterval' (days) and 'repottingFrequency' (months) based on species needs.
    4. Lifecycle: Synthesize 'propagationMethods' (localized array of strings), a detailed 'propagationInstructions' (localized string with step-by-step guide), and a detailed 'repottingInstructions' (localized string with step-by-step guide) using data from all provided sources. Include 'lastPotSize' (string) and 'citesStatus' (Appendix I, II, or III).
    5. Technical: Suggest 'targetPh', 'targetEc', 'targetVpd', 'targetDli' for optimal growth.
    6. Localization: Translate ALL text fields (nickname, description, category, growthRate, citesStatus, origin, distribution, advice fields, petSafety, aiInsight, propagationInstructions, repottingInstructions, etc.) into these 11 codes: ${TARGET_LANGS.join(',')}.
    7. Toxicity: Detail pet-safety in 'petSafety' (isPetSafe bool).
    8. Soil: Breakdown 'soilComposition' into percentages with localized component names.
    9. Insights: Provide a unique 'aiInsight' about this specimen.
  `;

  try {
    reportSystemHit();
    const response = await callGeminiWithRetry(() => ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            species: { type: Type.STRING },
            scientificAuthor: { type: Type.STRING },
            rank: { type: Type.STRING },
            family: { type: Type.STRING },
            genus: { type: Type.STRING },
            category: translationSchema,
            growthRate: translationSchema,
            maxHeight: { type: Type.INTEGER },
            avgHeight: { type: Type.INTEGER },
            flowers: { type: Type.BOOLEAN },
            edible: { type: Type.BOOLEAN },
            vegetable: { type: Type.BOOLEAN },
            isPetSafe: { type: Type.BOOLEAN },
            wateringInterval: { type: Type.INTEGER },
            repottingFrequency: { type: Type.INTEGER },
            lastPotSize: { type: Type.STRING },
            propagationMethods: {
              type: Type.OBJECT,
              properties: TARGET_LANGS.reduce((a:any, l) => ({...a, [l]: {type: Type.ARRAY, items: {type: Type.STRING}}}), {}),
              required: TARGET_LANGS
            },
            propagationInstructions: translationSchema,
            repottingInstructions: translationSchema,
            citesStatus: translationSchema,
            targetPh: { type: Type.NUMBER },
            targetEc: { type: Type.NUMBER },
            targetVpd: { type: Type.NUMBER },
            targetDli: { type: Type.NUMBER },
            minSoilMoist: { type: Type.INTEGER },
            maxSoilMoist: { type: Type.INTEGER },
            minTemp: { type: Type.NUMBER },
            maxTemp: { type: Type.NUMBER },
            minLightLux: { type: Type.INTEGER },
            maxLightLux: { type: Type.INTEGER },
            minSoilEc: { type: Type.INTEGER },
            minEnvHumid: { type: Type.INTEGER },
            nickname: translationSchema,
            description: translationSchema,
            aiInsight: translationSchema,
            commonNames: {
              type: Type.OBJECT,
              properties: TARGET_LANGS.reduce((a:any, l) => ({...a, [l]: {type: Type.ARRAY, items: {type: Type.STRING}}}), {}),
              required: TARGET_LANGS
            },
            petSafety: translationSchema,
            origin: translationSchema,
            distribution: translationSchema,
            lightAdvice: translationSchema,
            moistureAdvice: translationSchema,
            nutritionAdvice: translationSchema,
            tempAdvice: translationSchema,
            humidityAdvice: translationSchema,
            soilComposition: { 
              type: Type.ARRAY, 
              items: { 
                type: Type.OBJECT, 
                properties: { 
                  component: translationSchema,
                  percent: { type: Type.INTEGER }
                } 
              } 
            }
          }
        }
      }
    }));

    const parsed = JSON.parse(cleanJson(response.text || "{}"));
    return createPlant({
        ...parsed,
        trefleId: trefle?.id,
        opbId: opb?.pid,
        images: base64Image ? [base64Image] : []
    });
  } catch (error: any) {
    onLog?.(`Uplink Error: ${error.message}`, "DEBUG");
    throw error;
  }
};

/**
 * 5. Utility to ensure a Plant object is fully initialized with defaults.
 */
export const createPlant = (data: Partial<Plant>): Plant => {
  const emptyLocalized: LocalizedString = { en: '' };
  const emptyLocalizedArray: LocalizedArray = { en: [] };

  return {
    id: data.id || `p-${Date.now()}`,
    species: data.species || 'Unknown Species',
    nickname: data.nickname || { en: data.species || 'New Specimen' },
    commonNames: data.commonNames || emptyLocalizedArray,
    family: data.family || null,
    genus: data.genus || null,
    scientificAuthor: data.scientificAuthor || null,
    rank: data.rank || 'species',
    category: data.category || null,
    
    trefleId: data.trefleId || null,
    opbId: data.opbId || null,
    
    aiInsight: data.aiInsight || emptyLocalized,
    lightAdvice: data.lightAdvice || emptyLocalized,
    tempAdvice: data.tempAdvice || emptyLocalized,
    moistureAdvice: data.moistureAdvice || emptyLocalized,
    nutritionAdvice: data.nutritionAdvice || emptyLocalized,
    humidityAdvice: data.humidityAdvice || emptyLocalized,
    petSafety: data.petSafety || emptyLocalized,
    isPetSafe: data.isPetSafe ?? false,
    
    origin: data.origin || emptyLocalized,
    distribution: data.distribution || emptyLocalized,
    growthRate: data.growthRate || null,
    maxHeight: data.maxHeight || null,
    avgHeight: data.avgHeight || null,
    edible: data.edible ?? false,
    vegetable: data.vegetable ?? false,
    flowers: data.flowers ?? false,
    soilComposition: data.soilComposition || [],
    images: data.images || [],
    
    minSoilMoist: data.minSoilMoist || null,
    maxSoilMoist: data.maxSoilMoist || null,
    minTemp: data.minTemp || null,
    maxTemp: data.maxTemp || null,
    minLightLux: data.minLightLux || null,
    maxLightLux: data.maxLightLux || null,
    minSoilEc: data.minSoilEc || null,
    minEnvHumid: data.minEnvHumid || null,
    
    wateringInterval: data.wateringInterval || 7,
    lastWatered: data.lastWatered || null,
    createdAt: data.createdAt || new Date().toISOString(),
    updatedAt: data.updatedAt || new Date().toISOString(),
    lastModified: data.lastModified || new Date().toISOString(),
    
    description: data.description || emptyLocalized,
    logs: data.logs || [],
    
    propagationMethods: data.propagationMethods || emptyLocalizedArray,
    propagationInstructions: data.propagationInstructions || emptyLocalized,
    repottingInstructions: data.repottingInstructions || emptyLocalized,
    targetPh: data.targetPh || null,
    targetEc: data.targetEc || null,
    citesStatus: data.citesStatus || null,
    provenance: data.provenance || {
        nursery: '',
        dateOfPurchase: '',
        cost: 0,
        currency: 'USD'
    },
    repottingFrequency: data.repottingFrequency || 18,
    lastPotSize: data.lastPotSize || null,
    targetVpd: data.targetVpd || null,
    targetDli: data.targetDli || null,
    houseId: data.houseId || null
  } as Plant;
};

/**
 * 4. Health Diagnosis via Gemini
 */
export const analyzePlantHealth = async (
  plant: Plant,
  base64: string,
  userObservations?: string,
  apiKey?: string
): Promise<{ diagnosis: LocalizedString; recoveryPlan: LocalizedArray } | null> => {
  const ai = new GoogleGenAI({ apiKey: apiKey || GEMINI_API_KEY });
  const model = 'gemini-3-flash-preview';

  const translationSchema = {
    type: Type.OBJECT,
    properties: TARGET_LANGS.reduce((a: any, l) => ({ ...a, [l]: { type: Type.STRING } }), {}),
    required: TARGET_LANGS
  };

  const prompt = `
    Act as a Master Botanical Pathologist. 
    Analyze the image for health issues affecting this "${plant.species}". 
    USER OBSERVATIONS: "${userObservations || 'None provided'}"
    Look for: chlorosis, necrosis, pest trails, fungal spots, or wilting.
    Provide a concise technical diagnosis and a step-by-step recovery plan.
    Localize all text into these 11 codes: ${TARGET_LANGS.join(',')}.
  `;

  try {
    reportSystemHit();
    const response = await callGeminiWithRetry(() => ai.models.generateContent({
      model,
      contents: {
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: base64.split(',')[1] } },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            diagnosis: translationSchema,
            recoveryPlan: {
              type: Type.OBJECT,
              properties: TARGET_LANGS.reduce((a: any, l) => ({ 
                ...a, 
                [l]: { 
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                } 
              }), {}),
              required: TARGET_LANGS
            }
          },
          required: ["diagnosis", "recoveryPlan"]
        }
      }
    }));

    const text = response.text;
    if (!text) return null;
    return JSON.parse(cleanJson(text));
  } catch (error) {
    console.error("Diagnostic Failure:", error);
    return null;
  }
};