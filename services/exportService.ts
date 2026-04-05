import * as XLSX from 'xlsx';
import { Plant } from '../types';

/**
 * Generates an Excel file optimized for Niimbot App label import.
 * Format based on user requirements: nickname, species, family, qr
 */
export const exportPlantsToNiimbotExcel = (plants: Plant[], lv: (val: any) => string, fileName: string = 'verdant_labels.xlsx') => {
  // Helper to ensure protocol fields don't contain the pipe separator
  const sanitize = (val: string | null | undefined, fallback: string) => 
    (val || fallback).replace(/\|/g, '').trim();

  // 1. Prepare data mapping exactly to the requested headers
  const data = plants.map(p => {
    // Construct the H-Format Protocol Hash for the QR column
    // UPDATED STRUCTURE: HOUSE_ID|PLANT_ID|SPECIES|FAMILY
    const houseId = sanitize(p.houseId, 'GLOBAL');
    const plantId = sanitize(p.id, 'NEW');
    const species = sanitize(p.species, 'UNKNOWN_SPECIES');
    const family = sanitize(p.family, 'BOTANICAL');
    
    const hFormatHash = `${houseId}|${plantId}|${species}|${family}`;

    return {
      'nickname': lv(p.nickname),
      'species': p.species,
      'family': p.family || '-',
      'qr': hFormatHash 
    };
  });

  // 2. Create worksheet
  const worksheet = XLSX.utils.json_to_sheet(data);
  
  // 3. Set column widths for easier visibility in Niimbot preview
  const wscols = [
    { wch: 30 }, // nickname
    { wch: 30 }, // species
    { wch: 20 }, // family
    { wch: 50 }, // qr (hash is long, so we give it more space)
  ];
  worksheet['!cols'] = wscols;

  // 4. Create workbook and trigger download
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Labels");
  
  XLSX.writeFile(workbook, fileName);
};

export const exportLogsToExcel = (plants: Plant[], lv: (val: any) => string, fileName: string = 'verdant_care_logs.xlsx') => {
  const allLogs: any[] = [];

  plants.forEach(plant => {
    (plant.logs || []).forEach(log => {
      allLogs.push({
        'Date': new Date(log.date).toLocaleString(),
        'Plant ID': plant.id,
        'Plant Name': lv(plant.nickname),
        'Species': plant.species,
        'Log Type': log.type,
        'Value': log.value || '-',
        'Note': log.localizedNote ? lv(log.localizedNote) : (log.note || '-'),
        'House ID': plant.houseId || 'GLOBAL'
      });
    });
  });

  // Sort by date descending
  allLogs.sort((a, b) => new Date(b.Date).getTime() - new Date(a.Date).getTime());

  const worksheet = XLSX.utils.json_to_sheet(allLogs);
  
  const wscols = [
    { wch: 20 }, // Date
    { wch: 15 }, // Plant ID
    { wch: 25 }, // Plant Name
    { wch: 25 }, // Species
    { wch: 15 }, // Log Type
    { wch: 10 }, // Value
    { wch: 50 }, // Note
    { wch: 15 }, // House ID
  ];
  worksheet['!cols'] = wscols;

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Care Logs");
  
  XLSX.writeFile(workbook, fileName);
};

export const exportCombinedLogsToExcel = (logs: any[], fileName: string = 'verdant_system_logs.xlsx') => {
  if (!logs || logs.length === 0) {
    // Create a worksheet with headers even if no data
    const worksheet = XLSX.utils.json_to_sheet([{
      'Timestamp': '-',
      'Category': '-',
      'Event': '-',
      'Details': '-',
      'Level': '-'
    }]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Logs");
    XLSX.writeFile(workbook, fileName);
    return;
  }

  const data = logs.map(l => ({
    'Timestamp': l.timestamp ? new Date(l.timestamp).toLocaleString() : '-',
    'Category': l.category || '-',
    'Event': l.event || '-',
    'Details': l.details || '-',
    'Level': l.level || '-'
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);
  
  const wscols = [
    { wch: 25 }, // Timestamp
    { wch: 15 }, // Category
    { wch: 30 }, // Event
    { wch: 60 }, // Details
    { wch: 10 }, // Level
  ];
  worksheet['!cols'] = wscols;

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "System Logs");
  
  XLSX.writeFile(workbook, fileName);
};
