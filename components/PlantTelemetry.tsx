
import React, { useMemo } from 'react';
import { usePlants } from '../context/PlantContext';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { Database, Droplets } from 'lucide-react';

export const PlantTelemetry: React.FC = () => {
    const { plants } = usePlants();
    const { t } = useLanguage();
    const { user } = useAuth();

    const isAdmin = user?.role === 'OWNER' || user?.role === 'CO_CEO';

    const stats = useMemo(() => {
        const filtered = plants.filter(p => {
            if (user?.houseId) return p.houseId === user.houseId;
            if (isAdmin) return true;
            return false;
        });

        const total = filtered.length;
        const thirsty = filtered.filter(p => {
            if (!p.lastWatered || !p.wateringInterval) return false;
            const lastDate = new Date(p.lastWatered);
            const intervalMs = p.wateringInterval * 86400000;
            return (lastDate.getTime() + intervalMs - Date.now()) <= 0;
        }).length;

        const hydrationLevel = total > 0 ? Math.round(((total - thirsty) / total) * 100) : 100;

        return {
            total,
            thirsty,
            hydrationLevel
        };
    }, [plants, user?.houseId, isAdmin]);

    return (
        <div className="px-6 md:px-10 mb-8">
            <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[32px] p-6 grid grid-cols-1 md:grid-cols-2 gap-6 shadow-xl dark:shadow-2xl relative overflow-hidden">
                {/* Decorative Grid Background */}
                <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
                
                <div className="relative z-10 flex flex-col gap-1">
                    <div className="flex items-center gap-2 mb-2">
                        <Database className="w-3 h-3 text-verdant" />
                        <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">{t('lbl_specimen_count')}</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                        <span className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter">{stats.total}</span>
                        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tighter">{t('lbl_units')}</span>
                    </div>
                    <div className="mt-2 h-1 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-verdant w-full opacity-50" />
                    </div>
                </div>

                <div className="relative z-10 flex flex-col gap-1">
                    <div className="flex items-center gap-2 mb-2">
                        <Droplets className="w-3 h-3 text-blue-500 dark:text-blue-400" />
                        <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">{t('lbl_hydration_index')}</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                        <span className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter">{stats.hydrationLevel}</span>
                        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tighter">%</span>
                    </div>
                    <div className="mt-2 h-1 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div 
                            className="h-full bg-blue-500 dark:bg-blue-400 transition-all duration-1000" 
                            style={{ width: `${stats.hydrationLevel}%` }} 
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};
