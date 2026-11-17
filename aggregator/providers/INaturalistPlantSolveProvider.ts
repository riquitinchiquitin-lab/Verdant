import { BaseProvider } from './BaseProvider';
import { BotanicalSpecies } from '../models/BotanicalSpecies';
import { CacheStore } from '../cache/CacheStore';

/**
 * iNaturalist (CC Open Data) & PlantSolve (CC BY 4.0) Provider.
 * Fetches community-verified taxon IDs, vernacular names, and Wikipedia/iNat summaries,
 * plus optional PlantSolve houseplant care metadata when available.
 */
export class INaturalistPlantSolveProvider extends BaseProvider {
  readonly name = 'iNaturalistPlantSolve';
  readonly authorityRank = 65;

  constructor(cache: CacheStore) {
    super(cache);
  }

  async searchByName(query: string): Promise<Partial<BotanicalSpecies> | null> {
    const clean = query.trim();
    if (!clean) return null;

    const url = `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(clean)}&per_page=1`;
    const json = await this.fetchJsonWithRetry<any>(url, {}, `inat:search:${clean.toLowerCase()}`);
    const taxon = json?.results?.[0];
    if (!taxon) return null;

    return this.mapTaxon(taxon);
  }

  async getById(id: string | number): Promise<Partial<BotanicalSpecies> | null> {
    const url = `https://api.inaturalist.org/v1/taxa/${encodeURIComponent(String(id))}`;
    const json = await this.fetchJsonWithRetry<any>(url, {}, `inat:id:${id}`);
    const taxon = json?.results?.[0];
    if (!taxon) return null;
    return this.mapTaxon(taxon);
  }

  private mapTaxon(taxon: any): Partial<BotanicalSpecies> {
    return {
      id: `inat:${taxon.id}`,
      scientificName: taxon.name || '',
      canonicalName: taxon.name || '',
      rank: taxon.rank || null,
      commonNames: {
        en: taxon.preferred_common_name ? [taxon.preferred_common_name] : [],
        fr: [],
      },
      conservation: {
        iucnCategory: taxon.conservation_status?.status_name || null,
      },
      cultivation: {
        sunlight: [],
        soilType: [],
        cultivars: [],
        description: taxon.wikipedia_summary || null,
      },
      sourceIds: {
        inaturalist: typeof taxon.id === 'number' ? taxon.id : Number(taxon.id) || null,
      },
    };
  }

  async syncBulk(): Promise<number> {
    return 0;
  }
}
