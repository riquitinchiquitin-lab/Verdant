import React, { useState, useMemo } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { useLanguage } from '../context/LanguageContext';
import { useInventory } from '../context/InventoryContext';
import { Plant, InventoryItem } from '../types';
import { getCompatibleItems } from '../services/compatibilityService';

interface FertilizerLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  plant: Plant;
  onLog: (fertilizer: InventoryItem, amount: number) => void;
}

export const FertilizerLogModal: React.FC<FertilizerLogModalProps> = ({ isOpen, onClose, plant, onLog }) => {
  const { t, lv } = useLanguage();
  const { inventory } = useInventory();
  
  const [selectedItemId, setSelectedItemId] = useState<string>('');
  const [amount, setAmount] = useState<number>(0);

  const fertilizers = useMemo(() => {
    return inventory.filter(item => (item.category === 'fertiliser' || (item.category === 'custom-mix' && item.mixType === 'fertiliser')) && item.quantity > 0);
  }, [inventory]);

  const compatibleFertilizers = useMemo(() => {
    return getCompatibleItems(plant, fertilizers);
  }, [plant, fertilizers]);

  const otherFertilizers = useMemo(() => {
    const compatibleIds = new Set(compatibleFertilizers.map(f => f.id));
    return fertilizers.filter(f => !compatibleIds.has(f.id));
  }, [fertilizers, compatibleFertilizers]);

  const selectedItem = useMemo(() => {
    return inventory.find(i => i.id === selectedItemId);
  }, [inventory, selectedItemId]);

  const handleConfirm = () => {
    if (selectedItem && amount > 0) {
      onLog(selectedItem, amount);
      onClose();
      setSelectedItemId('');
      setAmount(0);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('log_action_fertilized')}>
      <div className="space-y-6">
        <div className="space-y-4">
          <label className="block text-[10px] font-serif font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest px-1">{t('lbl_select_fertilizer')}</label>
          
          {compatibleFertilizers.length > 0 && (
            <div className="space-y-2">
              <p className="text-[9px] font-serif font-black text-emerald-500 uppercase tracking-widest px-1">{t('lbl_recommended_for_this_plant')}</p>
              <div className="grid grid-cols-1 gap-2">
                {compatibleFertilizers.map(f => (
                  <button
                    key={f.id}
                    onClick={() => setSelectedItemId(f.id)}
                    className={`flex items-center gap-4 p-3 rounded-2xl border-2 transition-all text-left ${
                      selectedItemId === f.id 
                        ? 'bg-emerald-50 border-emerald-500 dark:bg-emerald-900/20 shadow-lg' 
                        : 'bg-white dark:bg-slate-900 border-gray-100 dark:border-slate-800 hover:border-emerald-200'
                    }`}
                  >
                    <div className="w-12 h-12 rounded-xl overflow-hidden bg-gray-100 dark:bg-slate-800 shrink-0">
                      {f.images && f.images[0] && <img src={f.images[0]} className="w-full h-full object-cover" alt="" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-serif font-bold truncate dark:text-white">{lv(f.name)}</p>
                      <p className="text-[10px] font-serif text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest">{t('lbl_amount_available').replace('{amount}', String(f.quantity)).replace('{unit}', f.unit)}</p>
                    </div>
                    {selectedItemId === f.id && (
                      <div className="w-6 h-6 bg-emerald-500 text-white rounded-full flex items-center justify-center">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {otherFertilizers.length > 0 && (
            <div className="space-y-2">
              <p className="text-[9px] font-serif font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest px-1">{t('lbl_other_fertilizers')}</p>
              <div className="grid grid-cols-1 gap-2">
                {otherFertilizers.map(f => (
                  <button
                    key={f.id}
                    onClick={() => setSelectedItemId(f.id)}
                    className={`flex items-center gap-4 p-3 rounded-2xl border-2 transition-all text-left ${
                      selectedItemId === f.id 
                        ? 'bg-blue-50 border-blue-500 dark:bg-blue-900/20 shadow-lg' 
                        : 'bg-white dark:bg-slate-900 border-gray-100 dark:border-slate-800 hover:border-blue-200'
                    }`}
                  >
                    <div className="w-12 h-12 rounded-xl overflow-hidden bg-gray-100 dark:bg-slate-800 shrink-0">
                      {f.images && f.images[0] && <img src={f.images[0]} className="w-full h-full object-cover" alt="" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-serif font-bold truncate dark:text-white">{lv(f.name)}</p>
                      <p className="text-[10px] font-serif text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest">{t('lbl_amount_available').replace('{amount}', String(f.quantity)).replace('{unit}', f.unit)}</p>
                    </div>
                    {selectedItemId === f.id && (
                      <div className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {fertilizers.length === 0 && (
            <div className="py-10 text-center bg-gray-50 dark:bg-slate-900 rounded-3xl border-2 border-dashed border-gray-200 dark:border-slate-800">
              <p className="text-xs font-serif font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">{t('msg_no_fertilizers_inventory')}</p>
            </div>
          )}
        </div>

        {selectedItem && (
          <div className="space-y-4 animate-in slide-in-from-top-4 duration-300">
            <label className="block text-[10px] font-serif font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest px-1">{t('lbl_amount_used')} ({selectedItem.unit})</label>
            <div className="flex items-center gap-4">
              <input 
                type="number" 
                value={amount} 
                onChange={(e) => setAmount(Math.min(selectedItem.quantity, parseFloat(e.target.value) || 0))}
                className="flex-1 h-14 px-6 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-2xl font-black text-2xl outline-none focus:ring-4 focus:ring-verdant/10 transition-all dark:text-white"
                max={selectedItem.quantity}
                min={0}
              />
              <div className="flex gap-2">
                {[0.1, 0.5, 1, 5].map(v => (
                  <button 
                    key={v}
                    onClick={() => setAmount(prev => Math.min(selectedItem.quantity, prev + v))}
                    className="w-10 h-10 bg-gray-100 dark:bg-slate-800 rounded-xl flex items-center justify-center text-[10px] font-serif font-black text-slate-500 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700 transition-all"
                  >
                    +{v}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-4 pt-4">
          <button className="flex-1 h-14 bg-gray-100 dark:bg-slate-800 rounded-2xl text-[10px] font-black uppercase tracking-[0.3em] text-gray-500" onClick={onClose}>{t('cancel')}</button>
          <Button 
            className="flex-[2] h-14 rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-verdant/20" 
            onClick={handleConfirm}
            disabled={!selectedItem || amount <= 0}
          >
            {t('btn_log_fertilization')}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
