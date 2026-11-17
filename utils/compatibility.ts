import { House, Plant, SoilType } from '../types';

export interface CompatibilityReport {
  overall: 'COMPATIBLE' | 'CONDITIONAL' | 'INCOMPATIBLE' | 'UNKNOWN';
  climateStatus: 'OUTDOOR_COMPATIBLE' | 'OVERWINTER_INDOORS' | 'INDOOR_ONLY' | 'UNKNOWN';
  climateTitle: string;
  climateDetail: string;
  soilStatus: 'IDEAL' | 'AMEND_NEEDED' | 'CONTAINER_RECOMMENDED' | 'UNKNOWN';
  soilTitle: string;
  soilDetail: string;
}

export const SOIL_LABELS: Record<SoilType, string> = {
  LOAM: 'Loam (Balanced)',
  CLAY: 'Clay (Heavy / Moisture-Retentive)',
  SANDY: 'Sandy (Fast-Draining)',
  SILT: 'Silt (Fertile / Fine)',
  PEATY: 'Peaty (Acidic / Organic)',
  CHALKY: 'Chalky (Alkaline / Stony)',
  POTTING_MIX: 'Potting Mix / Container',
};

const parseZoneNum = (z?: string | null): number | null => {
  if (!z) return null;
  const match = String(z).trim().match(/(\d+)\s*([ab])?/i);
  if (!match) return null;
  const base = parseInt(match[1], 10);
  if (isNaN(base)) return null;
  const sub = match[2]?.toLowerCase() === 'b' ? 0.5 : 0;
  return base + sub;
};

export const checkPlantCompatibility = (plant: Plant, house?: House | null): CompatibilityReport => {
  if (!house) {
    return {
      overall: 'UNKNOWN',
      climateStatus: 'UNKNOWN',
      climateTitle: 'No Property Selected',
      climateDetail: 'Select or configure a House with an address to check local hardiness zone compatibility.',
      soilStatus: 'UNKNOWN',
      soilTitle: 'No Soil Profile',
      soilDetail: 'Configure a local soil type on your House to check ground and container compatibility.',
    };
  }

  // 1. CLIMATE / HARDINESS ZONE CHECK
  let climateStatus: CompatibilityReport['climateStatus'] = 'UNKNOWN';
  let climateTitle = 'Zone Data Unavailable';
  let climateDetail = 'Add an address to this House to auto-detect its USDA Hardiness Zone.';

  const houseZone = house.hardinessZoneNum ?? parseZoneNum(house.hardinessZone);
  const plantMinZone = parseZoneNum(plant.hardinessZoneMin);
  const plantMaxZone = parseZoneNum(plant.hardinessZoneMax);

  if (houseZone !== null) {
    if (plantMinZone !== null) {
      const effectiveMax = plantMaxZone ?? 13.5;
      if (houseZone >= plantMinZone && houseZone <= effectiveMax) {
        climateStatus = 'OUTDOOR_COMPATIBLE';
        climateTitle = `Compatible with Zone ${house.hardinessZone || houseZone}`;
        climateDetail = `Your area falls within this specimen's hardiness range (Zones ${plant.hardinessZoneMin}–${plant.hardinessZoneMax || '13'}). Suitable for outdoor planting.`;
      } else if (houseZone >= plantMinZone - 1.5 && houseZone < plantMinZone) {
        climateStatus = 'OVERWINTER_INDOORS';
        climateTitle = `Borderline for Zone ${house.hardinessZone || houseZone}`;
        climateDetail = `Your winters are slightly colder than its hardy minimum (Zone ${plant.hardinessZoneMin}). Grow in a movable container or provide winter frost protection.`;
      } else if (houseZone < plantMinZone - 1.5) {
        climateStatus = 'INDOOR_ONLY';
        climateTitle = `Too Cold Outdoors (Zone ${house.hardinessZone || houseZone})`;
        climateDetail = `Hardy down to Zone ${plant.hardinessZoneMin}. Keep indoors or in a heated greenhouse during winter.`;
      } else {
        climateStatus = 'OVERWINTER_INDOORS';
        climateTitle = `Warmer Climate (Zone ${house.hardinessZone || houseZone})`;
        climateDetail = `Your area is warmer than its typical range (up to Zone ${plant.hardinessZoneMax}). Provide afternoon shade and extra summer hydration.`;
      }
    } else if (typeof plant.minTemp === 'number' && typeof house.minWinterTempC === 'number') {
      if (house.minWinterTempC >= plant.minTemp) {
        climateStatus = 'OUTDOOR_COMPATIBLE';
        climateTitle = `Compatible with Zone ${house.hardinessZone || houseZone}`;
        climateDetail = `Average winter lows (${house.minWinterTempC}°C) stay above this specimen's minimum tolerance (${plant.minTemp}°C).`;
      } else {
        climateStatus = 'INDOOR_ONLY';
        climateTitle = `Indoor / Frost-Protected Required`;
        climateDetail = `Local winter lows (${house.minWinterTempC}°C) drop below this specimen's minimum (${plant.minTemp}°C).`;
      }
    } else {
      climateTitle = `House Zone: ${house.hardinessZone || houseZone}`;
      climateDetail = 'This specimen does not have USDA hardiness bounds recorded yet; compare against its minimum temperature in Tech Specs.';
    }
  }

  // 2. SOIL COMPATIBILITY CHECK
  let soilStatus: CompatibilityReport['soilStatus'] = 'UNKNOWN';
  let soilTitle = 'Soil Type Not Configured';
  let soilDetail = 'Set your House soil type in Admin → Houses to check ground & amendment compatibility.';

  if (house.soilType) {
    const soilText = (plant.soilComposition || [])
      .map(s => (s.component?.en || '').toLowerCase())
      .join(' ');
    const prefersFastDrainage =
      Boolean(plant.droughtTolerant) ||
      soilText.includes('perlite') ||
      soilText.includes('pumice') ||
      soilText.includes('sand') ||
      soilText.includes('bark') ||
      (plant.groundHumidityScale !== null && plant.groundHumidityScale !== undefined && plant.groundHumidityScale <= 4);

    const prefersAcidic = typeof plant.maxPh === 'number' && plant.maxPh < 6.5;
    const prefersAlkaline = typeof plant.minPh === 'number' && plant.minPh > 7.2;

    switch (house.soilType) {
      case 'POTTING_MIX':
        soilStatus = 'IDEAL';
        soilTitle = 'Container / Potting Mix Ready';
        soilDetail = 'Container culture lets you match the exact Soil Recipe ratios and pH.';
        break;
      case 'LOAM':
        if (prefersAcidic) {
          soilStatus = 'AMEND_NEEDED';
          soilTitle = 'Loam (Needs Acidifying Amendment)';
          soilDetail = `Loam has great structure, but this specimen prefers acidic pH (${plant.minPh ?? '?'}–${plant.maxPh}). Amend with pine bark or peat.`;
        } else {
          soilStatus = 'IDEAL';
          soilTitle = 'Ideal Loam Soil';
          soilDetail = 'Balanced drainage and nutrient retention suit this specimen well.';
        }
        break;
      case 'CLAY':
        if (prefersFastDrainage) {
          soilStatus = 'CONTAINER_RECOMMENDED';
          soilTitle = 'Clay Too Dense — Amend or Use Raised Bed';
          soilDetail = 'Heavy clay holds water and risks root rot for fast-draining species. Mix in 35%+ grit/perlite/compost or plant in a raised bed.';
        } else {
          soilStatus = 'AMEND_NEEDED';
          soilTitle = 'Heavy Clay (Organic Amendment Advised)';
          soilDetail = 'Incorporate coarse compost and pine bark to improve aeration and drainage.';
        }
        break;
      case 'SANDY':
        if (prefersFastDrainage) {
          soilStatus = 'IDEAL';
          soilTitle = 'Great Match for Sandy Soil';
          soilDetail = 'Fast drainage in sandy soil prevents root rot for this specimen.';
        } else {
          soilStatus = 'AMEND_NEEDED';
          soilTitle = 'Sandy Soil (Retains Little Moisture)';
          soilDetail = 'Amend with compost, coco coir, or aged manure to boost water and nutrient retention.';
        }
        break;
      case 'PEATY':
        if (prefersAlkaline) {
          soilStatus = 'AMEND_NEEDED';
          soilTitle = 'Peaty Soil Too Acidic';
          soilDetail = `This specimen prefers neutral-to-alkaline soil (pH ${plant.minPh}+). Add garden lime and mineral grit.`;
        } else {
          soilStatus = 'IDEAL';
          soilTitle = 'Rich, Acidic Peaty Soil';
          soilDetail = 'High organic matter and acidity suit moisture-loving or acidophilic species.';
        }
        break;
      case 'CHALKY':
        if (prefersAcidic) {
          soilStatus = 'CONTAINER_RECOMMENDED';
          soilTitle = 'Chalky Soil Too Alkaline';
          soilDetail = `Alkaline chalky soil can cause chlorosis (target pH ${plant.minPh ?? '?'}–${plant.maxPh}). Grow in containers or ericaceous beds.`;
        } else {
          soilStatus = 'AMEND_NEEDED';
          soilTitle = 'Chalky / Alkaline Soil';
          soilDetail = 'Add generous organic compost to buffer alkalinity and improve moisture holding.';
        }
        break;
      case 'SILT':
        if (prefersFastDrainage) {
          soilStatus = 'AMEND_NEEDED';
          soilTitle = 'Silty Soil (Improve Drainage)';
          soilDetail = 'Silt can compact over time. Mix in coarse sand, pumice, and compost for better root aeration.';
        } else {
          soilStatus = 'IDEAL';
          soilTitle = 'Fertile Silty Soil';
          soilDetail = 'Good moisture and fertility for most non-arid plants and trees.';
        }
        break;
    }
  }

  // 3. OVERALL VERDICT
  let overall: CompatibilityReport['overall'] = 'UNKNOWN';
  if (climateStatus === 'OUTDOOR_COMPATIBLE' && (soilStatus === 'IDEAL' || soilStatus === 'UNKNOWN')) {
    overall = 'COMPATIBLE';
  } else if (climateStatus === 'INDOOR_ONLY') {
    overall = soilStatus === 'IDEAL' || house.soilType === 'POTTING_MIX' ? 'CONDITIONAL' : 'INCOMPATIBLE';
  } else if (climateStatus !== 'UNKNOWN' || soilStatus !== 'UNKNOWN') {
    overall = 'CONDITIONAL';
  }

  return {
    overall,
    climateStatus,
    climateTitle,
    climateDetail,
    soilStatus,
    soilTitle,
    soilDetail,
  };
};
