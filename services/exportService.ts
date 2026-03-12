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