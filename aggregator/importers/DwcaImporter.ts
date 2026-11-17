import { CanadianDistributionStatus } from '../models/BotanicalSpecies';

export interface DwcaTaxonRecord {
  taxonID: string;
  scientificName: string;
  acceptedNameUsage?: string;
  taxonomicStatus?: string;
  family?: string;
  genus?: string;
  scientificNameAuthorship?: string;
  taxonRank?: string;
  vernacularNamesEn: string[];
  vernacularNamesFr: string[];
  provinces: Record<string, CanadianDistributionStatus>;
}

const splitDelimitedLine = (line: string, delimiter: string): string[] => {
  if (delimiter === '\t') return line.split('\t').map(s => s.trim().replace(/^"|"$/g, ''));
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
};

export class DwcaImporter {
  static parseTaxonTable(rawText: string, delimiter: '\t' | ',' = '\t'): Map<string, DwcaTaxonRecord> {
    const lines = rawText.split(/\r?\n/).filter(l => l.trim().length > 0);
    const map = new Map<string, DwcaTaxonRecord>();
    if (lines.length < 2) return map;

    const headers = splitDelimitedLine(lines[0], delimiter).map(h => h.toLowerCase());
    const idx = (name: string) => headers.indexOf(name.toLowerCase());

    const iId = idx('taxonid') !== -1 ? idx('taxonid') : idx('id');
    const iSci = idx('scientificname');
    const iAcc = idx('acceptednameusage');
    const iStat = idx('taxonomicstatus');
    const iFam = idx('family');
    const iGen = idx('genus');
    const iAuth = idx('scientificnameauthorship');
    const iRank = idx('taxonrank');
    const iProv = idx('locality');
    const iOcc = idx('occurrencestatus');
    const iEn = idx('vernacularnameen');
    const iFr = idx('vernacularnamefr');

    for (let r = 1; r < lines.length; r++) {
      const cols = splitDelimitedLine(lines[r], delimiter);
      const sci = iSci !== -1 ? cols[iSci] : '';
      if (!sci) continue;

      const key = sci.toLowerCase();
      const existing = map.get(key) || {
        taxonID: iId !== -1 ? cols[iId] : `dwca-${r}`,
        scientificName: sci,
        acceptedNameUsage: iAcc !== -1 ? cols[iAcc] : undefined,
        taxonomicStatus: iStat !== -1 ? cols[iStat] : undefined,
        family: iFam !== -1 ? cols[iFam] : undefined,
        genus: iGen !== -1 ? cols[iGen] : undefined,
        scientificNameAuthorship: iAuth !== -1 ? cols[iAuth] : undefined,
        taxonRank: iRank !== -1 ? cols[iRank] : undefined,
        vernacularNamesEn: [],
        vernacularNamesFr: [],
        provinces: {},
      };

      if (iEn !== -1 && cols[iEn]) existing.vernacularNamesEn.push(cols[iEn]);
      if (iFr !== -1 && cols[iFr]) existing.vernacularNamesFr.push(cols[iFr]);
      if (iProv !== -1 && cols[iProv] && iOcc !== -1 && cols[iOcc]) {
        const st = cols[iOcc].toLowerCase() as CanadianDistributionStatus;
        existing.provinces[cols[iProv]] = st;
      }

      map.set(key, existing);
    }

    return map;
  }
}
