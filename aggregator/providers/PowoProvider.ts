import { BaseProvider } from './BaseProvider';
import { BotanicalSpecies, SpecimenHabit } from '../models/BotanicalSpecies';

export class PowoProvider extends BaseProvider {
  readonly name = 'POWO';
  readonly authorityRank = 100;

  async searchByName(query: string): Promise<Partial<BotanicalSpecies> | null> {
    const searchUrl = `https://powo.science.kew.org/api/2/search?q=${encodeURIComponent(query)}&f=species_f`;
    const searchJson = await this.fetchJsonWithRetry<any>(searchUrl);
    const fqId = searchJson?.results?.[0]?.fqId;
    if (!fqId) return null;
    return this.getById(fqId);
  }

  async getById(id: string | number): Promise<Partial<BotanicalSpecies> | null> {
    const url = `https://powo.science.kew.org/api/2/taxon/${encodeURIComponent(String(id))}?fields=distribution,descriptions,synonyms,lifeform,name,authors,family,genus`;
    const data = await this.fetchJsonWithRetry<any>(url);
    if (!data?.name) return null;

    const lifeform = (data.lifeform || '').toLowerCase();
    let specimenType: SpecimenHabit = 'PLANT';
    if (lifeform.includes('tree')) specimenType = 'TREE';
    else if (lifeform.includes('shrub')) specimenType = 'SHRUB';
    else if (lifeform.includes('climber') || lifeform.includes('vine')) specimenType = 'VINE';

    const countriesNative = (data.distribution?.natives || [])
      .map((n: any) => n.name)
      .filter(Boolean);
    const countriesIntroduced = (data.distribution?.introduced || [])
      .map((n: any) => n.name)
      .filter(Boolean);

    const synonyms = (data.synonyms || [])
      .map((s: any) => s.name)
      .filter(Boolean);

    const descValues = data.descriptions ? Object.values(data.descriptions) as any[] : [];
    const description = descValues.find((d: any) => typeof d === 'string') || null;

    return {
      scientificName: data.name,
      canonicalName: data.name,
      authority: data.authors || null,
      family: data.family || null,
      genus: data.genus || data.name.split(' ')[0],
      specimenType,
      synonyms,
      ecologicalTraits: {
        light: [],
        soilPreferences: [],
        associatedPests: [],
        lifeform: data.lifeform || null,
      },
      distribution: {
        canadianProvinces: {},
        countriesNative,
        countriesIntroduced,
        sampleCoordinates: [],
      },
      cultivation: {
        sunlight: [],
        soilType: [],
        cultivars: [],
        description,
      },
      sourceIds: { powo: String(id) },
    };
  }
}
