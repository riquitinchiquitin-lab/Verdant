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

  const categories: (InventoryCategory | 'all')[] = ['all', 'tools', 'insecticide', 'fungicide', 'pesticide', 'fertiliser', 'seeds', 'soil', 'accessories', 'pots', 'saucers', 'custom-mix'];

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
    <div className="p-4 md:p-10 max-w-7xl mx-auto space-y-6 pb-32 transition-all">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-md-outline-variant/30 pb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-md-on-surface tracking-tight">{t('inventory_title')}</h1>
        </div>
        <div className="flex flex-wrap gap-2.5 w-full md:w-auto">
          {can('manage_inventory') && (
            <Button variant="tonal" size="md" onClick={() => setIsCalcOpen(true)} className="flex-1 md:flex-none">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
              {t('mix_calculator')}
            </Button>
          )}
          {can('manage_inventory') && (
            <Button variant="primary" size="md" onClick={() => setIsAddModalOpen(true)} className="flex-1 md:flex-none">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
              {t('add_item')}
            </Button>
          )}
        </div>
      </div>

      {/* M3 Filter Chips */}
      <div className="flex py-2 sticky top-0 z-30 -mx-2 px-2 bg-md-surface/95 backdrop-blur-md overflow-x-auto no-scrollbar flex-nowrap md:flex-wrap gap-2 touch-pan-x">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            className={`m3-state-layer shrink-0 h-9 px-4 rounded-full text-xs font-semibold transition-all whitespace-nowrap border ${
              filter === cat
                ? 'bg-md-secondary-container text-md-on-secondary-container border-transparent shadow-xs'
                : 'bg-md-surface-container-low border-md-outline-variant text-md-on-surface-variant hover:text-md-on-surface'
            }`}
          >
            {cat === 'all' ? t('cat_all') : t(`cat_${cat.replace('-', '_')}`)}
          </button>
        ))}
        <div className="shrink-0 w-4 md:hidden"></div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
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
        <div className="py-20 text-center bg-md-surface-container-low rounded-[28px] border border-dashed border-md-outline-variant">
          <p className="text-md-on-surface-variant font-semibold text-sm">{t('inventory_empty')}</p>
          <p className="text-md-on-surface-variant/70 mt-1.5 text-xs max-w-xs mx-auto">{t('inventory_restricted_access')}</p>
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
      {selectedItem && (() => {
        const liveSelectedItem = inventory.find(i => i.id === selectedItem.id) || selectedItem;
        return (
          <Modal 
            isOpen={!!selectedItem} 
            onClose={() => setSelectedItem(null)} 
            title={lv(liveSelectedItem.name) || 'Item Details'}
            size="2xl"
          >
            <div className="py-2">
              <InventoryItemDetails item={liveSelectedItem} onClose={() => setSelectedItem(null)} />
            </div>
          </Modal>
        );
      })()}
      <CompatibilityModal 
        item={compatibilityItem} 
        onClose={() => setCompatibilityItem(null)} 
      />
    </div>
  );
};