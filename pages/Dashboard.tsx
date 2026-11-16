
import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePlants } from '../context/PlantContext';
import { useLanguage } from '../context/LanguageContext';
import { useSystem } from '../context/SystemContext';
import { Button } from '../components/ui/Button';
import { Plant } from '../types';
import { Plus } from 'lucide-react';
import { AddPlantModal } from '../components/AddPlantModal';
import { PlantCard } from '../components/PlantCard';
import { PlantDetailsModal } from '../components/PlantDetailsModal';
import { Logo } from '../components/ui/Logo';
import { PlantTelemetry } from '../components/PlantTelemetry';
import { exportPlantsToNiimbotExcel } from '../services/exportService';

export const Dashboard: React.FC = () => {
  const { user, can } = useAuth();
  const { showNotification } = useSystem();
  const navigate = useNavigate();
  const { plants, addPlant, restoreDemoData, houses, searchFilter } = usePlants();
  const { t, lv } = useLanguage();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedPlant, setSelectedPlant] = useState<Plant | null>(null);
  const [viewMode, setViewMode] = useState<'MY_HOUSE' | 'ALL'>('MY_HOUSE');
  const [selectedHouseFilter, setSelectedHouseFilter] = useState<string | 'ALL' | 'UNATTRIBUTED'>('ALL');

  const isAdmin = user?.role === 'OWNER' || user?.role === 'CO_CEO';

  const filtered = useMemo(() => {
    return plants.filter(p => {
      // 1. Admin House Filter
      if (isAdmin) {
        if (selectedHouseFilter === 'ALL') return true;
        if (selectedHouseFilter === 'UNATTRIBUTED') return !p.houseId;
        return p.houseId === selectedHouseFilter;
      }

      // 2. Non-admin users see only their assigned house
      if (user?.houseId) {
        return p.houseId === user.houseId;
      }
      
      return false;
    }).filter(p => {
        const f = searchFilter.toLowerCase();
        if (!f) return true;
        return (lv(p.nickname) || '').toLowerCase().includes(f) || (p.species || '').toLowerCase().includes(f);
    });
  }, [plants, user, isAdmin, viewMode, selectedHouseFilter, searchFilter, lv]);

  const { featured, others } = useMemo(() => {
    const priorityPlant = filtered.find(p => p.isPriority);
    if (priorityPlant) {
      return {
        featured: priorityPlant,
        others: filtered.filter(p => p.id !== priorityPlant.id)
      };
    }
    return {
      featured: filtered[0],
      others: filtered.slice(1)
    };
  }, [filtered]);

  const handleExport = () => {
    const fileName = `verdant_${user?.house?.name?.en || 'jungle'}_labels.xlsx`;
    exportPlantsToNiimbotExcel(filtered, lv, fileName);
    showNotification("EXPORT COMPLETE", "SUCCESS");
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20 transition-all">
        <AddPlantModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} onSave={addPlant} />
        <PlantDetailsModal isOpen={!!selectedPlant} plant={selectedPlant} onClose={() => setSelectedPlant(null)} />

        {/* M3 PAGE HEADER */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 px-4 md:px-10 pt-6 pb-2">
            <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 bg-md-primary-container text-md-on-primary-container rounded-2xl flex items-center justify-center p-2 shadow-xs">
                    <Logo className="w-full h-full" />
                </div>
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-md-on-surface tracking-tight leading-none">{t('menu_my_plants')}</h1>
                    <p className="text-xs font-medium text-md-on-surface-variant mt-1">{filtered.length} {t('lbl_units')}</p>
                </div>
            </div>
            
            <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                {isAdmin && (
                    <select 
                        className="h-10 px-4 bg-md-surface-container-high border border-md-outline-variant/60 rounded-full text-xs font-semibold text-md-on-surface outline-none focus:ring-2 focus:ring-md-primary/30 transition-all min-w-[160px]"
                        value={selectedHouseFilter}
                        onChange={(e) => setSelectedHouseFilter(e.target.value as any)}
                    >
                        <option value="ALL">{t('labels_all_global_properties')}</option>
                        <option value="UNATTRIBUTED">{t('lbl_unattributed')}</option>
                        {houses.map(h => (
                            <option key={h.id} value={h.id}>{lv(h.name)}</option>
                        ))}
                    </select>
                )}
                <Button
                    variant="primary"
                    size="md"
                    onClick={() => setIsAddModalOpen(true)}
                >
                    <Plus className="w-4 h-4" />
                    {t('btn_add_plant')}
                </Button>
            </div>
        </div>

        <PlantTelemetry />

        <div className="px-4 md:px-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6 pb-8">
            {featured && (
                <div key={featured.id} className="relative group">
                    {!featured.houseId && (
                        <div className="absolute -top-2 -right-2 z-20 bg-amber-400 text-amber-950 text-[11px] font-semibold px-2.5 py-0.5 rounded-full shadow-md">
                            {t('lbl_unattributed')}
                        </div>
                    )}
                    <PlantCard plant={featured} onClick={() => setSelectedPlant(featured)} showActions={can('log_data')} />
                </div>
            )}
            {others.map(plant => (
                <div key={plant.id} className="relative group">
                    {!plant.houseId && (
                        <div className="absolute -top-2 -right-2 z-20 bg-amber-400 text-amber-950 text-[11px] font-semibold px-2.5 py-0.5 rounded-full shadow-md">
                            {t('lbl_unattributed')}
                        </div>
                    )}
                    <PlantCard plant={plant} onClick={() => setSelectedPlant(plant)} showActions={can('log_data')} />
                </div>
            ))}
        </div>
        
        {filtered.length === 0 && (
            <div className="mx-4 md:mx-10 py-20 text-center bg-md-surface-container-low border border-dashed border-md-outline-variant rounded-[28px]">
                <p className="text-md-on-surface-variant font-semibold text-sm">{t('empty_jungle')}</p>
                <Button variant="tonal" className="mt-6" onClick={restoreDemoData}>{t('restore_examples')}</Button>
            </div>
        )}
    </div>
  );
};
