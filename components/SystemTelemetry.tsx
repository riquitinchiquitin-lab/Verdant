
import React, { useMemo } from 'react';
import { usePlants } from '../context/PlantContext';
import { useLanguage } from '../context/LanguageContext';
import { Activity, Cpu } from 'lucide-react';

export const SystemTelemetry: React.FC = () => {
    const { isSynced } = usePlants();
    const { t } = useLanguage();

    const stats = useMemo(() => {
        return {
            uptime: "99.9%",
            syncStatus: isSynced ? t('connected') : t('status_syncing')
        };
    }, [isSynced, t]);

    return (
        <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[32px] p-6 grid grid-cols-1 md:grid-cols-2 gap-6 shadow-xl dark:shadow-2xl relative overflow-hidden mb-8">
            {/* Decorative Grid Background */}
            <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
            
            <div className="relative z-10 flex flex-col gap-1">
                <div className="flex items-center gap-2 mb-2">
                    <Activity className="w-3 h-3 text-amber-500 dark:text-amber-400" />
                    <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">{t('lbl_uplink_status')}</span>
                </div>
                <div className="flex items-baseline gap-1">
                    <span className={`text-xl font-black tracking-tighter ${isSynced ? 'text-emerald-500 dark:text-emerald-400' : 'text-amber-500 dark:text-amber-400 animate-pulse'}`}>
                        {stats.syncStatus}
                    </span>
                </div>
                <div className="mt-auto flex items-center gap-2 pt-4">
                    <div className={`w-2 h-2 rounded-full ${isSynced ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-amber-500 animate-ping'}`} />
                    <span className="text-[8px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest">{t('lbl_terminal_active')}</span>
                </div>
            </div>

            <div className="relative z-10 flex flex-col gap-1">
                <div className="flex items-center gap-2 mb-2">
                    <Cpu className="w-3 h-3 text-purple-500 dark:text-purple-400" />
                    <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">{t('lbl_system_load')}</span>
                </div>
                <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter">{stats.uptime}</span>
                </div>
                <div className="mt-2 flex gap-1">
                    {[1,2,3,4,5,6,7,8].map(i => (
                        <div key={i} className={`h-1 flex-1 rounded-full ${i < 7 ? 'bg-purple-500/40' : 'bg-slate-100 dark:bg-slate-800'}`} />
                    ))}
                </div>
            </div>
        </div>
    );
};
