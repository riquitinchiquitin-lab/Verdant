
import React, { useMemo, useEffect, useState } from 'react';
import { usePlants } from '../context/PlantContext';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../constants';
import { Activity, Cpu, Database, Key } from 'lucide-react';

interface ApiUsage {
    gemini_count: number;
    gemini_tokens: number;
    plantnet_count: number;
    trefle_count: number;
    perenual_count: number;
    serper_count: number;
    system_load?: string;
    recent_logs?: any[];
}

const API_LIMITS: Record<string, number> = {
    gemini: 5000,
    gemini_tokens: 1000000,
    plantnet: 500,
    trefle: 2500,
    perenual: 1000,
    serper: 1000,
    opb: 1000
};

export const SystemTelemetry: React.FC = () => {
    const { isSynced, plants, tasks, houses } = usePlants();
    const { t } = useLanguage();
    const { token, user } = useAuth();
    const [apiUsage, setApiUsage] = useState<ApiUsage | null>(null);

    useEffect(() => {
        const fetchUsage = () => {
            if (token && user) {
                fetch(`${API_URL}/api/system/usage`, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'x-user-role': user.role,
                        'x-user-id': user.id,
                        'x-user-house-id': user.houseId || ''
                    }
                })
                .then(res => {
                    const contentType = res.headers.get("content-type");
                    if (res.ok && contentType && contentType.includes("application/json")) {
                        return res.json();
                    }
                    return null;
                })
                .then(data => setApiUsage(data))
                .catch(err => console.error('Failed to fetch API usage:', err));
            }
        };

        fetchUsage();
        const interval = setInterval(fetchUsage, 5000);
        return () => clearInterval(interval);
    }, [token, user]);

    const stats = useMemo(() => {
        // Mock database size calculation based on record counts
        const baseSize = 124.5; // Base system overhead in KB
        const plantWeight = 2.4; // KB per plant
        const taskWeight = 0.8; // KB per task
        const houseWeight = 1.2; // KB per house
        
        const totalSize = baseSize + (plants.length * plantWeight) + (tasks.length * taskWeight) + (houses.length * houseWeight);
        
        const totalApiUsage = apiUsage ? 
            apiUsage.gemini_count + 
            apiUsage.plantnet_count + 
            apiUsage.trefle_count + 
            apiUsage.perenual_count + 
            apiUsage.serper_count : 0;

        return {
            systemLoad: apiUsage?.system_load ? `${apiUsage.system_load}%` : "0.0%",
            syncStatus: isSynced ? t('connected') : t('status_syncing'),
            dbSize: `${totalSize.toFixed(1)} KB`,
            apiUsage: totalApiUsage
        };
    }, [isSynced, t, plants.length, tasks.length, houses.length, apiUsage]);

    return (
        <div className="space-y-6 mb-8">
            <div className="bg-white dark:bg-slate-950 border border-gray-100 dark:border-slate-800 rounded-[32px] p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 shadow-xl dark:shadow-2xl relative overflow-hidden">
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
                        <span className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter">{stats.systemLoad}</span>
                    </div>
                    <div className="mt-2 flex gap-1">
                        {[1,2,3,4,5,6,7,8].map(i => {
                            const loadValue = parseFloat(apiUsage?.system_load || "0");
                            const isActive = i <= Math.ceil((loadValue / 100) * 8);
                            return (
                                <div key={i} className={`h-1 flex-1 rounded-full ${isActive ? 'bg-purple-500/40' : 'bg-slate-100 dark:bg-slate-800'}`} />
                            );
                        })}
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
                    {apiUsage && apiUsage.gemini_tokens > 0 && (
                        <div className="flex items-center gap-1 mt-1">
                            <span className="text-[9px] font-black text-amber-500 uppercase tracking-tight">Gemini:</span>
                            <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400">{(apiUsage.gemini_tokens / 1000).toFixed(1)}k tokens</span>
                        </div>
                    )}
                    <div className="mt-2 flex gap-1 items-end h-4">
                        {apiUsage && Object.entries(apiUsage).filter(([key]) => key.endsWith('_count')).map(([key, value], i) => {
                            const apiKey = key.replace('_count', '');
                            const limit = API_LIMITS[apiKey] || 1000;
                            const height = Math.min(100, ((value as number) / limit) * 100);
                            return (
                                <div 
                                    key={key} 
                                    className="w-full bg-amber-500/20 rounded-t-sm relative group"
                                    style={{ height: `${Math.max(10, height)}%` }}
                                >
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-slate-800 text-white text-[8px] px-2 py-1 rounded whitespace-nowrap z-20 shadow-xl border border-white/10">
                                        <div className="font-black mb-0.5">{t(`api_${apiKey}`)}</div>
                                        <div className="flex items-center gap-1">
                                            <span className="text-amber-400">{value as number}</span>
                                            <span className="opacity-40">/</span>
                                            <span>{limit}</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Live Feed Section - Desktop Only */}
            <div className="hidden lg:block bg-white dark:bg-slate-950 border border-gray-100 dark:border-slate-800 rounded-[32px] p-6 shadow-xl dark:shadow-2xl">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <Activity className="w-4 h-4 text-emerald-500" />
                        <h3 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Live System Feed</h3>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                        <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Real-time</span>
                    </div>
                </div>
                <div className="space-y-2">
                    {apiUsage?.recent_logs?.map((log, i) => (
                        <div key={log.id || i} className="flex items-center gap-3 py-2 border-b border-gray-50 dark:border-slate-900 last:border-0">
                            <span className="text-[8px] font-mono text-slate-400 shrink-0">
                                {new Date(log.created_at).toLocaleTimeString()}
                            </span>
                            <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter shrink-0 ${
                                log.level === 'ERROR' ? 'bg-red-500/10 text-red-500' :
                                log.level === 'WARN' ? 'bg-amber-500/10 text-amber-500' :
                                'bg-emerald-500/10 text-emerald-500'
                            }`}>
                                {log.level}
                            </span>
                            <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 truncate">
                                {log.event}
                            </span>
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 truncate ml-auto">
                                {log.details}
                            </span>
                        </div>
                    ))}
                    {(!apiUsage?.recent_logs || apiUsage.recent_logs.length === 0) && (
                        <div className="py-4 text-center">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">No recent events</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
