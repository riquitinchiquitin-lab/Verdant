import React, { useState } from 'react';
import { 
  Sun, 
  Thermometer, 
  Droplets, 
  Wind, 
  FlaskConical, 
  Activity, 
  Bug, 
  Leaf, 
  LayoutGrid, 
  Table as TableIcon,
  Sliders,
  CheckCircle2
} from 'lucide-react';
import { Plant, LocalizedString, LocalizedArray } from '../types';
import { useLanguage } from '../context/LanguageContext';

interface CultivationCareSpecsProps {
  plant: Plant;
  defaultView?: 'cards' | 'table';
  title?: string;
  className?: string;
}

interface SpecItem {
  id: string;
  label: string;
  category: 'Atmospheric' | 'Soil & Substrate' | 'Care & Nutrition' | 'Propagation' | 'Health';
  icon: React.ReactNode;
  valueDisplay: string;
  unit?: string;
  requirementText: string;
  notes: string;
  // Gauge properties
  hasGauge?: boolean;
  min?: number | null;
  max?: number | null;
  scaleMin?: number;
  scaleMax?: number;
  leftPct?: number;
  widthPct?: number;
  dotPct?: number;
  isSingleTarget?: boolean;
}

export const CultivationCareSpecs: React.FC<CultivationCareSpecsProps> = ({
  plant,
  defaultView = 'cards',
  title,
  className = ''
}) => {
  const { t, lv, lva } = useLanguage();
  const [viewMode, setViewMode] = useState<'cards' | 'table'>(defaultView);

  // Helper to compute gauge percentages
  const calcGauge = (
    minVal?: number | null, 
    maxVal?: number | null, 
    scaleMin = 0, 
    scaleMax = 100
  ) => {
    const hasMin = minVal !== undefined && minVal !== null;
    const hasMax = maxVal !== undefined && maxVal !== null;
    if (!hasMin && !hasMax) return { hasGauge: false };

    const span = Math.max(scaleMax - scaleMin, 1);
    let leftPct = 0;
    let widthPct = 0;
    let dotPct = 50;
    let isSingleTarget = false;

    if (hasMin && hasMax) {
      const clampedMin = Math.max(scaleMin, Math.min(scaleMax, minVal!));
      const clampedMax = Math.max(clampedMin, Math.min(scaleMax, maxVal!));
      leftPct = ((clampedMin - scaleMin) / span) * 100;
      widthPct = Math.max(((clampedMax - clampedMin) / span) * 100, 8);
    } else {
      isSingleTarget = true;
      const val = hasMin ? minVal! : maxVal!;
      const clamped = Math.max(scaleMin, Math.min(scaleMax, val));
      dotPct = ((clamped - scaleMin) / span) * 100;
    }

    return {
      hasGauge: true,
      min: minVal,
      max: maxVal,
      scaleMin,
      scaleMax,
      leftPct,
      widthPct,
      dotPct,
      isSingleTarget
    };
  };

  // Build the unified list of cultivation & atmospheric specification items
  const items: SpecItem[] = [];

  // 1. Light / Illuminance
  const lightNotes = lv(plant.lightAdvice) || 'Prefers bright indirect light.';
  const hasLightBounds = plant.minLightLux != null || plant.maxLightLux != null;
  const lightDisplay = hasLightBounds
    ? (plant.minLightLux && plant.maxLightLux 
        ? `${plant.minLightLux}–${plant.maxLightLux}` 
        : `${plant.minLightLux ?? plant.maxLightLux}`)
    : (lv(plant.windowExposure as any) || 'Bright indirect');
  const lightUnit = plant.targetDli ? `Lux / ${plant.targetDli} DLI` : 'Lux';
  const lightGauge = hasLightBounds 
    ? calcGauge(plant.minLightLux, plant.maxLightLux, 0, Math.max(25000, plant.maxLightLux || 25000))
    : { hasGauge: false };

  items.push({
    id: 'light',
    label: t('lbl_illuminance') || 'Light',
    category: 'Atmospheric',
    icon: <Sun className="w-4 h-4 text-amber-500" />,
    valueDisplay: lightDisplay,
    unit: hasLightBounds ? lightUnit : undefined,
    requirementText: hasLightBounds ? `${lightDisplay} ${lightUnit}` : lightDisplay,
    notes: lightNotes,
    ...lightGauge
  });

  // 2. Watering & Soil Moisture
  const waterIntervalText = plant.wateringInterval ? `Every ~${plant.wateringInterval} days` : '';
  const waterNotes = lv(plant.moistureAdvice) 
    || lv(plant.wateringMethod as any) 
    || 'Water thoroughly when soil reaches target dryness. Avoid overwatering.';
  const hasMoistBounds = plant.minSoilMoist != null || plant.maxSoilMoist != null;
  const moistDisplay = hasMoistBounds
    ? (plant.minSoilMoist && plant.maxSoilMoist ? `${plant.minSoilMoist}–${plant.maxSoilMoist}` : `${plant.minSoilMoist ?? plant.maxSoilMoist}`)
    : (waterIntervalText || 'Evenly moist');
  const moistGauge = hasMoistBounds
    ? calcGauge(plant.minSoilMoist, plant.maxSoilMoist, 0, 100)
    : { hasGauge: false };

  items.push({
    id: 'moisture',
    label: hasMoistBounds ? `${t('lbl_moisture') || 'Moisture'}${waterIntervalText ? ` (${waterIntervalText})` : ''}` : 'Watering',
    category: 'Soil & Substrate',
    icon: <Droplets className="w-4 h-4 text-sky-500" />,
    valueDisplay: moistDisplay,
    unit: hasMoistBounds ? '%' : undefined,
    requirementText: hasMoistBounds 
      ? (waterIntervalText ? `${moistDisplay}% (${waterIntervalText})` : `${moistDisplay}%`)
      : (waterIntervalText || 'Evenly moist'),
    notes: waterNotes,
    ...moistGauge
  });

  // 3. Humidity
  const humidNotes = lv(plant.humidityAdvice) || 'Thrives in moderate household humidity.';
  const hasHumidBounds = plant.minEnvHumid != null || plant.maxEnvHumid != null;
  const humidDisplay = hasHumidBounds
    ? (plant.minEnvHumid && plant.maxEnvHumid ? `${plant.minEnvHumid}–${plant.maxEnvHumid}` : `${plant.minEnvHumid ?? plant.maxEnvHumid}`)
    : 'Moderate';
  const humidGauge = hasHumidBounds
    ? calcGauge(plant.minEnvHumid, plant.maxEnvHumid, 0, 100)
    : { hasGauge: false };

  items.push({
    id: 'humidity',
    label: t('lbl_humidity') || 'Humidity',
    category: 'Atmospheric',
    icon: <Wind className="w-4 h-4 text-teal-500" />,
    valueDisplay: humidDisplay,
    unit: hasHumidBounds ? '%' : undefined,
    requirementText: hasHumidBounds ? `${humidDisplay}% RH` : humidDisplay,
    notes: humidNotes,
    ...humidGauge
  });

  // 4. Temperature
  const tempNotes = lv(plant.tempAdvice) 
    || (plant.minTemp ? `Maintain temperature above ${plant.minTemp}°C.` : 'Standard room temperature.');
  const hasTempBounds = plant.minTemp != null || plant.maxTemp != null;
  const tempDisplay = hasTempBounds
    ? (plant.minTemp && plant.maxTemp ? `${plant.minTemp}–${plant.maxTemp}` : `${plant.minTemp ?? plant.maxTemp}`)
    : (plant.hardinessZoneMin ? `Zone ${plant.hardinessZoneMin}–${plant.hardinessZoneMax || ''}` : '18–27');
  const tempGauge = hasTempBounds
    ? calcGauge(plant.minTemp, plant.maxTemp, 0, 45)
    : { hasGauge: false };

  items.push({
    id: 'temp',
    label: t('lbl_temperature') || 'Temperature',
    category: 'Atmospheric',
    icon: <Thermometer className="w-4 h-4 text-rose-500" />,
    valueDisplay: tempDisplay,
    unit: '°C',
    requirementText: `${tempDisplay}°C`,
    notes: tempNotes,
    ...tempGauge
  });

  // 5. Soil pH
  const soilRecipeNotes = plant.soilComposition?.length 
    ? plant.soilComposition.map(s => `${s.percent}% ${lv(s.component)}`).join(', ') 
    : (t('lbl_target_ph_desc') || 'Target pH level for optimal growth and nutrient uptake.');
  const minPhVal = plant.minPh ?? plant.targetPh;
  const maxPhVal = plant.maxPh;
  const hasPh = minPhVal != null || maxPhVal != null;
  const phDisplay = hasPh
    ? (plant.minPh && plant.maxPh ? `${plant.minPh}–${plant.maxPh}` : `${plant.targetPh ?? minPhVal ?? maxPhVal}`)
    : '6.5';
  const phGauge = hasPh
    ? calcGauge(minPhVal, maxPhVal, 3, 9)
    : calcGauge(6.5, null, 3, 9);

  items.push({
    id: 'ph',
    label: t('lbl_target_ph') || 'Soil pH',
    category: 'Soil & Substrate',
    icon: <FlaskConical className="w-4 h-4 text-emerald-500" />,
    valueDisplay: hasPh && plant.minPh && plant.maxPh ? phDisplay : `Target ${phDisplay}`,
    unit: 'pH',
    requirementText: hasPh && plant.minPh && plant.maxPh ? `pH ${phDisplay}` : `Target pH ${phDisplay}`,
    notes: soilRecipeNotes,
    ...phGauge
  });

  // 6. Target VPD
  if (plant.targetVpd != null) {
    const vpdGauge = calcGauge(plant.targetVpd, null, 0, 3);
    items.push({
      id: 'vpd',
      label: t('lbl_target_vpd') || 'Target VPD',
      category: 'Atmospheric',
      icon: <Activity className="w-4 h-4 text-purple-500" />,
      valueDisplay: `${plant.targetVpd}`,
      unit: 'kPa',
      requirementText: `${plant.targetVpd} kPa`,
      notes: t('lbl_target_vpd_desc') || 'Vapor pressure deficit target for optimal stomatal conductance.',
      ...vpdGauge
    });
  }

  // 7. Soil EC / Target EC
  if (plant.minSoilEc != null || plant.maxSoilEc != null || plant.targetEc != null) {
    const ecMin = plant.minSoilEc ?? plant.targetEc;
    const ecMax = plant.maxSoilEc;
    const ecDisplay = ecMin && ecMax ? `${ecMin}–${ecMax}` : `${ecMin ?? ecMax}`;
    const ecGauge = calcGauge(ecMin, ecMax, 0, 4);
    items.push({
      id: 'soil_ec',
      label: plant.targetEc ? (t('lbl_target_ec') || 'Target EC') : (t('lbl_soil_ec') || 'Soil EC'),
      category: 'Soil & Substrate',
      icon: <FlaskConical className="w-4 h-4 text-indigo-500" />,
      valueDisplay: ecDisplay,
      unit: 'mS/cm',
      requirementText: `${ecDisplay} mS/cm`,
      notes: lv(plant.nutritionAdvice) || t('lbl_target_ec_desc') || 'Electrical conductivity bounds for root nutrition.',
      ...ecGauge
    });
  }

  // 8. Target DLI
  if (plant.targetDli != null) {
    const dliGauge = calcGauge(plant.targetDli, null, 0, 40);
    items.push({
      id: 'dli',
      label: t('lbl_target_dli') || 'Target DLI',
      category: 'Atmospheric',
      icon: <Sun className="w-4 h-4 text-amber-500" />,
      valueDisplay: `${plant.targetDli}`,
      unit: 'mol/m²/d',
      requirementText: `${plant.targetDli} mol/m²/d`,
      notes: t('lbl_target_dli_desc') || 'Daily light integral requirement for vigorous photosynthetic energy.',
      ...dliGauge
    });
  }

  // 9. Fertilization / Feeding
  const hasFeed = plant.npkRatio || lv(plant.feedingSchedule as any) || lv(plant.nutritionAdvice);
  if (hasFeed) {
    const feedDisplay = plant.npkRatio ? `NPK ${plant.npkRatio}` : (t('lbl_growing_season_feed') || 'Growing season feed');
    const feedNotes = lv(plant.feedingSchedule as any) 
      || lv(plant.nutritionAdvice) 
      || 'Feed with a balanced fertilizer monthly during the growing season (spring/summer).';
    items.push({
      id: 'fertilization',
      label: t('btn_feed') || 'Fertilization',
      category: 'Care & Nutrition',
      icon: <FlaskConical className="w-4 h-4 text-green-500" />,
      valueDisplay: feedDisplay,
      requirementText: feedDisplay,
      notes: feedNotes,
      hasGauge: false
    });
  }

  // Custom Care Specs (if specifically defined in plant.careSpecs by AI)
  // Note: Propagation is intentionally omitted here as it is comprehensively detailed in the Phenophase tab
  if (plant.careSpecs && plant.careSpecs.length > 0) {
    plant.careSpecs.forEach((spec, idx) => {
      const paramName = lv(spec.parameter);
      // Avoid exact duplicates or propagation (managed in Phenophase tab)
      const isAlreadyCovered = items.some(
        it => it.label.toLowerCase() === paramName.toLowerCase() ||
              paramName.toLowerCase().includes(it.id)
      ) || paramName.toLowerCase().includes('propagat');
      if (!isAlreadyCovered) {
        items.push({
          id: `care-spec-${idx}`,
          label: paramName,
          category: 'Care & Nutrition',
          icon: <Leaf className="w-4 h-4 text-md-primary" />,
          valueDisplay: lv(spec.requirement),
          requirementText: lv(spec.requirement),
          notes: lv(spec.notes),
          hasGauge: false
        });
      }
    });
  }

  // 12. Susceptible Pests / Issues (if available)
  const pests = lva(plant.susceptiblePests as any);
  if (pests?.length > 0) {
    const pestDisplay = pests.join(', ');
    const pestNotes = plant.troubleshooting?.[0] 
      ? `${lv(plant.troubleshooting[0].symptom)}: ${lv(plant.troubleshooting[0].fix)}` 
      : 'Inspect under leaves periodically and maintain good air circulation.';
    items.push({
      id: 'pests',
      label: t('lbl_susceptible_pests') || 'Common Pests / Issues',
      category: 'Health',
      icon: <Bug className="w-4 h-4 text-rose-500" />,
      valueDisplay: pestDisplay,
      requirementText: pestDisplay,
      notes: pestNotes,
      hasGauge: false
    });
  }

  if (items.length === 0) return null;

  const sectionTitle = title || `${t('lbl_atmospheric_soil_bounds')} & ${t('lbl_care_specs') || 'Care Specifications'}`;

  return (
    <section className={`space-y-4 ${className}`}>
      {/* SECTION HEADER & VIEW SWITCHER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-md-primary shrink-0" />
            <h3 className="text-base font-bold text-md-on-surface tracking-tight">
              {sectionTitle}
            </h3>
          </div>
          <p className="text-xs text-md-on-surface-variant">
            Integrated cultivation bounds, physiological tolerances, and diagnostic triggers
          </p>
        </div>

        {/* VIEW TOGGLE: CARDS VS TABLE */}
        <div className="flex items-center p-1 rounded-2xl bg-md-surface-container-highest border border-md-outline-variant/30 text-xs font-medium self-start sm:self-auto shrink-0 shadow-xs">
          <button
            type="button"
            onClick={() => setViewMode('cards')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all duration-200 ${
              viewMode === 'cards'
                ? 'bg-md-primary-container text-md-on-primary-container font-semibold shadow-xs'
                : 'text-md-on-surface-variant hover:text-md-on-surface'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>{t('lbl_cards_view') || 'Visual Bounds'}</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('table')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all duration-200 ${
              viewMode === 'table'
                ? 'bg-md-primary-container text-md-on-primary-container font-semibold shadow-xs'
                : 'text-md-on-surface-variant hover:text-md-on-surface'
            }`}
          >
            <TableIcon className="w-3.5 h-3.5" />
            <span>{t('lbl_table_view') || 'Structured Table'}</span>
          </button>
        </div>
      </div>

      {/* VIEW MODE 1: VISUAL CARDS (WITH INTEGRATED DIAGNOSTIC TRIGGERS) */}
      {viewMode === 'cards' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => (
            <div
              key={item.id}
              className="relative flex flex-col justify-between p-5 bg-md-surface-container rounded-[22px] border border-md-outline-variant/25 hover:border-md-primary/40 transition-all duration-300 space-y-3.5 shadow-xs"
            >
              <div className="space-y-3">
                {/* Header: Icon + Parameter Label + Category */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="p-1.5 rounded-xl bg-md-surface-container-highest text-md-on-surface shrink-0">
                      {item.icon}
                    </span>
                    <p className="text-xs font-semibold text-md-on-surface-variant tracking-wide truncate">
                      {item.label}
                    </p>
                  </div>
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-md-surface-container-high text-md-on-surface-variant/80 shrink-0">
                    {item.category}
                  </span>
                </div>

                {/* Main Metric Value & Unit */}
                <div className="flex items-baseline gap-1.5 flex-wrap">
                  <span className="text-2xl sm:text-3xl font-bold text-md-on-surface tracking-tight">
                    {item.valueDisplay}
                  </span>
                  {item.unit && !item.valueDisplay.includes(item.unit) && (
                    <span className="text-xs font-medium text-md-on-surface-variant">{item.unit}</span>
                  )}
                </div>

                {/* Range Gauge Slider (if numeric bounds exist) */}
                {item.hasGauge && (
                  <div className="space-y-1.5 pt-1">
                    <div className="relative h-2 w-full bg-md-surface-container-highest rounded-full overflow-visible">
                      {item.isSingleTarget ? (
                        <div
                          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-md-primary shadow-sm ring-4 ring-md-primary/20 transition-all duration-500"
                          style={{ left: `${item.dotPct}%` }}
                        />
                      ) : (
                        <div
                          className="absolute top-0 bottom-0 bg-md-primary rounded-full shadow-xs transition-all duration-500"
                          style={{ left: `${item.leftPct}%`, width: `${item.widthPct}%` }}
                        />
                      )}
                    </div>
                    <div className="flex justify-between text-[10px] font-medium text-md-on-surface-variant/70">
                      <span>{item.isSingleTarget ? `${item.min ?? item.max}` : (item.scaleMin ?? 'min')}</span>
                      <span>{item.isSingleTarget ? item.unit : (item.scaleMax ?? 'max')}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* INTEGRATED NOTES & DIAGNOSTIC TRIGGERS BOX */}
              {item.notes && (
                <div className="pt-2.5 mt-2 border-t border-md-outline-variant/20 flex items-start gap-2 text-xs text-md-on-surface-variant leading-relaxed bg-md-surface-container-low/75 p-3 rounded-2xl border border-md-outline-variant/15">
                  <Activity className="w-3.5 h-3.5 text-md-primary shrink-0 mt-0.5" />
                  <div className="space-y-0.5 min-w-0 flex-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-md-primary block">
                      {t('lbl_notes_diagnostic_triggers') || 'Notes & Diagnostic Triggers'}
                    </span>
                    <p className="line-clamp-3 hover:line-clamp-none transition-all cursor-default text-[11px] sm:text-xs">
                      {item.notes}
                    </p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* VIEW MODE 2: STRUCTURED TABLE (ENHANCED WITH MINI GAUGES & BADGES) */}
      {viewMode === 'table' && (
        <div className="bg-md-surface-container rounded-[24px] p-5 sm:p-6 border border-md-outline-variant/25 space-y-4 shadow-xs">
          <div className="overflow-x-auto -mx-2 px-2">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-md-outline-variant/30 text-[10px] font-bold uppercase tracking-wider text-md-on-surface-variant">
                  <th className="py-2.5 pr-4 pl-2">
                    {t('lbl_parameter') || 'Parameter'}
                  </th>
                  <th className="py-2.5 pr-4 min-w-[220px]">
                    {t('lbl_optimal_range_requirement') || 'Optimal Range / Requirement'}
                  </th>
                  <th className="py-2.5 pr-2 min-w-[280px]">
                    {t('lbl_notes_diagnostic_triggers') || 'Notes & Diagnostic Triggers'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-md-outline-variant/20 text-xs">
                {items.map((row) => (
                  <tr key={row.id} className="align-top hover:bg-md-surface-container-highest/25 transition-colors">
                    {/* Parameter Column */}
                    <td className="py-3 pr-4 pl-2 font-semibold text-md-primary whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="p-1 rounded-lg bg-md-surface-container-highest shrink-0">
                          {row.icon}
                        </span>
                        <div>
                          <span>{row.label}</span>
                          <span className="block text-[10px] font-normal text-md-on-surface-variant">
                            {row.category}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Optimal Range / Requirement Column (with Mini Gauge) */}
                    <td className="py-3 pr-4 text-md-on-surface">
                      <div className="space-y-1.5">
                        <div className="font-semibold text-xs sm:text-sm">
                          {row.requirementText || t('lbl_na')}
                        </div>
                        {row.hasGauge && (
                          <div className="w-32 sm:w-44 space-y-1">
                            <div className="relative h-1.5 w-full bg-md-surface-container-highest rounded-full overflow-hidden">
                              {row.isSingleTarget ? (
                                <div
                                  className="absolute top-0 bottom-0 w-2 rounded-full bg-md-primary"
                                  style={{ left: `${row.dotPct}%` }}
                                />
                              ) : (
                                <div
                                  className="absolute top-0 bottom-0 bg-md-primary rounded-full"
                                  style={{ left: `${row.leftPct}%`, width: `${row.widthPct}%` }}
                                />
                              )}
                            </div>
                            <div className="flex justify-between text-[9px] text-md-on-surface-variant/70">
                              <span>{row.isSingleTarget ? `${row.min ?? row.max}` : row.scaleMin}</span>
                              <span>{row.isSingleTarget ? row.unit : row.scaleMax}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Notes & Diagnostic Triggers Column */}
                    <td className="py-3 pr-2 text-md-on-surface-variant leading-relaxed text-[11px] sm:text-xs">
                      {row.notes || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
};
