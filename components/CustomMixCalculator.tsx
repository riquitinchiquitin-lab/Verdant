import React, { useState, useEffect, useMemo } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { useInventory } from '../context/InventoryContext';
import { translateInput, translateObjectInput } from '../services/translationService';
import { Button } from './ui/Button';
import { generateUUID } from '../services/crypto';
import { useAuth } from '../context/AuthContext';
import { InventoryItem, CustomMixType, ContainerType } from '../types';
import { UNIT_SYSTEMS, convertValue } from '../services/unitUtils';
import { ContainerIcon } from './icons/ContainerIcons';

interface IngredientState {
  id: string;
  name: string;
  quantity: string;
  unit: string;
}

interface CustomMixCalculatorProps {
  onSaveSuccess?: () => void;
  itemToEdit?: InventoryItem;
}

const PRESET_COLORS = ['#5E8F47', '#3B82F6', '#EF4444', '#F59E0B', '#8B5CF6', '#EC4899', '#10B981', '#6366F1', '#6B7280', '#000000'];
const RATIO_PRESETS = [1, 2, 3, 5, 10];

export const CustomMixCalculator: React.FC<CustomMixCalculatorProps> = ({ onSaveSuccess, itemToEdit }) => {
  const { t, lv } = useLanguage();
  const { addItem, updateItem } = useInventory();
  const { user } = useAuth();
  
  const [mixName, setMixName] = useState<string>(lv(itemToEdit?.name) || '');
  const [description, setDescription] = useState<string>(lv(itemToEdit?.description) || '');
  const [applicationUsage, setApplicationUsage] = useState<string>(lv(itemToEdit?.applicationUsage) || '');
  const [instructions, setInstructions] = useState<string>(lv(itemToEdit?.instructions) || '');
  const [mixType, setMixType] = useState<CustomMixType>(itemToEdit?.mixType || 'general');
  const [containerType, setContainerType] = useState<ContainerType>(itemToEdit?.containerType || 'hdpe_jug');
  const [containerColor, setContainerColor] = useState<string>(itemToEdit?.containerColor || '#5E8F47');
  const [isSaving, setIsSaving] = useState(false);
  
  const [ingredients, setIngredients] = useState<IngredientState[]>(() => {
    if (itemToEdit?.ingredients) {
      return itemToEdit.ingredients.map((ing, idx) => ({
        id: `ing-${idx}-${generateUUID()}`,
        name: lv(ing.name),
        quantity: (ing.quantity || 0).toString(),
        unit: ing.unit || 'ml',
      }));
    }
    return [{ id: generateUUID(), name: '', quantity: '0', unit: 'ml' }];
  });

  const CONTAINER_OPTIONS: { label: string; value: ContainerType }[] = [
    { label: 'HDPE Jug', value: 'hdpe_jug' },
    { label: 'Jerry Can', value: 'jerry_can' },
    { label: 'Bag in a Box', value: 'bag_in_box' },
    { label: 'Spray Bottle', value: 'spray_bottle' },
    { label: 'Pressure Sprayer', value: 'pressure_sprayer' },
    { label: 'Bucket with Lid', value: 'bucket' },
    { label: 'Sealed Tote', value: 'tote' },
    { label: 'None', value: 'none' },
  ];

  const MIX_TYPES: { label: string; value: CustomMixType }[] = [
    { label: t('cat_custom_mix'), value: 'general' },
    { label: t('cat_soil'), value: 'soil' },
    { label: t('cat_fertiliser'), value: 'fertiliser' },
    { label: t('cat_insecticide'), value: 'insecticide' },
  ];

  const { totalVolume, totalUnit, ratios } = useMemo(() => {
    const total = ingredients.reduce((sum, ing) => sum + convertValue(parseFloat(ing.quantity) || 0, ing.unit, 'ml'), 0);
    const dominantUnit = ingredients.length > 0 ? ingredients.reduce((a, b) => (parseFloat(a.quantity) || 0) > (parseFloat(b.quantity) || 0) ? a : b).unit : 'ml';
    const totalInDominantUnit = convertValue(total, 'ml', dominantUnit);

    const calculatedRatios = ingredients.map(ing => {
      const ingInMl = convertValue(parseFloat(ing.quantity) || 0, ing.unit, 'ml');
      return total > 0 ? (ingInMl / total) * 100 : 0;
    });

    return { totalVolume: totalInDominantUnit, totalUnit: dominantUnit, ratios: calculatedRatios };
  }, [ingredients]);

  const addIngredient = () => setIngredients(prev => [...prev, { id: generateUUID(), name: '', quantity: '0', unit: 'ml' }]);
  const removeIngredient = (id: string) => { if (ingredients.length > 1) setIngredients(prev => prev.filter(ing => ing.id !== id)); };
  const updateIngredient = (id: string, newValues: Partial<IngredientState>) => {
    setIngredients(prev => prev.map(ing => ing.id === id ? { ...ing, ...newValues } : ing));
  };

  const handleSave = async () => {
    if (!mixName.trim() || isSaving) return;
    setIsSaving(true);
    try {
        const apiKey = user?.personalAiKey || '';
        const translations = await translateObjectInput({
          name: mixName,
          description: description || '',
          applicationUsage: applicationUsage || '',
          instructions: instructions || ''
        }, 'en', apiKey);

        const localizedIngredients = await Promise.all(ingredients.map(async ing => {
            const localizedIngName = await translateInput(ing.name || 'Unnamed Ingredient', 'en', apiKey);
            return { name: localizedIngName, quantity: parseFloat(ing.quantity) || 0, unit: ing.unit };
        }));
        const itemData = { 
          category: 'custom-mix' as const, 
          name: translations.name, 
          description: translations.description, 
          applicationUsage: translations.applicationUsage,
          instructions: translations.instructions,
          mixType, 
          containerType, 
          containerColor, 
          quantity: totalVolume, 
          unit: totalUnit, 
          images: itemToEdit?.images || [], 
          ingredients: localizedIngredients,
          houseId: itemToEdit?.houseId || user?.houseId
        };
        if (itemToEdit) updateItem(itemToEdit.id, itemData);
        else addItem({ id: `inv-mix-${generateUUID()}`, ...itemData } as InventoryItem);
        if (onSaveSuccess) onSaveSuccess();
    } catch (e) { console.error(e); } 
    finally { setIsSaving(false); }
  };
  
  return (
    <div className="space-y-6 w-full animate-in fade-in duration-500 max-h-[80vh] overflow-y-auto no-scrollbar px-2 pb-6">
      <div className="flex items-center gap-4 mb-2">
        <div className="p-4 bg-white dark:bg-slate-800 rounded-[24px] shadow-sm border border-gray-100 dark:border-slate-700 flex items-center justify-center transition-all duration-500" style={{ borderLeft: `8px solid ${containerColor}` }}>
          <ContainerIcon type={containerType} color={containerColor} className="w-8 h-8" />
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-black text-gray-900 dark:text-white uppercase tracking-tight mb-1">{t('mix_calculator')}</h2>
          <p className="text-[10px] text-gray-400 dark:text-slate-500 font-black uppercase tracking-widest">{t('lbl_total_volume')} & {t('lbl_ratio')}</p>
        </div>
      </div>

      <div className="bg-gray-50 dark:bg-slate-800/50 p-6 rounded-[28px] border border-gray-100 dark:border-slate-800 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-2 px-1">{t('lbl_nickname')}</label>
              <input type="text" placeholder={t('lbl_nickname')} value={mixName} onChange={(e) => setMixName(e.target.value)} className="w-full bg-transparent border-b border-gray-200 dark:border-slate-700 text-xl font-bold focus:ring-0 focus:border-verdant dark:text-white pb-1 outline-none transition-all" />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-2 px-1">{t('category')}</label>
            <select value={mixType} onChange={(e) => setMixType(e.target.value as CustomMixType)} className="w-full bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-verdant outline-none dark:text-white">
              {MIX_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>

        <div className="text-center">
            <label className="block text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-2 px-1">{t('lbl_total_volume')}</label>
            <p className="text-4xl font-black dark:text-white">{totalVolume.toFixed(2)} {totalUnit}</p>
          </div>
      </div>

      <div className="space-y-4">
        <label className="block text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest px-1">{t('lbl_ingredients')}</label>
        {ingredients.map((ing, idx) => (
          <div key={ing.id} className="p-5 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[32px] shadow-sm space-y-4 group transition-all hover:border-verdant/20">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gray-50 dark:bg-slate-800 flex items-center justify-center font-black text-gray-400 text-xs shadow-inner">{idx + 1}</div>
              <input placeholder={t('lbl_ingredients')} value={ing.name} onChange={(e) => setIngredients(prev => prev.map(i => i.id === ing.id ? { ...i, name: e.target.value } : i))} className="flex-1 bg-transparent border-none text-base font-bold focus:ring-0 dark:text-white outline-none" />
              <button onClick={() => removeIngredient(ing.id)} className="p-2 text-gray-300 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
              <div className="bg-gray-50 dark:bg-slate-800/80 rounded-2xl p-4 flex flex-col justify-center border border-transparent focus-within:border-verdant/30 transition-all">
                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 px-1">{t('quantity')}</span>
                <div className="flex items-center gap-2">
                    <input type="text" inputMode="decimal" value={ing.quantity} onChange={(e) => {
                      const value = e.target.value;
                      if (/^\d*\.?\d*$/.test(value)) {
                        updateIngredient(ing.id, { quantity: value });
                      }
                    }} className="flex-1 min-w-0 bg-transparent border-none text-3xl font-black focus:ring-0 dark:text-white p-0" />
                    <select value={ing.unit} onChange={(e) => updateIngredient(ing.id, { unit: e.target.value })} className="flex-shrink-0 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-[10px] font-black text-verdant uppercase tracking-widest rounded-lg px-2 py-1 outline-none">
                      <optgroup label={t('metric')}>{UNIT_SYSTEMS.METRIC.map(u => <option key={u.value} value={u.value}>{u.value}</option>)}</optgroup>
                      <optgroup label={t('imperial')}>{UNIT_SYSTEMS.IMPERIAL.map(u => <option key={u.value} value={u.value}>{u.value}</option>)}</optgroup>
                    </select>
                  </div>
                </div>
                <div className="space-y-3 bg-gray-50/50 dark:bg-slate-800/30 p-4 rounded-2xl border border-gray-100/50 dark:border-slate-800/50 text-center">
                  <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{t('lbl_ratio')}</span>
                  <p className="text-2xl font-black text-verdant">{ratios[idx].toFixed(2)}%</p>
                </div>
              </div>
          </div>
        ))}
        <Button variant="secondary" size="sm" className="w-full border-dashed rounded-[24px] py-4 border-2 hover:border-verdant/50 transition-all font-black text-[10px] tracking-widest uppercase mt-2" onClick={addIngredient}><svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M12 4v16m8-8H4" /></svg>{t('add_item')}</Button>
      </div>

      <div className="pt-8 border-t border-gray-100 dark:border-slate-800 space-y-6">
        <div className="space-y-4">
           <label className="block text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest px-1">{t('visual_configuration')}</label>
           <div className="flex flex-wrap items-center gap-2">{PRESET_COLORS.map(c => <button key={c} onClick={() => setContainerColor(c)} className={`w-10 h-10 rounded-2xl border-2 transition-all ${containerColor === c ? 'scale-110 border-gray-900 dark:border-white shadow-xl' : 'border-transparent'}`} style={{ backgroundColor: c }} />)}</div>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <div><label className="block text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2">{t('vessel_type')}</label><select value={containerType} onChange={(e) => setContainerType(e.target.value as ContainerType)} className="w-full bg-gray-100 dark:bg-slate-800 border-none rounded-xl px-3 py-3 text-xs font-bold outline-none dark:text-white">{CONTAINER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
             <div><label className="block text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2">{t('lbl_desc')}</label><input type="text" placeholder="e.g. Weekly fertilization" value={description} onChange={(e) => setDescription(e.target.value)} className="w-full bg-gray-100 dark:bg-slate-800 border-none rounded-xl px-3 py-3 text-xs font-bold outline-none dark:text-white" /></div>
             <div><label className="block text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2">{t('lbl_usage_instructions')}</label><input type="text" placeholder="e.g. Mix 1:10 with water" value={applicationUsage} onChange={(e) => setApplicationUsage(e.target.value)} className="w-full bg-gray-100 dark:bg-slate-800 border-none rounded-xl px-3 py-3 text-xs font-bold outline-none dark:text-white" /></div>
             <div><label className="block text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2">{t('lbl_instructions')}</label><input type="text" placeholder="e.g. Apply to soil only" value={instructions} onChange={(e) => setInstructions(e.target.value)} className="w-full bg-gray-100 dark:bg-slate-800 border-none rounded-xl px-3 py-3 text-xs font-bold outline-none dark:text-white" /></div>
           </div>
        </div>
        <div className="pt-4"><Button variant="primary" className="w-full py-5 rounded-[28px] shadow-2xl shadow-verdant/30 text-base font-black tracking-[0.2em]" disabled={isSaving || !mixName.trim() || ingredients.some(i => !i.name)} onClick={handleSave} isLoading={isSaving}>{itemToEdit ? t('save_changes').toUpperCase() : t('save_mix').toUpperCase()}</Button></div>
      </div>
    </div>
  );
};