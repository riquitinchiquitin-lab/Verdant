import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion } from 'motion/react';
import { useLocation } from 'react-router-dom';
import { usePlants } from '../context/PlantContext';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { Plant, Log } from '../types';
import { Button } from '../components/ui/Button';
import { generateUUID } from '../services/crypto';
import { PotRotationIcon } from '../components/ui/Icons';
import { useDraggableScroll } from '../hooks/useDraggableScroll';

const getDaysDue = (plant: Plant): number | null => {
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

    if (!plant.lastWatered) return 0; // If it has an interval but was never watered, it's due now
    
    const lastDate = new Date(plant.lastWatered);
    const intervalMs = effectiveInterval * 86400000;
    let daysLeftNum = Math.ceil((lastDate.getTime() + intervalMs - Date.now()) / 86400000);

    // Incorporate moisture data (matching PlantCard logic)
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
        }
    }

    return daysLeftNum;
};

const getRotationDaysDue = (plant: Plant): number | null => {
    if (!plant.rotationFrequency) return null;
    if (!plant.lastRotated) return 0;
    const lastDate = new Date(plant.lastRotated);
    const intervalMs = plant.rotationFrequency * 86400000;
    return Math.ceil((lastDate.getTime() + intervalMs - Date.now()) / 86400000);
};

const CareActionItem: React.FC<{
  action: { plant: Plant; type: 'WATER' | 'ROTATE'; daysDue: number };
  onAction: (plant: Plant, type: 'WATER' | 'ROTATE') => void;
  lastLoggedAction: string | null;
  t: any;
  lv: any;
}> = ({ action, onAction, lastLoggedAction, t, lv }) => {
    const { plant, type, daysDue } = action;
    const isOverdue = daysDue <= 0;
    const actionKey = `${plant.id}-${type.toLowerCase()}`;
    
    return (
        <div className={`group flex items-center gap-3 p-2 md:p-3 rounded-2xl border transition-all duration-300 bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-800 hover:border-verdant/50 hover:shadow-lg`}>
            {/* Plant Image */}
            <div className="w-12 h-12 md:w-16 md:h-16 rounded-xl overflow-hidden bg-gray-100 dark:bg-slate-800 shrink-0 shadow-inner">
                {plant.images?.[0] ? (
                    <img src={plant.images[0]} alt={lv(plant.nickname)} className="w-full h-full object-cover" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300 dark:text-slate-700 font-black text-xs md:text-sm">?</div>
                )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                    <h3 className="font-black text-gray-900 dark:text-white uppercase tracking-tight text-base md:text-lg truncate">
                        {lv(plant.nickname)}
                    </h3>
                    {isOverdue && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping shrink-0" />}
                </div>
                <p className="text-xs md:text-sm text-gray-400 dark:text-slate-500 truncate font-sans font-normal normal-case">
                    {type === 'WATER' ? t('lbl_watering_schedule') : t('lbl_rotation_schedule')}
                </p>
                <div className="flex items-center gap-2 mt-1.5">
                    <span className={`px-2 md:px-2.5 py-0.5 rounded-full text-xs md:text-sm font-black uppercase tracking-widest border shadow-sm ${isOverdue ? 'bg-red-500 text-white border-red-400' : type === 'WATER' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200/50' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200/50'}`}>
                        {type === 'WATER' ? '💧' : '🔄'} {isOverdue ? (daysDue === 0 ? t('due_today') : t('care_days_overdue', { days: Math.abs(daysDue).toString() })) : t('care_due_in', { days: daysDue.toString() })}
                    </span>
                </div>
            </div>

            {/* Actions */}
            <div className="flex gap-1.5 md:gap-2">
                <motion.button 
                    whileTap={{ scale: 0.92 }}
                    onClick={() => onAction(plant, type)}
                    className={`w-8 h-8 md:w-10 md:h-10 rounded-xl flex items-center justify-center transition-all shadow-sm border-b-2 ${lastLoggedAction === actionKey ? 'bg-emerald-500 border-emerald-700 text-white' : isOverdue ? (type === 'WATER' ? 'bg-red-600 hover:bg-red-700 border-red-800' : 'bg-amber-600 hover:bg-amber-700 border-amber-800') : (type === 'WATER' ? 'bg-blue-600 hover:bg-blue-700 border-blue-800' : 'bg-indigo-600 hover:bg-indigo-700 border-indigo-800')} text-white`}
                >
                    {type === 'WATER' ? (
                        <span className="text-xs md:text-sm">💧</span>
                    ) : (
                        <PotRotationIcon className="w-5 h-5 md:w-6 md:h-6" />
                    )}
                </motion.button>
            </div>
        </div>
    );
};

export const CareSchedule: React.FC = () => {
  const { plants, addLog, updatePlant, houses } = usePlants();
  const { user } = useAuth();
  const { t, lv, language, getLocalizedString } = useLanguage();
  const location = useLocation();
  const scheduleScroll = useDraggableScroll();
  
  const queryParams = new URLSearchParams(location.search);
  const shouldHighlightThirsty = queryParams.get('filter') === 'thirsty';
  const [notifyPerm, setNotifyPerm] = useState<NotificationPermission>(typeof Notification !== 'undefined' ? Notification.permission : 'default');
  const [lastLoggedAction, setLastLoggedAction] = useState<string | null>(null);

  const isAdmin = user?.role === 'OWNER' || user?.role === 'CO_CEO';
  const isManager = isAdmin || user?.role === 'LEAD_HAND';

  const userHouseName = useMemo(() => {
    if (!user?.houseId) return '';
    const house = houses.find(h => h.id === user.houseId);
    return house ? lv(house.name) : '';
  }, [user?.houseId, houses, lv]);

  const requestNotification = async () => {
    if (typeof Notification !== 'undefined') {
        try {
            const res = await Notification.requestPermission();
            setNotifyPerm(res);
            if (res === 'granted') { 
                const message = userHouseName 
                    ? t('notifications_house_enabled', { house: userHouseName })
                    : t('notifications_global_enabled');
                new Notification(t('app_name'), { body: message }); 
            }
        } catch (e) {
            console.warn("Notifications restricted by system protocol.");
        }
    }
  };

  const handleAction = async (plant: Plant, type: 'WATER' | 'ROTATE') => {
    const now = new Date().toISOString();
    if (type === 'WATER') {
      // Use getLocalizedString to avoid Gemini translation delay for standard notes
      const localizedNote = getLocalizedString('log_water_manual');
      addLog(plant.id, { 
        id: `l-${generateUUID()}`, 
        date: now, 
        type: 'WATER', 
        localizedNote 
      });
      // updatePlant is redundant because addLog already updates lastWatered
      setLastLoggedAction(plant.id + '-water');
    } else {
      const localizedNote = getLocalizedString('log_rotated_manual');
      addLog(plant.id, { 
        id: `l-${generateUUID()}`, 
        date: now, 
        type: 'ROTATED', 
        localizedNote 
      });
      // updatePlant is redundant because addLog already updates lastRotated
      setLastLoggedAction(plant.id + '-rotate');
    }
    setTimeout(() => setLastLoggedAction(null), 2000);
  };

  const careActions = useMemo(() => {
    const actions: { plant: Plant; type: 'WATER' | 'ROTATE'; daysDue: number }[] = [];
    
    plants.forEach(p => {
        // Filtering based on user role and house assignment
        const isVisible = user?.houseId ? p.houseId === user.houseId : (isAdmin || (isManager && !p.houseId));
        if (!isVisible) return;

        const wDays = getDaysDue(p);
        const rDays = getRotationDaysDue(p);
        
        if (wDays !== null && wDays <= 3) {
            actions.push({ plant: p, type: 'WATER', daysDue: wDays });
        }
        if (rDays !== null && rDays <= 3) {
            actions.push({ plant: p, type: 'ROTATE', daysDue: rDays });
        }
    });

    return actions.sort((a, b) => a.daysDue - b.daysDue);
  }, [plants, user?.houseId, isAdmin, isManager]);

  const { dueNow, upcoming } = useMemo(() => {
    const now = careActions.filter(a => a.daysDue <= 0);
    const future = careActions.filter(a => a.daysDue > 0);
    return { dueNow: now, upcoming: future };
  }, [careActions]);

  return (
    <div className="p-4 md:p-10 max-w-3xl mx-auto pb-32 transition-all">
        
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 md:mb-10 gap-4 md:gap-6">
            <div>
                <h1 className="text-2xl md:text-4xl font-black text-gray-900 dark:text-white tracking-tighter uppercase leading-none">{t('care_title_page')}</h1>
                {userHouseName && (
                    <p className="text-verdant mt-1.5 md:mt-2 font-black uppercase tracking-widest text-[8px] md:text-[10px] bg-verdant/5 px-2 md:px-3 py-0.5 md:py-1 rounded-full border border-verdant/10 inline-block">
                        {t('house_prefix')}: {userHouseName}
                    </p>
                )}
            </div>
            {notifyPerm !== 'granted' && (
                <Button variant="secondary" onClick={requestNotification} size="sm" className="w-full sm:w-auto rounded-xl h-10 md:h-12 shadow-sm uppercase tracking-widest font-black text-[9px] md:text-[10px]">
                    <svg className="w-3.5 h-3.5 md:w-4 md:h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                    {t('enable_alerts')}
                </Button>
            )}
        </div>

        <div className="space-y-10">
            {careActions.length > 0 ? (
                <>
                    {dueNow.length > 0 && (
                        <section className="space-y-4">
                            <h2 className="text-sm md:text-base font-black text-red-500 uppercase tracking-[0.4em] px-2">{t('tasks_due_now')}</h2>
                            <div className="flex flex-col gap-3">
                                {dueNow.map((action, idx) => (
                                    <CareActionItem 
                                        key={`${action.plant.id}-${action.type}-${idx}`} 
                                        action={action} 
                                        onAction={handleAction} 
                                        lastLoggedAction={lastLoggedAction}
                                        t={t}
                                        lv={lv}
                                    />
                                ))}
                            </div>
                        </section>
                    )}

                    {upcoming.length > 0 && (
                        <section className="space-y-4">
                            <h2 className="text-sm md:text-base font-black text-blue-500 uppercase tracking-[0.4em] px-2">{t('tasks_upcoming')}</h2>
                            <div className="flex flex-col gap-3">
                                {upcoming.map((action, idx) => (
                                    <CareActionItem 
                                        key={`${action.plant.id}-${action.type}-${idx}`} 
                                        action={action} 
                                        onAction={handleAction} 
                                        lastLoggedAction={lastLoggedAction}
                                        t={t}
                                        lv={lv}
                                    />
                                ))}
                            </div>
                        </section>
                    )}
                </>
            ) : (
                <div className="py-32 text-center bg-white dark:bg-slate-900/30 rounded-[64px] border-4 border-dashed border-gray-100 dark:border-slate-800 shadow-inner flex flex-col items-center justify-center animate-in fade-in duration-1000">
                    <div className="w-24 h-24 bg-gray-50 dark:bg-slate-800 rounded-full flex items-center justify-center mb-8 shadow-sm">
                        <svg className="w-12 h-12 text-gray-200 dark:text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                    </div>
                    <p className="text-gray-300 dark:text-slate-600 font-black uppercase tracking-[0.4em] text-xs italic">{t('care_queue_clear')}</p>
                    <p className="text-gray-400 dark:text-slate-500 mt-4 text-sm max-w-xs leading-relaxed font-bold">{t('care_no_specimens')}</p>
                </div>
            )}
        </div>
    </div>
  );
};