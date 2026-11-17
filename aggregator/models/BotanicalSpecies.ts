export type SpecimenHabit = 'PLANT' | 'TREE' | 'SHRUB' | 'VINE' | 'HERB';

export type CanadianDistributionStatus =
  | 'native'
  | 'introduced'
  | 'ephemeral'
  | 'extirpated'
  | 'excluded'
  | 'doubtful';

export interface BotanicalProvenance {
  provider: string;
  authorityRank: number;
  updatedAt: string;
}

export interface MunicipalTreeRecord {
  id?: string;
  species: string;
  genus?: string | null;
  commonName?: string | null;
  dbhCm?: number | null;
  latitude: number;
  longitude: number;
  municipality: string;
  neighborhood?: string | null;
}

export interface BotanicalSpecies {
  id: string;
  scientificName: string;
  canonicalName: string;
  authority?: string | null;
  rank?: string | null;
  kingdom?: string | null;
  phylum?: string | null;
  class?: string | null;
  order?: string | null;
  family?: string | null;
  genus?: string | null;
  specimenType: SpecimenHabit;

  synonyms: string[];
  commonNames: {
    en: string[];
    fr: string[];
    other?: Record<string, string[]>;
  };

  ecologicalTraits: {
    hardinessZoneMin?: string | null;
    hardinessZoneMax?: string | null;
    canadianHardinessZone?: string | null;
    light: string[];
    waterNeeds?: string | null;
    droughtTolerance?: string | null;
    shadeTolerance?: string | null;
    wetlandIndicator?: string | null;
    soilPreferences: string[];
    phMin?: number | null;
    phMax?: number | null;
    growthForm?: string | null;
    lifeform?: string | null;
    maxHeightCm?: number | null;
    woodDensity?: string | null;
    leafTraits?: string | null;
    associatedPests: string[];
  };

  distribution: {
    canadianProvinces: Record<string, CanadianDistributionStatus>;
    countriesNative: string[];
    countriesIntroduced: string[];
    gbifOccurrenceCount?: number | null;
    sampleCoordinates: { lat: number; lng: number }[];
  };

  conservation: {
    iucnCategory?: string | null;
    citesAppendix?: string | null;
    bgciCountryEndemic?: boolean | null;
  };

  cultivation: {
    wateringIntervalDays?: number | null;
    sunlight: string[];
    soilType: string[];
    cultivars: string[];
    description?: string | null;
  };

  municipalSummary?: {
    totalRecordedTrees: number;
    municipalities: string[];
    avgDbhCm?: number | null;
  };

  sourceIds: {
    vascan?: number | null;
    gbif?: number | null;
    powo?: string | null;
    wfo?: string | null;
    usdaSymbol?: string | null;
    nrcanTidcf?: string | null;
    perenual?: number | null;
    trefle?: number | null;
    openfarm?: string | null;
    bgci?: string | null;
    trySpeciesId?: string | null;
  };

  provenance: Record<string, BotanicalProvenance>;
}

export interface BotanicalProvider {
  readonly name: string;
  readonly authorityRank: number;
  searchByName(query: string): Promise<Partial<BotanicalSpecies> | null>;
  getById(id: string | number): Promise<Partial<BotanicalSpecies> | null>;
  syncBulk(input?: unknown): Promise<number>;
}
