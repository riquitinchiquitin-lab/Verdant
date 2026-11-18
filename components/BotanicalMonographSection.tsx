import React from 'react';
import { 
  FileText, 
  Sparkles, 
  Flower2, 
  Heart, 
  Layers, 
  ShieldCheck, 
  Wind, 
  Home, 
  Scissors, 
  Sun, 
  Info, 
  CheckCircle2, 
  Dna,
  Compass,
  Lightbulb,
  Zap,
  Clock,
  Award,
  Leaf
} from 'lucide-react';
import { Plant } from '../types';
import { useLanguage } from '../context/LanguageContext';

interface BotanicalMonographSectionProps {
  plant: Plant;
  className?: string;
}

export const BotanicalMonographSection: React.FC<BotanicalMonographSectionProps> = ({ plant, className = '' }) => {
  const { t, lv, lva } = useLanguage();

  const speciesLower = (plant.species || '').toLowerCase();
  const familyLower = (plant.family || '').toLowerCase();
  const nicknameLower = (lv(plant.nickname) || '').toLowerCase();

  // --- 1. BOTANICAL DESCRIPTION SYNTHESIS ---
  const descriptionText = lv(plant.description) || (() => {
    const habit = lv(plant.growthHabit as any) || 'Herbaceous perennial';
    const origin = lv(plant.origin) ? `native to ${lv(plant.origin)}` : '';
    const foliage = lv(plant.foliageTraits as any) ? `It is distinguished by its ${lv(plant.foliageTraits as any).toLowerCase()}.` : '';
    const size = (plant.maxHeight || plant.maxSpread) 
      ? `Under optimal cultivation, specimens reach ${plant.maxHeight ? `${plant.maxHeight} cm in height` : ''}${plant.maxHeight && plant.maxSpread ? ' by ' : ''}${plant.maxSpread ? `${plant.maxSpread} cm in canopy spread` : ''}.`
      : '';
    return `${plant.species} is a ${habit.toLowerCase()}${origin ? ` ${origin}` : ''}. ${foliage} ${size} Valued for its robust architectural silhouette, physiological drought tolerance, and adaptability to domestic environments.`;
  })();

  // --- 2. CULTIVATION AND USES ---
  const customUses = lva(plant.cultivationUses as any);
  const synthesizedUses = (() => {
    if (customUses && customUses.length > 0) {
      return customUses.map((u, i) => ({
        id: `use-${i}`,
        title: `Cultivation & Application ${i + 1}`,
        description: u,
        icon: <Sparkles className="w-4 h-4 text-md-primary" />
      }));
    }

    const usesList = [];

    // Air Purification / Clean Air
    usesList.push({
      id: 'air_purification',
      title: t('lbl_air_purification') || 'Air Quality & Toxin Filtration',
      description: 'Documented in clean air research to filter household volatile organic compounds (formaldehyde, benzene, trichloroethylene, and xylene). Exhibits Crassulacean Acid Metabolism (CAM), absorbing CO₂ and releasing oxygen during night hours.',
      icon: <Wind className="w-4 h-4 text-teal-500" />
    });

    // Interior Architecture & Low-Maintenance
    usesList.push({
      id: 'interior_design',
      title: t('lbl_interior_architecture') || 'Architectural Foliage & Interior Design',
      description: 'Widely cultivated in residential and commercial architecture for its strong structural vertical lines, minimal root-zone requirements, and exceptional tolerance to low-light indoor environments.',
      icon: <Home className="w-4 h-4 text-indigo-500" />
    });

    // Landscaping & Xeriscaping
    if (plant.droughtTolerant || speciesLower.includes('sansevieria') || speciesLower.includes('dracaena') || familyLower.includes('asparagaceae') || familyLower.includes('cact')) {
      usesList.push({
        id: 'xeriscaping',
        title: t('lbl_xeriscaping') || 'Xeriscaping & Arid Landscaping',
        description: 'Ideal candidate for water-wise sustainable landscaping, rock gardens, and outdoor container planting in subtropical and Mediterranean climate zones (USDA 9–11).',
        icon: <Sun className="w-4 h-4 text-amber-500" />
      });
    }

    // Traditional / Fiber / Ethnobotanical
    if (speciesLower.includes('dracaena') || speciesLower.includes('sansevieria') || familyLower.includes('asparagaceae')) {
      usesList.push({
        id: 'fiber_ethnobotanical',
        title: t('lbl_ethnobotanical') || 'Bowstring Fiber & Traditional Uses',
        description: 'Historically cultivated for high-tensile leaf fibers used to craft durable bowstrings, cordage, fishing nets, and woven goods. Traditional ethnobotanical applications include sap use for soothing skin irritations.',
        icon: <Scissors className="w-4 h-4 text-emerald-500" />
      });
    } else {
      usesList.push({
        id: 'ornamental_container',
        title: t('lbl_ornamental') || 'Container Gardening & Soil Stabilization',
        description: 'Cultivated in indoor pots and outdoor planters. Vigorous root system aids soil containment, while architectural foliage provides a dynamic focal accent in plant collections.',
        icon: <Layers className="w-4 h-4 text-emerald-500" />
      });
    }

    return usesList;
  })();

  // --- 3. VARIETIES & CULTIVARS ---
  const cultivarsList = (() => {
    // If plant has explicit cultivars in plant.cultivars
    if (plant.cultivars && plant.cultivars.length > 0) {
      return plant.cultivars.map((c) => ({
        name: c,
        traits: 'Recognized botanical cultivar and horticulturally selected clone.',
        form: 'Cultivar'
      }));
    }

    // If plant has infraspecific taxa
    if (plant.infraspecificTaxa && plant.infraspecificTaxa.length > 0) {
      return plant.infraspecificTaxa.map((tax) => ({
        name: tax,
        traits: 'Botanically accepted infraspecific subspecies or taxonomic variety.',
        form: 'Infraspecific Taxon'
      }));
    }

    // Species-specific curated variety registries for common specimens
    if (speciesLower.includes('dracaena trifasciata') || speciesLower.includes('sansevieria trifasciata')) {
      return [
        {
          name: "'Laurentii' (Golden Snake Plant)",
          traits: 'Signature golden-yellow variegated margins framing deep green, horizontally banded sword leaves.',
          form: 'Variegated Standard'
        },
        {
          name: "'Moonshine' (Silver Ghost)",
          traits: 'Broad, luminous silvery-mint green leaves with faint margins, darkening to olive-jade with maturity.',
          form: 'Silvery Mutation'
        },
        {
          name: "'Zeylanica' (Ceylon Bowstring)",
          traits: 'Classic unmargined ancestral form showcasing dark emerald bands on light sage background.',
          form: 'Botanical Archetype'
        },
        {
          name: "'Black Coral'",
          traits: 'Intense charcoal-green upright blades marked with distinct silver-gray horizontal waves.',
          form: 'Melanistic Selection'
        },
        {
          name: "'Futura Robusta'",
          traits: 'Semi-compact broad vase-shaped rosette with dense silvery-green marbling and wavy foliage.',
          form: 'Semi-Dwarf Rosette'
        },
        {
          name: "'Golden Hahnii' (Bird's Nest)",
          traits: 'Miniature low-growing spiraled nest rosette featuring creamy-gold longitudinal stripes.',
          form: 'Dwarf Rosette'
        }
      ];
    }

    if (speciesLower.includes('monstera deliciosa')) {
      return [
        { name: "'Borsigiana'", traits: 'Vigorous compact climbing vine with shorter internodes and smaller fenestrated foliage.', form: 'Climbing Variety' },
        { name: "'Albo Variegata'", traits: 'High-contrast pure white chimeric sectoral variegation across leaf blades.', form: 'Chimera Cultivar' },
        { name: "'Thai Constellation'", traits: 'Genetically stable cream-yellow starry flecks and galaxy splashes.', form: 'Lab-Cloned Cultivar' },
        { name: "'Aurea' (Marmorata)", traits: 'Striking chartreuse-gold marbled variegation developing with light intensity.', form: 'Rare Mutation' }
      ];
    }

    if (speciesLower.includes('epipremnum') || nicknameLower.includes('pothos')) {
      return [
        { name: "'Golden'", traits: 'Classic heartleaf vine with splashed warm gold patterns across glossy foliage.', form: 'Standard Form' },
        { name: "'Marble Queen'", traits: 'Heavy creamy-white marbling dominating more than half the leaf surface.', form: 'Variegated Cultivar' },
        { name: "'Neon'", traits: 'Electric chartreuse to vibrant lime-yellow heart-shaped blades without markings.', form: 'Solid Pigment Form' },
        { name: "'N'Joy'", traits: 'Compact leaves with crisp white sectoral patches and distinct green margins.', form: 'Dwarf Selection' }
      ];
    }

    if (speciesLower.includes('ficus elastica')) {
      return [
        { name: "'Burgundy'", traits: 'Deep dark reddish-black glossy leaves with bright red emergent sheath covers.', form: 'Melanic Selection' },
        { name: "'Tineke'", traits: 'Tricolor variegation with creamy-white, gray-green, and blush-pink undertones.', form: 'Pastel Variegated' },
        { name: "'Ruby'", traits: 'Dramatic coral-pink flushed variegation with cream and deep green sectors.', form: 'Anthocyanin Cultivar' }
      ];
    }

    return [
      {
        name: plant.variety ? `'${plant.variety}'` : `${plant.species} Typica`,
        traits: 'Standard wild-type morphological form and core horticultural botanical lineage.',
        form: 'Type Specimen'
      }
    ];
  })();

  // --- 4. CULTURAL SIGNIFICANCE & FOLKLORE ---
  const culturalText = lv(plant.culturalSignificance as any) || (() => {
    if (speciesLower.includes('dracaena') || speciesLower.includes('sansevieria')) {
      return 'In Asian cultural traditions and Feng Shui philosophy, the plant is treasured as a talisman of protective energy, steadfast resilience, and purity. Its upward-pointing sword-shaped foliage is traditionally positioned near building entryways to deflect negative energy (Chi) and attract prosperity, longevity, and clear thought. In West African folklore, it is revered as a sacred plant linked to Oya and Ogun (protective deities of storms and iron), while in Brazilian and Afro-Caribbean heritage, it is known as the "Espada de São Jorge" (Sword of Saint George), symbolizing spiritual shielding and courage.';
    }
    if (speciesLower.includes('monstera')) {
      return 'In traditional Mexican and Central American folklore, Monstera is celebrated as a symbol of abundance, honoring the wild life force of the tropical rainforest canopy. Its architectural silhouette has become a global emblem of tropical vitality, natural shelter, and architectural modernism.';
    }
    return `In horticultural folklore and botanical tradition, ${plant.species} embodies resilience, botanical fortitude, and harmonious vitality within the home. Prized across domestic and cultural spaces as a living symbol of continuous growth, endurance, and connection to the natural world.`;
  })();

  // --- 5. FRUIT & FLOWER TYPE WITH DETAILS ---
  const flowerTypeTitle = lv(plant.flowerType as any) || (() => {
    if (speciesLower.includes('dracaena') || speciesLower.includes('sansevieria')) {
      return 'Terminal Raceme / Paniculate Spike';
    }
    if (familyLower.includes('araceae')) {
      return 'Spadix enclosed by Spathe';
    }
    if (familyLower.includes('orchid')) {
      return 'Zygomorphic Floral Raceme';
    }
    return 'Inflorescence / Flower Cluster';
  })();

  const flowerDetailsText = lv(plant.flowerTraits as any) || (() => {
    if (speciesLower.includes('dracaena') || speciesLower.includes('sansevieria')) {
      return 'Produces dense clusters of tubular, slender, greenish-white to pale cream actinomorphic florets borne on tall upright central flower scapes. Florets open in the evening and emit an intensely sweet, nocturnal, vanilla-jasmine fragrance accompanied by sticky nectar drops, evolved to attract nocturnal hawkmoths and pollinating insects.';
    }
    return 'Exhibits specialized floral morphology adapted to its native pollinators, producing distinct floral structures that emerge during mature seasonal cycles.';
  })();

  const fruitTypeTitle = lv(plant.fruitType as any) || (() => {
    if (speciesLower.includes('dracaena') || speciesLower.includes('sansevieria')) {
      return 'Fleshy Globose Berry';
    }
    if (familyLower.includes('araceae')) {
      return 'Clustered Fleshy Berry Spathe';
    }
    if (familyLower.includes('fabaceae')) {
      return 'Legume / Dehiscent Pod';
    }
    return 'Loculicidal Capsule / Berry';
  })();

  const fruitDetailsText = lv(plant.fruitTraits as any) || (() => {
    if (speciesLower.includes('dracaena') || speciesLower.includes('sansevieria')) {
      return 'Following successful pollination, flowers transition into small, spherical, fleshy globose berries (~8–10mm in diameter). The berries mature from pale green to vibrant bright orange or red-orange, each encapsulating 1 to 3 hard, rounded seeds. Seed dispersal occurs primarily via endozoochory (ingested and distributed by frugivorous birds).';
    }
    return 'Produces specialized seed-bearing capsules or fleshy fruit structures engineered for seed distribution via native fauna, wind, or natural gravity.';
  })();

  // --- 6. DID YOU KNOW? (BOTANICAL CURIOSITIES & EVOLUTIONARY ADAPTATIONS) ---
  const customFacts = lva(plant.didYouKnow as any);
  const didYouKnowFacts = (() => {
    if (customFacts && customFacts.length > 0) {
      return customFacts.map((factText, i) => ({
        title: `Botanical Curiosity #${i + 1}`,
        content: factText,
        icon: <Zap className="w-4 h-4 text-amber-500" />
      }));
    }

    if (speciesLower.includes('dracaena trifasciata') || speciesLower.includes('sansevieria')) {
      return [
        {
          title: 'Nighttime Oxygen Factory (CAM)',
          content: 'Unlike 95% of all plants that consume oxygen during the night, snake plants practice Crassulacean Acid Metabolism (CAM). They keep their pores tightly sealed during the heat of day and open them exclusively at night to absorb carbon dioxide and release pure oxygen, making them the premier bedroom companion.',
          icon: <Wind className="w-4 h-4 text-teal-400" />
        },
        {
          title: 'NASA Clean Air Champion',
          content: "In NASA's landmark Clean Air Study, snake plants demonstrated the remarkable capability to break down more than 107 known airborne toxins and heavy organic chemicals, including cancer-causing benzene, formaldehyde, xylene, and toluene.",
          icon: <Award className="w-4 h-4 text-amber-400" />
        },
        {
          title: 'Secret Identity & 2017 Reclassification',
          content: 'For over 250 years, the plant was botanically categorized under the genus Sansevieria. However, comprehensive molecular phylogenetic DNA testing in 2017 proved conclusively that it is genetically a true Dracaena, closely related to Dragon Trees and Corn Plants!',
          icon: <Dna className="w-4 h-4 text-indigo-400" />
        },
        {
          title: 'Unbreakable African Royal Fiber',
          content: 'Indigenous African tribes and hunters historically extracted the plant’s exceptionally tensile vascular leaf fibers to weave lightweight, moisture-proof bowstrings—giving birth to its enduring common moniker "Bowstring Hemp."',
          icon: <Scissors className="w-4 h-4 text-emerald-400" />
        }
      ];
    }

    if (speciesLower.includes('monstera deliciosa')) {
      return [
        {
          title: 'Hurricane Survival Windows',
          content: 'The iconic holes in Monstera leaves (fenestrations) are not just aesthetic—they evolved so torrential tropical downpours and hurricane-force winds can blow straight through the foliage without snapping the giant leaves.',
          icon: <Wind className="w-4 h-4 text-sky-400" />
        },
        {
          title: 'Skototropism (Shadow Hunting)',
          content: 'Young Monstera seedlings exhibit negative phototropism: they deliberately steer away from sunlight, crawling across dark jungle floors toward the deepest shadow to locate the trunk of a giant canopy tree to climb!',
          icon: <Compass className="w-4 h-4 text-amber-400" />
        },
        {
          title: 'Edible Monster Fruit',
          content: 'Its species name "deliciosa" literally translates to delicious! In nature, mature Monstera plants bear 25cm conical fruits that take an entire year to ripen and taste like an exotic fusion of pineapple, banana, and mango.',
          icon: <Sparkles className="w-4 h-4 text-emerald-400" />
        },
        {
          title: 'Climbing with Aerial Hydration',
          content: 'Monstera aerial roots do not just anchor the vine to host bark—they actively absorb ambient humidity and rainfall directly from the air, channeling water down the vine without relying solely on ground roots.',
          icon: <Layers className="w-4 h-4 text-indigo-400" />
        }
      ];
    }

    if (speciesLower.includes('epipremnum') || nicknameLower.includes('pothos')) {
      return [
        {
          title: 'The Botanical Vampire',
          content: 'Known worldwide as "Devil\'s Ivy" because it is nearly indestructible and remains vibrant green even when kept in pitch-black closets or windowless rooms for weeks at a time.',
          icon: <ShieldCheck className="w-4 h-4 text-teal-400" />
        },
        {
          title: 'Lost the Ability to Bloom',
          content: 'Due to a prehistoric genetic mutation in its gibberellin synthesis pathway, mature pothos plants in the wild have almost completely lost the natural capacity to flower, reproducing entirely through clonal vegetative runners.',
          icon: <Dna className="w-4 h-4 text-rose-400" />
        }
      ];
    }

    if (speciesLower.includes('ficus')) {
      return [
        {
          title: 'Living Architecture of Meghalaya',
          content: 'Indigenous Khasi communities in northeast India guide the aerial roots of Ficus elastica across swollen monsoon rivers over several generations, creating living bridges that support dozens of travelers and strengthen with age.',
          icon: <Home className="w-4 h-4 text-emerald-400" />
        },
        {
          title: 'Ancient Rubber Heritage',
          content: 'Before the global rise of South American Para rubber trees (Hevea brasiliensis), the sticky milky white latex sap of Ficus elastica served as the primary natural rubber material throughout ancient Asia.',
          icon: <Clock className="w-4 h-4 text-amber-400" />
        }
      ];
    }

    // Dynamic fallback for any other botanical specimen
    return [
      {
        title: 'Evolutionary Survival Engine',
        content: `As a member of the ${plant.family || 'plant'} family, this specimen has evolved specialized cellular adaptations to maximize photosynthetic light interception while conserving vital hydration in its native ecosystem.`,
        icon: <Zap className="w-4 h-4 text-amber-400" />
      },
      {
        title: 'Ecological Symbiosis',
        content: `${plant.species} co-evolved with native pollinators and soil mycorrhizal fungi to create a self-sustaining micro-ecosystem capable of withstanding seasonal climactic fluctuations.`,
        icon: <Leaf className="w-4 h-4 text-emerald-400" />
      }
    ];
  })();

  return (
    <div className={`space-y-5 ${className}`}>
      {/* 1. DESCRIPTION OF THE PLANT */}
      <section className="bg-md-surface-container rounded-[26px] p-5 sm:p-6 border border-md-outline-variant/25 space-y-3.5 shadow-xs">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-xl bg-md-primary-container text-md-on-primary-container">
            <FileText className="w-4 h-4 text-md-primary" />
          </div>
          <div>
            <h3 className="text-base font-bold text-md-on-surface tracking-tight">
              {t('lbl_botanical_description') || 'Botanical Monograph & Species Description'}
            </h3>
            <p className="text-xs text-md-on-surface-variant">
              Comprehensive morphological profile, botanical structure, and growth habit
            </p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-md-surface-container-low border border-md-outline-variant/20 space-y-2.5">
          <p className="text-xs sm:text-sm text-md-on-surface leading-relaxed font-normal">
            {descriptionText}
          </p>

          {/* Quick Morphology Dimension Badges */}
          <div className="flex flex-wrap gap-2 pt-2 border-t border-md-outline-variant/15 text-xs">
            {plant.growthHabit && (
              <span className="px-3 py-1 rounded-full font-medium bg-md-surface-container-high text-md-on-surface">
                Habit: {lv(plant.growthHabit as any)}
              </span>
            )}
            {plant.lifespan && (
              <span className="px-3 py-1 rounded-full font-medium bg-md-surface-container-high text-md-on-surface">
                Life Cycle: {lv(plant.lifespan as any)}
              </span>
            )}
            {(plant.maxHeight || plant.maxSpread) && (
              <span className="px-3 py-1 rounded-full font-medium bg-md-surface-container-high text-md-on-surface">
                Mature Size: {plant.maxHeight ? `${plant.maxHeight}cm H` : ''}{plant.maxHeight && plant.maxSpread ? ' × ' : ''}{plant.maxSpread ? `${plant.maxSpread}cm W` : ''}
              </span>
            )}
            {plant.etymology && (
              <span className="px-3 py-1 rounded-full font-medium bg-md-primary-container/50 text-md-on-primary-container">
                Etymology: {lv(plant.etymology as any)}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* 2. CULTIVATION AND USES */}
      <section className="bg-md-surface-container rounded-[26px] p-5 sm:p-6 border border-md-outline-variant/25 space-y-3.5 shadow-xs">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-xl bg-md-secondary-container text-md-on-secondary-container">
            <Sparkles className="w-4 h-4 text-md-secondary" />
          </div>
          <div>
            <h3 className="text-base font-bold text-md-on-surface tracking-tight">
              {t('lbl_cultivation_and_uses') || 'Cultivation, Applications & Practical Uses'}
            </h3>
            <p className="text-xs text-md-on-surface-variant">
              Interior landscaping, air purification, horticulture, and traditional ethnobotanical applications
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {synthesizedUses.map((u) => (
            <div
              key={u.id}
              className="p-4 rounded-2xl bg-md-surface-container-low border border-md-outline-variant/20 space-y-1.5 hover:border-md-primary/30 transition-all duration-200"
            >
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-md-surface-container-highest shrink-0">
                  {u.icon}
                </span>
                <p className="text-xs font-bold text-md-on-surface tracking-tight">
                  {u.title}
                </p>
              </div>
              <p className="text-xs text-md-on-surface-variant leading-relaxed pl-8">
                {u.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* 3. VARIETIES & CULTIVARS */}
      <section className="bg-md-surface-container rounded-[26px] p-5 sm:p-6 border border-md-outline-variant/25 space-y-3.5 shadow-xs">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-xl bg-md-tertiary-container text-md-on-tertiary-container">
              <Dna className="w-4 h-4 text-md-tertiary" />
            </div>
            <div>
              <h3 className="text-base font-bold text-md-on-surface tracking-tight">
                {t('lbl_varieties_cultivars') || 'Recognized Varieties & Cultivars'}
              </h3>
              <p className="text-xs text-md-on-surface-variant">
                Horticultural selections, leaf variegations, and infraspecific forms
              </p>
            </div>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-md-surface-container-high text-md-on-surface-variant">
            {cultivarsList.length} Varieties
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {cultivarsList.map((c, idx) => (
            <div
              key={idx}
              className="p-4 rounded-2xl bg-md-surface-container-low border border-md-outline-variant/20 space-y-1.5 hover:border-md-primary/40 transition-all duration-200"
            >
              <div className="flex items-center justify-between gap-1.5">
                <p className="text-xs font-bold text-md-on-surface tracking-tight truncate font-serif">
                  {c.name}
                </p>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-md-surface-container-highest text-md-on-surface-variant/80 shrink-0">
                  {c.form}
                </span>
              </div>
              <p className="text-xs text-md-on-surface-variant leading-relaxed">
                {c.traits}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* 4. CULTURAL SIGNIFICANCE & FOLKLORE */}
      <section className="bg-md-surface-container rounded-[26px] p-5 sm:p-6 border border-md-outline-variant/25 space-y-3.5 shadow-xs">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-xl bg-md-primary-container text-md-on-primary-container">
            <Heart className="w-4 h-4 text-md-primary" />
          </div>
          <div>
            <h3 className="text-base font-bold text-md-on-surface tracking-tight">
              {t('lbl_cultural_significance') || 'Cultural Significance, Symbolism & Folklore'}
            </h3>
            <p className="text-xs text-md-on-surface-variant">
              Traditional symbolism, Feng Shui energy placement, folklore, and heritage
            </p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-md-primary-container/20 border border-md-primary/25 space-y-2">
          <p className="text-xs sm:text-sm text-md-on-surface leading-relaxed font-normal">
            {culturalText}
          </p>

          <div className="flex flex-wrap gap-2 pt-2 border-t border-md-outline-variant/20 text-xs">
            <span className="px-2.5 py-1 rounded-full font-medium bg-md-surface-container text-md-on-surface flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-md-primary" />
              <span>Resilience & Fortitude</span>
            </span>
            <span className="px-2.5 py-1 rounded-full font-medium bg-md-surface-container text-md-on-surface flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-md-primary" />
              <span>Protective Energy (Chi)</span>
            </span>
            <span className="px-2.5 py-1 rounded-full font-medium bg-md-surface-container text-md-on-surface flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-md-primary" />
              <span>Endurance & Longevity</span>
            </span>
          </div>
        </div>
      </section>

      {/* 5. FRUIT OR FLOWER TYPE WITH DETAILS */}
      <section className="bg-md-surface-container rounded-[26px] p-5 sm:p-6 border border-md-outline-variant/25 space-y-4 shadow-xs">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-xl bg-md-secondary-container text-md-on-secondary-container">
              <Flower2 className="w-4 h-4 text-md-secondary" />
            </div>
            <div>
              <h3 className="text-base font-bold text-md-on-surface tracking-tight">
                {t('lbl_flower_fruit_details') || 'Inflorescence, Flower & Fruit Morphology'}
              </h3>
              <p className="text-xs text-md-on-surface-variant">
                Detailed botanical taxonomy of floral structures, seed capsules, and dispersal vectors
              </p>
            </div>
          </div>

          {plant.bloomSeason && (
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-md-secondary-container/60 text-md-on-secondary-container flex items-center gap-1.5 border border-md-outline-variant/20">
              <Sun className="w-3.5 h-3.5 text-amber-500" />
              <span>{lv(plant.bloomSeason as any)}</span>
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* FLOWER & INFLORESCENCE DETAILS CARD */}
          <div className="p-4 rounded-2xl bg-md-surface-container-low border border-md-outline-variant/20 space-y-2.5">
            <div className="flex items-center justify-between gap-2 border-b border-md-outline-variant/15 pb-2">
              <div className="flex items-center gap-2">
                <Flower2 className="w-4 h-4 text-md-primary shrink-0" />
                <span className="text-xs font-bold text-md-on-surface uppercase tracking-wide">
                  {t('lbl_flower_type') || 'Flower & Inflorescence'}
                </span>
              </div>
              <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-md-primary-container text-md-on-primary-container">
                {flowerTypeTitle}
              </span>
            </div>

            <p className="text-xs text-md-on-surface-variant leading-relaxed">
              {flowerDetailsText}
            </p>

            {lva(plant.attracts as any)?.length > 0 && (
              <div className="pt-2 border-t border-md-outline-variant/15 flex items-center gap-2 text-[11px] text-md-on-surface-variant">
                <span className="font-semibold text-md-on-surface">Attracts:</span>
                <span>{lva(plant.attracts as any).join(', ')}</span>
              </div>
            )}
          </div>

          {/* FRUIT & SEED CAPSULE DETAILS CARD */}
          <div className="p-4 rounded-2xl bg-md-surface-container-low border border-md-outline-variant/20 space-y-2.5">
            <div className="flex items-center justify-between gap-2 border-b border-md-outline-variant/15 pb-2">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-amber-500 shrink-0" />
                <span className="text-xs font-bold text-md-on-surface uppercase tracking-wide">
                  {t('lbl_fruit_type') || 'Fruit & Seed Capsule'}
                </span>
              </div>
              <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400">
                {fruitTypeTitle}
              </span>
            </div>

            <p className="text-xs text-md-on-surface-variant leading-relaxed">
              {fruitDetailsText}
            </p>

            <div className="pt-2 border-t border-md-outline-variant/15 flex items-center gap-2 text-[11px] text-md-on-surface-variant">
              <span className="font-semibold text-md-on-surface">Dispersal:</span>
              <span>Endozoochory (Frugivorous Birds & Wildlife)</span>
            </div>
          </div>
        </div>
      </section>

      {/* 6. DID YOU KNOW? (BOTANICAL CURIOSITIES & EVOLUTIONARY ADAPTATIONS) */}
      <section className="bg-gradient-to-br from-amber-500/10 via-md-surface-container to-md-surface-container rounded-[26px] p-5 sm:p-6 border border-amber-500/30 space-y-4 shadow-xs">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-2xl bg-amber-500/20 text-amber-500 shadow-xs ring-1 ring-amber-500/30">
              <Lightbulb className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-md-on-surface tracking-tight">
                  {t('lbl_did_you_know') || 'Did You Know?'}
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-600 dark:text-amber-300">
                  Botanical Curiosities
                </span>
              </div>
              <p className="text-xs text-md-on-surface-variant">
                Evolutionary adaptations, biological superpowers & fascinating botanical trivia
              </p>
            </div>
          </div>
        </div>

        {/* AI Insight Revelation (if present) */}
        {lv(plant.aiInsight) && (
          <div className="p-4 rounded-2xl bg-amber-500/15 border border-amber-500/30 space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5" />
              <span>{t('lbl_botanical_insight') || 'Botanical Discovery & Insight'}</span>
            </div>
            <p className="text-xs sm:text-sm text-md-on-surface leading-relaxed font-medium">
              {lv(plant.aiInsight)}
            </p>
          </div>
        )}

        {/* Curated Trivia Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {didYouKnowFacts.map((fact, idx) => (
            <div
              key={idx}
              className="p-4 rounded-2xl bg-md-surface-container-low border border-md-outline-variant/20 space-y-2 hover:border-amber-500/40 hover:bg-md-surface-container-low/90 transition-all duration-200"
            >
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-xl bg-amber-500/15 text-amber-500 shrink-0">
                  {fact.icon}
                </span>
                <p className="text-xs font-bold text-md-on-surface tracking-tight">
                  {fact.title}
                </p>
              </div>
              <p className="text-xs text-md-on-surface-variant leading-relaxed pl-8">
                {fact.content}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
