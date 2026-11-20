import React, { useState, useRef, useMemo } from 'react';
import { Plant } from '../types';
import { Button } from './ui/Button';
import { useLanguage } from '../context/LanguageContext';
import { usePlants } from '../context/PlantContext';
import { compressImage } from '../services/imageUtils';
import { generateUUID } from '../services/crypto';
import { Droplets, Star, Check, RefreshCw, Sun, Thermometer, Wind, Globe, Tag, Printer } from 'lucide-react';
import { refreshPlantRecord } from '../services/plantAi';
import { isPlantTree } from '../utils/botanicalCategory';
import { PrintLabelModal } from './PrintLabelModal';

interface PlantCardProps {
  plant: Partial<Plant>;
  className?: string;
  showActions?: boolean;
  onClick?: () => void;
}

export const PlantCard: React.FC<PlantCardProps> = ({ plant, className = '', showActions = true, onClick }) => {
  const { t, language, lv } = useLanguage();
  const { addLog, updatePlant, deletePlant, setAlertMessage, getEffectiveApiKey } = usePlants();

  const MiniPill = ({ 
      label, 
      value, 
      color, 
      explanation 
  }: { 
      label: string, 
      value: string | number | null | undefined, 
      color: string,
      explanation?: string 
  }) => {
      const [isHovered, setIsHovered] = useState(false);

      return (
          <div 
              className="relative flex-1"
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
              onTouchStart={(e) => {
                  e.stopPropagation();
                  setIsHovered(!isHovered);
              }}
          >
              <div className={`flex flex-col items-center justify-center p-2 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm transition-all duration-300 cursor-help min-h-[95px] ${color} ${isHovered ? 'ring-2 ring-verdant scale-[1.02] z-20' : ''}`}>
                  {!isHovered ? (
                      <div className="flex flex-col items-center animate-in fade-in duration-300">
                          <span className="text-[12px] font-black uppercase opacity-60 tracking-widest mb-1">{label}</span>
                          <span className="text-3xl font-black uppercase leading-none">{value ?? t('lbl_na')}</span>
                      </div>
                  ) : (
                      <div className="px-1 w-full h-full flex items-center justify-center overflow-hidden animate-in fade-in slide-in-from-bottom-1 duration-300">
                          <p className="text-[10px] font-bold leading-tight text-center text-gray-700 dark:text-slate-300 uppercase tracking-tighter">
                              {explanation || t('lbl_optimal_range_confirmed')}
                          </p>
                      </div>
                  )}
              </div>
          </div>
      );
  };

  const [isUploading, setIsUploading] = useState<'AVATAR' | 'LOG' | null>(null);
  const [isRefreshingData, setIsRefreshingData] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [lastLoggedAction, setLastLoggedAction] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const imageUrl = plant.images?.[0] || '';
  
  const handleAction = async (e: React.ChangeEvent<HTMLInputElement>, mode: 'AVATAR' | 'LOG') => {
    if (e.target.files?.[0] && plant.id) {
      setIsUploading(mode);
      try {
        const base64 = await compressImage(e.target.files[0]);
        if (mode === 'AVATAR') {
          await updatePlant(plant.id, { images: [base64, ...(plant.images?.slice(1) || [])] });
        } else {
          await addLog(plant.id, { 
            id: `l-${generateUUID()}`, 
            date: new Date().toISOString(), 
            type: 'IMAGE', 
            imageUrl: base64, 
            localizedNote: { 
              en: t('log_image_manual'),
              [language]: t('log_image_manual') 
            } 
          });
        }
      } catch (err) { console.error(err); } 
      finally { setIsUploading(null); }
    }
  };

  const status = useMemo(() => {
    let effectiveInterval = plant.wateringInterval;
    
    if (!effectiveInterval) {
      const waterLogs = (plant.logs || []).filter(l => l.type === 'WATER').sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      if (waterLogs.length >= 2) {
        let totalDiff = 0;
        for (let i = 0; i < waterLogs.length - 1; i++) {
          totalDiff += new Date(waterLogs[i].date).getTime() - new Date(waterLogs[i+1].date).getTime();
        }
        effectiveInterval = Math.max(1, Math.round((totalDiff / (waterLogs.length - 1)) / 86400000));
      } else {
        effectiveInterval = 7; // Default to 7 days if not enough data
      }
    }

    const waterLogs = (plant.logs || []).filter(l => l.type === 'WATER').sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const effectiveLastWatered = plant.lastWatered || waterLogs[0]?.date || plant.createdAt;

    if (!effectiveLastWatered) {
      if (!showActions) {
        return { label: t('lbl_new_specimen'), color: 'bg-md-tertiary-container text-md-on-tertiary-container border-md-tertiary/20', percent: 0, daysLeft: '?' };
      }
      return { label: t('status_data_needed'), color: 'bg-md-secondary-container text-md-on-secondary-container border-md-outline-variant/40', percent: 0, daysLeft: '?' };
    }

    const lastDate = new Date(effectiveLastWatered);
    const intervalMs = effectiveInterval * 86400000;
    let daysLeftNum = Math.ceil((lastDate.getTime() + intervalMs - Date.now()) / 86400000);
    let percent = Math.max(0, Math.min(100, (1 - ((Date.now() - lastDate.getTime()) / intervalMs)) * 100));

    // Incorporate moisture data
    const moistureLogs = (plant.logs || []).filter(l => l.type === 'MOISTURE').sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    if (moistureLogs.length > 0) {
      const latestMoisture = moistureLogs[0];
      const moistureDate = new Date(latestMoisture.date);
      
      // Only use moisture data if it was logged AFTER the last watering
      if (moistureDate.getTime() > lastDate.getTime()) {
        const moistureValue = latestMoisture.value || 5; // 1 to 10
        const daysSinceMoisture = (Date.now() - moistureDate.getTime()) / 86400000;
        
        // Estimated days left at the time of moisture reading based on 1-10 scale
        const estimatedDaysLeftAtReading = effectiveInterval * ((moistureValue - 1) / 9);
        
        daysLeftNum = Math.ceil(estimatedDaysLeftAtReading - daysSinceMoisture);
        percent = Math.max(0, Math.min(100, (daysLeftNum / effectiveInterval) * 100));
      }
    }

    if (daysLeftNum <= 0) return { label: t('status_thirsty'), color: 'bg-md-error-container text-md-on-error-container border-md-error/20', percent: 0, daysLeft: 0 };
    if (daysLeftNum <= 2) return { label: t('status_soon'), color: 'bg-amber-100 text-amber-950 dark:bg-amber-900/60 dark:text-amber-200 border-amber-500/20', percent, daysLeft: daysLeftNum };
    return { label: t('status_stable'), color: 'bg-md-primary-container text-md-on-primary-container border-md-primary/20', percent, daysLeft: daysLeftNum };
  }, [plant.lastWatered, plant.wateringInterval, plant.logs, t, showActions]);

  const getAdvice = (type: 'moisture' | 'light' | 'temp' | 'humidity') => {
    const field = `${type}Advice` as keyof Plant;
    return lv(plant[field] as any);
  };

    return (
        <div 
            onClick={onClick} 
            className={`group m3-card-elevated rounded-[24px] border border-md-outline-variant/30 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 flex flex-col overflow-hidden ${onClick ? 'cursor-pointer' : ''} ${className}`}
        >
            {/* IMAGE SECTION */}
            <div className="relative h-48 md:h-60 bg-md-surface-container-highest overflow-hidden m-2.5 rounded-[20px]">
                <img 
                    src={imageUrl} 
                    alt={lv(plant.nickname)} 
                    className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-700" 
                    referrerPolicy="no-referrer"
                />
                
                <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 z-10 max-w-[calc(100%-90px)]">
                     <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold shadow-xs whitespace-nowrap ${plant.isPetSafe ? 'bg-md-primary-container text-md-on-primary-container' : 'bg-md-error-container text-md-on-error-container'}`}>
                        {plant.isPetSafe ? t('status_safe') : t('status_toxic')}
                     </span>
                     {plant.category && (
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-md-surface-container-high/90 text-md-on-surface backdrop-blur-xs shadow-xs whitespace-nowrap">
                            {lv(plant.category as any)}
                        </span>
                     )}
                </div>
                
                <div className="absolute top-3 right-3 z-10 flex flex-col items-end gap-1.5">
                    {plant.isPriority && (
                        <div className="bg-amber-300 text-amber-950 p-1.5 rounded-full shadow-sm">
                            <Star className="w-3.5 h-3.5 fill-current" />
                        </div>
                    )}
                    <button
                        type="button"
                        disabled={isRefreshingData}
                        onClick={async (e) => {
                            if (status.label === t('status_data_needed') && plant.id && !isRefreshingData) {
                                e.stopPropagation();
                                setIsRefreshingData(true);
                                try {
                                    const updates = await refreshPlantRecord(plant as Plant, getEffectiveApiKey());
                                    await updatePlant(plant.id, updates);
                                    setAlertMessage(`Botanical data refreshed for ${lv(plant.nickname) || plant.species}`);
                                    setTimeout(() => setAlertMessage(null), 4000);
                                } catch (err: any) {
                                    setAlertMessage(err?.message || 'Failed to refresh botanical data');
                                    setTimeout(() => setAlertMessage(null), 4000);
                                } finally {
                                    setIsRefreshingData(false);
                                }
                            }
                        }}
                        className={`text-[11px] font-semibold px-2.5 py-1 rounded-full shadow-xs border transition-all ${
                            status.label === t('status_data_needed')
                                ? 'cursor-pointer hover:scale-105 active:scale-95 hover:brightness-110 animate-pulse'
                                : ''
                        } ${status.color}`}
                        title={status.label === t('status_data_needed') ? 'Click to fetch botanical data' : undefined}
                    >
                        {isRefreshingData ? 'Fetching...' : status.label}
                    </button>
                </div>

                <div className="absolute bottom-2.5 left-3 z-10 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/40 backdrop-blur-xs">
                    <div className="w-1.5 h-1.5 rounded-full bg-white/80" />
                    <span className="text-[10px] font-mono text-white/90">{plant.id?.substring(0, 8)}</span>
                </div>
            </div>

            {/* CONTENT SECTION */}
            <div className="px-5 pb-5 pt-2 flex-1 flex flex-col gap-3">
                <div>
                    <h3 className="text-md-on-surface font-bold text-lg md:text-xl tracking-tight leading-snug truncate">
                        {lv(plant.nickname)}
                    </h3>
                    <p className="text-md-primary font-medium text-xs md:text-sm truncate">
                        <span className="italic font-serif">{plant.species}</span>
                        {plant.scientificAuthor ? <span className="text-md-on-surface-variant font-normal ml-1">{plant.scientificAuthor}</span> : null}
                    </p>
                    {(plant.family || lv(plant.growthHabit as any) || plant.specimenType || isPlantTree(plant)) && (
                        <p className="text-[11px] text-md-on-surface-variant truncate mt-0.5">
                            {[
                                plant.family,
                                lv(plant.growthHabit as any) || (isPlantTree(plant) ? 'Tree' : null)
                            ].filter(Boolean).join(' · ')}
                        </p>
                    )}
                </div>

                {/* QUICK BOTANICAL SPECS */}
                {(() => {
                    const lightText = lv(plant.windowExposure as any)
                        || (plant.minLightLux && plant.maxLightLux ? `${plant.minLightLux}–${plant.maxLightLux} Lux` : '');
                    const tempText = (plant.minTemp != null && plant.maxTemp != null)
                        ? `${plant.minTemp}–${plant.maxTemp}°C`
                        : (plant.hardinessZoneMin || plant.hardinessZoneMax)
                            ? `Zone ${plant.hardinessZoneMin || '?'}${plant.hardinessZoneMax ? `–${plant.hardinessZoneMax}` : ''}`
                            : '';
                    const humidText = (plant.minEnvHumid != null && plant.maxEnvHumid != null)
                        ? `${plant.minEnvHumid}–${plant.maxEnvHumid}% RH`
                        : (plant.minPh != null && plant.maxPh != null)
                            ? `pH ${plant.minPh}–${plant.maxPh}`
                            : '';
                    const nativeText = (plant.nativeRegions as any)?.[language]?.[0]
                        || (plant.nativeRegions as any)?.en?.[0]
                        || lv(plant.origin as any)
                        || '';

                    if (!lightText && !tempText && !humidText && !nativeText) return null;

                    return (
                        <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                            {lightText && (
                                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-md-surface-container-low border border-md-outline-variant/20 truncate" title={lightText}>
                                    <Sun className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                    <span className="truncate text-md-on-surface">{lightText}</span>
                                </div>
                            )}
                            {tempText && (
                                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-md-surface-container-low border border-md-outline-variant/20 truncate" title={tempText}>
                                    <Thermometer className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                                    <span className="truncate text-md-on-surface">{tempText}</span>
                                </div>
                            )}
                            {humidText && (
                                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-md-surface-container-low border border-md-outline-variant/20 truncate" title={humidText}>
                                    <Wind className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                                    <span className="truncate text-md-on-surface">{humidText}</span>
                                </div>
                            )}
                            {nativeText && (
                                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-md-surface-container-low border border-md-outline-variant/20 truncate" title={nativeText}>
                                    <Globe className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                    <span className="truncate text-md-on-surface">{nativeText}</span>
                                </div>
                            )}
                        </div>
                    );
                })()}

                {(plant.iucnStatus || lv(plant.careDifficulty as any) || plant.droughtTolerant) && (
                    <div className="flex flex-wrap gap-1.5">
                        {plant.iucnStatus && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-md-tertiary-container/80 text-md-on-tertiary-container">
                                IUCN: {plant.iucnStatus}
                            </span>
                        )}
                        {lv(plant.careDifficulty as any) && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-md-surface-container-highest text-md-on-surface-variant">
                                {lv(plant.careDifficulty as any)}
                            </span>
                        )}
                        {plant.droughtTolerant && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-md-secondary-container/70 text-md-on-secondary-container">
                                Drought Tolerant
                            </span>
                        )}
                    </div>
                )}

                <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                        <span className="text-xs font-medium text-md-on-surface-variant">{t('lbl_hydration')}</span>
                        <span className={`text-xs font-semibold ${status.daysLeft === 0 ? 'text-md-error' : status.daysLeft === '?' ? 'text-md-on-surface-variant' : 'text-md-primary'}`}>
                            {status.daysLeft === 0 ? t('status_due_now') : status.daysLeft === '?' ? '?' : `${status.daysLeft}d`}
                        </span>
                    </div>
                    <div className="h-1.5 w-full bg-md-surface-container-highest rounded-full overflow-hidden">
                        <div 
                            className={`h-full rounded-full transition-all duration-700 ${status.daysLeft === 0 ? 'bg-md-error animate-pulse' : 'bg-md-primary'}`} 
                            style={{ width: `${status.percent}%` }} 
                        />
                    </div>
                </div>

                {showActions && (
                    <div className="mt-auto pt-1 flex items-center gap-2">
                        <Button 
                            variant={lastLoggedAction === 'WATER' ? 'primary' : status.daysLeft === 0 ? 'danger' : 'tonal'}
                            size="md"
                            className="flex-1"
                            onClick={async (e) => { 
                                e.stopPropagation(); 
                                await addLog(plant.id!, { id: `l-${generateUUID()}`, date: new Date().toISOString(), type: 'WATER' }); 
                                setLastLoggedAction('WATER');
                                const dateString = new Date().toLocaleDateString(language, { month: 'long', day: 'numeric' });
                                const message = t('log_alert_message').replace('{action}', t('log_action_watered')).replace('{date}', dateString);
                                setAlertMessage(message);
                                setTimeout(() => setLastLoggedAction(null), 2000);
                                setTimeout(() => setAlertMessage(null), 4000);
                            }}
                        >
                            {lastLoggedAction === 'WATER' ? <Check className="w-4 h-4" /> : <Droplets className="w-4 h-4" />}
                            <span>{t('log_action_watered') || 'Water'}</span>
                        </Button>
                        {plant.id && (
                            <Button
                                variant="outlined"
                                size="md"
                                disabled={isRefreshingData}
                                title={t('btn_refresh_ai') || 'Refresh Botanical Data'}
                                aria-label={t('btn_refresh_ai') || 'Refresh Botanical Data'}
                                className="px-3 shrink-0"
                                onClick={async (e) => {
                                    e.stopPropagation();
                                    if (isRefreshingData || !plant.id) return;
                                    setIsRefreshingData(true);
                                    try {
                                        const updates = await refreshPlantRecord(plant as Plant, getEffectiveApiKey());
                                        await updatePlant(plant.id, updates);
                                        setAlertMessage(`Botanical data refreshed for ${lv(plant.nickname) || plant.species}`);
                                        setTimeout(() => setAlertMessage(null), 4000);
                                    } catch (err: any) {
                                        console.error('Failed to refresh botanical data:', err);
                                        setAlertMessage(err?.message || 'Failed to refresh botanical data');
                                        setTimeout(() => setAlertMessage(null), 4000);
                                    } finally {
                                        setIsRefreshingData(false);
                                    }
                                }}
                            >
                                <RefreshCw className={`w-4 h-4 ${isRefreshingData ? 'animate-spin text-md-primary' : ''}`} />
                            </Button>
                        )}
                        {plant.id && (
                            <Button
                                variant="outlined"
                                size="md"
                                title={t('btn_print_label') || 'Print Label'}
                                aria-label={t('btn_print_label') || 'Print Label'}
                                className="px-3 shrink-0"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setIsPrintModalOpen(true);
                                }}
                            >
                                <Tag className="w-4 h-4 text-md-on-surface-variant hover:text-md-primary" />
                            </Button>
                        )}
                    </div>
                )}
            </div>
            {plant.id && isPrintModalOpen && (
                <PrintLabelModal
                    isOpen={isPrintModalOpen}
                    onClose={() => setIsPrintModalOpen(false)}
                    plant={plant as Plant}
                />
            )}
        </div>
    );
};