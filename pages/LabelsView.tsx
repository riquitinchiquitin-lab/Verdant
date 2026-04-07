import React, { useState, useMemo } from 'react';
import { usePlants } from '../context/PlantContext';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { exportPlantsToNiimbotExcel } from '../services/exportService';

export const LabelsView: React.FC = () => {
  const { plants, houses } = usePlants();
  const { t, lv } = useLanguage();
  const { user } = useAuth();
  
  const [selectedHouseId, setSelectedHouseId] = useState<string>(user?.houseId || 'ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const isGlobalUser = ['OWNER', 'CO_CEO'].includes(user?.role || '');

  const filteredPlants = useMemo(() => {
    return plants.filter(p => {
      const matchesHouse = selectedHouseId === 'ALL' || p.houseId === selectedHouseId;
      const matchesSearch = lv(p.nickname).toLowerCase().includes(searchQuery.toLowerCase()) || 
                           p.species.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesHouse && matchesSearch;
    });
  }, [plants, selectedHouseId, searchQuery, lv]);

  const handleExport = () => {
    const plantsToExport = plants.filter(p => selectedIds.has(p.id));
    if (plantsToExport.length === 0) return;
    
    const fileName = `verdant_labels_${selectedHouseId.toLowerCase()}_${new Date().getTime()}.xlsx`;
    exportPlantsToNiimbotExcel(plantsToExport, lv, fileName);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredPlants.length && filteredPlants.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredPlants.map(p => p.id)));
    }
  };

  const toggleSelection = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const sanitize = (val: string | null | undefined, fallback: string) => 
    (val || fallback).replace(/\|/g, '').trim();

  return (
    <div className="p-4 md:p-10 max-w-6xl mx-auto space-y-6 md:space-y-10 pb-32">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 md:gap-6">
        <div>
          <h1 className="text-2xl md:text-4xl font-black text-gray-900 dark:text-white tracking-tighter uppercase leading-none">{t('menu_labels')}</h1>
          <p className="text-gray-500 dark:text-slate-400 mt-1.5 md:mt-2 text-[10px] md:text-sm font-bold uppercase tracking-widest">{t('labels_niimbot_handshake')}</p>
        </div>
        
        <div className="flex items-center gap-3 md:gap-4 w-full md:w-auto">
          {selectedIds.size > 0 && (
            <div className="text-right hidden md:block">
              <p className="text-[10px] font-black text-verdant uppercase tracking-widest leading-none mb-1">{t('labels_queue_ready')}</p>
              <p className="text-sm font-bold text-gray-900 dark:text-white">{selectedIds.size} {t('labels_specimens')}</p>
            </div>
          )}
          <Button 
            onClick={handleExport}
            disabled={selectedIds.size === 0}
            className="flex-1 md:flex-none h-12 md:h-14 px-6 md:px-8 rounded-xl md:rounded-2xl shadow-xl shadow-verdant/20 font-black uppercase tracking-widest flex items-center justify-center gap-2 md:gap-3 transition-all disabled:grayscale text-[10px] md:text-base"
          >
            <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {t('labels_export_selected', { count: selectedIds.size.toString() })}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
        {isGlobalUser && (
          <div className="space-y-1">
            <label className="text-[9px] md:text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">{t('labels_property_filter')}</label>
            <select 
              value={selectedHouseId} 
              onChange={(e) => {
                setSelectedHouseId(e.target.value);
                setSelectedIds(new Set()); // Reset selection on house change
              }}
              className="w-full h-10 md:h-14 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-xl md:rounded-2xl px-4 md:px-5 font-bold outline-none focus:ring-4 focus:ring-verdant/10 transition-all dark:text-white text-xs md:text-base"
            >
              <option value="ALL">{t('labels_all_global_properties')}</option>
              {houses.map(h => (
                <option key={h.id} value={h.id}>{lv(h.name)}</option>
              ))}
            </select>
          </div>
        )}
        <div className="space-y-1">
          <label className="text-[9px] md:text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">{t('labels_quick_filter')}</label>
          <input 
            type="text" 
            placeholder={t('labels_search_specimen')} 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-10 md:h-14 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-xl md:rounded-2xl px-4 md:px-5 font-bold outline-none focus:ring-4 focus:ring-verdant/10 transition-all dark:text-white text-xs md:text-base"
          />
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-[24px] md:rounded-[40px] border border-gray-100 dark:border-slate-800 overflow-hidden shadow-sm">
        <div className="overflow-x-auto no-scrollbar touch-pan-x">
          <table className="w-full text-left border-collapse min-w-[600px] md:min-w-0">
            <thead>
              <tr className="bg-gray-50 dark:bg-slate-800/50">
                <th className="px-4 md:px-6 py-3 md:py-5 w-10 md:w-12">
                  <button 
                    onClick={toggleSelectAll}
                    className={`w-5 h-5 md:w-6 md:h-6 rounded-lg border-2 flex items-center justify-center transition-all ${
                      selectedIds.size === filteredPlants.length && filteredPlants.length > 0
                      ? 'bg-verdant border-verdant text-white' 
                      : 'bg-white dark:bg-slate-800 border-gray-300 dark:border-slate-600'
                    }`}
                  >
                    {(selectedIds.size === filteredPlants.length && filteredPlants.length > 0) && (
                      <svg className="w-3 h-3 md:w-4 md:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                </th>
                <th className="px-4 md:px-6 py-3 md:py-5 text-[9px] md:text-[10px] font-black text-gray-400 uppercase tracking-widest">{t('labels_specimen')}</th>
                <th className="px-4 md:px-6 py-3 md:py-5 text-[9px] md:text-[10px] font-black text-gray-400 uppercase tracking-widest hidden md:table-cell">{t('labels_family')}</th>
                <th className="px-4 md:px-6 py-3 md:py-5 text-[9px] md:text-[10px] font-black text-gray-400 uppercase tracking-widest hidden sm:table-cell">{t('labels_sync_hash')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
              {filteredPlants.map(p => {
                const isSelected = selectedIds.has(p.id);
                const hFormatHash = `${sanitize(p.houseId, 'GLOBAL')}|${sanitize(p.id, 'ID')}|${sanitize(p.species, 'SPECIES')}|${sanitize(p.family, 'BOTANICAL')}`;
                
                return (
                  <tr 
                    key={p.id} 
                    onClick={() => toggleSelection(p.id)}
                    className={`cursor-pointer transition-all duration-300 ${
                      isSelected 
                      ? 'bg-verdant/5 dark:bg-verdant/10' 
                      : 'hover:bg-gray-50/50 dark:hover:bg-slate-800/30'
                    }`}
                  >
                    <td className="px-4 md:px-6 py-3 md:py-6">
                      <div className={`w-5 h-5 md:w-6 md:h-6 rounded-lg border-2 flex items-center justify-center transition-all ${
                        isSelected 
                        ? 'bg-verdant border-verdant text-white' 
                        : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700'
                      }`}>
                        {isSelected && (
                          <svg className="w-3 h-3 md:w-4 md:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    </td>
                    <td className="px-4 md:px-6 py-3 md:py-6">
                      <div className="flex items-center gap-2 md:gap-4">
                        {p.images && p.images[0] ? (
                          <img src={p.images[0]} className="w-8 h-8 md:w-12 md:h-12 rounded-lg md:rounded-xl object-cover shadow-sm border border-gray-100 dark:border-slate-700" alt="" referrerPolicy="no-referrer" />
                        ) : (
                          <div className="w-8 h-8 md:w-12 md:h-12 rounded-lg md:rounded-xl bg-gray-100 dark:bg-slate-800 flex items-center justify-center text-gray-300 dark:text-slate-700 font-black text-[10px]">?</div>
                        )}
                        <div className="min-w-0">
                          <p className="font-black text-gray-900 dark:text-white uppercase tracking-tight leading-none mb-0.5 md:mb-1 truncate text-xs md:text-base">{lv(p.nickname)}</p>
                          <p className="text-[8px] md:text-[10px] font-serif italic text-gray-400 truncate">{p.species}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 md:px-6 py-3 md:py-6 hidden md:table-cell">
                      <span className="text-[9px] md:text-[10px] font-black text-gray-500 dark:text-slate-400 uppercase tracking-widest bg-gray-100 dark:bg-slate-800 px-2 md:px-3 py-0.5 md:py-1 rounded-full">
                        {p.family || '-'}
                      </span>
                    </td>
                    <td className="px-4 md:px-6 py-3 md:py-6 hidden sm:table-cell">
                      <code className="text-[8px] md:text-[9px] font-mono text-verdant bg-verdant/5 dark:bg-slate-900/40 px-1.5 md:px-2 py-1 md:py-1.5 rounded-lg border border-verdant/10 select-all max-w-[150px] md:max-w-[250px] truncate block">
                        {hFormatHash}
                      </code>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
        
        {filteredPlants.length === 0 && (
          <div className="py-20 text-center space-y-3">
             <p className="text-gray-300 font-black uppercase tracking-[0.3em] text-xs">{t('labels_no_specimens_found')}</p>
             <p className="text-gray-400 text-sm italic">{t('labels_adjust_filters')}</p>
          </div>
        )}
      </div>
  );
};