export interface BgciTryTraitRecord {
  species: string;
  bgciId?: string | null;
  bgciCountryEndemic?: boolean | null;
  iucnCategory?: string | null;
  trySpeciesId?: string | null;
  woodDensity?: string | null;
  leafTraits?: string | null;
  hardinessZoneMin?: string | null;
  maxHeightCm?: number | null;
}

const parseCsvRow = (line: string, delimiter: string): string[] => {
  if (delimiter === '\t') return line.split('\t').map(s => s.trim().replace(/^"|"$/g, ''));
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQuotes = !inQuotes;
    else if (c === delimiter && !inQuotes) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur.trim());
  return out;
};

export class CsvTraitImporter {
  static parse(rawText: string, delimiter?: ',' | '\t'): Map<string, BgciTryTraitRecord> {
    const lines = rawText.split(/\r?\n/).filter(l => l.trim().length > 0);
    const map = new Map<string, BgciTryTraitRecord>();
    if (lines.length < 2) return map;

    const detectedDelimiter = delimiter || (lines[0].includes('\t') ? '\t' : ',');
    const headers = parseCsvRow(lines[0], detectedDelimiter).map(h => h.toLowerCase());
    const idx = (...candidates: string[]) => {
      for (const c of candidates) {
        const found = headers.indexOf(c.toLowerCase());
        if (found !== -1) return found;
      }
      return -1;
    };

    const iSpecies = idx('species', 'taxonname', 'acc_species_name', 'scientificname');
    const iBgciId = idx('bgci_id', 'bgciid');
    const iEndemic = idx('endemic', 'country_endemic', 'bgci_endemic');
    const iIucn = idx('iucn', 'iucn_status', 'red_list_category');
    const iTryId = idx('try_species_id', 'accspeciesid');
    const iWood = idx('wood_density', 'wooddensity');
    const iLeaf = idx('leaf_traits', 'sla', 'leaf_area');
    const iZone = idx('hardiness_zone', 'hardiness_min');
    const iHeight = idx('max_height_cm', 'plant_height_cm', 'height_cm');

    for (let r = 1; r < lines.length; r++) {
      const cols = parseCsvRow(lines[r], detectedDelimiter);
      const species = iSpecies !== -1 ? cols[iSpecies] : '';
      if (!species) continue;

      const key = species.toLowerCase();
      const endemicRaw = iEndemic !== -1 ? cols[iEndemic]?.toLowerCase() : '';
      const heightRaw = iHeight !== -1 ? parseFloat(cols[iHeight]) : NaN;

      map.set(key, {
        species,
        bgciId: iBgciId !== -1 ? cols[iBgciId] || null : null,
        bgciCountryEndemic: endemicRaw ? ['true', '1', 'yes', 'y'].includes(endemicRaw) : null,
        iucnCategory: iIucn !== -1 ? cols[iIucn] || null : null,
        trySpeciesId: iTryId !== -1 ? cols[iTryId] || null : null,
        woodDensity: iWood !== -1 ? cols[iWood] || null : null,
        leafTraits: iLeaf !== -1 ? cols[iLeaf] || null : null,
        hardinessZoneMin: iZone !== -1 ? cols[iZone] || null : null,
        maxHeightCm: !isNaN(heightRaw) ? heightRaw : null,
      });
    }

    return map;
  }
}
