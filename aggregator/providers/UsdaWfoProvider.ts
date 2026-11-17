import { BaseProvider } from './BaseProvider';
import { BotanicalSpecies } from '../models/BotanicalSpecies';

const USDA_TRAITS_INDEX: Record<string, { symbol: string; wetlandIndicator: string; growthHabit: string }> = {
  'acer rubrum': { symbol: 'ACRU', wetlandIndicator: 'FAC', growthHabit: 'Tree' },
  'picea glauca': { symbol: 'PIGL', wetlandIndicator: 'FACU', growthHabit: 'Tree' },
  'solanum lycopersicum': { symbol: 'SOLY2', wetlandIndicator: 'UPL', growthHabit: 'Forb/herb' },
  'betula papyrifera': { symbol: 'BEPA', wetlandIndicator: 'FACU', growthHabit: 'Tree' },
  'quercus rubra': { symbol: 'QURU', wetlandIndicator: 'FACU', growthHabit: 'Tree' },
  'pinus strobus': { symbol: 'PIST', wetlandIndicator: 'FACU', growthHabit: 'Tree' },
};

export class UsdaWfoProvider extends BaseProvider {
  readonly name = 'USDA_WFO';
  readonly authorityRank = 92;

  async searchByName(query: string): Promise<Partial<BotanicalSpecies> | null> {
    const wfoUrl = `https://list.worldfloraonline.org/matching_rest.php?input_string=${encodeURIComponent(query)}`;
    const wfoJson = await this.fetchJsonWithRetry<any>(wfoUrl);
    const wfoMatch = wfoJson?.match || null;

    const usda = USDA_TRAITS_INDEX[query.trim().toLowerCase()];
    if (!wfoMatch && !usda) return null;

    return {
      scientificName: wfoMatch?.full_name_string_no_authors_plain || query,
      canonicalName: wfoMatch?.full_name_string_no_authors_plain || query,
      authority: wfoMatch?.authors_string || null,
      ecologicalTraits: {
        light: [],
        soilPreferences: [],
        associatedPests: [],
        wetlandIndicator: usda?.wetlandIndicator || null,
        growthForm: usda?.growthHabit || null,
      },
      sourceIds: {
        wfo: wfoMatch?.wfo_id || null,
        usdaSymbol: usda?.symbol || null,
      },
    };
  }

  async getById(id: string | number): Promise<Partial<BotanicalSpecies> | null> {
    return this.searchByName(String(id));
  }
}
