import { BaseProvider } from './BaseProvider';
import { BotanicalSpecies, MunicipalTreeRecord } from '../models/BotanicalSpecies';
import { GeoJsonForestryImporter, MUNICIPAL_PRESETS, MunicipalFieldMapping } from '../importers/GeoJsonForestryImporter';

export class MunicipalForestryProvider extends BaseProvider {
  readonly name = 'MUNICIPAL_FORESTRY';
  readonly authorityRank = 40;

  async syncBulk(input?: unknown): Promise<number> {
    if (!input || typeof input !== 'object') return 0;
    const payload = input as {
      format: 'geojson' | 'csv';
      preset?: string;
      mapping?: MunicipalFieldMapping;
      data: any;
    };
    const mapping = payload.mapping || (payload.preset ? MUNICIPAL_PRESETS[payload.preset.toLowerCase()] : null);
    if (!mapping) return 0;

    let records: MunicipalTreeRecord[] = [];
    if (payload.format === 'geojson') {
      records = GeoJsonForestryImporter.parseGeoJson(payload.data, mapping);
    } else if (payload.format === 'csv' && typeof payload.data === 'string') {
      records = GeoJsonForestryImporter.parseCsv(payload.data, mapping);
    }

    if (records.length === 0) return 0;
    return this.cache.addMunicipalTrees(records);
  }

  async searchByName(query: string): Promise<Partial<BotanicalSpecies> | null> {
    const matches = await this.cache.findMunicipalTreesBySpecies(query);
    if (matches.length === 0) return null;

    const municipalities = Array.from(new Set(matches.map(m => m.municipality)));
    const dbhs = matches.map(m => m.dbhCm).filter((v): v is number => typeof v === 'number');
    const avgDbhCm = dbhs.length > 0 ? Number((dbhs.reduce((a, b) => a + b, 0) / dbhs.length).toFixed(1)) : null;

    return {
      specimenType: 'TREE',
      municipalSummary: {
        totalRecordedTrees: matches.length,
        municipalities,
        avgDbhCm,
      },
      distribution: {
        canadianProvinces: {},
        countriesNative: [],
        countriesIntroduced: [],
        sampleCoordinates: matches.slice(0, 10).map(m => ({ lat: m.latitude, lng: m.longitude })),
      },
    };
  }

  async getById(id: string | number): Promise<Partial<BotanicalSpecies> | null> {
    return this.searchByName(String(id));
  }
}
