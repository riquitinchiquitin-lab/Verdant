import { LocalizedString, Plant } from '../types';

export const TARGET_LANGS = ['en', 'zh', 'ja', 'ko', 'es', 'fr', 'pt', 'de', 'id', 'vi', 'tl'] as const;
export type SupportedLang = typeof TARGET_LANGS[number];

/**
 * Authoritatively determines whether a specimen is a botanical tree based on:
 * 1. Self-supporting woody trunk with secondary growth (lignin / woodiness)
 * 2. Apical dominance (single defined stem branching above ground vs shrub)
 * 3. Elevated crown / canopy
 * 4. Mature height threshold (>= 3m / 300cm in forestry standards)
 * 5. Arborescent taxonomic lineages & genera (broadleaf hardwoods, conifers, arborescent palms)
 * 6. Bonsai specimens (miniaturized arborescent woody trees in cultivation)
 *
 * Strictly filters out false-positive non-tree flora:
 * - Creeping climbing vines with "tree" or "fig" in name (e.g. Ficus pumila)
 * - Herbaceous aroids with "tree" in common name (e.g. Tree Philodendron / Thaumatophyllum)
 * - Succulents & succulent shrubs (e.g. Crassula ovata "Jade Tree", Euphorbia tirucalli "Pencil Tree")
 * - Miniature herbaceous plants with maxHeight < 150cm (unless cultivated as bonsai)
 */
export function isPlantTree(plant?: Partial<Plant> | null): boolean {
  if (!plant) return false;

  // 1. Explicit user or database designation
  if (plant.specimenType === 'TREE') return true;

  // Check category across all languages
  const categoryStr = typeof (plant.category as unknown) === 'string'
    ? (plant.category as unknown as string).toLowerCase()
    : Object.values(plant.category || {}).filter((v): v is string => typeof v === 'string').join(' ').toLowerCase();

  const nicknameStr = typeof (plant.nickname as unknown) === 'string'
    ? (plant.nickname as unknown as string).toLowerCase()
    : Object.values(plant.nickname || {}).filter((v): v is string => typeof v === 'string').join(' ').toLowerCase();

  const speciesStr = (plant.species || '').toLowerCase().trim();
  const genusStr = (plant.genus || '').toLowerCase().trim();
  const familyStr = (plant.family || '').toLowerCase().trim();

  // Growth habit & lifeform strings
  const habitStr = typeof (plant.growthHabit as unknown) === 'string'
    ? (plant.growthHabit as unknown as string).toLowerCase()
    : Object.values(plant.growthHabit || {}).filter((v): v is string => typeof v === 'string').join(' ').toLowerCase();

  // 2. Bonsai cultivation (miniaturized woody arborescent species)
  if (categoryStr.includes('bonsai') || nicknameStr.includes('bonsai') || habitStr.includes('bonsai')) {
    return true;
  }

  // 3. STRICT NON-TREE EXCLUSIONS (Herbs, soft vines, succulents, and dwarf plants)
  // Even if a plant has "tree" or "fig" in colloquial name, botanical science defines these as non-trees:
  const nonTreeExclusions = [
    'ficus pumila',               // Creeping fig (creeping climbing vine, not a tree)
    'creeping fig',
    'philodendron bipinnatifidum', // Tree philodendron (herbaceous giant aroid)
    'thaumatophyllum',
    'tree philodendron',
    'lacy tree philodendron',
    'crassula ovata',             // Jade plant / jade tree (succulent shrub)
    'crassula argentea',
    'jade tree',
    'jade plant',
    'euphorbia tirucalli',        // Pencil tree / pencil cactus (succulent shrub)
    'euphorbia trigona',          // African milk tree (succulent)
    'pencil tree',
    'african milk tree',
    'begonia',                    // Cane / tree begonias (herbaceous)
    'hypoestes',                  // Polka dot plant / tree (herbaceous)
    'pilea peperomioides',        // Chinese money plant (herbaceous succulent)
    'chinese money plant',
    'passiflora',                 // Passion flower vine
    'epipremnum',                 // Pothos vine
    'syngonium',                  // Arrowhead vine
    'scindapsus',
    'monstera deliciosa',         // Monstera vine / climber
    'monstera adansonii',
    'calathea',                   // Prayer plants (herbaceous)
    'maranta',
    'ctenanthe',
    'peperomia',
    'sansevieria',                // Snake plant (succulent herb)
    'dracaena trifasciata'
  ];

  for (const exclusion of nonTreeExclusions) {
    if (speciesStr.includes(exclusion) || nicknameStr.includes(exclusion)) {
      return false;
    }
  }

  // Purely herbaceous families (cannot be trees unless arborescent monocot palms or tree ferns)
  const strictlyHerbaceousFamilies = [
    'araceae',      // Aroids (Monstera, Philodendron, Anthurium, Pothos, etc.)
    'bromeliaceae', // Bromeliads / Tillandsia
    'gesneriaceae', // African violets
    'commelinaceae',// Tradescantia
    'marantaceae',  // Prayer plants
    'begoniaceae',  // Begonias
    'crassulaceae', // Crassula, Echeveria, Sedum, Kalanchoe (succulents)
    'aizoaceae'
  ];

  if (strictlyHerbaceousFamilies.includes(familyStr)) {
    return false;
  }

  // 4. Height Threshold Criterion (Botanical & Forestry Standard: mature height >= 300cm / 3m)
  // If mature height is strictly under 150cm (1.5m), it is an herb, groundcover, or dwarf shrub
  if (plant.maxHeight != null && plant.maxHeight > 0 && plant.maxHeight < 150) {
    return false;
  }
  if (plant.avgHeight != null && plant.avgHeight > 0 && plant.avgHeight < 120) {
    return false;
  }

  // 5. Category keyword matching
  if (
    categoryStr.includes('tree') ||
    categoryStr.includes('arbre') ||
    categoryStr.includes('árbol') ||
    categoryStr.includes('pohon') ||
    categoryStr.includes('baum')
  ) {
    return true;
  }

  // 6. Growth Habit & Botanical Lifeform (POWO, GBIF, VASCAN, OPB, NCSU)
  if (
    habitStr.includes('tree') ||
    habitStr.includes('arborescent') ||
    habitStr.includes('shrub/tree') ||
    habitStr.includes('tree/shrub') ||
    habitStr.includes('small tree') ||
    habitStr.includes('medium tree') ||
    habitStr.includes('large tree') ||
    habitStr.includes('woody tree') ||
    habitStr.includes('arbre') ||
    habitStr.includes('árbol') ||
    habitStr.includes('phanerophyte') ||
    habitStr.includes('megaphanerophyte') ||
    habitStr.includes('mesophanerophyte') ||
    habitStr.includes('microphanerophyte')
  ) {
    return true;
  }

  // 7. Botanical Taxonomic Lineages (Woody Perennial Genera & Arborescent Houseplants)
  const fullTaxonText = `${speciesStr} ${nicknameStr} ${genusStr} ${familyStr}`;

  // Dedicated arborescent woody genera & species
  const treeGeneraAndSpecies = [
    // Gymnosperms & Conifers
    'pinus', 'pine', 'picea', 'spruce', 'abies', 'fir', 'cedrus', 'cedar',
    'cupressus', 'cypress', 'juniperus', 'juniper', 'taxus', 'yew',
    'sequoia', 'sequoiadendron', 'metasequoia', 'redwood',
    'ginkgo', 'araucaria', 'norfolk island pine', 'larix', 'larch',
    'tsuga', 'hemlock', 'thuja', 'arborvitae', 'cryptomeria', 'podocarpus',
    'chamaecyparis', 'sciadopitys',

    // Broadleaf Hardwoods & Temperate Trees
    'acer', 'maple', 'quercus', 'oak', 'betula', 'birch', 'fraxinus', 'ash tree',
    'ulmus', 'elm', 'prunus', 'cherry tree', 'plum tree', 'peach tree', 'almond tree',
    'malus', 'apple tree', 'pyrus', 'pear tree', 'magnolia', 'salix', 'willow',
    'populus', 'poplar', 'aspen', 'cottonwood', 'castanea', 'chestnut',
    'fagus', 'beech', 'tilia', 'linden', 'basswood', 'platanus', 'sycamore', 'plane tree',
    'liquidambar', 'sweetgum', 'celtis', 'hackberry', 'gleditsia', 'honeylocust',
    'robinia', 'black locust', 'juglans', 'walnut tree', 'carya', 'pecan', 'hickory',
    'alnus', 'alder', 'catalpa', 'paulownia', 'tabebuia', 'delonix', 'royal poinciana',
    'cercis', 'redbud', 'koelreuteria', 'corylus', 'hazelnut tree', 'diospyros', 'persimmon tree',
    'sorbus', 'rowan', 'carpinus', 'hornbeam', 'liriodendron', 'tulip tree', 'zelkova',

    // Subtropical & Tropical Trees / Arborescent Indoor Trees
    'olea', 'olive tree', 'eucalyptus', 'jacaranda', 'adansonia', 'baobab',
    'lagerstroemia', 'crepe myrtle', 'camellia',
    'citrus', 'lemon tree', 'orange tree', 'lime tree', 'grapefruit tree', 'calamondin',
    'ficus lyrata', 'fiddle leaf', 'figuier lyre',
    'ficus elastica', 'rubber tree', 'rubber plant',
    'ficus benjamina', 'weeping fig',
    'ficus microcarpa', 'ficus retusa', 'ficus macrophylla', 'ficus religiosa',
    'ficus carica', 'fig tree', 'ficus sycomorus',
    'pachira', 'money tree', 'pachira aquatica',
    'schefflera', 'umbrella tree',
    'dracaena draco', 'dragon tree', 'dracaena marginata', 'dracaena reflexa', 'dracaena fragrans',
    'beaucarnea recurvata', 'ponytail palm', 'elephant foot tree',
    'polyscias', 'ming aralia'
  ];

  for (const kw of treeGeneraAndSpecies) {
    if (fullTaxonText.includes(kw)) {
      return true;
    }
  }

  // 8. Arborescent Monocot Palms (Arecaceae with mature arborescent single trunk >= 3m)
  if (familyStr === 'arecaceae' || familyStr === 'palmae') {
    const arborescentPalms = [
      'phoenix', 'date palm', 'washingtonia', 'roystonea', 'royal palm',
      'cocos', 'coconut palm', 'trachycarpus', 'windmill palm',
      'ravenea rivularis', 'majesty palm', 'howea forsteriana', 'kentia palm',
      'dypsis lutescens', 'areca palm', 'syagrus'
    ];
    for (const palm of arborescentPalms) {
      if (fullTaxonText.includes(palm)) {
        return true;
      }
    }
  }

  // 9. Tree Ferns (Cyatheales)
  if (familyStr === 'cyatheaceae' || familyStr === 'dicksoniaceae') {
    return true;
  }
  const treeFerns = ['cyathea', 'dicksonia', 'alsophila', 'sphaeropteris', 'tree fern'];
  for (const tf of treeFerns) {
    if (fullTaxonText.includes(tf)) {
      return true;
    }
  }

  return false;
}

export const STANDARD_CATEGORIES: Record<string, LocalizedString> = {
  TREE: {
    en: 'Tree',
    zh: '树木',
    ja: '樹木',
    ko: '수목',
    es: 'Árbol',
    fr: 'Arbre',
    pt: 'Árvore',
    de: 'Baum',
    id: 'Pohon',
    vi: 'Cây thân gỗ',
    tl: 'Puno'
  },
  AROID: {
    en: 'Aroid',
    zh: '天南星科',
    ja: 'サトイモ科',
    ko: '천남성과',
    es: 'Arácea',
    fr: 'Aracée',
    pt: 'Arácea',
    de: 'Aronstabgewächs',
    id: 'Talos-talosan',
    vi: 'Họ Ráy',
    tl: 'Aroid'
  },
  SUCCULENT: {
    en: 'Succulent',
    zh: '多肉植物',
    ja: '多肉植物',
    ko: '다육식물',
    es: 'Suculenta',
    fr: 'Succulente',
    pt: 'Suculenta',
    de: 'Sukkulente',
    id: 'Sukulen',
    vi: 'Cây mọng nước',
    tl: 'Halamang Makatas'
  },
  PALM: {
    en: 'Palm',
    zh: '棕榈',
    ja: 'ヤシ',
    ko: '야자나무',
    es: 'Palmera',
    fr: 'Palmier',
    pt: 'Palmeira',
    de: 'Palme',
    id: 'Palem',
    vi: 'Cây cọ',
    tl: 'Palmera'
  },
  FERN: {
    en: 'Fern',
    zh: '蕨类植物',
    ja: 'シダ植物',
    ko: '양치식물',
    es: 'Helecho',
    fr: 'Fougère',
    pt: 'Samambaia',
    de: 'Farn',
    id: 'Tumbuhan Paku',
    vi: 'Dương xỉ',
    tl: 'Pako'
  },
  ORCHID: {
    en: 'Orchid',
    zh: '兰科植物',
    ja: 'ラン',
    ko: '난초',
    es: 'Orquídea',
    fr: 'Orchidée',
    pt: 'Orquídea',
    de: 'Orchidee',
    id: 'Anggrek',
    vi: 'Hoa lan',
    tl: 'Dapo'
  },
  PRAYER_PLANT: {
    en: 'Prayer Plant',
    zh: '竹芋科',
    ja: 'クズウコン科',
    ko: '마란타과',
    es: 'Marantácea',
    fr: 'Marantacée',
    pt: 'Marantácea',
    de: 'Pfeilwurzgewächs',
    id: 'Marantaceae',
    vi: 'Họ Củ dong',
    tl: 'Prayer Plant'
  },
  BROMELIAD: {
    en: 'Bromeliad',
    zh: '凤梨科',
    ja: 'パイナップル科',
    ko: '파인애플과',
    es: 'Bromelia',
    fr: 'Broméliacée',
    pt: 'Bromélia',
    de: 'Bromelie',
    id: 'Nanas-nanasan',
    vi: 'Họ Dứa',
    tl: 'Bromeliad'
  },
  BONSAI: {
    en: 'Bonsai',
    zh: '盆景',
    ja: '盆栽',
    ko: '분재',
    es: 'Bonsái',
    fr: 'Bonsaï',
    pt: 'Bonsai',
    de: 'Bonsai',
    id: 'Bonsai',
    vi: 'Cây cảnh Bonsai',
    tl: 'Bonsai'
  },
  CARNIVOROUS: {
    en: 'Carnivorous Plant',
    zh: '食虫植物',
    ja: '食虫植物',
    ko: '식충식물',
    es: 'Planta carnívora',
    fr: 'Plante carnivore',
    pt: 'Planta carnívora',
    de: 'Fleischfressende Pflanze',
    id: 'Tanaman Karnivora',
    vi: 'Cây bắt mồi',
    tl: 'Halamang Kumakain ng Insekto'
  },
  VINE: {
    en: 'Vine & Climber',
    zh: '藤本植物',
    ja: 'つる植物',
    ko: '덩굴식물',
    es: 'Enredadera',
    fr: 'Plante grimpante',
    pt: 'Trepadeira',
    de: 'Kletterpflanze',
    id: 'Tanaman Merambat',
    vi: 'Cây dây leo',
    tl: 'Baging'
  },
  HERB: {
    en: 'Herb',
    zh: '草本植物',
    ja: 'ハーブ',
    ko: '허브',
    es: 'Hierba',
    fr: 'Herbe aromatique',
    pt: 'Erva',
    de: 'Kräuter',
    id: 'Herba',
    vi: 'Cây thảo mộc',
    tl: 'Herba'
  },
  FLOWERING: {
    en: 'Flowering Plant',
    zh: '开花植物',
    ja: '顕花植物',
    ko: '현화식물',
    es: 'Planta con flor',
    fr: 'Plante à fleurs',
    pt: 'Planta com flor',
    de: 'Blühpflanze',
    id: 'Tanaman Berbunga',
    vi: 'Cây có hoa',
    tl: 'Halamang Namumulaklak'
  },
  FOLIAGE: {
    en: 'Foliage Plant',
    zh: '观叶植物',
    ja: '観葉植物',
    ko: '관엽 식物',
    es: 'Planta de follaje',
    fr: 'Plante à feuillage',
    pt: 'Planta de folhagem',
    de: 'Laubpflanze',
    id: 'Tanaman Daun',
    vi: 'Cây lá',
    tl: 'Halamang Dahon'
  }
};

export interface InferCategoryParams {
  species?: string | null;
  nickname?: LocalizedString | string | null;
  family?: string | null;
  genus?: string | null;
  specimenType?: 'PLANT' | 'TREE' | 'SHRUB' | 'VINE' | 'HERB' | string | null;
  growthHabit?: LocalizedString | string | null;
  lifeform?: string | null;
  growthForm?: string | null;
  category?: LocalizedString | string | null;
}

const normalize = (val: any): string => {
  if (!val) return '';
  if (typeof val === 'string') return val.toLowerCase().trim();
  if (typeof val === 'object') {
    return Object.values(val)
      .filter((v): v is string => typeof v === 'string')
      .join(' ')
      .toLowerCase()
      .trim();
  }
  return '';
};

/**
 * Searches if an existing category string matches one of our standard keys or translations.
 */
function matchStandardCategory(raw: string): LocalizedString | null {
  const norm = raw.toLowerCase().trim();
  if (!norm) return null;

  for (const [key, loc] of Object.entries(STANDARD_CATEGORIES)) {
    if (key.toLowerCase() === norm) return loc;
    for (const text of Object.values(loc)) {
      if (text && text.toLowerCase() === norm) return loc;
    }
  }

  // Fuzzy matches
  if (norm.includes('tree') || norm.includes('arbre') || norm.includes('árbol') || norm.includes('pohon') || norm.includes('baum')) {
    return STANDARD_CATEGORIES.TREE;
  }
  if (norm.includes('aroid') || norm.includes('araceae') || norm.includes('aracée')) {
    return STANDARD_CATEGORIES.AROID;
  }
  if (norm.includes('succulent') || norm.includes('cactus') || norm.includes('cacti') || norm.includes('suculenta')) {
    return STANDARD_CATEGORIES.SUCCULENT;
  }
  if (norm.includes('palm') || norm.includes('palmier') || norm.includes('palmera')) {
    return STANDARD_CATEGORIES.PALM;
  }
  if (norm.includes('fern') || norm.includes('fougère') || norm.includes('helecho') || norm.includes('farn')) {
    return STANDARD_CATEGORIES.FERN;
  }
  if (norm.includes('orchid') || norm.includes('orchidée') || norm.includes('orquídea')) {
    return STANDARD_CATEGORIES.ORCHID;
  }
  if (norm.includes('maranta') || norm.includes('prayer plant') || norm.includes('calathea')) {
    return STANDARD_CATEGORIES.PRAYER_PLANT;
  }
  if (norm.includes('bromeliad') || norm.includes('bromelia') || norm.includes('tillandsia')) {
    return STANDARD_CATEGORIES.BROMELIAD;
  }
  if (norm.includes('bonsai')) {
    return STANDARD_CATEGORIES.BONSAI;
  }
  if (norm.includes('carnivorous') || norm.includes('carnivore') || norm.includes('carnívora')) {
    return STANDARD_CATEGORIES.CARNIVOROUS;
  }
  if (norm.includes('vine') || norm.includes('climber') || norm.includes('grimpante') || norm.includes('trepadeira')) {
    return STANDARD_CATEGORIES.VINE;
  }
  if (norm.includes('herb') || norm.includes('herbe') || norm.includes('hierba') || norm.includes('erva')) {
    return STANDARD_CATEGORIES.HERB;
  }
  if (norm.includes('flowering') || norm.includes('fleur') || norm.includes('flor') || norm.includes('blüh')) {
    return STANDARD_CATEGORIES.FLOWERING;
  }
  if (norm.includes('foliage') || norm.includes('feuillage') || norm.includes('follaje') || norm.includes('laub')) {
    return STANDARD_CATEGORIES.FOLIAGE;
  }

  return null;
}

/**
 * Automatically infers and populates a plant's botanical category with full
 * 11-language localization based on botanical indicators (species, family,
 * genus, growth habit, specimenType, or nickname).
 */
export function inferPlantCategory(data: InferCategoryParams): LocalizedString {
  // 1. If an existing category is provided, check if it matches a standard category
  if (data.category) {
    if (typeof data.category === 'string' && data.category.trim()) {
      const matched = matchStandardCategory(data.category);
      if (matched) return matched;
      // Populate custom category across all languages
      const trimmed = data.category.trim();
      return TARGET_LANGS.reduce((acc, lang) => {
        acc[lang] = trimmed;
        return acc;
      }, {} as LocalizedString);
    }

    if (typeof data.category === 'object') {
      const vals = Object.values(data.category).filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
      if (vals.length > 0) {
        for (const v of vals) {
          const matched = matchStandardCategory(v);
          if (matched) return matched;
        }
        // Fill missing language codes with default available string
        const fallback = data.category.en || vals[0];
        const res: LocalizedString = { ...data.category };
        for (const l of TARGET_LANGS) {
          if (!res[l]) res[l] = fallback;
        }
        return res;
      }
    }
  }

  // 2. Explicit specimen type: TREE
  if (data.specimenType === 'TREE') {
    return STANDARD_CATEGORIES.TREE;
  }

  const speciesText = normalize(data.species);
  const nicknameText = normalize(data.nickname);
  const familyText = normalize(data.family);
  const genusText = normalize(data.genus);
  const habitText = normalize(data.growthHabit);
  const lifeformText = `${normalize(data.lifeform)} ${normalize(data.growthForm)}`;

  const corpus = `${speciesText} ${nicknameText} ${familyText} ${genusText} ${habitText} ${lifeformText}`;

  // 3. Bonsai
  if (corpus.includes('bonsai')) {
    return STANDARD_CATEGORIES.BONSAI;
  }

  // 4. Money Tree & Tree Indicators
  if (
    nicknameText.includes('money tree') ||
    speciesText.includes('pachira aquatica') ||
    speciesText.includes('pachira') ||
    genusText === 'pachira' ||
    corpus.includes('fiddle leaf') ||
    corpus.includes('ficus lyrata') ||
    corpus.includes('ficus elastica') ||
    corpus.includes('rubber tree') ||
    corpus.includes('weeping fig') ||
    corpus.includes('ficus benjamina') ||
    corpus.includes('umbrella tree') ||
    corpus.includes('schefflera') ||
    corpus.includes('dracaena reflexa') ||
    corpus.includes('dracaena marginata') ||
    corpus.includes('dracaena fragrans') ||
    corpus.includes('dragon tree') ||
    corpus.includes('corn plant') ||
    corpus.includes('citrus') ||
    corpus.includes('lemon tree') ||
    corpus.includes('orange tree') ||
    corpus.includes('olive tree') ||
    corpus.includes('olea europaea') ||
    corpus.includes('eucalyptus') ||
    habitText.includes('tree') ||
    lifeformText.includes('tree') ||
    habitText.includes('arborescent')
  ) {
    return STANDARD_CATEGORIES.TREE;
  }

  // 5. Aroid (Araceae)
  if (
    familyText.includes('araceae') ||
    corpus.includes('monstera') ||
    corpus.includes('philodendron') ||
    corpus.includes('anthurium') ||
    corpus.includes('epipremnum') ||
    corpus.includes('pothos') ||
    corpus.includes('scindapsus') ||
    corpus.includes('alocasia') ||
    corpus.includes('colocasia') ||
    corpus.includes('syngonium') ||
    corpus.includes('aglaonema') ||
    corpus.includes('dieffenbachia') ||
    corpus.includes('zamioculcas') ||
    corpus.includes('zz plant') ||
    corpus.includes('peace lily') ||
    corpus.includes('spathiphyllum') ||
    corpus.includes('rhaphidophora') ||
    corpus.includes('caladium')
  ) {
    return STANDARD_CATEGORIES.AROID;
  }

  // 6. Cactus & Succulent
  if (
    familyText.includes('cactaceae') ||
    familyText.includes('crassulaceae') ||
    familyText.includes('aizoaceae') ||
    familyText.includes('asphodelaceae') ||
    familyText.includes('didiereaceae') ||
    corpus.includes('snake plant') ||
    corpus.includes('sansevieria') ||
    corpus.includes('mother-in-law') ||
    corpus.includes('mother in law') ||
    corpus.includes('cactus') ||
    corpus.includes('cacti') ||
    corpus.includes('succulent') ||
    corpus.includes('aloe') ||
    corpus.includes('haworthia') ||
    corpus.includes('gasteria') ||
    corpus.includes('echeveria') ||
    corpus.includes('sedum') ||
    corpus.includes('crassula') ||
    corpus.includes('jade plant') ||
    corpus.includes('kalanchoe') ||
    corpus.includes('sempervivum') ||
    corpus.includes('opuntia') ||
    corpus.includes('mammillaria') ||
    corpus.includes('echinocactus') ||
    corpus.includes('agave') ||
    corpus.includes('string of pearls') ||
    corpus.includes('senecio rowleyanus') ||
    corpus.includes('burro') ||
    habitText.includes('succulent') ||
    lifeformText.includes('succulent')
  ) {
    return STANDARD_CATEGORIES.SUCCULENT;
  }

  // 7. Palm (Arecaceae)
  if (
    familyText.includes('arecaceae') ||
    familyText.includes('palmae') ||
    corpus.includes('palm') ||
    corpus.includes('chamaedorea') ||
    corpus.includes('dypsis') ||
    corpus.includes('areca') ||
    corpus.includes('phoenix dactylifera') ||
    corpus.includes('rhapis') ||
    corpus.includes('howea') ||
    corpus.includes('caryota') ||
    corpus.includes('livistona') ||
    corpus.includes('washingtonia') ||
    corpus.includes('parlor palm') ||
    corpus.includes('kentia') ||
    corpus.includes('majesty palm')
  ) {
    return STANDARD_CATEGORIES.PALM;
  }

  // 8. Fern (Polypodiopsida, Pteridophyta)
  if (
    familyText.includes('polypodiaceae') ||
    familyText.includes('nephrolepidaceae') ||
    familyText.includes('pteridaceae') ||
    familyText.includes('aspleniaceae') ||
    familyText.includes('dryopteridaceae') ||
    familyText.includes('davalliaceae') ||
    familyText.includes('cyatheaceae') ||
    familyText.includes('adiantaceae') ||
    familyText.includes('blechnaceae') ||
    corpus.includes('fern') ||
    corpus.includes('helecho') ||
    corpus.includes('fougère') ||
    corpus.includes('nephrolepis') ||
    corpus.includes('asplenium') ||
    corpus.includes('adiantum') ||
    corpus.includes('platycerium') ||
    corpus.includes('staghorn') ||
    corpus.includes('bird nest fern') ||
    corpus.includes('bird\'s nest fern') ||
    corpus.includes('maidenhair') ||
    corpus.includes('phlebodium')
  ) {
    return STANDARD_CATEGORIES.FERN;
  }

  // 9. Orchid (Orchidaceae)
  if (
    familyText.includes('orchidaceae') ||
    corpus.includes('orchid') ||
    corpus.includes('orchidée') ||
    corpus.includes('orquídea') ||
    corpus.includes('phalaenopsis') ||
    corpus.includes('cattleya') ||
    corpus.includes('dendrobium') ||
    corpus.includes('oncidium') ||
    corpus.includes('vanda') ||
    corpus.includes('paphiopedilum') ||
    corpus.includes('cymbidium')
  ) {
    return STANDARD_CATEGORIES.ORCHID;
  }

  // 10. Prayer Plant (Marantaceae)
  if (
    familyText.includes('marantaceae') ||
    corpus.includes('prayer plant') ||
    corpus.includes('calathea') ||
    corpus.includes('maranta') ||
    corpus.includes('goeppertia') ||
    corpus.includes('ctenanthe') ||
    corpus.includes('stromanthe') ||
    corpus.includes('rattlesnake plant')
  ) {
    return STANDARD_CATEGORIES.PRAYER_PLANT;
  }

  // 11. Bromeliad (Bromeliaceae)
  if (
    familyText.includes('bromeliaceae') ||
    corpus.includes('bromeliad') ||
    corpus.includes('air plant') ||
    corpus.includes('tillandsia') ||
    corpus.includes('guzmania') ||
    corpus.includes('aechmea') ||
    corpus.includes('neoregelia') ||
    corpus.includes('vriesea') ||
    corpus.includes('cryptanthus') ||
    corpus.includes('billbergia') ||
    corpus.includes('ananas')
  ) {
    return STANDARD_CATEGORIES.BROMELIAD;
  }

  // 12. Carnivorous Plant
  if (
    familyText.includes('droseraceae') ||
    familyText.includes('nepenthaceae') ||
    familyText.includes('sarraceniaceae') ||
    familyText.includes('cephalotaceae') ||
    familyText.includes('lentibulariaceae') ||
    corpus.includes('venus flytrap') ||
    corpus.includes('flytrap') ||
    corpus.includes('pitcher plant') ||
    corpus.includes('sundew') ||
    corpus.includes('nepenthes') ||
    corpus.includes('drosera') ||
    corpus.includes('dionaea') ||
    corpus.includes('sarracenia')
  ) {
    return STANDARD_CATEGORIES.CARNIVOROUS;
  }

  // 13. Vine & Climber
  if (
    data.specimenType === 'VINE' ||
    corpus.includes('vine') ||
    corpus.includes('climber') ||
    corpus.includes('ivy') ||
    corpus.includes('hedera') ||
    corpus.includes('cissus') ||
    corpus.includes('parthenocissus') ||
    corpus.includes('passiflora') ||
    habitText.includes('vine') ||
    habitText.includes('climbing') ||
    habitText.includes('liana')
  ) {
    return STANDARD_CATEGORIES.VINE;
  }

  // 14. Herb
  if (
    data.specimenType === 'HERB' ||
    familyText.includes('lamiaceae') ||
    familyText.includes('apiaceae') ||
    corpus.includes('basil') ||
    corpus.includes('rosemary') ||
    corpus.includes('mint') ||
    corpus.includes('thyme') ||
    corpus.includes('oregano') ||
    corpus.includes('parsley') ||
    corpus.includes('cilantro') ||
    corpus.includes('sage')
  ) {
    return STANDARD_CATEGORIES.HERB;
  }

  // 15. Prominent Flowering Plant
  if (
    familyText.includes('gesneriaceae') ||
    corpus.includes('african violet') ||
    corpus.includes('saintpaulia') ||
    corpus.includes('anthurium andraeanum') ||
    corpus.includes('cyclamen') ||
    corpus.includes('hibiscus') ||
    corpus.includes('azalea') ||
    corpus.includes('gardenia') ||
    corpus.includes('camellia')
  ) {
    return STANDARD_CATEGORIES.FLOWERING;
  }

  // 16. Default: Foliage Plant
  return STANDARD_CATEGORIES.FOLIAGE;
}
