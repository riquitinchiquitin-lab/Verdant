
import React from 'react';
import { InventoryItem } from '../types';
import { useLanguage } from '../context/LanguageContext';
import { formatVolume, convertValue } from '../services/unitUtils';
import { ContainerIcon } from './icons/ContainerIcons';

interface CustomMixDetailsProps {
  item: InventoryItem;
}

export const CustomMixDetails: React.FC<CustomMixDetailsProps> = ({ item }) => {
  // Fix: Added 'lv' to the destructuring of useLanguage() to unwrap LocalizedString values
  const { t, lv } = useLanguage();

  

  const ingredients = item.ingredients || [];
  const totalVolumeMl = ingredients.reduce((sum, ing) => sum + convertValue(ing.quantity, ing.unit, 'ml'), 0);
  const totalVolume = item.quantity;
  const mixUnit = item.unit;

  return (
    <div className="space-y-5 w-full animate-in fade-in duration-300 font-sans">
      <div className="flex items-center gap-4 mb-2">
        <div 
          className="p-4 rounded-2xl shadow-xs border border-md-outline-variant/30 flex items-center justify-center bg-md-surface-container-high"
          style={{ color: item.containerColor || '#456834' }}
        >
          <ContainerIcon 
            type={item.containerType || 'hdpe_jug'} 
            color={item.containerColor || '#456834'} 
            className="w-10 h-10" 
          />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl md:text-2xl font-bold text-md-on-surface tracking-tight leading-snug truncate">{lv(item.name)}</h2>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-xs text-md-on-surface-variant font-semibold">{t('cat_custom_mix')}</p>
            {item.mixType && item.mixType !== 'general' && (
              <>
                <span className="w-1 h-1 rounded-full bg-md-outline-variant" />
                <p className="text-xs font-semibold text-md-primary uppercase">{item.mixType}</p>
              </>
            )}
          </div>
        </div>
      </div>

      {item.description && (
        <div className="p-4 bg-md-surface-container rounded-2xl border border-md-outline-variant/30">
          <p className="text-xs font-semibold text-md-on-surface-variant mb-1">{t('lbl_desc')}</p>
          <p className="text-sm text-md-on-surface">
            {lv(item.description)}
          </p>
        </div>
      )}

      <div className="bg-md-surface-container p-5 rounded-[24px] border border-md-outline-variant/30 flex justify-between items-center">
        <div>
          <label className="block text-xs font-semibold text-md-on-surface-variant mb-1">{t('lbl_total_volume')}</label>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-md-on-surface">{item.quantity}</span>
            <span className="text-base font-semibold text-md-on-surface-variant uppercase">{item.unit}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        {ingredients.map((ing, idx) => {
          const ingredientVolumeMl = convertValue(ing.quantity, ing.unit, 'ml');
          const ratio = totalVolumeMl > 0 ? (ingredientVolumeMl / totalVolumeMl) * 100 : 0;
          const amountInMixUnit = (totalVolume > 0) ? (ratio / 100) * totalVolume : 0;
          
          const targetUnit = ing.unit || mixUnit;
          const amountInTargetUnit = convertValue(amountInMixUnit, mixUnit, targetUnit);
          const formatted = formatVolume(amountInTargetUnit, targetUnit);
          
          return (
            <div key={idx} className="m3-card-elevated flex flex-col p-4 rounded-[20px] border border-md-outline-variant/30">
              <div className="flex justify-between items-start mb-3">
                <span className="font-bold text-sm text-md-on-surface truncate pr-2">
                  {lv(ing.name)}
                </span>
                <span className="text-[11px] bg-md-secondary-container text-md-on-secondary-container px-2 py-0.5 rounded-full font-semibold shrink-0">
                  {ratio.toFixed(1)}%
                </span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold text-md-primary">
                  {formatted.value}
                </span>
                <span className="text-xs font-semibold text-md-on-surface-variant">{formatted.unit}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
