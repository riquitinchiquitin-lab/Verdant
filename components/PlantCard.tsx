import React, { useState, useRef, useMemo } from 'react';
import { Plant } from '../types';
import { Button } from './ui/Button';
import { useLanguage } from '../context/LanguageContext';
import { usePlants } from '../context/PlantContext';
import { compressImage } from '../services/imageUtils';
import { generateUUID } from '../services/crypto';

interface PlantCardProps {
  plant: Partial<Plant>;
  className?: string;
  showActions?: boolean;
  onClick?: () => void;
}

export const PlantCard: React.FC<PlantCardProps> = ({ plant, className = '', showActions = true, onClick }) => {
  const { t, language, lv } = useLanguage();
  const { addLog, updatePlant, deletePlant, setAlertMessage } = usePlants();

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

    if (!plant.lastWatered) {
      if (!showActions) {
        return { label: t('lbl_new_specimen'), color: 'bg-blue-600 text-white border-blue-400', percent: 0, daysLeft: '?' };
      }
      return { label: t('status_data_needed'), color: 'bg-slate-700 text-white border-slate-600', percent: 0, daysLeft: '?' };
    }

    const lastDate = new Date(plant.lastWatered);
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

    if (daysLeftNum <= 0) return { label: t('status_thirsty'), color: 'bg-red-600 text-white border-red-400', percent: 0, daysLeft: 0 };
    if (daysLeftNum <= 2) return { label: t('status_soon'), color: 'bg-amber-500 text-white border-amber-400', percent, daysLeft: daysLeftNum };
    return { label: t('status_stable'), color: 'bg-emerald-600 text-white border-emerald-400', percent, daysLeft: daysLeftNum };
  }, [plant.lastWatered, plant.wateringInterval, plant.logs, t, showActions]);

  const getAdvice = (type: 'moisture' | 'light' | 'temp' | 'humidity') => {
    const field = `${type}Advice` as keyof Plant;
    return lv(plant[field] as any);
  };

    return (
        <div 
            onClick={onClick} 
            className={`group bg-white dark:bg-slate-900 rounded-[32px] border border-gray-100 dark:border-slate-800 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-500 flex flex-col overflow-hidden ${onClick ? 'cursor-pointer' : ''} ${className}`}
        >
            {/* IMAGE SECTION */}
            <div className="relative h-48 md:h-64 bg-verdant-bone dark:bg-slate-800 overflow-hidden m-3 rounded-[24px]">
                <img 
                    src={imageUrl} 
                    alt={lv(plant.nickname)} 
                    className="w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-1000" 
                    referrerPolicy="no-referrer"
                />
                
                <div className="absolute top-3 left-3 flex flex-wrap gap-2.5 z-10 max-w-[calc(100%-80px)]">
                     <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-[0.15em] border shadow-sm whitespace-nowrap ${plant.isPetSafe ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-red-600 text-white border-red-500'}`}>
                        {plant.isPetSafe ? t('status_safe') : t('status_toxic')}
                     </span>
                     {plant.category && (
                        <span className="px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-[0.15em] border bg-white dark:bg-slate-900 text-gray-900 dark:text-white border-gray-200 dark:border-slate-700 shadow-sm whitespace-nowrap">
                            {lv(plant.category as any)}
                        </span>
                     )}
                </div>
                
                <div className="absolute top-3 right-3 z-10 flex flex-col items-end gap-2">
                    {plant.isPriority && (
                        <div className="bg-amber-500 text-white p-1.5 rounded-full shadow-lg border border-amber-400 animate-in zoom-in duration-300">
                            <span className="text-xs">⭐</span>
                        </div>
                    )}
                    <span className={`text-[8px] font-black px-3 py-1 rounded-full shadow-sm border uppercase tracking-[0.15em] ${status.color}`}>
                        {status.label}
                    </span>
                </div>

                {/* Hardware Decoration: Serial Number */}
                <div className="absolute bottom-3 left-3 z-10 flex items-center gap-2 opacity-40">
                    <div className="w-1 h-1 rounded-full bg-white animate-pulse" />
                    <span className="text-[7px] font-mono text-white uppercase tracking-[0.2em]">{t('lbl_serial_number')}: {plant.id?.substring(0, 8)}</span>
                </div>

                {/* Hardware Decoration: Dot Grid */}
                <div className="absolute bottom-3 right-3 z-10 opacity-20 grid grid-cols-3 gap-0.5">
                    {[...Array(9)].map((_, i) => (
                        <div key={i} className="w-0.5 h-0.5 bg-white rounded-full" />
                    ))}
                </div>
            </div>

            {/* CONTENT SECTION */}
            <div className="px-5 pb-5 pt-1 flex-1 flex flex-col gap-3">
                <div>
                    <h3 className="text-gray-900 dark:text-white font-black text-xl md:text-2xl tracking-tighter leading-tight truncate">
                        {lv(plant.nickname)}
                    </h3>
                    <p className="text-verdant font-sans font-normal normal-case text-xs md:text-sm truncate opacity-70">
                        {plant.species}
                    </p>
                </div>

                <div className="space-y-1.5">
                    <div className="flex justify-between items-end">
                        <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">{t('lbl_hydration')}</span>
                        <span className={`text-[8px] font-black tracking-widest ${status.daysLeft === 0 ? 'text-red-500' : status.daysLeft === '?' ? 'text-gray-400' : 'text-verdant'}`}>
                            {status.daysLeft === 0 ? t('status_due_now') : status.daysLeft === '?' ? '?' : `${status.daysLeft}D`}
                        </span>
                    </div>
                    <div className="h-1 w-full bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div 
                            className={`h-full rounded-full transition-all duration-1000 ${status.daysLeft === 0 ? 'bg-red-500 animate-pulse' : 'bg-verdant'}`} 
                            style={{ width: `${status.percent}%` }} 
                        />
                    </div>
                </div>

                {showActions && (
                    <div className="mt-auto pt-1">
                        <Button 
                            variant="primary"
                            className={`w-full rounded-xl h-10 font-black text-[9px] uppercase tracking-widest shadow-sm transition-all ${lastLoggedAction === 'WATER' ? 'bg-emerald-500 text-white' : status.daysLeft === 0 ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'}`} 
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
                            <span className="text-lg">💧</span>
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
};