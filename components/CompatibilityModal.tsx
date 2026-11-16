
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
      <div className="space-y-5 py-2 font-sans">
        <div className="flex items-center gap-4 p-4 bg-md-surface-container rounded-2xl border border-md-outline-variant/30">
          <div className="w-16 h-16 rounded-xl overflow-hidden bg-md-surface-container-highest shrink-0 border border-md-outline-variant/30">
            {item.images && item.images[0] ? (
              <img src={item.images[0]} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-md-on-surface-variant/40">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.25} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
              </div>
            )}
          </div>
          <div>
            <h3 className="font-bold text-md-on-surface tracking-tight leading-snug">{lv(item.name)}</h3>
            <p className="text-xs font-semibold text-md-primary mt-0.5">
              {item.sizeCm}cm {item.sizeInches ? `(${item.sizeInches}")` : ''}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <h4 className="text-xs font-bold text-md-on-surface-variant uppercase tracking-wider">
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
            <div className="py-12 text-center bg-md-surface-container rounded-[24px] border border-dashed border-md-outline-variant">
              <p className="text-md-on-surface-variant text-xs font-semibold">
                {t('msg_no_compatible_items_found')}
              </p>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
