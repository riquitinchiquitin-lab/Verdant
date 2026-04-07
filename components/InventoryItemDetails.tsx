import React, { useState, useMemo } from 'react';
import { InventoryItem } from '../types';
import { useLanguage } from '../context/LanguageContext';
import { useInventory } from '../context/InventoryContext';
import { usePlants } from '../context/PlantContext';
import { useAuth } from '../context/AuthContext';
import { formatVolume } from '../services/unitUtils';
import { CustomMixDetails } from './CustomMixDetails';
import { ConsumeModal } from './ConsumeModal';
import { Button } from './ui/Button';
import { getCompatiblePlants } from '../services/compatibilityService';

interface InventoryItemDetailsProps {
  item: InventoryItem;
  onClose?: () => void;
}

export const InventoryItemDetails: React.FC<InventoryItemDetailsProps> = ({ item, onClose }) => {
  const { t, lv, lva } = useLanguage();
  const { assignToPlant, releaseFromPlant, deleteItem } = useInventory();
  const { plants } = usePlants();
  const { can } = useAuth();
  const [isConsumeOpen, setIsConsumeOpen] = useState(false);
  const [isConfirmingDiscard, setIsConfirmingDiscard] = useState(false);

  const compatibleJunglePlants = useMemo(() => {
    return getCompatiblePlants(item, plants);
  }, [item, plants]);

  const handleDiscard = () => {
    deleteItem(item.id);
    if (onClose) onClose();
  };

  if (item.category === 'custom-mix') {
    return <CustomMixDetails item={item} />;
  }

  const formattedVolume = formatVolume(item.quantity, item.unit);
  const canConsume = ['insecticide', 'fertiliser', 'soil', 'custom-mix', 'seeds'].includes(item.category);
  const canAssociate = ['pots', 'accessories', 'saucers'].includes(item.category);
  const associatedPlant = item.associatedPlantId ? plants.find(p => p.id === item.associatedPlantId) : null;

  const SpecItem = ({ label, value }: { label: string, value?: string | number }) => {
    if (!value) return null;
    return (
      <div className="bg-gray-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-gray-100 dark:border-slate-800">
        <p className="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-1">{label}</p>
        <p className="text-sm font-bold text-gray-900 dark:text-white">{value}</p>
      </div>
    );
  };

  const handleAssociationChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const plantId = e.target.value;
    if (plantId) {
      assignToPlant(item.id, plantId);
    } else {
      releaseFromPlant(item.id);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-4 relative">
      
      {/* Confirmation Overlay - Mirrors Plant Mechanic */}
      {isConfirmingDiscard && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-red-600/95 backdrop-blur-2xl p-6 animate-in fade-in duration-300">
              <div className="max-w-md w-full bg-white dark:bg-slate-950 rounded-[50px] p-10 shadow-2xl text-center space-y-8 animate-in slide-in-from-bottom-8 duration-500">
                  <div className="w-24 h-24 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center text-red-500 mx-auto">
                      <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight uppercase leading-none">{t('discard')}</h3>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest leading-relaxed">{t('msg_discard_confirm')}</p>
                  </div>
                  <div className="flex flex-col gap-3">
                      <Button 
                        className="w-full h-14 bg-red-600 hover:bg-red-700 text-white font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-red-500/20 border-b-4 border-red-800" 
                        onClick={handleDiscard}
                      >
                        {t('discard').toUpperCase()}
                      </Button>
                      <button 
                        className="w-full h-12 text-gray-400 hover:text-gray-900 dark:hover:text-white text-xs font-black uppercase tracking-[0.3em] border border-gray-100 dark:border-slate-800 rounded-2xl" 
                        onClick={() => setIsConfirmingDiscard(false)}
                      >
                        {t('cancel').toUpperCase()}
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Header Info */}
      <div className="flex flex-col md:flex-row gap-6">
        <div className="w-full md:w-56 h-56 rounded-3xl overflow-hidden bg-gray-100 dark:bg-slate-800 shadow-inner shrink-0 relative group">
          {item.images && item.images[0] ? (
            <img src={item.images[0]} alt={lv(item.name)} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-300">
              <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
            </div>
          )}
        </div>
        <div className="flex-1 space-y-4">
          <div className="flex flex-col gap-1">
            <div className="flex justify-between items-start">
              <span className="inline-block px-2.5 py-1 bg-verdant/10 text-verdant dark:text-verdant-light text-[10px] font-black uppercase tracking-widest rounded-full w-fit">
                {t(`cat_${item.category.replace('-', '_')}`)}
              </span>
              {can('manage_inventory') && (
                <button 
                  onClick={() => setIsConfirmingDiscard(true)}
                  className="w-10 h-10 flex items-center justify-center bg-red-50 dark:bg-red-900/20 text-red-400 hover:text-red-600 rounded-2xl transition-all shadow-sm group border border-red-100 dark:border-red-900/30"
                  title={t('lbl_delete')}
                >
                  <svg className="w-5 h-5 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              )}
            </div>
            <h2 className="text-3xl font-black text-gray-900 dark:text-white leading-tight tracking-tight mt-2">{lv(item.name)}</h2>
            {item.brand && <p className="text-sm font-bold text-gray-500 dark:text-slate-500 uppercase tracking-widest">{lv(item.brand)}</p>}
          </div>

          <div className="flex items-center gap-8 pt-4">
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest">{t('lbl_quantity')}</span>
              <span className={`text-2xl font-black ${item.quantity <= 0 ? 'text-red-500' : 'text-gray-900 dark:text-white'}`}>
                {formattedVolume.value} <span className="text-sm text-gray-400 font-bold ml-1">{formattedVolume.unit}</span>
              </span>
            </div>
            {(item.sizeCm || item.sizeInches) && (
              <div className="flex flex-col">
                <span className="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest">{t('lbl_size')}</span>
                <span className="text-2xl font-black text-gray-900 dark:text-white">
                  {item.sizeCm}cm {item.sizeInches ? <span className="text-sm text-gray-400 font-bold ml-1">({item.sizeInches}")</span> : ''}
                </span>
              </div>
            )}
            {item.model && (
              <div className="flex flex-col">
                <span className="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest">{t('lbl_model')}</span>
                <span className="text-2xl font-black text-gray-900 dark:text-white">{item.model}</span>
              </div>
            )}
          </div>

          {canConsume && can('consume_inventory') && (
            <div className="pt-4">
              <Button 
                onClick={() => setIsConsumeOpen(true)}
                className="w-full md:w-48 shadow-xl shadow-verdant/20 h-12 font-black uppercase tracking-widest flex items-center gap-2"
                disabled={item.quantity <= 0}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M20 12H4" /></svg>
                {t('btn_consume')}
              </Button>
            </div>
          )}

          {canAssociate && (
            <div className="pt-4 space-y-3">
              <label className="block text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest">{t('lbl_plant_association')}</label>
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl border ${associatedPlant ? 'bg-blue-50 border-blue-100 text-blue-500 dark:bg-blue-900/20 dark:border-blue-800' : 'bg-gray-50 border-gray-100 text-gray-400 dark:bg-slate-800 dark:border-slate-700'}`}>
                   {associatedPlant ? (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                   ) : (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9" /></svg>
                   )}
                </div>
                <select 
                  className="flex-1 bg-gray-50 dark:bg-slate-800 border-none rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-blue-500 dark:text-white transition-all outline-none"
                  value={item.associatedPlantId || ''}
                  onChange={handleAssociationChange}
                >
                  <option value="">{t('lbl_available_not_assigned')}</option>
                  {plants.map(p => (
                    <option key={p.id} value={p.id}>{lv(p.nickname)} ({p.species})</option>
                  ))}
                </select>
                {associatedPlant && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                    onClick={() => releaseFromPlant(item.id)}
                  >
                    {t('btn_release')}
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Jungle Compatibility Section (Consumables) */}
      {compatibleJunglePlants.length > 0 && (
        <div className="p-6 bg-emerald-50/50 dark:bg-emerald-900/10 rounded-[32px] border border-emerald-100 dark:border-emerald-800/30">
          <p className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-[0.2em] mb-4">{t('lbl_recommended_for_plants')}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
             {compatibleJunglePlants.map(p => (
               <div key={p.id} className="flex items-center gap-4 bg-white dark:bg-slate-800 p-3 rounded-2xl shadow-sm border border-emerald-100/20">
                 {p.images && p.images[0] && <img src={p.images[0]} className="w-12 h-12 rounded-xl object-cover shadow-inner" />}
                 <div className="min-w-0">
                   <p className="text-sm font-bold truncate dark:text-white leading-none mb-1">{lv(p.nickname)}</p>
                   <p className="text-[10px] text-gray-500 italic truncate font-serif">{p.species}</p>
                 </div>
                 <svg className="w-5 h-5 text-emerald-500 ml-auto shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
               </div>
             ))}
          </div>
        </div>
      )}

      {/* Description */}
      {item.description && (
        <div className="p-6 bg-gray-50/50 dark:bg-slate-800/30 rounded-[32px] border border-gray-100 dark:border-slate-800">
          <p className="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-3">{t('lbl_desc')}</p>
          <p className="text-sm text-gray-700 dark:text-slate-300 font-medium leading-relaxed italic">"{lv(item.description)}"</p>
        </div>
      )}

      {/* Usage Instructions */}
      {(item.applicationUsage || item.instructions) && (
        <div className="p-6 bg-gray-50/50 dark:bg-slate-800/30 rounded-[32px] border border-gray-100 dark:border-slate-800">
          <p className="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-3">{t('lbl_usage_instructions')}</p>
          <p className="text-sm text-gray-700 dark:text-slate-300 font-medium leading-relaxed whitespace-pre-wrap">{lv(item.applicationUsage) || lv(item.instructions)}</p>
        </div>
      )}

      {/* Dynamic Specs Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {item.category === 'soil' && (
          <SpecItem label={t('cat_soil')} value={lva(item.soilTypes).join(', ')} />
        )}
        {item.category === 'pots' && (
          <>
            <SpecItem label={t('lbl_material')} value={item.material} />
            <SpecItem label={t('lbl_color')} value={item.color} />
            <SpecItem label={t('lbl_hole_size')} value={item.openingHoleSize} />
            <SpecItem label={t('lbl_depth')} value={item.depth} />
            <SpecItem label={t('lbl_drainage')} value={item.drainageCapability} />
          </>
        )}
        {item.category === 'saucers' && (
          <>
            <SpecItem label={t('lbl_material')} value={item.material} />
            <SpecItem label={t('lbl_color')} value={item.color} />
          </>
        )}
        

      </div>

      {/* General Compatibility List */}
      {item.compatibility && lva(item.compatibility).length > 0 && (
        <div className="space-y-3">
            <p className="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest px-1">{t('lbl_species_compatibility')}</p>
            <div className="flex flex-wrap gap-2">
                {lva(item.compatibility).map((c, i) => (
                    <span key={i} className="px-3 py-1 bg-gray-100 dark:bg-slate-800 rounded-lg text-xs font-bold text-gray-700 dark:text-slate-200 border border-gray-200 dark:border-slate-700 shadow-sm">{c}</span>
                ))}
            </div>
        </div>
      )}

      {/* Image Gallery */}
      {item.images && item.images.length > 1 && (
        <div className="space-y-4 pt-4 border-t border-gray-100 dark:border-slate-800">
           <div className="flex items-center gap-2 px-1">
             <div className="w-1.5 h-1.5 rounded-full bg-verdant"></div>
             <p className="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest">{t('lbl_visual_records')}</p>
           </div>
           <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar">
              {item.images.map((img, i) => (
                <div key={i} className="w-48 h-48 rounded-2xl overflow-hidden border-2 border-gray-50 dark:border-slate-800 shrink-0 bg-gray-50 dark:bg-slate-900 shadow-sm">
                  <img src={img} className="w-full h-full object-cover" />
                </div>
              ))}
           </div>
        </div>
      )}

      <ConsumeModal 
        item={item} 
        isOpen={isConsumeOpen} 
        onClose={() => setIsConsumeOpen(false)} 
      />
    </div>
  );
};