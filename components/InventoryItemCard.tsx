import React from 'react';
import { InventoryItem } from '../types';
import { useLanguage } from '../context/LanguageContext';
import { useInventory } from '../context/InventoryContext';
import { usePlants } from '../context/PlantContext';
import { formatVolume } from '../services/unitUtils';
import { ContainerIcon } from './icons/ContainerIcons';
import { PotIcon, SaucerIcon } from './icons/PotIcons';

export const InventoryItemCard: React.FC<{ 
  item: InventoryItem; 
  onCompatibilityClick?: () => void;
  onClick?: () => void;
  onEditClick?: () => void;
}> = ({ item, onCompatibilityClick, onClick, onEditClick }) => {
  const { t, lv, lva } = useLanguage();
  const { consumeItem, updateItem } = useInventory();
  const { plants } = usePlants();

  const getCategoryLabel = () => {
    switch (item.category) {
      case 'tools': return t('cat_tools');
      case 'insecticide': return t('cat_insecticide');
      case 'fertiliser': return t('cat_fertiliser');
      case 'seeds': return t('cat_seeds');
      case 'soil': return t('cat_soil');
      case 'accessories': return t('cat_accessories');
      case 'pots': return t('cat_pots');
      case 'saucers': return t('cat_saucers');
      case 'custom-mix': return t('cat_custom_mix');
      default: return item.category;
    }
  };

  const canConsume = ['insecticide', 'fertiliser', 'soil', 'custom-mix', 'seeds'].includes(item.category);
  const isCustomMix = item.category === 'custom-mix';
  const isPot = item.category === 'pots';
  const isSaucer = item.category === 'saucers';
  const isAccessory = item.category === 'accessories';
  const isLowStock = item.quantity <= 0;
  const hasCompatibility = (!!item.compatibility && lva(item.compatibility).length > 0) || isPot || isSaucer;
  
  const formattedVolume = formatVolume(item.quantity, item.unit);

  const isPotOrAccessory = isPot || isAccessory || isSaucer;
  const associatedPlant = item.associatedPlantId ? plants.find(p => p.id === item.associatedPlantId) : null;

  const getStepSize = () => {
    const unit = item.unit.toLowerCase();
    if (['l', 'gal', 'kg'].includes(unit)) return 0.1;
    if (['ml', 'g'].includes(unit)) return 10;
    return 1;
  };

  const handleDecrement = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (item.quantity <= 0) return;
    consumeItem(item.id, getStepSize());
  };

  const handleIncrement = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newQty = item.quantity + getStepSize();
    updateItem(item.id, { quantity: newQty });
  };

  return (
    <div 
      onClick={onClick}
      className={`bg-white dark:bg-slate-900 rounded-[32px] border border-gray-100 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col group hover:shadow-xl hover:border-verdant/30 transition-all duration-500 ${onClick ? 'cursor-pointer' : ''}`}
    >
      <div className="relative h-32 md:h-44 bg-gray-50 dark:bg-slate-800/50 overflow-hidden">
        {item.images && item.images[0] ? (
          <img src={item.images[0]} alt={lv(item.name)} className="w-full h-full object-contain p-4 group-hover:scale-110 transition-transform duration-700" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-200 dark:text-slate-700">
            {isCustomMix ? (
              <div 
                className="p-8 rounded-[32px] bg-white/50 dark:bg-slate-800/50 shadow-inner flex items-center justify-center transition-all group-hover:scale-110"
                style={{ color: item.containerColor || '#5E8F47' }}
              >
                <ContainerIcon type={item.containerType || 'hdpe_jug'} color={item.containerColor || '#5E8F47'} className="w-16 h-16 opacity-80" />
              </div>
            ) : isPot ? (
               <div 
                className="p-8 rounded-[32px] bg-white/50 dark:bg-slate-800/50 shadow-inner flex items-center justify-center transition-all group-hover:scale-110"
                style={{ color: item.potColor || '#9CA3AF' }}
              >
                <PotIcon type={item.potType || 'ceramic'} color={item.potColor || '#9CA3AF'} className="w-16 h-16 opacity-80" />
              </div>
            ) : isSaucer ? (
               <div 
                className="p-8 rounded-[32px] bg-white/50 dark:bg-slate-800/50 shadow-inner flex items-center justify-center transition-all group-hover:scale-110"
                style={{ color: item.potColor || '#9CA3AF' }}
              >
                <SaucerIcon color={item.potColor || '#9CA3AF'} className="w-16 h-16 opacity-80" />
              </div>
            ) : (
              <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
            )}
          </div>
        )}
        
        <div className="absolute top-4 left-4 flex flex-col gap-2">
          <span 
            className={`${(isCustomMix || isPot) ? 'opacity-90' : 'bg-verdant/90'} backdrop-blur-md text-white text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full shadow-lg`}
            style={isCustomMix ? { backgroundColor: item.containerColor || '#5E8F47' } : (isPot || isSaucer) ? { backgroundColor: item.potColor || '#5E8F47' } : {}}
          >
            {getCategoryLabel()}
          </span>
          {isLowStock && (
            <span className="bg-red-500/90 backdrop-blur-md text-white text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full shadow-lg animate-pulse">
              {t('out_of_stock')}
            </span>
          )}
          {isPotOrAccessory && (
            <span className={`backdrop-blur-md text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full shadow-lg border border-white/20 truncate max-w-[120px] md:max-w-none ${associatedPlant ? 'bg-blue-500/90 text-white' : 'bg-verdant/20 text-verdant dark:text-verdant-light'}`}>
              {associatedPlant ? `${t('in_use')}: ${lv(associatedPlant.nickname)}` : t('available')}
            </span>
          )}
        </div>
      </div>

      <div className="p-3 md:p-5 flex-1 flex flex-col space-y-2 md:space-y-4">
        <div>
          <h3 className="font-bold text-gray-900 dark:text-white leading-tight group-hover:text-verdant transition-colors text-xs md:text-base line-clamp-2">{lv(item.name)}</h3>
          {(item.brand || item.model || item.sizeCm || item.sizeInches) && (
            <p className="text-[8px] md:text-[10px] text-gray-500 dark:text-slate-500 font-black uppercase tracking-wider mt-0.5 md:mt-1 truncate">
              {lv(item.brand)} {item.model ? `• ${item.model}` : ''} 
              {(item.sizeCm || item.sizeInches) && (
                <span className="ml-1 text-verdant dark:text-verdant-light">
                  • {item.sizeCm ? `${item.sizeCm}cm` : ''} {item.sizeInches ? `(${item.sizeInches}")` : ''}
                </span>
              )}
            </p>
          )}
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mt-auto pt-2 md:pt-3 border-t border-gray-50 dark:border-slate-800 gap-2">
          {canConsume ? (
            <div className="flex items-center gap-1 bg-gray-50 dark:bg-slate-800 rounded-xl md:rounded-2xl p-0.5 md:p-1 border border-gray-100 dark:border-slate-700/50 shadow-inner w-full sm:w-auto justify-between sm:justify-start">
               <button 
                onClick={handleDecrement}
                disabled={isLowStock}
                className="w-7 h-7 md:w-8 md:h-8 flex items-center justify-center bg-white dark:bg-slate-700 hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 rounded-lg md:rounded-xl transition-all active:scale-90 disabled:opacity-30 shadow-sm border border-gray-100 dark:border-slate-600"
              >
                <svg className="w-3.5 h-3.5 md:w-4 md:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M20 12H4" /></svg>
              </button>
              
              <div className="px-1.5 md:px-3 flex flex-col items-center">
                <span className="text-[7px] md:text-[8px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-tighter leading-none mb-0.5">{formattedVolume.unit}</span>
                <span className={`text-xs md:text-sm font-black transition-colors ${isLowStock ? 'text-red-500' : 'text-gray-900 dark:text-white'}`}>
                  {formattedVolume.value}
                </span>
              </div>

              <button 
                onClick={handleIncrement}
                className="w-7 h-7 md:w-8 md:h-8 flex items-center justify-center bg-white dark:bg-slate-700 hover:bg-verdant/10 dark:hover:bg-verdant/20 text-gray-400 hover:text-verdant rounded-lg md:rounded-xl transition-all active:scale-90 shadow-sm border border-gray-100 dark:border-slate-600"
              >
                <svg className="w-3.5 h-3.5 md:w-4 md:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M12 4v16m8-8H4" /></svg>
              </button>
            </div>
          ) : (
            <div className="flex flex-col">
              <span className="text-[8px] md:text-[9px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-[0.2em]">{t('lbl_quantity')}</span>
              <span className="text-xs md:text-sm font-black text-gray-900 dark:text-white">
                {formattedVolume.value} <span className="text-[9px] md:text-[10px] text-gray-400 font-bold ml-0.5">{formattedVolume.unit}</span>
              </span>
            </div>
          )}
          
          <div className="flex gap-1.5 md:gap-2 ml-auto sm:ml-0">
            {hasCompatibility && !isCustomMix && (
              <button 
                onClick={(e) => { e.stopPropagation(); onCompatibilityClick?.(); }}
                className="w-8 h-8 md:w-10 md:h-10 flex items-center justify-center bg-verdant/10 dark:bg-verdant/20 text-verdant dark:text-verdant-light rounded-xl md:rounded-2xl hover:bg-verdant hover:text-white transition-all shadow-sm border border-verdant/10"
                title={t('btn_compatibility')}
              >
                <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </button>
            )}

            {onEditClick && (
              <button 
                onClick={(e) => { e.stopPropagation(); onEditClick(); }}
                className={`px-2 md:px-3 py-1.5 md:py-2 rounded-lg md:rounded-xl text-[8px] md:text-[10px] font-black uppercase tracking-widest transition-all shadow-sm border ${
                  isCustomMix 
                    ? 'bg-amber-500/10 text-amber-600 border-amber-500/20 hover:bg-amber-500 hover:text-white' 
                    : 'bg-blue-500/10 text-blue-600 border-blue-500/20 hover:bg-blue-500 hover:text-white'
                }`}
              >
                {isCustomMix ? t('edit_mix') : t('edit')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};