import { BaseProvider } from './BaseProvider';
import { BotanicalSpecies, CanadianDistributionStatus, SpecimenHabit } from '../models/BotanicalSpecies';
import { DwcaImporter, DwcaTaxonRecord } from '../importers/DwcaImporter';

export class VascanProvider extends BaseProvider {
  readonly name = 'VASCAN';
  readonly authorityRank = 95;
  private bulkIndex = new Map<string, DwcaTaxonRecord>();

  async syncBulk(input?: unknown): Promise<number> {
    if (typeof input === 'string' && input.trim().length > 0) {
      const parsed = DwcaImporter.parseTaxonTable(input, input.includes('\t') ? '\t' : ',');
      for (const [k, v] of parsed.entries()) {
        this.bulkIndex.set(k, v);
      }
      return parsed.size;
    }
    return 0;
  }

  private mapHabit(habit?: string | null): SpecimenHabit {
    const h = (habit || '').toLowerCase();
    if (h.includes('tree')) return 'TREE';
    if (h.includes('shrub')) return 'SHRUB';
    if (h.includes('vine')) return 'VINE';
    if (h.includes('herb')) return 'HERB';
    return 'PLANT';
  }

  async searchByName(query: string): Promise<Partial<BotanicalSpecies> | null> {
    const url = `https://data.canadensys.net/vascan/api/0.1/search.json?q=${encodeURIComponent(query)}`;
    const json = await this.fetchJsonWithRetry<any>(url);
    const match = json?.results?.[0]?.matches?.[0];

    if (!match) {
      const fallback = this.bulkIndex.get(query.trim().toLowerCase());
      if (!fallback) return null;
      return {
        scientificName: fallback.acceptedNameUsage || fallback.scientificName,
        canonicalName: fallback.acceptedNameUsage || fallback.scientificName,
        authority: fallback.scientificNameAuthorship || null,
        rank: fallback.taxonRank || null,
        family: fallback.family || null,
        genus: fallback.genus || null,
        commonNames: { en: fallback.vernacularNamesEn, fr: fallback.vernacularNamesFr },
        distribution: {
          canadianProvinces: fallback.provinces,
          countriesNative: Object.values(fallback.provinces).includes('native') ? ['Canada'] : [],
          countriesIntroduced: Object.values(fallback.provinces).includes('introduced') ? ['Canada'] : [],
          sampleCoordinates: [],
        },
        sourceIds: { vascan: Number(fallback.taxonID) || null },
      };
    }

    return this.normalizeMatch(match);
  }

  async getById(id: string | number): Promise<Partial<BotanicalSpecies> | null> {
    const url = `https://data.canadensys.net/vascan/api/0.1/taxon/${encodeURIComponent(String(id))}.json`;
    const json = await this.fetchJsonWithRetry<any>(url);
    const match = json?.taxon || json?.results?.[0]?.matches?.[0];
    if (!match) return null;
    return this.normalizeMatch(match);
  }

  private normalizeMatch(match: any): Partial<BotanicalSpecies> {
    const enNames: string[] = [];
    const frNames: string[] = [];
    for (const v of match.vernacularNames || []) {
      const lang = (v.language || '').toLowerCase();
      if (lang === 'en' && v.vernacularName) enNames.push(v.vernacularName);
      if (lang === 'fr' && v.vernacularName) frNames.push(v.vernacularName);
    }

    const provinces: Record<string, CanadianDistributionStatus> = {};
    for (const d of match.distribution || []) {
      const prov = (d.locationID || d.locality || '').replace(/^CA-/, '');
      const status = (d.occurrenceStatus || '').toLowerCase() as CanadianDistributionStatus;
      if (prov && status) provinces[prov] = status;
    }

    const sciName: string = match.canonicalName || match.scientificName || '';
    const synonyms = (match.synonyms || []).map((s: any) => s.canonicalName || s.scientificName).filter(Boolean);

    return {
      scientificName: sciName,
      canonicalName: sciName,
      authority: match.scientificNameAuthorship || null,
      rank: match.taxonRank || null,
      family: match.family || null,
      genus: match.genus || (sciName ? sciName.split(' ')[0] : null),
      specimenType: this.mapHabit(match.habit),
      synonyms,
      commonNames: { en: enNames, fr: frNames },
      distribution: {
        canadianProvinces: provinces,
        countriesNative: Object.values(provinces).includes('native') ? ['Canada'] : [],
        countriesIntroduced: Object.values(provinces).includes('introduced') ? ['Canada'] : [],
        sampleCoordinates: [],
      },
      sourceIds: { vascan: match.taxonID ? Number(match.taxonID) : null },
    };
  }
}
