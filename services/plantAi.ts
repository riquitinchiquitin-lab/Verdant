import { Type } from "@google/genai";
import { API_URL } from '../constants';
import { generateGeminiContent } from './GeminiService';
import { Plant, LocalizedString, LocalizedArray } from '../types';
import { fetchTrefleData, fetchOpenPlantBookData, fetchPerenualData, searchGroundingData, fetchGbifData, fetchPowoData, fetchINaturalistData, fetchNcsuData, fetchVascanData, fetchAggregatedSpeciesData } from './botanicalServices';
import { trackUsage } from './usageService';
import { generateUUID } from './crypto';
import { inferPlantCategory, isPlantTree } from '../utils/botanicalCategory';

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
    try {
        await callGeminiWithRetry(() => generateGeminiContent({
            model: 'gemini-3-flash-preview',
            personalApiKey: apiKey,
            contents: 'ping',
            config: { maxOutputTokens: 1 }
        }));
        return true;
    } catch (e: any) {
        console.warn("API Verification Failed:", e.message || e);
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
    const token = localStorage.getItem('verdant_token');
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: token ? { 'Authorization': `Bearer ${token}` } : undefined,
      body: formData
    });
    if (response.ok) {
        trackUsage('plantnet');
        const data = await response.json();
        if (data.results?.[0]) {
            return {
                bestMatch: data.results[0].species.scientificNameWithoutAuthor,
                score: data.results[0].score,
                commonNames: data.results[0].species.commonNames || [],
                gbifId: data.results[0].gbif?.id || null,
                powoId: data.results[0].powo?.id || null,
                alternatives: data.results.slice(1, 3).map((r: any) => ({
                    species: r.species?.scientificNameWithoutAuthor,
                    score: r.score
                }))
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
  const model = 'gemini-3-flash-preview';
  
  try {
    reportSystemHit();
    const res = await callGeminiWithRetry(() => generateGeminiContent({
      model,
      personalApiKey: apiKey,
      contents: {
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: base64.split(',')[1] } },
          { text: "Identify this plant species. Return ONLY the scientific name." }
        ]
      }
    }));
    
    if (res.usageMetadata) {
      const totalTokens = (res.usageMetadata.promptTokenCount || 0) + (res.usageMetadata.candidatesTokenCount || 0);
      trackUsage('gemini', totalTokens);
    } else {
      trackUsage('gemini');
    }
    const bestMatch = res.text?.trim() || "Unknown";
    console.log(`[GEMINI] Identification Result: ${bestMatch}`);
    return { bestMatch, score: 0.99 };
  } catch (e: any) {
    console.error("[GEMINI] Identification Protocol Fault:", e.message || e);
    if (e.message?.toLowerCase().includes("api key not valid") || 
        e.message?.toLowerCase().includes("invalid api key") ||
        e.message?.toLowerCase().includes("api_key_invalid")) {
        throw new Error("API_KEY_INVALID");
    }
    throw e;
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
  const model = 'gemini-3-flash-preview';

  onLog?.("msg_accessing_archives", "NETWORK");
  const [trefle, opb, perenual, grounding, gbif, powo, inat, ncsu, vascan] = await Promise.all([
    fetchTrefleData(scientificName).catch(() => null),
    fetchOpenPlantBookData(scientificName).catch(() => null),
    fetchPerenualData(scientificName).catch(() => null),
    searchGroundingData(`how to propagate and repot ${scientificName} successfully`).catch(() => null),
    fetchGbifData(scientificName).catch(() => null),
    fetchPowoData(scientificName).catch(() => null),
    fetchINaturalistData(scientificName).catch(() => null),
    fetchNcsuData(scientificName).catch(() => null),
    fetchVascanData(scientificName).catch(() => null)
  ]);

  onLog?.("msg_harmonizing_data", "GEMINI");
  
  // Limit grounding & open-source data to prevent prompt bloat
  const limitedGrounding = grounding ? {
    organic_results: grounding.organic?.slice(0, 3).map((r: any) => ({ title: r.title, snippet: r.snippet })),
    answerBox: grounding.answerBox
  } : null;

  const openSourceSummary = {
    gbifIucn: gbif?.iucnCategory || null,
    powoLifeform: powo?.lifeform || null,
    powoNative: powo?.distribution?.natives?.slice(0, 12)?.map((n: any) => n.name) || null,
    powoSynonyms: powo?.synonyms?.slice(0, 6)?.map((s: any) => s.name) || null,
    inatFloweringMonths: inat?.floweringHistogram || null,
    ncsu: ncsu ? {
      habit: ncsu.habit,
      soilTexture: ncsu.soilTexture,
      soilPh: ncsu.soilPh,
      soilDrainage: ncsu.soilDrainage,
      toxicPrinciple: ncsu.toxicPrinciple,
      poisonSeverity: ncsu.poisonSeverity,
      poisonSymptoms: ncsu.poisonSymptoms
    } : null,
    vascanHabit: vascan?.habit || null,
    vascanDistribution: vascan?.distribution || null
  };

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
    - GBIF/POWO/iNaturalist/NCSU/VASCAN: ${JSON.stringify(openSourceSummary)}
    - Web Grounding: ${JSON.stringify(limitedGrounding)}
    
    REQUIREMENTS:
    1. Extract: species, scientificAuthor, rank, kingdom (e.g. Plantae), clade (e.g. Tracheophytes → Angiosperms → Eudicots → Asterids), order, family, subfamily, genus, infraspecificTaxa (array of accepted subspecies/varieties if any), wikidataId, ipniLsid, wfoId, tropicosId, usdaSymbol, itisTsn, eppoCode, category, growthRate, maxHeight (cm), maxSpread (cm, mature width), avgHeight (cm), flowers (bool), edible (bool), vegetable (bool), droughtTolerant (bool, from Perenual drought_tolerant or species traits), synonyms (array of botanical synonym strings from Trefle/POWO).
    2. Specs: min/max moisture (%), temp (C), light (Lux), soil EC (minSoilEc, maxSoilEc), humidity (minEnvHumid, maxEnvHumid %), minPh & maxPh (from Trefle main_species.growth.ph_minimum/ph_maximum), minRootDepthCm (from Trefle minimum_root_depth.cm), frostFreeDaysMin (from Trefle frost_free_days_minimum), hardinessZoneMin & hardinessZoneMax (from Perenual hardiness.min/max).
    3. Care & Seasonal Cadence: Estimate 'wateringInterval' (days), 'summerWateringInterval' (days), 'winterWateringInterval' (days), 'repottingFrequency' (months), 'careDifficulty' (Easy/Moderate/Challenging from Perenual care_level), 'windowExposure' (e.g. South / West Bright Indirect from Perenual sunlight), 'potMaterial' (recommended pot material, e.g. Terracotta or Glazed Ceramic), 'dormancyPeriod' (e.g. Winter or None), 'npkRatio' (e.g. "2-7-7" or "10-10-10 Half Strength"), 'bloomSeason' (from Trefle bloom_months or Perenual flowering_season), 'pruningMonths' (from Perenual pruning_month).
    4. Lifecycle, Morphology & Ecology: Synthesize 'propagationMethods' (localized array of strings), 'susceptiblePests' (localized array from Perenual pest_susceptibility or species profile), 'attracts' (localized array of pollinators/wildlife from Perenual attracts), 'nativeRegions' (localized array from Trefle/POWO native distribution), 'introducedRegions' (localized array of introduced/naturalized regions if any), 'foliageTraits', 'flowerTraits', & 'fruitTraits' (concise localized morphological descriptions), 'leafAreaIndex' (string if known, e.g. "~4.5", else null), 'ecologicalFlags' ({ indoor, tropical, thorny, saltTolerant, medicinal, invasive } booleans from Perenual), a detailed 'propagationInstructions' (localized string), and 'repottingInstructions' (localized string). Include 'lastPotSize' (string) and 'citesStatus' (Appendix I, II, or III).
    5. Plant Book / Field Guide Monograph: Provide 'growthHabit' (localized string, e.g. Low-growing, compact, acaulescent herbaceous perennial), 'lifespan' (localized string, e.g. Perennial; reaches maturity in 2–5 years), 'etymology' (localized 1-sentence origin/meaning of the Latin name), 'naturalHabitat' (localized biome/elevation/substrate description), 'culturalSignificance' (localized string detailing folklore, symbolic meaning, and cultural heritage), 'cultivationUses' (localized array of 3-5 practical, landscape, interior, and traditional uses), 'didYouKnow' (localized array of 3-4 surprising botanical facts, evolutionary adaptations, or fascinating trivia), 'flowerType' (localized string detailing inflorescence structure, flower morphology, and bloom characteristics), 'fruitType' (localized string detailing fruit category, seed capsule, and dispersal method), 'specialFeatures' (localized array of 2-4 traits like Fragrant, Variegated, Air-purifying), 'wateringMethod' (localized string detailing soak-and-dry vs bottom-water & tap/rainwater sensitivity), 'feedingSchedule' (localized string detailing spring/summer vs winter cadence), 'trainingAdvice' (localized string on staking, moss pole, or pinching), 'careSpecs' (array of 8-10 structured cultivation rows for Light, Watering, Humidity, Temperature, Soil/Substrate, Soil pH, Potting, Fertilization, Propagation, and Common Pests/Issues, each with localized 'parameter', 'requirement', and 'notes' with diagnostic triggers), and 'troubleshooting' (array of 3 common Symptom -> Cause -> Fix objects with localized strings).
    6. Technical: Suggest 'targetPh', 'targetEc', 'targetVpd', 'targetDli' (use OPB min_light_mmol/max_light_mmol to inform DLI if available).
    7. Localization: Translate ALL localized text fields into these 11 codes: ${TARGET_LANGS.join(',')}.
    8. Toxicity: Detail pet-safety in 'petSafety' (isPetSafe bool from Perenual poisonous_to_pets) AND human-safety in 'humanSafety' (isHumanSafe bool from Perenual poisonous_to_humans).
    9. Soil: Breakdown 'soilComposition' into percentages with localized component names.
    10. Insights: Provide a unique 'aiInsight' about this specimen.
  `;

  try {
    reportSystemHit();
    const response = await callGeminiWithRetry(() => generateGeminiContent({
      model,
      personalApiKey: apiKey,
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
            synonyms: { type: Type.ARRAY, items: { type: Type.STRING } },
            category: translationSchema,
            growthRate: translationSchema,
            maxHeight: { type: Type.INTEGER },
            maxSpread: { type: Type.INTEGER },
            avgHeight: { type: Type.INTEGER },
            flowers: { type: Type.BOOLEAN },
            edible: { type: Type.BOOLEAN },
            vegetable: { type: Type.BOOLEAN },
            droughtTolerant: { type: Type.BOOLEAN },
            isPetSafe: { type: Type.BOOLEAN },
            isHumanSafe: { type: Type.BOOLEAN },
            hardinessZoneMin: { type: Type.STRING },
            hardinessZoneMax: { type: Type.STRING },
            minPh: { type: Type.NUMBER },
            maxPh: { type: Type.NUMBER },
            minRootDepthCm: { type: Type.INTEGER },
            frostFreeDaysMin: { type: Type.INTEGER },
            ecologicalFlags: {
              type: Type.OBJECT,
              properties: {
                indoor: { type: Type.BOOLEAN },
                tropical: { type: Type.BOOLEAN },
                thorny: { type: Type.BOOLEAN },
                saltTolerant: { type: Type.BOOLEAN },
                medicinal: { type: Type.BOOLEAN },
                invasive: { type: Type.BOOLEAN }
              }
            },
            wateringInterval: { type: Type.INTEGER },
            summerWateringInterval: { type: Type.INTEGER },
            winterWateringInterval: { type: Type.INTEGER },
            repottingFrequency: { type: Type.INTEGER },
            lastPotSize: { type: Type.STRING },
            npkRatio: { type: Type.STRING },
            careDifficulty: translationSchema,
            potMaterial: translationSchema,
            windowExposure: translationSchema,
            dormancyPeriod: translationSchema,
            bloomSeason: translationSchema,
            pruningMonths: translationSchema,
            foliageTraits: translationSchema,
            flowerTraits: translationSchema,
            humanSafety: translationSchema,
            growthHabit: translationSchema,
            lifespan: translationSchema,
            etymology: translationSchema,
            naturalHabitat: translationSchema,
            wateringMethod: translationSchema,
            feedingSchedule: translationSchema,
            trainingAdvice: translationSchema,
            specialFeatures: {
              type: Type.OBJECT,
              properties: TARGET_LANGS.reduce((a:any, l) => ({...a, [l]: {type: Type.ARRAY, items: {type: Type.STRING}}}), {}),
              required: TARGET_LANGS
            },
            troubleshooting: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  symptom: translationSchema,
                  cause: translationSchema,
                  fix: translationSchema
                }
              }
            },
            susceptiblePests: {
              type: Type.OBJECT,
              properties: TARGET_LANGS.reduce((a:any, l) => ({...a, [l]: {type: Type.ARRAY, items: {type: Type.STRING}}}), {}),
              required: TARGET_LANGS
            },
            attracts: {
              type: Type.OBJECT,
              properties: TARGET_LANGS.reduce((a:any, l) => ({...a, [l]: {type: Type.ARRAY, items: {type: Type.STRING}}}), {}),
              required: TARGET_LANGS
            },
            nativeRegions: {
              type: Type.OBJECT,
              properties: TARGET_LANGS.reduce((a:any, l) => ({...a, [l]: {type: Type.ARRAY, items: {type: Type.STRING}}}), {}),
              required: TARGET_LANGS
            },
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
            minSoilEc: { type: Type.NUMBER },
            maxSoilEc: { type: Type.NUMBER },
            minEnvHumid: { type: Type.INTEGER },
            maxEnvHumid: { type: Type.INTEGER },
            nickname: translationSchema,
            description: translationSchema,
            aiInsight: translationSchema,
            commonNames: {
              type: Type.OBJECT,
              properties: TARGET_LANGS.reduce((a:any, l) => ({...a, [l]: {type: Type.ARRAY, items: {type: Type.STRING}}}), {}),
              required: TARGET_LANGS
            },
            petSafety: translationSchema,
            toxicPrinciple: translationSchema,
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
            },
            kingdom: { type: Type.STRING },
            clade: { type: Type.STRING },
            order: { type: Type.STRING },
            subfamily: { type: Type.STRING },
            infraspecificTaxa: { type: Type.ARRAY, items: { type: Type.STRING } },
            wikidataId: { type: Type.STRING },
            ipniLsid: { type: Type.STRING },
            wfoId: { type: Type.STRING },
            tropicosId: { type: Type.STRING },
            usdaSymbol: { type: Type.STRING },
            itisTsn: { type: Type.STRING },
            eppoCode: { type: Type.STRING },
            introducedRegions: {
              type: Type.OBJECT,
              properties: TARGET_LANGS.reduce((a:any, l) => ({...a, [l]: {type: Type.ARRAY, items: {type: Type.STRING}}}), {}),
              required: TARGET_LANGS
            },
            fruitTraits: translationSchema,
            leafAreaIndex: { type: Type.STRING },
            culturalSignificance: translationSchema,
            cultivationUses: {
              type: Type.OBJECT,
              properties: TARGET_LANGS.reduce((a:any, l) => ({...a, [l]: {type: Type.ARRAY, items: {type: Type.STRING}}}), {}),
              required: TARGET_LANGS
            },
            flowerType: translationSchema,
            fruitType: translationSchema,
            didYouKnow: {
              type: Type.OBJECT,
              properties: TARGET_LANGS.reduce((a:any, l) => ({...a, [l]: {type: Type.ARRAY, items: {type: Type.STRING}}}), {}),
              required: TARGET_LANGS
            },
            careSpecs: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  parameter: translationSchema,
                  requirement: translationSchema,
                  notes: translationSchema
                }
              }
            }
          }
        }
      }
    }));

    if (response.usageMetadata) {
      const totalTokens = (response.usageMetadata.promptTokenCount || 0) + (response.usageMetadata.candidatesTokenCount || 0);
      trackUsage('gemini', totalTokens);
    } else {
      trackUsage('gemini');
    }

    const parsed = JSON.parse(cleanJson(response.text || "{}"));
    const fallbackApiImage = opb?.image_url || trefle?.image_url || perenual?.default_image?.medium_url || perenual?.default_image?.regular_url || inat?.taxon?.default_photo?.medium_url;
    const catEn = (parsed?.category?.en || '').toLowerCase();
    const habitEn = (parsed?.growthHabit?.en || '').toLowerCase();
    const inferredSpecimenType: 'PLANT' | 'TREE' = (
      catEn.includes('tree') ||
      habitEn.includes('tree') ||
      (powo?.lifeform || '').toLowerCase().includes('tree') ||
      (vascan?.habit || '').toLowerCase().includes('tree') ||
      (ncsu?.plantType || '').toLowerCase().includes('tree')
    ) ? 'TREE' : 'PLANT';

    const autoCategory = inferPlantCategory({
      species: scientificName,
      nickname: parsed?.nickname,
      family: parsed?.family || opb?.family || trefle?.family || gbif?.family,
      genus: parsed?.genus || trefle?.genus || gbif?.genus,
      category: parsed?.category,
      growthHabit: parsed?.growthHabit,
      lifeform: powo?.lifeform || vascan?.habit,
      growthForm: ncsu?.plantType,
      specimenType: inferredSpecimenType
    });
    parsed.category = autoCategory;

    return createPlant({
        ...parsed,
        trefleId: trefle?.id,
        opbId: opb?.pid,
        perenualId: perenual?.id || null,
        gbifId: gbif?.gbifId || null,
        powoId: powo?.fqId || null,
        iucnStatus: gbif?.iucnCategory || null,
        inaturalistId: inat?.inaturalistId || null,
        ncsuUrl: ncsu?.url || null,
        vascanId: vascan?.vascanId || null,
        cultivars: ncsu?.cultivars || [],
        canadianProvinces: vascan?.distribution || [],
        specimenType: inferredSpecimenType,
        images: base64Image ? [base64Image] : (fallbackApiImage ? [fallbackApiImage] : [])
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

  const resolvedCategory = (data.category && (typeof data.category === 'string' ? (data.category as string).trim() : Object.values(data.category).some(v => typeof v === 'string' && v.trim())))
    ? inferPlantCategory({ ...data, category: data.category })
    : inferPlantCategory(data);

  return {
    id: data.id || `p-${generateUUID()}`,
    species: data.species || 'Unknown Species',
    nickname: data.nickname || { en: data.species || 'New Specimen' },
    commonNames: data.commonNames || emptyLocalizedArray,
    family: data.family || null,
    genus: data.genus || null,
    scientificAuthor: data.scientificAuthor || null,
    rank: data.rank || 'species',
    category: resolvedCategory,
    
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
    maxSoilEc: data.maxSoilEc || null,
    minEnvHumid: data.minEnvHumid || null,
    maxEnvHumid: data.maxEnvHumid || null,
    
    wateringInterval: data.wateringInterval || 7,
    summerWateringInterval: data.summerWateringInterval || null,
    winterWateringInterval: data.winterWateringInterval || null,
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
    houseId: data.houseId || null,

    careDifficulty: data.careDifficulty || null,
    potMaterial: data.potMaterial || null,
    windowExposure: data.windowExposure || null,
    dormancyPeriod: data.dormancyPeriod || null,
    npkRatio: data.npkRatio || null,
    susceptiblePests: data.susceptiblePests || emptyLocalizedArray,
    bloomSeason: data.bloomSeason || null,
    pruningMonths: data.pruningMonths || null,
    droughtTolerant: data.droughtTolerant ?? false,

    perenualId: data.perenualId || null,
    hardinessZoneMin: data.hardinessZoneMin || null,
    hardinessZoneMax: data.hardinessZoneMax || null,
    isHumanSafe: data.isHumanSafe ?? true,
    humanSafety: data.humanSafety || emptyLocalized,
    minPh: data.minPh || null,
    maxPh: data.maxPh || null,
    minRootDepthCm: data.minRootDepthCm || null,
    frostFreeDaysMin: data.frostFreeDaysMin || null,
    foliageTraits: data.foliageTraits || null,
    flowerTraits: data.flowerTraits || null,
    attracts: data.attracts || emptyLocalizedArray,
    nativeRegions: data.nativeRegions || emptyLocalizedArray,
    synonyms: data.synonyms || [],
    ecologicalFlags: data.ecologicalFlags || {},

    maxSpread: data.maxSpread || null,
    growthHabit: data.growthHabit || null,
    lifespan: data.lifespan || null,
    etymology: data.etymology || null,
    naturalHabitat: data.naturalHabitat || null,
    specialFeatures: data.specialFeatures || emptyLocalizedArray,
    wateringMethod: data.wateringMethod || null,
    feedingSchedule: data.feedingSchedule || null,
    trainingAdvice: data.trainingAdvice || null,
    troubleshooting: data.troubleshooting || [],

    specimenType: data.specimenType || 'PLANT',
    iucnStatus: data.iucnStatus || null,
    inaturalistId: data.inaturalistId || null,
    ncsuUrl: data.ncsuUrl || null,
    vascanId: data.vascanId || null,
    toxicPrinciple: data.toxicPrinciple || null,
    cultivars: data.cultivars || [],
    canadianProvinces: data.canadianProvinces || [],

    kingdom: data.kingdom || null,
    clade: data.clade || null,
    order: data.order || null,
    subfamily: data.subfamily || null,
    infraspecificTaxa: data.infraspecificTaxa || [],
    wikidataId: data.wikidataId || null,
    ipniLsid: data.ipniLsid || null,
    wfoId: data.wfoId || null,
    tropicosId: data.tropicosId || null,
    usdaSymbol: data.usdaSymbol || null,
    itisTsn: data.itisTsn || null,
    eppoCode: data.eppoCode || null,
    introducedRegions: data.introducedRegions || emptyLocalizedArray,
    fruitTraits: data.fruitTraits || null,
    leafAreaIndex: data.leafAreaIndex || null,
    careSpecs: data.careSpecs || [],
    culturalSignificance: data.culturalSignificance || null,
    cultivationUses: data.cultivationUses || null,
    flowerType: data.flowerType || null,
    fruitType: data.fruitType || null,
    didYouKnow: data.didYouKnow || null
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
    const response = await callGeminiWithRetry(() => generateGeminiContent({
      model,
      personalApiKey: apiKey,
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

    if (response.usageMetadata) {
      const totalTokens = (response.usageMetadata.promptTokenCount || 0) + (response.usageMetadata.candidatesTokenCount || 0);
      trackUsage('gemini', totalTokens);
    } else {
      trackUsage('gemini');
    }

    const text = response.text;
    if (!text) return null;
    return JSON.parse(cleanJson(text));
  } catch (error) {
    console.error("Diagnostic Failure:", error);
    return null;
  }
};

/**
 * 5. Refresh Botanical Data for an existing Plant or Tree
 * Queries the unified Botanical Aggregator & AI Harmonizer while preserving user logs, photos, and house assignment.
 */
export const refreshPlantRecord = async (
  plant: Plant,
  apiKey?: string
): Promise<Partial<Plant>> => {
  const query = (plant.species || plant.nickname?.en || Object.values(plant.nickname || {})[0] || '').trim();
  if (!query) {
    throw new Error('Species or plant name is required to refresh botanical data.');
  }

  const [aggregated, aiDetails] = await Promise.all([
    fetchAggregatedSpeciesData(query).catch(() => null),
    generatePlantDetails(query, undefined, undefined, apiKey).catch(() => null)
  ]);

  if (!aggregated && !aiDetails) {
    throw new Error(`Could not retrieve updated botanical data for "${query}".`);
  }

  const aggUpdates: Partial<Plant> = {};
  if (aggregated) {
    if (aggregated.scientificName) aggUpdates.species = aggregated.scientificName;
    if (aggregated.authority) aggUpdates.scientificAuthor = aggregated.authority;
    if (aggregated.family) aggUpdates.family = aggregated.family;
    if (aggregated.genus) aggUpdates.genus = aggregated.genus;
    if (Array.isArray(aggregated.synonyms) && aggregated.synonyms.length > 0) {
      aggUpdates.synonyms = aggregated.synonyms;
    }
    if (aggregated.traits?.hardinessZoneMin) aggUpdates.hardinessZoneMin = String(aggregated.traits.hardinessZoneMin);
    if (aggregated.traits?.hardinessZoneMax) aggUpdates.hardinessZoneMax = String(aggregated.traits.hardinessZoneMax);
    if (aggregated.traits?.droughtTolerant !== undefined && aggregated.traits?.droughtTolerant !== null) {
      aggUpdates.droughtTolerant = Boolean(aggregated.traits.droughtTolerant);
    }
    if (aggregated.traits?.soilPhMin !== undefined) aggUpdates.minPh = aggregated.traits.soilPhMin;
    if (aggregated.traits?.soilPhMax !== undefined) aggUpdates.maxPh = aggregated.traits.soilPhMax;
    if (aggregated.conservation?.iucnCategory) aggUpdates.iucnStatus = aggregated.conservation.iucnCategory;
    if (aggregated.sourceIds?.vascan) {
      const parsedVascan = Number(aggregated.sourceIds.vascan);
      if (Number.isFinite(parsedVascan)) aggUpdates.vascanId = parsedVascan;
    }
    if (aggregated.sourceIds?.gbif) aggUpdates.gbifId = aggregated.sourceIds.gbif;
    if (aggregated.sourceIds?.powo) aggUpdates.powoId = String(aggregated.sourceIds.powo);
    if (aggregated.sourceIds?.wfo) aggUpdates.wfoId = String(aggregated.sourceIds.wfo);
    if (aggregated.sourceIds?.usdaSymbol) aggUpdates.usdaSymbol = String(aggregated.sourceIds.usdaSymbol);
    if (aggregated.sourceIds?.wikidata) aggUpdates.wikidataId = String(aggregated.sourceIds.wikidata);
    if (aggregated.sourceIds?.ipniLsid) aggUpdates.ipniLsid = String(aggregated.sourceIds.ipniLsid);
    if (aggregated.sourceIds?.tropicos) aggUpdates.tropicosId = String(aggregated.sourceIds.tropicos);
    if (aggregated.sourceIds?.itisTsn) aggUpdates.itisTsn = String(aggregated.sourceIds.itisTsn);
    if (aggregated.sourceIds?.eppoCode) aggUpdates.eppoCode = String(aggregated.sourceIds.eppoCode);
    if (aggregated.sourceIds?.inaturalist) aggUpdates.inaturalistId = Number(aggregated.sourceIds.inaturalist);
    if (aggregated.distribution?.countriesNative && aggregated.distribution.countriesNative.length > 0) {
      aggUpdates.nativeRegions = { en: aggregated.distribution.countriesNative };
      aggUpdates.origin = { en: aggregated.distribution.countriesNative.slice(0, 4).join(', ') };
    }
    if (aggregated.distribution?.countriesIntroduced && aggregated.distribution.countriesIntroduced.length > 0) {
      aggUpdates.introducedRegions = { en: aggregated.distribution.countriesIntroduced };
    }
    if (aggregated.distribution?.canadianProvinces && typeof aggregated.distribution.canadianProvinces === 'object') {
      aggUpdates.canadianProvinces = Object.entries(aggregated.distribution.canadianProvinces).map(
        ([prov, status]) => `${prov}: ${status}`
      );
    }
    if (aggregated.traits?.growthHabit) {
      aggUpdates.growthHabit = { en: aggregated.traits.growthHabit };
    }
    if (aggregated.taxonomy?.lifeform) {
      aggUpdates.growthHabit = aggUpdates.growthHabit || { en: aggregated.taxonomy.lifeform };
    }
  }

  // Determine specimenType ('TREE' vs 'PLANT') using authoritative botanical analysis
  const isTree = isPlantTree({
    ...plant,
    ...(aiDetails || {}),
    ...aggUpdates,
  });
  const resolvedSpecimenType: 'TREE' | 'PLANT' = isTree ? 'TREE' : 'PLANT';

  const resolvedCategory = inferPlantCategory({
    ...plant,
    ...(aiDetails || {}),
    ...aggUpdates,
    specimenType: resolvedSpecimenType,
    category: aiDetails?.category || plant.category
  });

  const merged: Partial<Plant> = {
    ...(aiDetails || {}),
    ...aggUpdates,
    category: resolvedCategory,
    specimenType: resolvedSpecimenType,
    // Preserve user-owned & specimen-identity fields
    nickname: plant.nickname,
    images: plant.images,
    logs: plant.logs,
    houseId: plant.houseId,
    room: plant.room,
    provenance: plant.provenance,
    lastWatered: plant.lastWatered,
    lastRotated: plant.lastRotated,
    lastPotSize: plant.lastPotSize,
    lastPotSizeCm: plant.lastPotSizeCm,
    lastPotSizeInches: plant.lastPotSizeInches,
    isPriority: plant.isPriority,
    updatedAt: new Date().toISOString(),
    lastModified: new Date().toISOString(),
  };

  return merged;
};

