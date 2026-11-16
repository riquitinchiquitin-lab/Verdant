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
    if (ingredients.length === 0) {
      return { totalVolume: 0, totalUnit: 'ml', ratios: [] };
    }
    const baseUnitFor = (u: string) => {
      const lower = u.toLowerCase().trim();
      return ['mg', 'g', 'kg', 'oz', 'lb', 'gram', 'grams', 'kilogram', 'kilograms', 'ounce', 'ounces', 'pound', 'pounds', 'milligram', 'milligrams'].includes(lower) ? 'g' : 'ml';
    };
    const primaryBase = baseUnitFor(ingredients[0].unit);
    const normalized = ingredients.map(ing => convertValue(parseFloat(ing.quantity) || 0, ing.unit, primaryBase));
    const total = normalized.reduce((sum, v) => sum + v, 0);

    let maxIdx = 0;
    for (let i = 1; i < normalized.length; i++) {
      if (normalized[i] > normalized[maxIdx]) maxIdx = i;
    }
    const dominantUnit = ingredients[maxIdx].unit;
    const totalInDominantUnit = convertValue(total, primaryBase, dominantUnit);

    const calculatedRatios = normalized.map(val => (total > 0 ? (val / total) * 100 : 0));

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
    <div className="space-y-5 w-full animate-in fade-in duration-300 max-h-[80vh] overflow-y-auto no-scrollbar px-1 pb-4 font-sans">
      <div className="flex items-center gap-4 mb-1">
        <div className="p-3.5 bg-md-surface-container-high rounded-2xl shadow-xs border border-md-outline-variant/30 flex items-center justify-center" style={{ borderLeft: `6px solid ${containerColor}` }}>
          <ContainerIcon type={containerType} color={containerColor} className="w-8 h-8" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg md:text-xl font-bold text-md-on-surface tracking-tight">{t('mix_calculator')}</h2>
          <p className="text-xs text-md-on-surface-variant font-semibold">{t('lbl_total_volume')} & {t('lbl_ratio')}</p>
        </div>
      </div>

      <div className="bg-md-surface-container p-5 rounded-[24px] border border-md-outline-variant/30 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-md-on-surface-variant mb-1.5 ml-1">{t('lbl_nickname')}</label>
            <input type="text" placeholder={t('lbl_nickname')} value={mixName} onChange={(e) => setMixName(e.target.value)} className="w-full h-12 px-4 bg-md-surface-container-highest border border-md-outline-variant/60 rounded-2xl text-sm font-semibold text-md-on-surface outline-none focus:border-md-primary focus:ring-2 focus:ring-md-primary/20 transition-all" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-md-on-surface-variant mb-1.5 ml-1">{t('category')}</label>
            <select value={mixType} onChange={(e) => setMixType(e.target.value as CustomMixType)} className="w-full h-12 bg-md-surface-container-highest border border-md-outline-variant/60 rounded-2xl px-4 text-sm font-semibold text-md-on-surface outline-none focus:border-md-primary">
              {MIX_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>

        <div className="text-center pt-1">
          <label className="block text-xs font-semibold text-md-on-surface-variant mb-1">{t('lbl_total_volume')}</label>
          <p className="text-3xl md:text-4xl font-bold text-md-primary">{totalVolume.toFixed(2)} {totalUnit}</p>
        </div>
      </div>

      <div className="space-y-3.5">
        <label className="block text-xs font-semibold text-md-on-surface-variant ml-1">{t('lbl_ingredients')}</label>
        {ingredients.map((ing, idx) => (
          <div key={ing.id} className="m3-card-elevated p-4 md:p-5 border border-md-outline-variant/30 rounded-[24px] space-y-3.5 group">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-md-secondary-container text-md-on-secondary-container flex items-center justify-center font-bold text-xs shrink-0">{idx + 1}</div>
              <input placeholder={t('lbl_ingredients')} value={ing.name} onChange={(e) => setIngredients(prev => prev.map(i => i.id === ing.id ? { ...i, name: e.target.value } : i))} className="flex-1 bg-transparent border-none text-base font-bold text-md-on-surface outline-none" />
              <button onClick={() => removeIngredient(ing.id)} className="m3-state-layer w-8 h-8 rounded-full flex items-center justify-center text-md-on-surface-variant hover:text-md-error transition-all opacity-70 md:opacity-0 md:group-hover:opacity-100"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-md-surface-container rounded-2xl p-3.5 flex flex-col justify-center border border-md-outline-variant/30 focus-within:border-md-primary transition-all">
                <span className="text-[11px] font-semibold text-md-on-surface-variant mb-1">{t('quantity')}</span>
                <div className="flex items-center gap-2">
                  <input type="text" inputMode="decimal" value={ing.quantity} onChange={(e) => {
                    const value = e.target.value;
                    if (/^\d*\.?\d*$/.test(value)) {
                      updateIngredient(ing.id, { quantity: value });
                    }
                  }} className="flex-1 min-w-0 bg-transparent border-none text-2xl font-bold text-md-on-surface focus:ring-0 p-0 outline-none" />
                  <select value={ing.unit} onChange={(e) => updateIngredient(ing.id, { unit: e.target.value })} className="shrink-0 bg-md-surface-container-highest border border-md-outline-variant/50 text-xs font-semibold text-md-primary rounded-xl px-2.5 py-1.5 outline-none">
                    <optgroup label={t('metric')}>{UNIT_SYSTEMS.METRIC.map(u => <option key={u.value} value={u.value}>{u.value}</option>)}</optgroup>
                    <optgroup label={t('imperial')}>{UNIT_SYSTEMS.IMPERIAL.map(u => <option key={u.value} value={u.value}>{u.value}</option>)}</optgroup>
                  </select>
                </div>
              </div>
              <div className="bg-md-surface-container p-3.5 rounded-2xl border border-md-outline-variant/30 flex flex-col justify-center text-center">
                <span className="text-[11px] font-semibold text-md-on-surface-variant">{t('lbl_ratio')}</span>
                <p className="text-2xl font-bold text-md-primary">{ratios[idx].toFixed(2)}%</p>
              </div>
            </div>
          </div>
        ))}
        <Button variant="tonal" size="md" className="w-full" onClick={addIngredient}><svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M12 4v16m8-8H4" /></svg>{t('add_item')}</Button>
      </div>

      <div className="pt-5 border-t border-md-outline-variant/30 space-y-5">
        <div className="space-y-4">
          <label className="block text-xs font-semibold text-md-on-surface-variant ml-1">{t('visual_configuration')}</label>
          <div className="flex flex-wrap items-center gap-2">{PRESET_COLORS.map(c => <button key={c} onClick={() => setContainerColor(c)} className={`w-9 h-9 rounded-2xl border-2 transition-all ${containerColor === c ? 'scale-110 border-md-on-surface shadow-md' : 'border-transparent'}`} style={{ backgroundColor: c }} />)}</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div><label className="block text-xs font-semibold text-md-on-surface-variant mb-1.5 ml-1">{t('vessel_type')}</label><select value={containerType} onChange={(e) => setContainerType(e.target.value as ContainerType)} className="w-full h-12 bg-md-surface-container-highest border border-md-outline-variant/60 rounded-2xl px-4 text-sm font-medium outline-none text-md-on-surface">{CONTAINER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
            <div><label className="block text-xs font-semibold text-md-on-surface-variant mb-1.5 ml-1">{t('lbl_desc')}</label><input type="text" placeholder="e.g. Weekly fertilization" value={description} onChange={(e) => setDescription(e.target.value)} className="w-full h-12 bg-md-surface-container-highest border border-md-outline-variant/60 rounded-2xl px-4 text-sm font-medium outline-none text-md-on-surface" /></div>
            <div><label className="block text-xs font-semibold text-md-on-surface-variant mb-1.5 ml-1">{t('lbl_usage_instructions')}</label><input type="text" placeholder="e.g. Mix 1:10 with water" value={applicationUsage} onChange={(e) => setApplicationUsage(e.target.value)} className="w-full h-12 bg-md-surface-container-highest border border-md-outline-variant/60 rounded-2xl px-4 text-sm font-medium outline-none text-md-on-surface" /></div>
            <div><label className="block text-xs font-semibold text-md-on-surface-variant mb-1.5 ml-1">{t('lbl_instructions')}</label><input type="text" placeholder="e.g. Apply to soil only" value={instructions} onChange={(e) => setInstructions(e.target.value)} className="w-full h-12 bg-md-surface-container-highest border border-md-outline-variant/60 rounded-2xl px-4 text-sm font-medium outline-none text-md-on-surface" /></div>
          </div>
        </div>
        <div className="pt-2"><Button variant="primary" size="lg" className="w-full" disabled={isSaving || !mixName.trim() || ingredients.some(i => !i.name)} onClick={handleSave} isLoading={isSaving}>{itemToEdit ? t('save_changes') : t('save_mix')}</Button></div>
      </div>
    </div>
  );
};