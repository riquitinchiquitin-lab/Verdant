import { BotanicalProvider, BotanicalSpecies } from '../models/BotanicalSpecies';
import { CacheStore } from '../cache/CacheStore';
import { VascanProvider } from '../providers/VascanProvider';
import { PowoProvider } from '../providers/PowoProvider';
import { GbifProvider } from '../providers/GbifProvider';
import { UsdaWfoProvider } from '../providers/UsdaWfoProvider';
import { NrcanTreeProvider } from '../providers/NrcanTreeProvider';
import { BgciTryProvider } from '../providers/BgciTryProvider';
import { HorticulturalProvider } from '../providers/HorticulturalProvider';
import { MunicipalForestryProvider } from '../providers/MunicipalForestryProvider';

const dedupeStrings = (arr: (string | null | undefined)[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of arr) {
    const clean = item?.trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(clean);
    }
  }
  return out;
};

export interface ProviderContribution {
  provider: BotanicalProvider;
  data: Partial<BotanicalSpecies>;
}

export class BotanicalAggregatorService {
  readonly cache: CacheStore;
  readonly vascan: VascanProvider;
  readonly powo: PowoProvider;
  readonly gbif: GbifProvider;
  readonly usdaWfo: UsdaWfoProvider;
  readonly nrcan: NrcanTreeProvider;
  readonly bgciTry: BgciTryProvider;
  readonly horticultural: HorticulturalProvider;
  readonly municipal: MunicipalForestryProvider;
  readonly providers: BotanicalProvider[];

  constructor(cache?: CacheStore) {
    this.cache = cache || new CacheStore();
    this.vascan = new VascanProvider(this.cache);
    this.powo = new PowoProvider(this.cache);
    this.gbif = new GbifProvider(this.cache);
    this.usdaWfo = new UsdaWfoProvider(this.cache);
    this.nrcan = new NrcanTreeProvider(this.cache);
    this.bgciTry = new BgciTryProvider(this.cache);
    this.horticultural = new HorticulturalProvider(this.cache);
    this.municipal = new MunicipalForestryProvider(this.cache);

    this.providers = [
      this.powo,
      this.vascan,
      this.usdaWfo,
      this.gbif,
      this.nrcan,
      this.bgciTry,
      this.horticultural,
      this.municipal,
    ];
  }

  /**
   * Resolves common names (EN/FR), cultivars, or synonyms via VASCAN & GBIF first
   */
  async resolveCanonicalName(query: string): Promise<{
    canonicalName: string;
    vascanMatch: Partial<BotanicalSpecies> | null;
    gbifMatch: Partial<BotanicalSpecies> | null;
  }> {
    const cleaned = query.replace(/['"][^'"]+['"]/g, '').trim();
    const [vascanMatch, gbifMatch] = await Promise.all([
      this.vascan.searchByName(cleaned).catch(() => null),
      this.gbif.searchByName(cleaned).catch(() => null),
    ]);

    const canonicalName =
      vascanMatch?.canonicalName ||
      gbifMatch?.canonicalName ||
      cleaned;

    return { canonicalName, vascanMatch, gbifMatch };
  }

  /**
   * Queries all providers concurrently and merges by authorityRank
   */
  async aggregateByName(query: string): Promise<BotanicalSpecies> {
    const { canonicalName, vascanMatch, gbifMatch } = await this.resolveCanonicalName(query);

    const remainingProviders = this.providers.filter(
      p => p.name !== 'VASCAN' && p.name !== 'GBIF'
    );

    const settled = await Promise.allSettled(
      remainingProviders.map(async (provider) => {
        const data = await provider.searchByName(canonicalName);
        return data ? { provider, data } : null;
      })
    );

    const contributions: ProviderContribution[] = [];
    if (vascanMatch) contributions.push({ provider: this.vascan, data: vascanMatch });
    if (gbifMatch) contributions.push({ provider: this.gbif, data: gbifMatch });

    for (const res of settled) {
      if (res.status === 'fulfilled' && res.value) {
        contributions.push(res.value);
      }
    }

    return this.mergeContributions(canonicalName, contributions);
  }

  async getByProviderId(providerName: string, id: string | number): Promise<Partial<BotanicalSpecies> | null> {
    const provider = this.providers.find(p => p.name.toLowerCase() === providerName.toLowerCase());
    if (!provider) return null;
    return provider.getById(id);
  }

  /**
   * Authority-aware merge: higher authorityRank fields are never overwritten by lower authority sources.
   */
  mergeContributions(fallbackName: string, contributions: ProviderContribution[]): BotanicalSpecies {
    const sorted = [...contributions].sort((a, b) => b.provider.authorityRank - a.provider.authorityRank);
    const now = new Date().toISOString();

    const merged: BotanicalSpecies = {
      id: fallbackName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      scientificName: fallbackName,
      canonicalName: fallbackName,
      authority: null,
      rank: null,
      kingdom: null,
      phylum: null,
      class: null,
      order: null,
      family: null,
      genus: null,
      specimenType: 'PLANT',
      synonyms: [],
      commonNames: { en: [], fr: [] },
      ecologicalTraits: {
        light: [],
        soilPreferences: [],
        associatedPests: [],
      },
      distribution: {
        canadianProvinces: {},
        countriesNative: [],
        countriesIntroduced: [],
        gbifOccurrenceCount: null,
        sampleCoordinates: [],
      },
      conservation: {
        iucnCategory: null,
        citesAppendix: null,
        bgciCountryEndemic: null,
      },
      cultivation: {
        sunlight: [],
        soilType: [],
        cultivars: [],
        description: null,
      },
      sourceIds: {},
      provenance: {},
    };

    const setIfHigher = <K extends keyof BotanicalSpecies>(
      field: K,
      value: BotanicalSpecies[K] | null | undefined,
      provider: BotanicalProvider
    ) => {
      if (value === undefined || value === null || value === '') return;
      const existingRank = merged.provenance[String(field)]?.authorityRank ?? -1;
      if (provider.authorityRank > existingRank) {
        merged[field] = value as BotanicalSpecies[K];
        merged.provenance[String(field)] = {
          provider: provider.name,
          authorityRank: provider.authorityRank,
          updatedAt: now,
        };
      }
    };

    for (const { provider, data } of sorted) {
      setIfHigher('scientificName', data.scientificName, provider);
      setIfHigher('canonicalName', data.canonicalName, provider);
      setIfHigher('authority', data.authority, provider);
      setIfHigher('rank', data.rank, provider);
      setIfHigher('kingdom', data.kingdom, provider);
      setIfHigher('phylum', data.phylum, provider);
      setIfHigher('class', data.class, provider);
      setIfHigher('order', data.order, provider);
      setIfHigher('family', data.family, provider);
      setIfHigher('genus', data.genus, provider);

      if (data.specimenType && data.specimenType !== 'PLANT') {
        setIfHigher('specimenType', data.specimenType, provider);
      }

      if (data.synonyms?.length) {
        merged.synonyms = dedupeStrings([...merged.synonyms, ...data.synonyms]);
      }
      if (data.commonNames?.en?.length) {
        merged.commonNames.en = dedupeStrings([...merged.commonNames.en, ...data.commonNames.en]);
      }
      if (data.commonNames?.fr?.length) {
        merged.commonNames.fr = dedupeStrings([...merged.commonNames.fr, ...data.commonNames.fr]);
      }

      if (data.ecologicalTraits) {
        const et = data.ecologicalTraits;
        merged.ecologicalTraits.hardinessZoneMin ??= et.hardinessZoneMin ?? null;
        merged.ecologicalTraits.hardinessZoneMax ??= et.hardinessZoneMax ?? null;
        merged.ecologicalTraits.canadianHardinessZone ??= et.canadianHardinessZone ?? null;
        merged.ecologicalTraits.waterNeeds ??= et.waterNeeds ?? null;
        merged.ecologicalTraits.droughtTolerance ??= et.droughtTolerance ?? null;
        merged.ecologicalTraits.shadeTolerance ??= et.shadeTolerance ?? null;
        merged.ecologicalTraits.wetlandIndicator ??= et.wetlandIndicator ?? null;
        merged.ecologicalTraits.phMin ??= et.phMin ?? null;
        merged.ecologicalTraits.phMax ??= et.phMax ?? null;
        merged.ecologicalTraits.growthForm ??= et.growthForm ?? null;
        merged.ecologicalTraits.lifeform ??= et.lifeform ?? null;
        merged.ecologicalTraits.maxHeightCm ??= et.maxHeightCm ?? null;
        merged.ecologicalTraits.woodDensity ??= et.woodDensity ?? null;
        merged.ecologicalTraits.leafTraits ??= et.leafTraits ?? null;

        if (et.light?.length) merged.ecologicalTraits.light = dedupeStrings([...merged.ecologicalTraits.light, ...et.light]);
        if (et.soilPreferences?.length) merged.ecologicalTraits.soilPreferences = dedupeStrings([...merged.ecologicalTraits.soilPreferences, ...et.soilPreferences]);
        if (et.associatedPests?.length) merged.ecologicalTraits.associatedPests = dedupeStrings([...merged.ecologicalTraits.associatedPests, ...et.associatedPests]);
      }

      if (data.distribution) {
        const dist = data.distribution;
        Object.assign(merged.distribution.canadianProvinces, dist.canadianProvinces);
        if (dist.countriesNative?.length) {
          merged.distribution.countriesNative = dedupeStrings([...merged.distribution.countriesNative, ...dist.countriesNative]);
        }
        if (dist.countriesIntroduced?.length) {
          merged.distribution.countriesIntroduced = dedupeStrings([...merged.distribution.countriesIntroduced, ...dist.countriesIntroduced]);
        }
        if (typeof dist.gbifOccurrenceCount === 'number') {
          merged.distribution.gbifOccurrenceCount ??= dist.gbifOccurrenceCount;
        }
        if (dist.sampleCoordinates?.length) {
          merged.distribution.sampleCoordinates.push(...dist.sampleCoordinates.slice(0, 5));
        }
      }

      if (data.conservation) {
        merged.conservation.iucnCategory ??= data.conservation.iucnCategory ?? null;
        merged.conservation.citesAppendix ??= data.conservation.citesAppendix ?? null;
        merged.conservation.bgciCountryEndemic ??= data.conservation.bgciCountryEndemic ?? null;
      }

      if (data.cultivation) {
        merged.cultivation.wateringIntervalDays ??= data.cultivation.wateringIntervalDays ?? null;
        merged.cultivation.description ??= data.cultivation.description ?? null;
        if (data.cultivation.sunlight?.length) merged.cultivation.sunlight = dedupeStrings([...merged.cultivation.sunlight, ...data.cultivation.sunlight]);
        if (data.cultivation.soilType?.length) merged.cultivation.soilType = dedupeStrings([...merged.cultivation.soilType, ...data.cultivation.soilType]);
        if (data.cultivation.cultivars?.length) merged.cultivation.cultivars = dedupeStrings([...merged.cultivation.cultivars, ...data.cultivation.cultivars]);
      }

      if (data.municipalSummary) {
        merged.municipalSummary = data.municipalSummary;
      }

      if (data.sourceIds) {
        for (const [k, v] of Object.entries(data.sourceIds)) {
          if (v !== undefined && v !== null) {
            (merged.sourceIds as any)[k] = v;
          }
        }
      }
    }

    return merged;
  }
}
