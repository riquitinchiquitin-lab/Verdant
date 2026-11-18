import writeXlsxFile from 'write-excel-file/browser';
import { Plant } from '../types';
import { getShortBarcodeId } from './barcodeService';

const cell = (value: unknown, fontWeight?: 'bold') => ({
  value: value == null ? '' : String(value),
  type: String as StringConstructor,
  ...(fontWeight ? { fontWeight } : {}),
});

/**
 * Generates an Excel file optimized for Niimbot App label import.
 * Format based on user requirements: nickname, species, family, barcode, qr
 */
export const exportPlantsToNiimbotExcel = async (
  plants: Plant[],
  lv: (val: any) => string,
  fileName: string = 'verdant_labels.xlsx'
) => {
  const sanitize = (val: string | null | undefined, fallback: string) =>
    (val || fallback).replace(/\|/g, '').trim();

  const headerRow = [
    cell('nickname', 'bold'),
    cell('species', 'bold'),
    cell('family', 'bold'),
    cell('barcode', 'bold'),
    cell('qr', 'bold'),
  ];

  const dataRows = plants.map((p) => {
    const houseId = sanitize(p.houseId, 'GLOBAL');
    const plantId = sanitize(p.id, 'NEW');
    const species = sanitize(p.species, 'UNKNOWN_SPECIES');
    const family = sanitize(p.family, 'BOTANICAL');
    const hFormatHash = `${houseId}|${plantId}|${species}|${family}`;

    return [
      cell(lv(p.nickname)),
      cell(p.species),
      cell(p.family || '-'),
      cell(getShortBarcodeId(plantId)),
      cell(hFormatHash),
    ];
  });

  await writeXlsxFile([headerRow, ...dataRows], {
    columns: [
      { width: 30 },
      { width: 30 },
      { width: 20 },
      { width: 24 },
      { width: 50 },
    ],
    sheet: 'Labels',
  }).toFile(fileName);
};

export const exportLogsToExcel = async (
  plants: Plant[],
  lv: (val: any) => string,
  fileName: string = 'verdant_care_logs.xlsx'
) => {
  const allLogs: any[] = [];

  plants.forEach((plant) => {
    (plant.logs || []).forEach((log) => {
      allLogs.push({
        _ts: new Date(log.date).getTime() || 0,
        date: new Date(log.date).toLocaleString(),
        plantId: plant.id,
        plantName: lv(plant.nickname),
        species: plant.species,
        logType: log.type,
        value: log.value || '-',
        note: log.localizedNote ? lv(log.localizedNote) : log.note || '-',
        houseId: plant.houseId || 'GLOBAL',
      });
    });
  });

  allLogs.sort((a, b) => b._ts - a._ts);

  const headerRow = [
    cell('Date', 'bold'),
    cell('Plant ID', 'bold'),
    cell('Plant Name', 'bold'),
    cell('Species', 'bold'),
    cell('Log Type', 'bold'),
    cell('Value', 'bold'),
    cell('Note', 'bold'),
    cell('House ID', 'bold'),
  ];

  const dataRows = allLogs.map((r) => [
    cell(r.date),
    cell(r.plantId),
    cell(r.plantName),
    cell(r.species),
    cell(r.logType),
    cell(r.value),
    cell(r.note),
    cell(r.houseId),
  ]);

  await writeXlsxFile([headerRow, ...dataRows], {
    columns: [
      { width: 20 },
      { width: 15 },
      { width: 25 },
      { width: 25 },
      { width: 15 },
      { width: 10 },
      { width: 50 },
      { width: 15 },
    ],
    sheet: 'Care Logs',
  }).toFile(fileName);
};

export const exportCombinedLogsToExcel = async (
  logs: any[],
  fileName: string = 'verdant_system_logs.xlsx'
) => {
  const headerRow = [
    cell('Timestamp', 'bold'),
    cell('Category', 'bold'),
    cell('Event', 'bold'),
    cell('Details', 'bold'),
    cell('Level', 'bold'),
  ];

  const dataRows =
    !logs || logs.length === 0
      ? [[cell('-'), cell('-'), cell('-'), cell('-'), cell('-')]]
      : logs.map((l) => [
          cell(l.timestamp ? new Date(l.timestamp).toLocaleString() : '-'),
          cell(l.category || '-'),
          cell(l.event || '-'),
          cell(l.details || '-'),
          cell(l.level || '-'),
        ]);

  await writeXlsxFile([headerRow, ...dataRows], {
    columns: [
      { width: 25 },
      { width: 15 },
      { width: 30 },
      { width: 60 },
      { width: 10 },
    ],
    sheet: !logs || logs.length === 0 ? 'Logs' : 'System Logs',
  }).toFile(fileName);
};
