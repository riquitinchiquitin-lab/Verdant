import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { usePlants } from '../context/PlantContext';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { Plant, Log } from '../types';
import { Button } from '../components/ui/Button';

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

export const CareSchedule: React.FC = () => {
  const { plants, addLog, houses } = usePlants();
  const { user } = useAuth();
  const { t, lv } = useLanguage();
  const location = useLocation();
  
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

  const handleWater = (plant: Plant) => {
    addLog(plant.id, { id: `l-${Date.now()}`, date: new Date().toISOString(), type: 'WATER', localizedNote: { en: t('log_water_manual') } });
    setLastLoggedAction(plant.id);
    setTimeout(() => setLastLoggedAction(null), 2000);
  };

  const filteredPlants = useMemo(() => {
    return plants.filter(p => {
        const daysDue = getDaysDue(p);
        if (daysDue === null) return false;
        
        // Show everything due in the next 3 days, or already overdue
        const isVisible = daysDue <= 3;
        if (!isVisible) return false;

        // Filtering based on user role and house assignment
        if (isAdmin) return true;
        if (user?.houseId && p.houseId === user.houseId) return true;
        if (isManager && !p.houseId) return true; // Managers see unattributed plants
        return false;
    });
  }, [plants, user?.houseId, isAdmin, isManager]);

  const sortedPlants = useMemo(() => 
    [...filteredPlants].sort((a, b) => (getDaysDue(a) || 0) - (getDaysDue(b) || 0)), 
  [filteredPlants]);

  return (
    <div className="p-4 md:p-10 max-w-4xl mx-auto pb-32 transition-all">
        
        
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 md:mb-10 gap-4 md:gap-6">
            <div>
                <h1 className="text-2xl md:text-4xl font-black text-gray-900 dark:text-white tracking-tighter uppercase leading-none">{t('care_title_page')}</h1>
                {userHouseName && (
                    <p className="text-verdant mt-1.5 md:mt-2 font-black uppercase tracking-widest text-[8px] md:text-[10px] bg-verdant/5 px-2 md:px-3 py-0.5 md:py-1 rounded-full border border-verdant/10 inline-block">
                        {t('property_prefix')}: {userHouseName}
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
            {sortedPlants.length > 0 ? sortedPlants.map(plant => {
                const daysDue = getDaysDue(plant) || 0;
                const isOverdue = daysDue <= 0;
                const isSoon = daysDue > 0 && daysDue <= 2;
                const isUrgentThirsty = shouldHighlightThirsty && isOverdue;
                
                return (
                    <div key={plant.id} className={`bg-white dark:bg-slate-900 rounded-[24px] md:rounded-[32px] border-2 ${isUrgentThirsty ? 'border-red-500 ring-4 ring-red-500/10 animate-pulse' : 'border-gray-100 dark:border-slate-800'} p-3 md:p-5 shadow-sm flex flex-col items-center gap-3 md:gap-6 hover:border-verdant/40 transition-all duration-500 group`}>
                        <div className="flex items-center gap-3 md:gap-5 w-full">
                            <div className="w-14 h-14 md:w-20 md:h-20 rounded-xl md:rounded-[24px] bg-gray-100 dark:bg-slate-800 flex-shrink-0 overflow-hidden shadow-inner ring-2 md:ring-4 ring-white dark:ring-slate-800 transition-transform group-hover:scale-105 duration-500">
                                {plant.images?.[0] ? (
                                    <img src={plant.images[0]} alt={lv(plant.nickname)} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-gray-300 dark:text-slate-700 font-black text-sm md:text-xl">?</div>
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 mb-0.5 md:mb-1">
                                    <h3 className="text-sm md:text-xl font-black text-gray-900 dark:text-white truncate uppercase tracking-tight leading-none">{lv(plant.nickname)}</h3>
                                    {isOverdue && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping shrink-0" />}
                                </div>
                                <p className="text-[9px] md:text-xs text-gray-400 dark:text-slate-500 truncate font-sans font-normal normal-case leading-none mb-2 md:mb-3">{plant.species}</p>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className={`px-2 md:px-3 py-0.5 md:py-1 rounded-full text-[8px] md:text-[9px] font-black uppercase tracking-widest border shadow-sm transition-colors duration-500 ${isOverdue ? 'bg-red-500 text-white border-red-400' : isSoon ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200/50' : 'bg-verdant/10 dark:bg-verdant/20 text-verdant dark:text-verdant-light border-verdant/20'}`}>
                                        {isOverdue ? (daysDue === 0 ? t('due_today') : t('care_days_overdue', { days: Math.abs(daysDue).toString() })) : t('care_due_in', { days: daysDue.toString() })}
                                    </span>
                                </div>
                            </div>
                        </div>
                        
                        <div className="flex w-full shrink-0">
                            <Button 
                                size="md" 
                                className={`w-full rounded-xl md:rounded-2xl h-10 md:h-14 font-black uppercase tracking-widest text-[9px] md:text-[10px] shadow-xl border-b-2 md:border-b-4 transition-all active:scale-95 ${lastLoggedAction === plant.id ? 'bg-emerald-500 border-emerald-700 text-white' : isOverdue ? 'bg-red-600 hover:bg-red-700 border-red-800 text-white' : 'bg-blue-600 hover:bg-blue-700 border-blue-800 text-white'}`} 
                                onClick={() => handleWater(plant)}
                            >
                                <span className="text-lg md:text-xl">💧</span>
                            </Button>
                        </div>
                    </div>
                );
            }) : (
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