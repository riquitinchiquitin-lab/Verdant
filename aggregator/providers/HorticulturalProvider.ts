import { BaseProvider } from './BaseProvider';
import { BotanicalSpecies } from '../models/BotanicalSpecies';

export class HorticulturalProvider extends BaseProvider {
  readonly name = 'HORTICULTURAL';
  readonly authorityRank = 60;

  async searchByName(query: string): Promise<Partial<BotanicalSpecies> | null> {
    const perenualKey = process.env.PERENUAL_API_KEY;
    const trefleToken = process.env.TREFLE_TOKEN;

    const [perenual, trefle, openfarm] = await Promise.all([
      perenualKey
        ? this.fetchJsonWithRetry<any>(
            `https://perenual.com/api/species-list?key=${encodeURIComponent(perenualKey)}&q=${encodeURIComponent(query)}`
          )
        : Promise.resolve(null),
      trefleToken
        ? this.fetchJsonWithRetry<any>(
            `https://trefle.io/api/v1/plants/search?token=${encodeURIComponent(trefleToken)}&q=${encodeURIComponent(query)}`
          )
        : Promise.resolve(null),
      this.fetchJsonWithRetry<any>(
        `https://openfarm.cc/api/v1/crops/?filter=${encodeURIComponent(query)}`
      ),
    ]);

    const pMatch = perenual?.data?.[0];
    const tMatch = trefle?.data?.[0];
    const oMatch = openfarm?.data?.[0]?.attributes;

    if (!pMatch && !tMatch && !oMatch) return null;

    const sunlight: string[] = Array.isArray(pMatch?.sunlight)
      ? pMatch.sunlight
      : oMatch?.sun_requirements
        ? [oMatch.sun_requirements]
        : [];

    return {
      // Intentionally low authorityRank (60): taxonomic fields will NOT overwrite POWO/VASCAN/GBIF
      scientificName: pMatch?.scientific_name?.[0] || tMatch?.scientific_name || oMatch?.binomial_name || query,
      family: tMatch?.family || null,
      genus: tMatch?.genus || null,
      ecologicalTraits: {
        light: sunlight,
        soilPreferences: [],
        associatedPests: [],
        waterNeeds: pMatch?.watering || null,
      },
      cultivation: {
        sunlight,
        soilType: [],
        cultivars: [],
        description: oMatch?.description || null,
      },
      sourceIds: {
        perenual: pMatch?.id || null,
        trefle: tMatch?.id || null,
        openfarm: openfarm?.data?.[0]?.id || null,
      },
    };
  }

  async getById(id: string | number): Promise<Partial<BotanicalSpecies> | null> {
    const perenualKey = process.env.PERENUAL_API_KEY;
    if (!perenualKey) return null;
    const detail = await this.fetchJsonWithRetry<any>(
      `https://perenual.com/api/species/details/${encodeURIComponent(String(id))}?key=${encodeURIComponent(perenualKey)}`
    );
    if (!detail?.id) return null;
    return {
      ecologicalTraits: {
        light: Array.isArray(detail.sunlight) ? detail.sunlight : [],
        soilPreferences: Array.isArray(detail.soil) ? detail.soil : [],
        associatedPests: Array.isArray(detail.pest_susceptibility) ? detail.pest_susceptibility : [],
        hardinessZoneMin: detail.hardiness?.min || null,
        hardinessZoneMax: detail.hardiness?.max || null,
        waterNeeds: detail.watering || null,
      },
      cultivation: {
        sunlight: Array.isArray(detail.sunlight) ? detail.sunlight : [],
        soilType: Array.isArray(detail.soil) ? detail.soil : [],
        cultivars: [],
        description: detail.description || null,
      },
      sourceIds: { perenual: detail.id },
    };
  }
}
