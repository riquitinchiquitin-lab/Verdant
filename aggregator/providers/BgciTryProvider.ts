import { BaseProvider } from './BaseProvider';
import { BotanicalSpecies } from '../models/BotanicalSpecies';
import { CsvTraitImporter, BgciTryTraitRecord } from '../importers/CsvTraitImporter';

export class BgciTryProvider extends BaseProvider {
  readonly name = 'BGCI_TRY';
  readonly authorityRank = 80;
  private traitIndex = new Map<string, BgciTryTraitRecord>();

  async syncBulk(input?: unknown): Promise<number> {
    if (typeof input === 'string' && input.trim().length > 0) {
      const parsed = CsvTraitImporter.parse(input);
      for (const [k, v] of parsed.entries()) {
        this.traitIndex.set(k, v);
      }
      return parsed.size;
    }
    return 0;
  }

  async searchByName(query: string): Promise<Partial<BotanicalSpecies> | null> {
    const rec = this.traitIndex.get(query.trim().toLowerCase());
    if (!rec) return null;

    return {
      ecologicalTraits: {
        light: [],
        soilPreferences: [],
        associatedPests: [],
        woodDensity: rec.woodDensity || null,
        leafTraits: rec.leafTraits || null,
        hardinessZoneMin: rec.hardinessZoneMin || null,
        maxHeightCm: rec.maxHeightCm ?? null,
      },
      conservation: {
        iucnCategory: rec.iucnCategory || null,
        bgciCountryEndemic: rec.bgciCountryEndemic ?? null,
      },
      sourceIds: {
        bgci: rec.bgciId || null,
        trySpeciesId: rec.trySpeciesId || null,
      },
    };
  }

  async getById(id: string | number): Promise<Partial<BotanicalSpecies> | null> {
    const target = String(id);
    for (const rec of this.traitIndex.values()) {
      if (rec.bgciId === target || rec.trySpeciesId === target) {
        return this.searchByName(rec.species);
      }
    }
    return null;
  }
}
