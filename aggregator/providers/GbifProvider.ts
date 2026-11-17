import { BaseProvider } from './BaseProvider';
import { BotanicalSpecies } from '../models/BotanicalSpecies';

export class GbifProvider extends BaseProvider {
  readonly name = 'GBIF';
  readonly authorityRank = 90;

  async searchByName(query: string): Promise<Partial<BotanicalSpecies> | null> {
    const matchUrl = `https://api.gbif.org/v1/species/match?name=${encodeURIComponent(query)}&verbose=true`;
    const match = await this.fetchJsonWithRetry<any>(matchUrl);
    if (!match?.usageKey) return null;
    return this.getById(match.usageKey);
  }

  async getById(id: string | number): Promise<Partial<BotanicalSpecies> | null> {
    const key = String(id);
    const [detail, iucn, occ] = await Promise.all([
      this.fetchJsonWithRetry<any>(`https://api.gbif.org/v1/species/${encodeURIComponent(key)}`),
      this.fetchJsonWithRetry<any>(`https://api.gbif.org/v1/species/${encodeURIComponent(key)}/iucnRedListCategory`),
      this.fetchJsonWithRetry<any>(`https://api.gbif.org/v1/occurrence/search?taxonKey=${encodeURIComponent(key)}&hasCoordinate=true&limit=8`),
    ]);

    if (!detail?.canonicalName && !detail?.scientificName) return null;

    const coords = (occ?.results || [])
      .filter((r: any) => typeof r.decimalLatitude === 'number' && typeof r.decimalLongitude === 'number')
      .map((r: any) => ({ lat: r.decimalLatitude, lng: r.decimalLongitude }));

    return {
      scientificName: detail.canonicalName || detail.scientificName,
      canonicalName: detail.canonicalName || detail.scientificName,
      authority: detail.authorship || null,
      rank: detail.rank ? String(detail.rank).toLowerCase() : null,
      kingdom: detail.kingdom || null,
      phylum: detail.phylum || null,
      class: detail.class || null,
      order: detail.order || null,
      family: detail.family || null,
      genus: detail.genus || null,
      distribution: {
        canadianProvinces: {},
        countriesNative: [],
        countriesIntroduced: [],
        gbifOccurrenceCount: typeof occ?.count === 'number' ? occ.count : null,
        sampleCoordinates: coords,
      },
      conservation: {
        iucnCategory: iucn?.category || null,
      },
      sourceIds: { gbif: Number(key) },
    };
  }
}
