export interface LocalizedString {
  en: string;
  zh?: string; // Mandarin
  ja?: string; // Japanese
  ko?: string; // Korean
  es?: string; // Spanish
  fr?: string; // French
  pt?: string; // Portuguese
  de?: string; // German
  id?: string; // Indonesian
  vi?: string; // Vietnamese
  tl?: string; // Tagalog
  [key: string]: string | undefined;
}

export interface LocalizedArray {
  en?: string[];
  zh?: string[];
  ja?: string[];
  ko?: string[];
  es?: string[];
  fr?: string[];
  pt?: string[];
  de?: string[];
  id?: string[];
  vi?: string[];
  tl?: string[];
  [key: string]: string[] | undefined;
}

export type UserRole = 'OWNER' | 'CO_CEO' | 'LEAD_HAND' | 'GARDENER' | 'SEASONAL';

export interface User {
  id: string;
  email: string;
  name: string | null;
  role: UserRole; 
  googleId?: string | null;
  houseId?: string | null;
  house?: House;
  caretakerStart?: string; // Access start for Seasonal
  caretakerEnd?: string;   // Access end for Seasonal
  createdAt?: string;
  deletedAt?: string | null;
  personalAiKey?: string; // Owner/CEO personal key
  personalAiKeyTestedAt?: string; // Verification timestamp
}

export interface House {
  id: string;
  name: LocalizedString;
  createdAt?: string;
  deletedAt?: string | null;
  aiKeyTestedAt?: string; // Verification timestamp
  _count?: {
    users: number;
    plants: number;
  };
}

export type LogType = 'WATER' | 'MOISTURE' | 'NOTE' | 'NEW_LEAF' | 'FLOWER' | 'REPOTTED' | 'PRUNED' | 'IMAGE' | 'FERTILIZED' | 'DISEASE_CHECK' | 'PHENOPHASE' | 'ROTATED';

export type PhenophaseType = 'FIRST_BUD' | 'FULL_BLOOM' | 'SEED_SET' | 'DORMANCY_ENTRANCE' | 'FIRST_LEAF_SPRING' | 'BUDDING' | 'IN_FLOWER' | 'DORMANCY_START';

export interface Log {
  id: string;
  date: string;
  type: LogType;
  value?: number;
  note?: string; 
  localizedNote?: LocalizedString;
  imageUrl?: string;
  metadata?: any;
  authorId?: string; // Who logged this
}

export interface Plant {
  id: string;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
  houseId?: string | null;
  room?: LocalizedString | string | null; 
  
  // --- 1. IDENTIFICATION & TAXONOMY ---
  species: string;
  nickname: LocalizedString;
  commonNames?: LocalizedArray; 
  family?: string | null;
  genus?: string | null;
  scientificAuthor?: string | null;
  rank?: string | null; // species, variety, hybrid
  slug?: string | null;
  category?: LocalizedString | null;
  
  // External Database Linkage
  trefleId?: number | null;
  opbId?: string | null; // PID
  plantnetId?: string | null;
  gbifId?: number | string | null;
  powoId?: string | null;

  // AI Guidance
  aiInsight?: LocalizedString;
  lightAdvice?: LocalizedString;
  tempAdvice?: LocalizedString;
  moistureAdvice?: LocalizedString;
  nutritionAdvice?: LocalizedString;
  humidityAdvice?: LocalizedString;
  petSafety?: LocalizedString;
  isPetSafe?: boolean;
  
  // --- 2. BIOLOGY & STATS ---
  origin?: LocalizedString;
  distribution?: LocalizedString;
  growthRate?: LocalizedString | null; // Slow, Moderate, Rapid
  maxHeight?: number | null;
  avgHeight?: number | null;
  edible: boolean;
  vegetable?: boolean;
  flowers?: boolean;
  nativeCoordinates?: { lat: number; lng: number }[]; 
  soilComposition?: { component: LocalizedString; percent: number }[];
  images: string[];

  // --- 3. CARE THRESHOLDS (OpenPlantBook Specs) ---
  minSoilMoist?: number | null;
  maxSoilMoist?: number | null;
  minTemp?: number | null;
  maxTemp?: number | null;
  minLightLux?: number | null;
  maxLightLux?: number | null;
  minSoilEc?: number | null;
  maxSoilEc?: number | null;
  minEnvHumid?: number | null;
  maxEnvHumid?: number | null;
  
  // --- 4. CARE SCALES (Trefle 0-10) ---
  lightScale?: number | null;
  atmosphericHumidityScale?: number | null;
  groundHumidityScale?: number | null;
  soilNutrimentsScale?: number | null;
  soilSalinityScale?: number | null;

  // --- 5. CORE RECURRENCE ---
  wateringInterval?: number | null;
  lastWatered?: string | null;
  lastModified?: string;
  snoozedUntil?: string | null;
  
  description?: LocalizedString;
  logs?: Log[];

  // Identification Metadata
  identificationScore?: number;
  identifiedOrgan?: string;

  // --- 6. ADVANCED BIOLOGY & LIFECYCLE ---
  propagationMethods?: LocalizedArray;
  propagationInstructions?: LocalizedString;
  repottingInstructions?: LocalizedString;
  targetPh?: number | null;
  targetEc?: number | null;
  citesStatus?: LocalizedString | null;
  provenance?: {
    nursery?: string;
    dateOfPurchase?: string;
    cost?: number;
    currency?: string;
  };
  repottingFrequency?: number | null; // in months
  lastPotSize?: string | null;
  lastPotSizeInches?: number | null;
  lastPotSizeCm?: number | null;
  
  // Advanced Technical Metrics Targets
  targetVpd?: number | null;
  targetDli?: number | null;
  rotationFrequency?: number | null; // in days
  lastRotated?: string | null;
  healthStatus?: string | null;
  variety?: string | null;
  isPriority?: boolean;
}

export type RecurrenceType = 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY';

export interface RecurrenceSettings {
  type: RecurrenceType;
  hour?: number;
  minute?: number;
  dayOfWeek?: number; // 0 (Sun) to 6 (Sat)
  dayOfMonth?: number; // 1 to 31
}

export interface Task {
  id: string;
  title: LocalizedString;
  description?: LocalizedString;
  type?: 'WATER' | 'FERTILIZE' | 'REPOT' | 'PRUNE' | 'GENERAL';
  date: string;
  plantIds: string[];
  completed: boolean;
  completedAt?: string;
  deletedAt?: string | null;
  recurrence?: RecurrenceSettings;
  notificationId?: string;
  houseId?: string | null;
}

export type InventoryCategory = 'tools' | 'insecticide' | 'fungicide' | 'pesticide' | 'fertiliser' | 'seeds' | 'soil' | 'accessories' | 'pots' | 'saucers' | 'custom-mix';

export type CustomMixType = 'general' | 'soil' | 'fertiliser' | 'insecticide' | 'fungicide' | 'pesticide';

export type ContainerType = 'hdpe_jug' | 'jerry_can' | 'bag_in_box' | 'spray_bottle' | 'pressure_sprayer' | 'bucket' | 'tote' | 'none';

export type PotType = 'terra_cotta' | 'ceramic' | 'plastic' | 'concrete' | 'air_pot' | 'hanging_planter' | 'wood_box' | 'fiberglass';

export interface InventoryIngredient {
  name: LocalizedString;
  quantity: number;
  unit: string;
}

export interface InventoryItem {
  id: string;
  category: InventoryCategory;
  name: LocalizedString;
  brand?: LocalizedString;
  description?: LocalizedString;
  quantity: number;
  unit: string;
  images: string[];
  associatedPlantId?: string;
  houseId?: string | null;
  deletedAt?: string | null;

  model?: string;
  applicationUsage?: LocalizedString;
  compatibility?: LocalizedArray;
  instructions?: LocalizedString;
  soilTypes?: LocalizedArray;
  
  potType?: PotType;
  potColor?: string;
  sizeInches?: number;
  sizeCm?: number;
  openingHoleSize?: string;
  depth?: string;
  material?: string;
  color?: string;
  drainageCapability?: string;

  mixType?: CustomMixType;
  containerType?: ContainerType;
  containerColor?: string;
  ingredients?: InventoryIngredient[];
}

export interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
}