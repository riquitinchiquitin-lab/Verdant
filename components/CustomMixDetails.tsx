
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
    <div className="space-y-6 w-full animate-in fade-in duration-500">
      <div className="flex items-center gap-4 mb-2">
        <div 
          className="p-5 rounded-[28px] shadow-sm border border-gray-100 dark:border-slate-800 flex items-center justify-center transition-all bg-white dark:bg-slate-900"
          style={{ color: item.containerColor || '#5E8F47' }}
        >
          <ContainerIcon 
            type={item.containerType || 'hdpe_jug'} 
            color={item.containerColor || '#5E8F47'} 
            className="w-10 h-10" 
          />
        </div>
        <div className="flex-1">
          {/* Fix: Wrapped item.name in lv() to fix LocalizedString to ReactNode assignment error */}
          <h2 className="text-2xl font-black text-gray-900 dark:text-white uppercase tracking-tight leading-none mb-1">{lv(item.name)}</h2>
          <div className="flex items-center gap-2">
            <p className="text-[10px] text-gray-400 dark:text-slate-500 font-black uppercase tracking-widest">{t('cat_custom_mix')}</p>
            {item.mixType && item.mixType !== 'general' && (
              <>
                <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-slate-700"></span>
                <p className="text-[10px] font-black uppercase tracking-widest text-verdant">{item.mixType}</p>
              </>
            )}
          </div>
        </div>
      </div>

      {item.description && (
        <div className="p-5 bg-gray-50 dark:bg-slate-800/30 rounded-2xl border border-gray-100 dark:border-slate-800">
          <p className="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-2">{t('lbl_desc')}</p>
          {/* Fix: Wrapped item.description in lv() to fix LocalizedString to ReactNode assignment error */}
          <p className="text-sm text-gray-600 dark:text-slate-400 font-medium">
            {lv(item.description)}
          </p>
        </div>
      )}

      <div className="bg-gray-50 dark:bg-slate-800/50 p-6 rounded-[28px] border border-gray-100 dark:border-slate-800 flex justify-between items-center">
        <div>
          <label className="block text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-1 px-1">{t('lbl_total_volume')}</label>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-gray-900 dark:text-white">{item.quantity}</span>
            <span className="text-lg font-bold text-gray-400 uppercase">{item.unit}</span>
          </div>
        </div>
        
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {ingredients.map((ing, idx) => {
          const ingredientVolumeMl = convertValue(ing.quantity, ing.unit, 'ml');
          const ratio = totalVolumeMl > 0 ? (ingredientVolumeMl / totalVolumeMl) * 100 : 0;
          const amountInMixUnit = (totalVolume > 0) ? (ratio / 100) * totalVolume : 0;
          
          const targetUnit = ing.unit || mixUnit;
          const amountInTargetUnit = convertValue(amountInMixUnit, mixUnit, targetUnit);
          const formatted = formatVolume(amountInTargetUnit, targetUnit);
          
          return (
            <div key={idx} className="group flex flex-col p-5 bg-white dark:bg-slate-900 rounded-[28px] border border-gray-100 dark:border-slate-800 hover:border-verdant/30 transition-all shadow-sm">
              <div className="flex justify-between items-start mb-4">
                {/* Fix: Wrapped ing.name in lv() to fix LocalizedString to ReactNode assignment error */}
                <span className="font-black text-gray-800 dark:text-slate-200 truncate pr-2">
                  {lv(ing.name)}
                </span>
                <span className="text-[9px] bg-gray-50 dark:bg-slate-800 px-2 py-1 rounded-lg font-black text-gray-400 uppercase tracking-tighter shrink-0">
                  {ratio.toFixed(2)}%
                </span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-black text-amber-600 dark:text-amber-400">
                  {formatted.value}
                </span>
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{formatted.unit}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
