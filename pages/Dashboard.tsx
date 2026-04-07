
import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePlants } from '../context/PlantContext';
import { useLanguage } from '../context/LanguageContext';
import { useSystem } from '../context/SystemContext';
import { Button } from '../components/ui/Button';
import { Plant } from '../types';
import { Plus, Scan, Download } from 'lucide-react';
import { AddPlantModal } from '../components/AddPlantModal';
import { PlantCard } from '../components/PlantCard';
import { PlantDetailsModal } from '../components/PlantDetailsModal';
import { QrScannerModal } from '../components/QrScannerModal';
import { Logo } from '../components/ui/Logo';
import { PlantTelemetry } from '../components/PlantTelemetry';
import { exportPlantsToNiimbotExcel } from '../services/exportService';
import { generatePlantDetails } from '../services/plantAi';
import { generateUUID } from '../services/crypto';

export const Dashboard: React.FC = () => {
  const { user, can } = useAuth();
  const { showNotification } = useSystem();
  const navigate = useNavigate();
  const { plants, addPlant, restoreDemoData, houses, getEffectiveApiKey, searchFilter, refreshAllData, isSynced } = usePlants();
  const { t, lv } = useLanguage();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [selectedPlant, setSelectedPlant] = useState<Plant | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [viewMode, setViewMode] = useState<'MY_HOUSE' | 'ALL'>('MY_HOUSE');
  const [selectedHouseFilter, setSelectedHouseFilter] = useState<string | 'ALL' | 'UNATTRIBUTED'>('ALL');

  const isAdmin = user?.role === 'OWNER' || user?.role === 'CO_CEO';

  const filtered = useMemo(() => {
    return plants.filter(p => {
      // 1. Admin House Filter (if active)
      if (isAdmin && selectedHouseFilter !== 'ALL') {
        if (selectedHouseFilter === 'UNATTRIBUTED') return !p.houseId;
        return p.houseId === selectedHouseFilter;
      }

      // 2. If viewing all plants (only for admins), show everything
      if (isAdmin && viewMode === 'ALL') return true;
      
      // 3. If viewing "My House"
      if (viewMode === 'MY_HOUSE') {
        // If user has a house assigned, they see plants in that house
        // Admins also see unattributed plants in "My House" mode
        if (user?.houseId) {
          return p.houseId === user.houseId || (isAdmin && !p.houseId);
        }
        
        // Admins with NO house assigned see EVERYTHING in "My House" mode (since they own all houses)
        if (isAdmin) return true;
        
        // If user has no house assigned and is NOT an admin, they see nothing in "My House" mode
        return false;
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

  const handleScanSuccess = async (data: string) => {
    setIsScannerOpen(false);
    
    const parts = data.split('|');
    if (parts.length >= 3) {
      const [sourceHouse, sourceId, species, family] = parts;
      
      setIsSyncing(true);
      showNotification("SYNCING SPECIMEN...", "INFO");
      try {
        const details = await generatePlantDetails(species, undefined, undefined, getEffectiveApiKey());
        
        const syncedPlant: Plant = {
          ...details,
          id: `p-synced-${generateUUID()}`,
          species: species,
          family: family || details.family,
          houseId: user?.houseId || null, 
          createdAt: new Date().toISOString(),
          nickname: details.nickname || { en: species },
          images: details.images?.length ? details.images : ['https://images.unsplash.com/photo-1545239351-ef35f43d514b?q=80&w=1000&auto=format&fit=crop'],
          edible: details.edible || false,
          logs: []
        } as Plant;

        await addPlant(syncedPlant);
        setSelectedPlant(syncedPlant);
        showNotification("SYNC SUCCESS", "SUCCESS");
      } catch (err) {
        console.error("Botanical Sync Failure:", err);
        showNotification("SYNC FAILED", "ERROR");
      } finally {
        setIsSyncing(false);
      }
    } else {
      showNotification("INVALID SYNC ID", "WARNING");
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-20 transition-all">
        <AddPlantModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} onSave={addPlant} />
        <PlantDetailsModal isOpen={!!selectedPlant} plant={selectedPlant} onClose={() => setSelectedPlant(null)} />
        <QrScannerModal isOpen={isScannerOpen} onClose={() => setIsScannerOpen(false)} onScanSuccess={handleScanSuccess} />

        {/* CLEAN HEADER */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 px-6 md:px-10 pt-10 pb-4">
            <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white dark:bg-slate-900 rounded-2xl shadow-sm flex items-center justify-center border border-gray-100 dark:border-white/5">
                    <Logo className="w-8 h-8 text-verdant" />
                </div>
                <div>
                    <h1 className="text-2xl md:text-3xl font-black text-gray-900 dark:text-white tracking-tighter uppercase leading-none">Verdant</h1>
                </div>
            </div>
            
            <div className="flex items-center gap-3">
                {isAdmin && (
                    <div className="flex flex-col md:flex-row items-end md:items-center gap-3">
                        <select 
                            className="h-12 px-4 bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 outline-none focus:ring-4 focus:ring-emerald-500/10 transition-all appearance-none min-w-[160px]"
                            value={selectedHouseFilter}
                            onChange={(e) => setSelectedHouseFilter(e.target.value as any)}
                        >
                            <option value="ALL">{t('labels_all_global_properties')}</option>
                            <option value="UNATTRIBUTED">{t('lbl_unattributed')}</option>
                            {houses.map(h => (
                                <option key={h.id} value={h.id}>{lv(h.name)}</option>
                            ))}
                        </select>


                    </div>
                )}
                <Button
                    onClick={() => setIsAddModalOpen(true)}
                    className="h-12 px-6 bg-verdant text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-verdant/20 hover:scale-105 transition-all flex items-center gap-2"
                >
                    <Plus className="w-4 h-4" />
                    {t('btn_add_plant')}
                </Button>
            </div>
        </div>

        <PlantTelemetry />

        <div className="px-6 md:px-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8 pb-8">
            {featured && (
                <div key={featured.id} className="relative group">
                    {!featured.houseId && (
                        <div className="absolute -top-3 -right-3 z-20 bg-amber-500 text-white text-[8px] font-black px-2 py-1 rounded-full shadow-lg border-2 border-white dark:border-slate-900 uppercase tracking-widest animate-bounce">
                            {t('lbl_unattributed')}
                        </div>
                    )}
                    <PlantCard plant={featured} onClick={() => setSelectedPlant(featured)} showActions={can('log_data')} />
                </div>
            )}
            {others.map(plant => (
                <div key={plant.id} className="relative group">
                    {!plant.houseId && (
                        <div className="absolute -top-3 -right-3 z-20 bg-amber-500 text-white text-[8px] font-black px-2 py-1 rounded-full shadow-lg border-2 border-white dark:border-slate-900 uppercase tracking-widest animate-bounce">
                            {t('lbl_unattributed')}
                        </div>
                    )}
                    <PlantCard plant={plant} onClick={() => setSelectedPlant(plant)} showActions={can('log_data')} />
                </div>
            ))}
        </div>
        
        {filtered.length === 0 && (
            <div className="py-24 text-center border-4 border-dashed border-gray-100 dark:border-slate-800 rounded-[48px]">
                <p className="text-gray-400 font-black uppercase tracking-[0.4em]">{t('empty_jungle')}</p>
                <Button variant="primary" className="mt-8 rounded-2xl" onClick={restoreDemoData}>{t('restore_examples')}</Button>
            </div>
        )}
    </div>
  );
};
