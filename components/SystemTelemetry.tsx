
import React, { useMemo, useEffect, useState } from 'react';
import { usePlants } from '../context/PlantContext';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../constants';
import { Activity, Cpu, Database, Key } from 'lucide-react';

interface ApiUsage {
    google_maps_count: number;
    gemini_count: number;
    plantnet_count: number;
    trefle_count: number;
    perenual_count: number;
    serper_count: number;
}

export const SystemTelemetry: React.FC = () => {
    const { isSynced, plants, tasks, houses } = usePlants();
    const { t } = useLanguage();
    const { token, user } = useAuth();
    const [apiUsage, setApiUsage] = useState<ApiUsage | null>(null);

    useEffect(() => {
        if (token && user) {
            fetch(`${API_URL}/api/system/usage`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'x-user-role': user.role,
                    'x-user-id': user.id,
                    'x-user-house-id': user.houseId || ''
                }
            })
            .then(res => res.ok ? res.json() : null)
            .then(data => setApiUsage(data))
            .catch(err => console.error('Failed to fetch API usage:', err));
        }
    }, [token, user]);

    const stats = useMemo(() => {
        // Mock database size calculation based on record counts
        const baseSize = 124.5; // Base system overhead in KB
        const plantWeight = 2.4; // KB per plant
        const taskWeight = 0.8; // KB per task
        const houseWeight = 1.2; // KB per house
        
        const totalSize = baseSize + (plants.length * plantWeight) + (tasks.length * taskWeight) + (houses.length * houseWeight);
        
        const totalApiUsage = apiUsage ? 
            apiUsage.google_maps_count + 
            apiUsage.gemini_count + 
            apiUsage.plantnet_count + 
            apiUsage.trefle_count + 
            apiUsage.perenual_count + 
            apiUsage.serper_count : 0;

        return {
            uptime: "99.9%",
            syncStatus: isSynced ? t('connected') : t('status_syncing'),
            dbSize: `${totalSize.toFixed(1)} KB`,
            apiUsage: totalApiUsage
        };
    }, [isSynced, t, plants.length, tasks.length, houses.length, apiUsage]);

    return (
        <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[32px] p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 shadow-xl dark:shadow-2xl relative overflow-hidden mb-8">
            {/* Decorative Grid Background */}
            <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
            
            <div className="relative z-10 flex flex-col gap-1">
                <div className="flex items-center gap-2 mb-2">
                    <Activity className="w-3 h-3 text-emerald-500 dark:text-emerald-400" />
                    <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">{t('lbl_uplink_status')}</span>
                </div>
                <div className="flex items-baseline gap-1">
                    <span className={`text-xl font-black tracking-tighter ${isSynced ? 'text-emerald-500 dark:text-emerald-400' : 'text-amber-500 dark:text-amber-400 animate-pulse'}`}>
                        {stats.syncStatus}
                    </span>
                </div>
                <div className="mt-auto flex items-center gap-2 pt-4">
                    <div className={`w-2 h-2 rounded-full ${isSynced ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-emerald-500 animate-ping'}`} />
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

            <div className="relative z-10 flex flex-col gap-1">
                <div className="flex items-center gap-2 mb-2">
                    <Database className="w-3 h-3 text-blue-500 dark:text-blue-400" />
                    <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">{t('lbl_database_size')}</span>
                </div>
                <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter">{stats.dbSize}</span>
                </div>
                <div className="mt-2 h-1 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500/40 w-1/3" />
                </div>
            </div>

            <div className="relative z-10 flex flex-col gap-1">
                <div className="flex items-center gap-2 mb-2">
                    <Key className="w-3 h-3 text-amber-500 dark:text-amber-400" />
                    <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">{t('lbl_api_usage')}</span>
                </div>
                <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter">{stats.apiUsage}</span>
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest ml-1">HITS</span>
                </div>
                <div className="mt-2 flex gap-1 items-end h-4">
                    {apiUsage && Object.entries(apiUsage).filter(([key]) => key.endsWith('_count')).map(([key, value], i) => {
                        const height = Math.min(100, (value as number) * 5);
                        return (
                            <div 
                                key={key} 
                                className="w-full bg-amber-500/20 rounded-t-sm relative group"
                                style={{ height: `${Math.max(10, height)}%` }}
                            >
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-slate-800 text-white text-[8px] px-1 rounded whitespace-nowrap z-20">
                                    {t(`api_${key.replace('_count', '')}`)}: {value as number}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
