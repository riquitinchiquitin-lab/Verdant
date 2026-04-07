
import React from 'react';
import { Modal } from './ui/Modal';
import { InventoryItem } from '../types';
import { useLanguage } from '../context/LanguageContext';
import { useInventory } from '../context/InventoryContext';
import { InventoryItemCard } from './InventoryItemCard';

interface CompatibilityModalProps {
  item: InventoryItem | null;
  onClose: () => void;
}

export const CompatibilityModal: React.FC<CompatibilityModalProps> = ({ item, onClose }) => {
  const { t, lv } = useLanguage();
  const { inventory } = useInventory();

  if (!item || (item.category !== 'pots' && item.category !== 'saucers')) return null;

  const isPot = item.category === 'pots';
  const targetCategory = isPot ? 'saucers' : 'pots';
  
  const compatibleItems = inventory.filter(i => {
    if (i.category !== targetCategory) return false;
    if (!i.sizeCm || !item.sizeCm) return false;
    
    if (isPot) {
      // Looking for saucers for this pot
      // Saucer should be >= Pot
      return i.sizeCm >= item.sizeCm;
    } else {
      // Looking for pots for this saucer
      // Pot should be <= Saucer
      return i.sizeCm <= item.sizeCm;
    }
  });

  return (
    <Modal 
      isOpen={!!item} 
      onClose={onClose} 
      title={t('btn_compatibility')}
      size="2xl"
    >
      <div className="space-y-6 py-4">
        <div className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700">
          <div className="w-16 h-16 rounded-xl overflow-hidden bg-white dark:bg-slate-900 shrink-0 border border-gray-100 dark:border-slate-800">
            {item.images && item.images[0] ? (
              <img src={item.images[0]} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-200 dark:text-slate-700">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
              </div>
            )}
          </div>
          <div>
            <h3 className="font-black text-gray-900 dark:text-white uppercase tracking-tight leading-none">{lv(item.name)}</h3>
            <p className="text-[10px] font-black text-verdant uppercase tracking-widest mt-1">
              {item.sizeCm}cm {item.sizeInches ? `(${item.sizeInches}")` : ''}
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <h4 className="text-xs font-black text-slate-600 dark:text-slate-400 uppercase tracking-[0.2em]">
            {isPot ? t('lbl_compatible_saucers') : t('lbl_compatible_pots')}
          </h4>
          
          {compatibleItems.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {compatibleItems.map(compatibleItem => (
                <InventoryItemCard 
                  key={compatibleItem.id} 
                  item={compatibleItem} 
                />
              ))}
            </div>
          ) : (
            <div className="py-12 text-center bg-gray-50 dark:bg-slate-900/50 rounded-[32px] border-2 border-dashed border-gray-200 dark:border-slate-800">
              <p className="text-gray-400 dark:text-slate-500 text-[10px] font-black uppercase tracking-widest">
                {t('msg_no_compatible_items_found')}
              </p>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
