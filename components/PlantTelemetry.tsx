
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
        <div className="px-4 md:px-10 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="m3-card-elevated rounded-[24px] p-5 border border-md-outline-variant/30 flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-md-primary-container text-md-on-primary-container flex items-center justify-center">
                            <Database className="w-4 h-4" />
                        </div>
                        <span className="text-xs font-semibold text-md-on-surface-variant">{t('lbl_specimen_count')}</span>
                    </div>
                    <div className="flex items-baseline gap-1.5 mt-1">
                        <span className="text-3xl font-bold text-md-on-surface tracking-tight">{stats.total}</span>
                        <span className="text-xs font-medium text-md-on-surface-variant">{t('lbl_units')}</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full bg-md-surface-container-highest rounded-full overflow-hidden">
                        <div className="h-full bg-md-primary w-full rounded-full opacity-75" />
                    </div>
                </div>

                <div className="m3-card-elevated rounded-[24px] p-5 border border-md-outline-variant/30 flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-md-tertiary-container text-md-on-tertiary-container flex items-center justify-center">
                            <Droplets className="w-4 h-4" />
                        </div>
                        <span className="text-xs font-semibold text-md-on-surface-variant">{t('lbl_hydration_index')}</span>
                    </div>
                    <div className="flex items-baseline gap-1 mt-1">
                        <span className="text-3xl font-bold text-md-on-surface tracking-tight">{stats.hydrationLevel}</span>
                        <span className="text-sm font-semibold text-md-on-surface-variant">%</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full bg-md-surface-container-highest rounded-full overflow-hidden">
                        <div 
                            className="h-full bg-md-tertiary rounded-full transition-all duration-700" 
                            style={{ width: `${stats.hydrationLevel}%` }} 
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};
