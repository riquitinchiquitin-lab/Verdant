import { MunicipalTreeRecord } from '../models/BotanicalSpecies';

export interface MunicipalFieldMapping {
  municipality: string;
  speciesField: string;
  genusField?: string;
  commonNameField?: string;
  dbhField?: string;
  latField?: string;
  lonField?: string;
  neighborhoodField?: string;
}

export const MUNICIPAL_PRESETS: Record<string, MunicipalFieldMapping> = {
  ottawa: {
    municipality: 'Ottawa',
    speciesField: 'SPECIES',
    genusField: 'GENUS',
    commonNameField: 'COMMON_NAME',
    dbhField: 'DBH',
    neighborhoodField: 'WARD',
  },
  montreal: {
    municipality: 'Montreal',
    speciesField: 'Essence_latin',
    genusField: 'Essence_genre',
    commonNameField: 'Essence_fr',
    dbhField: 'DHP',
    latField: 'Latitude',
    lonField: 'Longitude',
    neighborhoodField: 'Arrondissement',
  },
  toronto: {
    municipality: 'Toronto',
    speciesField: 'BOTANICAL_NAME',
    commonNameField: 'COMMON_NAME',
    dbhField: 'DBH_TRUNK',
    neighborhoodField: 'WARD',
  },
  nyc: {
    municipality: 'New York City',
    speciesField: 'spc_latin',
    commonNameField: 'spc_common',
    dbhField: 'tree_dbh',
    latField: 'latitude',
    lonField: 'longitude',
    neighborhoodField: 'nta_name',
  },
};

export class GeoJsonForestryImporter {
  static parseGeoJson(
    geojson: { type: string; features?: any[] },
    mapping: MunicipalFieldMapping
  ): MunicipalTreeRecord[] {
    if (!geojson?.features || !Array.isArray(geojson.features)) return [];
    const records: MunicipalTreeRecord[] = [];

    for (const feature of geojson.features) {
      const props = feature?.properties || {};
      const coords = feature?.geometry?.coordinates;
      const lon = Array.isArray(coords) ? Number(coords[0]) : Number(props[mapping.lonField || 'longitude']);
      const lat = Array.isArray(coords) ? Number(coords[1]) : Number(props[mapping.latField || 'latitude']);
      const species = String(props[mapping.speciesField] || '').trim();
      if (!species || isNaN(lat) || isNaN(lon)) continue;

      const dbhRaw = mapping.dbhField ? parseFloat(props[mapping.dbhField]) : NaN;
      records.push({
        species,
        genus: mapping.genusField ? props[mapping.genusField] || species.split(' ')[0] : species.split(' ')[0],
        commonName: mapping.commonNameField ? props[mapping.commonNameField] || null : null,
        dbhCm: !isNaN(dbhRaw) ? dbhRaw : null,
        latitude: lat,
        longitude: lon,
        municipality: mapping.municipality,
        neighborhood: mapping.neighborhoodField ? props[mapping.neighborhoodField] || null : null,
      });
    }
    return records;
  }

  static parseCsv(csvText: string, mapping: MunicipalFieldMapping): MunicipalTreeRecord[] {
    const lines = csvText.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length < 2) return [];

    const splitLine = (line: string) => {
      const out: string[] = [];
      let cur = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') inQuotes = !inQuotes;
        else if (c === ',' && !inQuotes) {
          out.push(cur.trim());
          cur = '';
        } else cur += c;
      }
      out.push(cur.trim());
      return out;
    };

    const headers = splitLine(lines[0]).map(h => h.toLowerCase());
    const idx = (name?: string) => (name ? headers.indexOf(name.toLowerCase()) : -1);

    const iSp = idx(mapping.speciesField);
    const iGen = idx(mapping.genusField);
    const iCom = idx(mapping.commonNameField);
    const iDbh = idx(mapping.dbhField);
    const iLat = idx(mapping.latField || 'latitude');
    const iLon = idx(mapping.lonField || 'longitude');
    const iNb = idx(mapping.neighborhoodField);

    const records: MunicipalTreeRecord[] = [];
    for (let r = 1; r < lines.length; r++) {
      const cols = splitLine(lines[r]);
      const species = iSp !== -1 ? cols[iSp] : '';
      const lat = iLat !== -1 ? parseFloat(cols[iLat]) : NaN;
      const lon = iLon !== -1 ? parseFloat(cols[iLon]) : NaN;
      if (!species || isNaN(lat) || isNaN(lon)) continue;

      const dbh = iDbh !== -1 ? parseFloat(cols[iDbh]) : NaN;
      records.push({
        species,
        genus: iGen !== -1 ? cols[iGen] || species.split(' ')[0] : species.split(' ')[0],
        commonName: iCom !== -1 ? cols[iCom] || null : null,
        dbhCm: !isNaN(dbh) ? dbh : null,
        latitude: lat,
        longitude: lon,
        municipality: mapping.municipality,
        neighborhood: iNb !== -1 ? cols[iNb] || null : null,
      });
    }
    return records;
  }
}
