import { BaseProvider } from './BaseProvider';
import { BotanicalSpecies } from '../models/BotanicalSpecies';

interface NrcanTreeProfile {
  tidcfId: string;
  canadianHardinessZone: string;
  shadeTolerance: string;
  droughtTolerance: string;
  growthForm: string;
  maxHeightCm: number;
  woodDensity: string;
  associatedPests: string[];
  soilPreferences: string[];
}

const NRCAN_TREES_INDEX: Record<string, NrcanTreeProfile> = {
  'acer rubrum': {
    tidcfId: 'TIDCF-ACRU',
    canadianHardinessZone: '3a',
    shadeTolerance: 'Moderate',
    droughtTolerance: 'Low to Moderate',
    growthForm: 'Deciduous Broadleaf Tree',
    maxHeightCm: 2500,
    woodDensity: '0.54 g/cm³ (Medium Hardwood)',
    associatedPests: ['Asian Longhorned Beetle', 'Verticillium Wilt', 'Tar Spot (Rhytisma)'],
    soilPreferences: ['Moist Loam', 'Acidic Clay', 'Swamp Margins'],
  },
  'picea glauca': {
    tidcfId: 'TIDCF-PIGL',
    canadianHardinessZone: '1a',
    shadeTolerance: 'Tolerant',
    droughtTolerance: 'Moderate',
    growthForm: 'Evergreen Conifer Tree',
    maxHeightCm: 3000,
    woodDensity: '0.40 g/cm³ (Light Softwood)',
    associatedPests: ['Spruce Budworm (Choristoneura fumiferana)', 'White Pine Weevil', 'Spruce Beetle'],
    soilPreferences: ['Well-Drained Loam', 'Boreal Podzol', 'Sandy Clay'],
  },
  'betula papyrifera': {
    tidcfId: 'TIDCF-BEPA',
    canadianHardinessZone: '2a',
    shadeTolerance: 'Intolerant',
    droughtTolerance: 'Low',
    growthForm: 'Deciduous Broadleaf Tree',
    maxHeightCm: 2200,
    woodDensity: '0.55 g/cm³ (Medium Hardwood)',
    associatedPests: ['Bronze Birch Borer', 'Birch Leafminer'],
    soilPreferences: ['Sandy Loam', 'Cool Moist Soil'],
  },
  'pinus strobus': {
    tidcfId: 'TIDCF-PIST',
    canadianHardinessZone: '2b',
    shadeTolerance: 'Intermediate',
    droughtTolerance: 'Moderate',
    growthForm: 'Evergreen Conifer Tree',
    maxHeightCm: 3500,
    woodDensity: '0.35 g/cm³ (Light Softwood)',
    associatedPests: ['White Pine Blister Rust', 'White Pine Weevil'],
    soilPreferences: ['Sandy Loam', 'Well-Drained Acidic Soil'],
  },
  'quercus rubra': {
    tidcfId: 'TIDCF-QURU',
    canadianHardinessZone: '3b',
    shadeTolerance: 'Intermediate',
    droughtTolerance: 'High',
    growthForm: 'Deciduous Broadleaf Tree',
    maxHeightCm: 2800,
    woodDensity: '0.63 g/cm³ (Dense Hardwood)',
    associatedPests: ['Oak Wilt (Bretziella fagacearum)', 'Spongy Moth'],
    soilPreferences: ['Deep Loam', 'Sandy Loam', 'Acidic'],
  },
};

export class NrcanTreeProvider extends BaseProvider {
  readonly name = 'NRCAN_TIDCF';
  readonly authorityRank = 85;
  private customTrees = new Map<string, NrcanTreeProfile>();

  async syncBulk(input?: unknown): Promise<number> {
    if (Array.isArray(input)) {
      let count = 0;
      for (const item of input) {
        if (item?.species) {
          this.customTrees.set(String(item.species).toLowerCase(), item);
          count++;
        }
      }
      return count;
    }
    return 0;
  }

  async searchByName(query: string): Promise<Partial<BotanicalSpecies> | null> {
    const key = query.trim().toLowerCase();
    const profile = this.customTrees.get(key) || NRCAN_TREES_INDEX[key];
    if (!profile) return null;

    return {
      specimenType: 'TREE',
      ecologicalTraits: {
        canadianHardinessZone: profile.canadianHardinessZone,
        shadeTolerance: profile.shadeTolerance,
        droughtTolerance: profile.droughtTolerance,
        growthForm: profile.growthForm,
        maxHeightCm: profile.maxHeightCm,
        woodDensity: profile.woodDensity,
        associatedPests: profile.associatedPests,
        soilPreferences: profile.soilPreferences,
        light: [],
      },
      sourceIds: { nrcanTidcf: profile.tidcfId },
    };
  }

  async getById(id: string | number): Promise<Partial<BotanicalSpecies> | null> {
    const target = String(id).toUpperCase();
    for (const [species, profile] of Object.entries(NRCAN_TREES_INDEX)) {
      if (profile.tidcfId === target) return this.searchByName(species);
    }
    return null;
  }
}
