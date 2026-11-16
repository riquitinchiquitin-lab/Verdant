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
    const unit = (item.unit || '').toLowerCase();
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
      className={`m3-card-elevated rounded-[24px] border border-md-outline-variant/30 overflow-hidden flex flex-col group hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 ${onClick ? 'cursor-pointer' : ''}`}
    >
      <div className="relative h-36 md:h-44 bg-md-surface-container-highest overflow-hidden m-2.5 rounded-[20px]">
        {item.images && item.images[0] ? (
          <img src={item.images[0]} alt={lv(item.name)} className="w-full h-full object-contain p-4 group-hover:scale-105 transition-transform duration-500" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-md-on-surface-variant/40">
            {isCustomMix ? (
              <div 
                className="p-6 rounded-3xl bg-md-surface-container-lowest/70 shadow-inner flex items-center justify-center transition-transform group-hover:scale-105"
                style={{ color: item.containerColor || '#456834' }}
              >
                <ContainerIcon type={item.containerType || 'hdpe_jug'} color={item.containerColor || '#456834'} className="w-14 h-14 opacity-85" />
              </div>
            ) : isPot ? (
               <div 
                className="p-6 rounded-3xl bg-md-surface-container-lowest/70 shadow-inner flex items-center justify-center transition-transform group-hover:scale-105"
                style={{ color: item.potColor || '#73796E' }}
              >
                <PotIcon type={item.potType || 'ceramic'} color={item.potColor || '#73796E'} className="w-14 h-14 opacity-85" />
              </div>
            ) : isSaucer ? (
               <div 
                className="p-6 rounded-3xl bg-md-surface-container-lowest/70 shadow-inner flex items-center justify-center transition-transform group-hover:scale-105"
                style={{ color: item.potColor || '#73796E' }}
              >
                <SaucerIcon color={item.potColor || '#73796E'} className="w-14 h-14 opacity-85" />
              </div>
            ) : (
              <svg className="w-14 h-14" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.25} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
            )}
          </div>
        )}
        
        <div className="absolute top-3 left-3 flex flex-col gap-1.5">
          <span 
            className={`${(isCustomMix || isPot) ? 'opacity-95 text-white' : 'bg-md-primary text-md-on-primary'} backdrop-blur-xs text-[11px] font-semibold px-2.5 py-0.5 rounded-full shadow-xs`}
            style={isCustomMix ? { backgroundColor: item.containerColor || '#456834' } : (isPot || isSaucer) ? { backgroundColor: item.potColor || '#456834' } : {}}
          >
            {getCategoryLabel()}
          </span>
          {isLowStock && (
            <span className="bg-md-error text-md-on-error text-[11px] font-semibold px-2.5 py-0.5 rounded-full shadow-xs animate-pulse">
              {t('out_of_stock')}
            </span>
          )}
          {isPotOrAccessory && (
            <span className={`backdrop-blur-xs text-[11px] font-semibold px-2.5 py-0.5 rounded-full shadow-xs truncate max-w-[140px] md:max-w-none ${associatedPlant ? 'bg-md-tertiary-container text-md-on-tertiary-container' : 'bg-md-secondary-container text-md-on-secondary-container'}`}>
              {associatedPlant ? `${t('in_use')}: ${lv(associatedPlant.nickname)}` : t('available')}
            </span>
          )}
        </div>
      </div>

      <div className="px-4 pb-4 pt-1 md:px-5 md:pb-5 flex-1 flex flex-col space-y-3">
        <div>
          <h3 className="font-bold text-md-on-surface leading-snug group-hover:text-md-primary transition-colors text-sm md:text-base line-clamp-2">{lv(item.name)}</h3>
          {(item.brand || item.model || item.sizeCm || item.sizeInches) && (
            <p className="text-xs text-md-on-surface-variant font-medium mt-0.5 truncate">
              {lv(item.brand)} {item.model ? `• ${item.model}` : ''} 
              {(item.sizeCm || item.sizeInches) && (
                <span className="ml-1 text-md-primary font-semibold">
                  • {item.sizeCm ? `${item.sizeCm}cm` : ''} {item.sizeInches ? `(${item.sizeInches}")` : ''}
                </span>
              )}
            </p>
          )}
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mt-auto pt-3 border-t border-md-outline-variant/30 gap-2.5">
          {canConsume ? (
            <div className="flex items-center gap-1 bg-md-surface-container rounded-2xl p-1 border border-md-outline-variant/40 w-full sm:w-auto justify-between sm:justify-start">
              <button 
                onClick={handleDecrement}
                disabled={isLowStock}
                aria-label="Decrease quantity"
                className="m3-state-layer w-8 h-8 flex items-center justify-center bg-md-surface-container-lowest hover:bg-md-error-container text-md-on-surface-variant hover:text-md-on-error-container rounded-xl transition-all active:scale-90 disabled:opacity-30 shadow-xs"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M20 12H4" /></svg>
              </button>
              
              <div className="px-2.5 flex flex-col items-center">
                <span className="text-[10px] font-semibold text-md-on-surface-variant leading-none mb-0.5">{formattedVolume.unit}</span>
                <span className={`text-xs md:text-sm font-bold transition-colors ${isLowStock ? 'text-md-error' : 'text-md-on-surface'}`}>
                  {formattedVolume.value}
                </span>
              </div>

              <button 
                onClick={handleIncrement}
                aria-label="Increase quantity"
                className="m3-state-layer w-8 h-8 flex items-center justify-center bg-md-surface-container-lowest hover:bg-md-primary-container text-md-on-surface-variant hover:text-md-on-primary-container rounded-xl transition-all active:scale-90 shadow-xs"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M12 4v16m8-8H4" /></svg>
              </button>
            </div>
          ) : (
            <div className="flex flex-col">
              <span className="text-[11px] font-medium text-md-on-surface-variant">{t('lbl_quantity')}</span>
              <span className="text-sm font-bold text-md-on-surface">
                {formattedVolume.value} <span className="text-xs text-md-on-surface-variant font-medium ml-0.5">{formattedVolume.unit}</span>
              </span>
            </div>
          )}
          
          <div className="flex gap-2 ml-auto sm:ml-0">
            {hasCompatibility && !isCustomMix && (
              <button 
                onClick={(e) => { e.stopPropagation(); onCompatibilityClick?.(); }}
                className="m3-state-layer w-9 h-9 md:w-10 md:h-10 flex items-center justify-center bg-md-primary-container text-md-on-primary-container rounded-xl hover:opacity-90 transition-all"
                title={t('btn_compatibility')}
              >
                <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </button>
            )}

            {onEditClick && (
              <button 
                onClick={(e) => { e.stopPropagation(); onEditClick(); }}
                className={`m3-state-layer px-3 h-9 rounded-xl text-xs font-semibold transition-all ${
                  isCustomMix 
                    ? 'bg-md-tertiary-container text-md-on-tertiary-container' 
                    : 'bg-md-secondary-container text-md-on-secondary-container'
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