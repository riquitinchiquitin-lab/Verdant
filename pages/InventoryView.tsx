import React, { useState } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { useInventory } from '../context/InventoryContext';
import { usePlants } from '../context/PlantContext';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { InventoryItemCard } from '../components/InventoryItemCard';
import { CustomMixCalculator } from '../components/CustomMixCalculator';
import { InventoryItemDetails } from '../components/InventoryItemDetails';
import { AddInventoryModal } from '../components/AddInventoryModal';
import { CompatibilityModal } from '../components/CompatibilityModal';
import { InventoryItem, InventoryCategory } from '../types';

export const InventoryView: React.FC = () => {
  const { t, lv } = useLanguage();
  const { inventory } = useInventory();
  const { plants, searchFilter } = usePlants();
  const { user, can } = useAuth();
  const [filter, setFilter] = useState<InventoryCategory | 'all'>('all');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isCalcOpen, setIsCalcOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [compatibilityItem, setCompatibilityItem] = useState<InventoryItem | null>(null);

  const isAdmin = user?.role === 'OWNER' || user?.role === 'CO_CEO';

  const categories: (InventoryCategory | 'all')[] = ['all', 'tools', 'insecticide', 'fertiliser', 'seeds', 'soil', 'accessories', 'pots', 'saucers', 'custom-mix'];

  const filteredByProperty = inventory.filter(i => {
    // --- STRICT INVENTORY VISIBILITY ---
    if (user?.houseId) return i.houseId === user.houseId;
    if (isAdmin) return true; // Global admins with no property see everything
    return false;
  });

  const filtered = (filter === 'all' ? filteredByProperty : filteredByProperty.filter(i => i.category === filter))
    .filter(i => {
        const f = searchFilter.toLowerCase();
        if (!f) return true;
        
        // --- SAFE SEARCH FILTERING ---
        // Ensure name exists before calling toLowerCase
        const nameMatch = (lv(i.name) || '').toLowerCase().includes(f);
        
        // Ensure brand exists before calling toLowerCase
        const brandLabel = i.brand ? lv(i.brand as any) : '';
        const brandMatch = (brandLabel || '').toLowerCase().includes(f);
        
        return nameMatch || brandMatch;
    });

  const handleItemClick = (item: InventoryItem) => {
    setSelectedItem(item);
  };

  const handleEditClick = (item: InventoryItem) => {
    setEditingItem(item);
  };

  return (
    <div className="p-4 md:p-10 max-w-7xl mx-auto space-y-6 md:space-y-10 pb-32 transition-all">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 md:gap-6 border-b border-gray-100 dark:border-slate-800 pb-4 md:pb-8">
        <div>
          <h1 className="text-2xl md:text-4xl font-black text-gray-900 dark:text-white tracking-tighter uppercase leading-none">{t('inventory_title')}</h1>
        </div>
        <div className="flex flex-wrap gap-2 md:gap-3 w-full md:w-auto">
          {can('manage_inventory') && (
            <Button variant="secondary" size="sm" onClick={() => setIsCalcOpen(true)} className="flex-1 md:flex-none rounded-xl md:rounded-2xl border-gray-200 h-10 md:h-12 text-[10px] md:text-base uppercase tracking-widest font-black">
              <svg className="w-3.5 h-3.5 md:w-5 md:h-5 mr-1.5 md:mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
              {t('mix_calculator')}
            </Button>
          )}
          {can('manage_inventory') && (
            <Button variant="primary" size="sm" onClick={() => setIsAddModalOpen(true)} className="flex-1 md:flex-none shadow-xl shadow-verdant/20 rounded-xl md:rounded-2xl h-10 md:h-12 text-[10px] md:text-base uppercase tracking-widest font-black">
              <svg className="w-3.5 h-3.5 md:w-5 md:h-5 mr-1.5 md:mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
              {t('add_item')}
            </Button>
          )}
        </div>
      </div>

      <div className="flex py-2 md:py-3 sticky top-0 z-30 -mx-2 px-2 bg-white/95 dark:bg-slate-950/95 backdrop-blur-md rounded-b-2xl md:rounded-b-3xl overflow-x-auto no-scrollbar flex-nowrap md:flex-wrap gap-1.5 md:gap-2 touch-pan-x border-b border-gray-100 dark:border-slate-800 md:border-none">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            className={`shrink-0 px-3 md:px-4 py-1.5 md:py-2.5 rounded-xl md:rounded-2xl text-[9px] md:text-[10px] font-black uppercase tracking-[0.1em] md:tracking-[0.15em] transition-all border-2 whitespace-nowrap ${
              filter === cat ? 'bg-verdant border-verdant text-white shadow-xl shadow-verdant/20 scale-105' 
                : 'bg-white/80 dark:bg-slate-950/80 border-gray-100 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:border-verdant/50'
            }`}
          >
            {cat === 'all' ? t('cat_all') : t(`cat_${cat.replace('-', '_')}`)}
          </button>
        ))}
        <div className="shrink-0 w-4 md:hidden"></div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-8">
        {filtered.map(item => (
          <InventoryItemCard 
            key={item.id} 
            item={item} 
            onCompatibilityClick={() => setCompatibilityItem(item)}
            onClick={() => handleItemClick(item)}
            onEditClick={can('manage_inventory') ? () => handleEditClick(item) : undefined}
          />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="py-32 text-center bg-white dark:bg-slate-900/30 rounded-[40px] border-4 border-dashed border-gray-100 dark:border-slate-800 shadow-inner">
          <p className="text-gray-300 dark:text-slate-600 font-black uppercase tracking-[0.2em] text-xs">{t('inventory_empty')}</p>
          <p className="text-gray-400 dark:text-slate-500 mt-2 text-sm max-w-xs mx-auto">{t('inventory_restricted_access')}</p>
        </div>
      )}

      {/* Modals */}
      <AddInventoryModal 
        isOpen={isAddModalOpen || (!!editingItem && editingItem.category !== 'custom-mix')} 
        onClose={() => {
          setIsAddModalOpen(false);
          setEditingItem(null);
        }} 
        itemToEdit={editingItem && editingItem.category !== 'custom-mix' ? editingItem : null}
      />
      <Modal isOpen={isCalcOpen} onClose={() => setIsCalcOpen(false)} title={t('mix_calculator')} size="2xl">
        <div className="py-2"><CustomMixCalculator onSaveSuccess={() => setIsCalcOpen(false)} /></div>
      </Modal>
      <Modal 
        isOpen={!!editingItem && editingItem.category === 'custom-mix'} 
        onClose={() => setEditingItem(null)} 
        title={t('mix_calculator')} 
        size="2xl"
      >
        <div className="py-2">
          {editingItem && editingItem.category === 'custom-mix' && (
            <CustomMixCalculator itemToEdit={editingItem} onSaveSuccess={() => setEditingItem(null)} />
          )}
        </div>
      </Modal>
      {selectedItem && (
        <Modal 
          isOpen={!!selectedItem} 
          onClose={() => setSelectedItem(null)} 
          title={lv(selectedItem.name) || 'Item Details'}
          size="2xl"
        >
          <div className="py-2">
            <InventoryItemDetails item={selectedItem} onClose={() => setSelectedItem(null)} />
          </div>
        </Modal>
      )}
      <CompatibilityModal 
        item={compatibilityItem} 
        onClose={() => setCompatibilityItem(null)} 
      />
    </div>
  );
};