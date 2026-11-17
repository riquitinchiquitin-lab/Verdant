import { BaseProvider } from './BaseProvider';
import { BotanicalSpecies } from '../models/BotanicalSpecies';
import { CacheStore } from '../cache/CacheStore';

/**
 * Wikidata (CC0) & Wikipedia REST API Provider.
 * Resolves cross-database botanical identifiers (IPNI, POWO, GBIF, Tropicos, USDA, ITIS, EPPO, WFO)
 * and encyclopedic species summaries.
 */
export class WikidataWikipediaProvider extends BaseProvider {
  readonly name = 'WikidataWikipedia';
  readonly authorityRank = 75;

  constructor(cache: CacheStore) {
    super(cache);
  }

  private getClaimString(claims: Record<string, any[]> | undefined, prop: string): string | null {
    const val = claims?.[prop]?.[0]?.mainsnak?.datavalue?.value;
    return typeof val === 'string' ? val : null;
  }

  async searchByName(query: string): Promise<Partial<BotanicalSpecies> | null> {
    const clean = query.trim();
    if (!clean) return null;

    const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(clean)}&language=en&format=json&limit=3&type=item`;
    const searchData = await this.fetchJsonWithRetry<any>(searchUrl, {}, `wikidata:search:${clean.toLowerCase()}`);

    const candidateId: string | undefined = searchData?.search?.[0]?.id;
    let entityData: Partial<BotanicalSpecies> | null = null;
    if (candidateId) {
      entityData = await this.getById(candidateId);
    }

    // Fetch Wikipedia REST summary as an encyclopedic fallback/supplement
    const wikiUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(clean.replace(/\s+/g, '_'))}`;
    const wiki = await this.fetchJsonWithRetry<any>(wikiUrl, {}, `wikipedia:summary:${clean.toLowerCase()}`).catch(() => null);

    if (!entityData && !wiki?.extract) return null;

    return {
      ...(entityData || { id: `wiki:${clean}`, scientificName: clean, canonicalName: clean }),
      cultivation: {
        sunlight: entityData?.cultivation?.sunlight || [],
        soilType: entityData?.cultivation?.soilType || [],
        cultivars: entityData?.cultivation?.cultivars || [],
        description: wiki?.extract || entityData?.cultivation?.description || null,
      },
    };
  }

  async getById(id: string | number): Promise<Partial<BotanicalSpecies> | null> {
    const qid = String(id).trim();
    if (!/^Q\d+$/i.test(qid)) return null;

    const entityUrl = `https://www.wikidata.org/wiki/Special:EntityData/${encodeURIComponent(qid)}.json`;
    const data = await this.fetchJsonWithRetry<any>(entityUrl, {}, `wikidata:entity:${qid}`);
    const entity = data?.entities?.[qid];
    if (!entity) return null;

    const claims = entity.claims || {};
    const taxonName = this.getClaimString(claims, 'P225') || entity.labels?.en?.value || qid;
    const ipniId = this.getClaimString(claims, 'P961');
    const gbifStr = this.getClaimString(claims, 'P846');
    const powoId = this.getClaimString(claims, 'P5037');
    const wfoId = this.getClaimString(claims, 'P7715');
    const tropicosId = this.getClaimString(claims, 'P960');
    const usdaSymbol = this.getClaimString(claims, 'P1772');
    const itisTsn = this.getClaimString(claims, 'P815');
    const eppoCode = this.getClaimString(claims, 'P3031');

    return {
      id: `wikidata:${qid}`,
      scientificName: taxonName,
      canonicalName: taxonName,
      commonNames: {
        en: entity.labels?.en?.value ? [entity.labels.en.value] : [],
        fr: entity.labels?.fr?.value ? [entity.labels.fr.value] : [],
      },
      sourceIds: {
        wikidata: qid,
        ipniLsid: ipniId ? (ipniId.startsWith('urn:') ? ipniId : `urn:lsid:ipni.org:names:${ipniId}`) : null,
        gbif: gbifStr && /^\d+$/.test(gbifStr) ? Number(gbifStr) : null,
        powo: powoId,
        wfo: wfoId,
        tropicos: tropicosId,
        usdaSymbol,
        itisTsn,
        eppoCode,
      },
    };
  }

  async syncBulk(): Promise<number> {
    return 0;
  }
}
