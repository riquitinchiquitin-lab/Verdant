
import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePlants } from '../context/PlantContext';
import { useLanguage } from '../context/LanguageContext';
import { useSystem } from '../context/SystemContext';
import { Button } from '../components/ui/Button';
import { Plant } from '../types';
import { AddPlantModal } from '../components/AddPlantModal';
import { PlantCard } from '../components/PlantCard';
import { PlantDetailsModal } from '../components/PlantDetailsModal';
import { QrScannerModal } from '../components/QrScannerModal';
import { exportPlantsToNiimbotExcel } from '../services/exportService';
import { generatePlantDetails } from '../services/plantAi';

export const Dashboard: React.FC = () => {
  const { user, can } = useAuth();
  const { showNotification } = useSystem();
  const navigate = useNavigate();
  const { plants, addPlant, restoreDemoData, houses, getEffectiveApiKey, searchFilter } = usePlants();
  const { t, lv } = useLanguage();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [selectedPlant, setSelectedPlant] = useState<Plant | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const isAdmin = user?.role === 'OWNER' || user?.role === 'CO_CEO';

  const filtered = useMemo(() => {
    return plants.filter(p => {
      if (isAdmin) return true;
      if (user?.houseId) return p.houseId === user.houseId;
      return false;
    }).filter(p => {
        const f = searchFilter.toLowerCase();
        if (!f) return true;
        return (lv(p.nickname) || '').toLowerCase().includes(f) || (p.species || '').toLowerCase().includes(f);
    });
  }, [plants, user, isAdmin, searchFilter, lv]);

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
          id: `p-synced-${Date.now()}`,
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
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8 pb-20 transition-all">
        <AddPlantModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} onSave={addPlant} />
        <PlantDetailsModal isOpen={!!selectedPlant} plant={selectedPlant} onClose={() => setSelectedPlant(null)} />
        <QrScannerModal isOpen={isScannerOpen} onClose={() => setIsScannerOpen(false)} onScanSuccess={handleScanSuccess} />

            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-gray-200 dark:border-slate-800 pb-8">
            <div>
                <h1 className="text-2xl md:text-4xl font-black text-gray-900 dark:text-white tracking-tighter uppercase leading-none">{t('menu_my_plants') || 'My Plants'}</h1>
                <p className="text-gray-500 dark:text-slate-400 mt-2 text-base md:text-lg font-bold uppercase tracking-widest text-xs md:text-sm">
                    {user?.houseId ? lv(houses.find(h => h.id === user.houseId)?.name) : t('global_view')} • {user ? t('role_' + user.role.toLowerCase()) : ''}
                </p>
                {!user?.houseId && !isAdmin && (
                    <p className="text-white text-[9px] font-black uppercase tracking-widest mt-2 bg-red-600 dark:bg-red-500 px-3 py-1 rounded-full shadow-sm inline-block animate-pulse">
                        {t('msg_no_house')}
                    </p>
                )}
            </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-10">
            {filtered.map(plant => (
                <div key={plant.id} className="relative group">
                    {!plant.houseId && (
                        <div className="absolute -top-3 -right-3 z-20 bg-amber-500 text-white text-[8px] font-black px-2 py-1 rounded-full shadow-lg border-2 border-white dark:border-slate-900 uppercase tracking-widest animate-bounce">
                            Unattributed
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
