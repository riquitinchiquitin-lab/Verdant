
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { useLanguage } from '../context/LanguageContext';
import { useInventory } from '../context/InventoryContext';
import { usePlants } from '../context/PlantContext';
import { useAuth } from '../context/AuthContext';
import { translateInput, translateObjectInput } from '../services/translationService';
import { InventoryItem, InventoryCategory, Plant } from '../types';
import { identifyInventoryItem } from '../services/inventoryAi';
import { compressImage } from '../services/imageUtils';
import { generateUUID } from '../services/crypto';
import { CameraCapture } from './ui/CameraCapture';
import { Logo } from './ui/Logo';
import { getCompatiblePlants } from '../services/compatibilityService';

interface AddInventoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  itemToEdit?: InventoryItem | null;
}

type AddMode = 'CHOICE' | 'CAMERA' | 'PROCESSING' | 'MANUAL' | 'REVIEW';

interface ProtocolLog {
    timestamp: string;
    source: string;
    message: string;
    type: 'SYSTEM' | 'GEMINI' | 'NETWORK' | 'DEBUG' | 'WARNING';
}

export const AddInventoryModal: React.FC<AddInventoryModalProps> = ({ isOpen, onClose, itemToEdit }) => {
  const { t, lv, language } = useLanguage();
  const { addItem, updateItem } = useInventory();
  const { plants, getEffectiveApiKey } = usePlants();
  const { user } = useAuth();
  
  const [addMode, setAddMode] = useState<AddMode>('CHOICE');
  const [logs, setLogs] = useState<ProtocolLog[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryImage, setRetryImage] = useState<string | null>(null);
  const [hasKey, setHasKey] = useState<boolean>(true);
  
  const [formData, setFormData] = useState<any>({
    category: 'tools',
    name: '',
    brand: '',
    description: '',
    applicationUsage: '',
    instructions: '',
    quantity: 1,
    unit: 'units',
    images: [],
    potType: 'ceramic',
    potColor: '#3B82F6',
    sizeInches: '',
    sizeCm: '',
    drainageCapability: 'Has drainage'
  });

  useEffect(() => {
    if (itemToEdit) {
      setFormData({
        category: itemToEdit.category,
        name: lv(itemToEdit.name),
        brand: lv(itemToEdit.brand),
        description: lv(itemToEdit.description),
        applicationUsage: lv(itemToEdit.applicationUsage),
        instructions: lv(itemToEdit.instructions),
        quantity: itemToEdit.quantity,
        unit: itemToEdit.unit,
        images: itemToEdit.images || [],
        potType: itemToEdit.potType || 'ceramic',
        potColor: itemToEdit.potColor || '#3B82F6',
        sizeInches: itemToEdit.sizeInches || '',
        sizeCm: itemToEdit.sizeCm || '',
        drainageCapability: itemToEdit.drainageCapability || 'Has drainage'
      });
      setAddMode('MANUAL');
    } else {
      resetForm();
    }
  }, [itemToEdit]);
  const [identifiedItem, setIdentifiedItem] = useState<InventoryItem | null>(null);
  const [compatiblePlants, setCompatiblePlants] = useState<Plant[]>([]);
  const [countdown, setCountdown] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fix: Check for selected API key as per guidelines
  useEffect(() => {
    if (isOpen && (window as any).aistudio) {
      (window as any).aistudio.hasSelectedApiKey().then(setHasKey);
    }
  }, [isOpen]);

  const isAiDisabled = !hasKey;

  // UI Progress Logic - drive the aesthetic progress bar via internal state logs
  const progressState = useMemo(() => {
    if (logs.length === 0) return { percent: 0, status: t('msg_receiving_image'), time: 10 };
    const lastMsg = logs[logs.length - 1].message.toLowerCase();
    
    if (lastMsg.includes("specimen received")) return { percent: 20, status: t('msg_validating_samples'), time: 8 };
    if (lastMsg.includes("initiating deep")) return { percent: 55, status: t('msg_ai_recognition'), time: 5 };
    if (lastMsg.includes("finalized")) return { percent: 100, status: t('msg_inventory_linked'), time: 0 };
    
    return { percent: 60, status: t('msg_extracting_specs'), time: 4 };
  }, [logs, t]);

  useEffect(() => {
    setCountdown(progressState.time);
  }, [progressState.time]);

  useEffect(() => {
    if (addMode === 'PROCESSING' && countdown > 0) {
      const timer = setInterval(() => {
        setCountdown(prev => Math.max(0, prev - 1));
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [addMode, countdown]);

  const addLog = (message: string, source: string = 'SYSTEM', type: 'SYSTEM' | 'GEMINI' | 'NETWORK' | 'DEBUG' | 'WARNING' = 'SYSTEM') => {
    setLogs(prev => [...prev, {
        timestamp: new Date().toLocaleTimeString([], { hour12: false, fractionalSecondDigits: 1 } as any),
        source: source.toUpperCase(),
        message,
        type
    }]);
  };

  const parseAiError = (err: any): string => {
    const errStr = JSON.stringify(err);
    if (errStr.includes('429') || errStr.includes('RESOURCE_EXHAUSTED')) {
        return t('msg_quota_exceeded');
    }
    return err.message || t('msg_protocol_interrupted');
  };

  const processImage = async (base64: string) => {
    setAddMode('PROCESSING');
    setIsSaving(true);
    setError(null);
    setRetryImage(base64);
    setLogs([]);
    addLog(t('msg_specimen_received'), "SYSTEM");
    
    try {
      const plantNames = plants.map(p => p.species);
      const result = await identifyInventoryItem(base64, plantNames, language, (msg, src) => {
          addLog(msg, src, src === 'NETWORK' ? 'NETWORK' : src === 'DEBUG' ? 'DEBUG' : 'GEMINI');
      }, getEffectiveApiKey());
      
      addLog(t('msg_sync_finalized'), "SYSTEM");

      const newItem: InventoryItem = {
        ...result,
        id: `inv-${generateUUID()}`,
        houseId: user?.houseId,
        category: (result.category || 'accessories').toLowerCase() as InventoryCategory,
        name: result.name,
        brand: result.brand,
        description: result.description
      };
      
      setIdentifiedItem(newItem);
      setCompatiblePlants(getCompatiblePlants(newItem, plants));
      setAddMode('REVIEW' as any); // Need to add REVIEW mode or similar
      setIsSaving(false);
    } catch (err: any) {
      console.error(err);
      const friendlyError = parseAiError(err);
      addLog(friendlyError, "DEBUG", "WARNING");
      setError(friendlyError);
      setIsSaving(false);
    }
  };

  const handleManualSave = async () => {
    if (!formData.name || !formData.category || isSaving) return;
    
    setIsSaving(true);
    try {
        const apiKey = getEffectiveApiKey();
        const translations = await translateObjectInput({
          name: formData.name,
          brand: formData.brand || '',
          description: formData.description || '',
          applicationUsage: formData.applicationUsage || '',
          instructions: formData.instructions || ''
        }, 'en', apiKey);

        if (itemToEdit) {
          updateItem(itemToEdit.id, {
            category: formData.category as InventoryCategory,
            name: translations.name,
            brand: translations.brand,
            description: translations.description,
            applicationUsage: translations.applicationUsage,
            instructions: translations.instructions,
            quantity: formData.quantity,
            unit: formData.unit,
            images: formData.images,
            potType: formData.potType,
            potColor: formData.potColor,
            sizeInches: formData.sizeInches ? parseFloat(formData.sizeInches) : undefined,
            sizeCm: formData.sizeCm ? parseFloat(formData.sizeCm) : undefined,
            drainageCapability: formData.drainageCapability
          });
        } else {
          const newItem: InventoryItem = {
            id: `inv-${generateUUID()}`,
            houseId: user?.houseId,
            category: formData.category as InventoryCategory,
            name: translations.name,
            brand: translations.brand,
            description: translations.description,
            applicationUsage: translations.applicationUsage,
            instructions: translations.instructions,
            quantity: formData.quantity,
            unit: formData.unit,
            images: formData.images,
            sizeInches: formData.sizeInches ? parseFloat(formData.sizeInches) : undefined,
            sizeCm: formData.sizeCm ? parseFloat(formData.sizeCm) : undefined,
            potType: (formData.category === 'pots' || formData.category === 'saucers') ? formData.potType : undefined,
            potColor: (formData.category === 'pots' || formData.category === 'saucers') ? formData.potColor : undefined,
            drainageCapability: (formData.category === 'pots' || formData.category === 'saucers') ? formData.drainageCapability : undefined,
          };
          addItem(newItem);
        }

        onClose();
        resetForm();
    } catch (e) {
        console.error(e);
    } finally {
        setIsSaving(false);
    }
  };

  const resetForm = () => {
    setFormData({ 
      category: 'tools', 
      name: '', 
      brand: '', 
      description: '', 
      quantity: 1, 
      unit: 'units', 
      images: [],
      potType: 'ceramic',
      potColor: '#3B82F6',
      sizeInches: '',
      sizeCm: '',
      drainageCapability: 'Has drainage'
    });
    setAddMode('CHOICE');
    setLogs([]);
    setError(null);
    setIsSaving(false);
    setRetryImage(null);
    setIdentifiedItem(null);
    setCompatiblePlants([]);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      try {
        const base64 = await compressImage(file);
        processImage(base64);
      } catch (err) {
        addLog(t('msg_compression_failure'), "DEBUG", "WARNING");
      }
    }
  };

  const handleKeySelection = async () => {
      if ((window as any).aistudio) {
          await (window as any).aistudio.openSelectKey();
          setHasKey(true);
      }
  };

  return (
    <Modal isOpen={isOpen} onClose={() => { onClose(); resetForm(); }} title={itemToEdit ? t('edit_item') : t('add_item')}>
      <div className="space-y-6 max-h-[85vh] overflow-y-auto no-scrollbar px-2 pb-4">
        
        {addMode === 'CHOICE' && (
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
            <div className="text-center py-4">
              <h3 className="text-sm font-bold text-md-on-surface-variant uppercase tracking-widest mb-2">{t('lbl_inventory_source')}</h3>
              <p className="text-xs text-md-on-surface-variant font-medium px-6 leading-relaxed">{t('msg_choose_input_method')}</p>
              {isAiDisabled && (
                <div className="mt-4 flex flex-col items-center gap-3">
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-md-error-container text-md-on-error-container rounded-full border border-md-error/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-md-error animate-pulse"></span>
                    <p className="text-[11px] font-semibold uppercase tracking-wider">{t('msg_scanner_offline')}</p>
                  </div>
                  <button
                    onClick={handleKeySelection}
                    className="text-xs font-semibold text-md-primary uppercase tracking-wider hover:underline border border-md-outline-variant/50 px-3 py-1 rounded-lg"
                  >
                    {t('btn_select_api_key')}
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4">
              <button
                disabled={isAiDisabled}
                onClick={() => setAddMode('CAMERA')}
                className={`group relative flex items-center p-6 sm:p-8 bg-md-primary-container/25 border-2 border-dashed border-md-primary/30 rounded-3xl hover:border-md-primary hover:bg-md-primary-container/40 transition-all duration-300 text-left ${isAiDisabled ? 'opacity-40 grayscale cursor-not-allowed' : ''}`}
              >
                <div className="w-14 h-14 bg-md-surface-container-lowest rounded-2xl shadow-sm flex items-center justify-center text-md-primary shrink-0 group-hover:scale-105 transition-transform">
                  <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                    <path d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812-1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <circle cx="12" cy="13" r="3" />
                  </svg>
                </div>
                <div className="ml-5">
                  <span className="block text-[11px] font-semibold uppercase tracking-wider text-md-primary mb-0.5">{t('lbl_live_product_sync')}</span>
                  <h4 className="text-lg font-bold text-md-on-surface tracking-tight">{t('btn_use_camera')}</h4>
                </div>
              </button>

              <button
                disabled={isAiDisabled}
                onClick={() => fileInputRef.current?.click()}
                className={`group relative flex items-center p-6 sm:p-8 bg-md-secondary-container/25 border-2 border-dashed border-md-secondary/30 rounded-3xl hover:border-md-secondary hover:bg-md-secondary-container/40 transition-all duration-300 text-left ${isAiDisabled ? 'opacity-40 grayscale cursor-not-allowed' : ''}`}
              >
                <div className="w-14 h-14 bg-md-surface-container-lowest rounded-2xl shadow-sm flex items-center justify-center text-md-secondary shrink-0 group-hover:scale-105 transition-transform">
                  <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                    <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div className="ml-5">
                  <span className="block text-[11px] font-semibold uppercase tracking-wider text-md-secondary mb-0.5">{t('lbl_library_match')}</span>
                  <h4 className="text-lg font-bold text-md-on-surface tracking-tight">{t('btn_upload_picture')}</h4>
                </div>
              </button>
            </div>

            <div className="pt-6 border-t border-md-outline-variant/30 flex justify-center">
              <button
                onClick={() => setAddMode('MANUAL')}
                className="text-xs font-semibold text-md-on-surface-variant hover:text-md-primary uppercase tracking-wider transition-colors border border-md-outline-variant/40 px-4 py-2 rounded-xl"
              >
                &mdash; {t('btn_skip_to_manual')} &mdash;
              </button>
            </div>

            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handlePhotoUpload} />
          </div>
        )}

        {addMode === 'CAMERA' && <CameraCapture onCapture={processImage} onCancel={() => setAddMode('CHOICE')} />}

        {addMode === 'PROCESSING' && (
          <div className="space-y-10 animate-in fade-in duration-300 py-8 px-4">
            <div className="flex flex-col items-center justify-center text-center">
              <div className="w-24 h-24 mb-6 relative">
                <div className="absolute inset-0 bg-md-primary/20 rounded-full animate-ping"></div>
                <div className="relative z-10 w-full h-full flex items-center justify-center bg-md-surface-container-lowest rounded-full shadow-md">
                  <svg className="w-11 h-11 text-md-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-2xl font-bold text-md-on-surface tracking-tight">{progressState.status}</h3>
                <p className="text-xs font-semibold text-md-primary uppercase tracking-widest animate-pulse">{t('msg_establishing_uplink')}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="relative pt-1">
                <div className="flex items-center justify-between mb-3 px-1">
                  <span className="text-xs font-semibold inline-block py-1 px-3 rounded-full text-md-on-primary bg-md-primary shadow-sm">
                    {progressState.percent}{t('lbl_match_percent')}
                  </span>
                  <span className="text-xs font-semibold inline-block text-md-on-surface-variant">
                    {t('lbl_est_remaining').replace('{time}', countdown.toString())}
                  </span>
                </div>
                <div className="overflow-hidden h-3.5 mb-4 flex rounded-full bg-md-surface-container-high p-0.5">
                  <div
                    style={{ width: `${progressState.percent}%` }}
                    className="flex flex-col text-center whitespace-nowrap text-md-on-primary justify-center bg-md-primary rounded-full transition-all duration-700 ease-out relative overflow-hidden"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-[shimmer_2s_infinite]"></div>
                  </div>
                </div>
              </div>
            </div>

            {error && (
              <div className="space-y-4 pt-2 animate-in slide-in-from-top-4">
                <p className="text-md-on-error-container text-center text-xs font-medium leading-relaxed bg-md-error-container p-4 rounded-2xl border border-md-error/30">{error}</p>
                <div className="flex gap-3">
                  <Button variant="outlined" onClick={resetForm} className="flex-1 h-12 rounded-2xl">Retry Manual</Button>
                  {retryImage && (
                    <Button onClick={() => processImage(retryImage)} className="flex-[2] h-12 rounded-2xl">Retry Sync</Button>
                  )}
                </div>
              </div>
            )}

            <style dangerouslySetInnerHTML={{ __html: `
                @keyframes shimmer {
                  0% { transform: translateX(-100%); }
                  100% { transform: translateX(100%); }
                }
            `}} />
          </div>
        )}

        {addMode === 'MANUAL' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-4 animate-in slide-in-from-bottom-2 duration-300">
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-md-on-surface-variant uppercase tracking-wider mb-1.5">{t('category')}</label>
              <select className="w-full bg-md-surface-container-high border border-md-outline-variant/40 rounded-xl px-4 py-2.5 text-sm font-medium text-md-on-surface focus:ring-2 focus:ring-md-primary/30 focus:border-md-primary transition-all outline-none" value={formData.category} onChange={(e) => setFormData({...formData, category: e.target.value as InventoryCategory})}>
                <option value="tools">{t('cat_tools')}</option>
                <option value="insecticide">{t('cat_insecticide')}</option>
                <option value="fertiliser">{t('cat_fertiliser')}</option>
                <option value="seeds">{t('cat_seeds')}</option>
                <option value="soil">{t('cat_soil')}</option>
                <option value="accessories">{t('cat_accessories')}</option>
                <option value="pots">{t('cat_pots')}</option>
                <option value="saucers">{t('cat_saucers')}</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-md-on-surface-variant uppercase tracking-wider mb-1.5">{t('lbl_nickname')}</label>
              <input
                className="w-full bg-md-surface-container-high border border-md-outline-variant/40 rounded-xl px-4 py-2.5 text-sm font-medium text-md-on-surface focus:ring-2 focus:ring-md-primary/30 focus:border-md-primary transition-all outline-none"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                placeholder={t('placeholder_inventory_name')}
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-md-on-surface-variant uppercase tracking-wider mb-1.5">{t('lbl_brand')}</label>
              <input
                className="w-full bg-md-surface-container-high border border-md-outline-variant/40 rounded-xl px-4 py-2.5 text-sm font-medium text-md-on-surface focus:ring-2 focus:ring-md-primary/30 focus:border-md-primary transition-all outline-none"
                value={formData.brand}
                onChange={(e) => setFormData({...formData, brand: e.target.value})}
                placeholder="e.g. Schultz"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-md-on-surface-variant uppercase tracking-wider mb-1.5">{t('lbl_desc')}</label>
              <textarea
                className="w-full bg-md-surface-container-high border border-md-outline-variant/40 rounded-xl px-4 py-2.5 text-sm font-medium text-md-on-surface focus:ring-2 focus:ring-md-primary/30 focus:border-md-primary transition-all outline-none min-h-[80px]"
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                placeholder={t('placeholder_describe_specimen')}
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-md-on-surface-variant uppercase tracking-wider mb-1.5">{t('lbl_usage_instructions')}</label>
              <textarea
                className="w-full bg-md-surface-container-high border border-md-outline-variant/40 rounded-xl px-4 py-2.5 text-sm font-medium text-md-on-surface focus:ring-2 focus:ring-md-primary/30 focus:border-md-primary transition-all outline-none min-h-[80px]"
                value={formData.applicationUsage}
                onChange={(e) => setFormData({...formData, applicationUsage: e.target.value})}
                placeholder={t('placeholder_usage_desc')}
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-md-on-surface-variant uppercase tracking-wider mb-1.5">{t('lbl_instructions')}</label>
              <textarea
                className="w-full bg-md-surface-container-high border border-md-outline-variant/40 rounded-xl px-4 py-2.5 text-sm font-medium text-md-on-surface focus:ring-2 focus:ring-md-primary/30 focus:border-md-primary transition-all outline-none min-h-[80px]"
                value={formData.instructions}
                onChange={(e) => setFormData({...formData, instructions: e.target.value})}
                placeholder={t('placeholder_guide')}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-md-on-surface-variant uppercase tracking-wider mb-1.5">{t('lbl_quantity')}</label>
              <input
                type="number"
                className="w-full bg-md-surface-container-high border border-md-outline-variant/40 rounded-xl px-4 py-2.5 text-sm font-medium text-md-on-surface focus:ring-2 focus:ring-md-primary/30 focus:border-md-primary transition-all outline-none"
                value={formData.quantity}
                onChange={(e) => setFormData({...formData, quantity: parseFloat(e.target.value) || 0})}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-md-on-surface-variant uppercase tracking-wider mb-1.5">{t('lbl_unit')}</label>
              <input
                className="w-full bg-md-surface-container-high border border-md-outline-variant/40 rounded-xl px-4 py-2.5 text-sm font-medium text-md-on-surface focus:ring-2 focus:ring-md-primary/30 focus:border-md-primary transition-all outline-none"
                value={formData.unit}
                onChange={(e) => setFormData({...formData, unit: e.target.value})}
                placeholder={t('placeholder_inventory_unit')}
              />
            </div>

            {(formData.category === 'pots' || formData.category === 'saucers') && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-md-on-surface-variant uppercase tracking-wider mb-1.5">{t('lbl_size_inches')}</label>
                  <input
                    type="number"
                    step="0.1"
                    className="w-full bg-md-surface-container-high border border-md-outline-variant/40 rounded-xl px-4 py-2.5 text-sm font-medium text-md-on-surface focus:ring-2 focus:ring-md-primary/30 focus:border-md-primary transition-all outline-none"
                    value={formData.sizeInches}
                    onChange={(e) => {
                      const val = e.target.value;
                      const cm = val ? (parseFloat(val) * 2.54).toFixed(2) : '';
                      setFormData({...formData, sizeInches: val, sizeCm: cm});
                    }}
                    placeholder="e.g. 6"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-md-on-surface-variant uppercase tracking-wider mb-1.5">{t('lbl_size_cm')}</label>
                  <input
                    type="number"
                    step="0.1"
                    className="w-full bg-md-surface-container-high border border-md-outline-variant/40 rounded-xl px-4 py-2.5 text-sm font-medium text-md-on-surface focus:ring-2 focus:ring-md-primary/30 focus:border-md-primary transition-all outline-none"
                    value={formData.sizeCm}
                    onChange={(e) => {
                      const val = e.target.value;
                      const inches = val ? (parseFloat(val) / 2.54).toFixed(2) : '';
                      setFormData({...formData, sizeCm: val, sizeInches: inches});
                    }}
                    placeholder="e.g. 15"
                  />
                </div>
              </>
            )}

            <div className="md:col-span-2 pt-4 flex gap-3">
              <Button variant="outlined" onClick={resetForm} className="flex-1 h-12 rounded-2xl">{t('btn_return_to_choice')}</Button>
              <Button className="flex-[2] h-12 rounded-2xl" onClick={handleManualSave} isLoading={isSaving}>{t('save')}</Button>
            </div>
          </div>
        )}

        {addMode === 'REVIEW' && identifiedItem && (
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
            <div className="m3-card-elevated rounded-3xl p-6 space-y-5">
              <div className="flex gap-5">
                <div className="w-28 h-28 rounded-2xl overflow-hidden bg-md-surface-container-high shrink-0">
                  {identifiedItem.images && identifiedItem.images[0] ? (
                    <img src={identifiedItem.images[0]} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-md-surface-container-high">
                      <Logo className="w-8 h-8 opacity-20" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="inline-block px-2.5 py-0.5 bg-md-primary-container text-md-on-primary-container text-[11px] font-semibold uppercase tracking-wider rounded-full mb-2">
                    {t(`cat_${identifiedItem.category.replace('-', '_')}`)}
                  </span>
                  <h3 className="text-xl font-bold text-md-on-surface truncate">{lv(identifiedItem.name)}</h3>
                  <p className="text-xs font-semibold text-md-on-surface-variant uppercase tracking-wider">{lv(identifiedItem.brand)}</p>
                  <div className="mt-3 flex items-center gap-4">
                    <div className="flex flex-col">
                      <span className="text-[11px] font-semibold text-md-on-surface-variant uppercase tracking-wider">{t('lbl_quantity')}</span>
                      <span className="text-lg font-bold text-md-on-surface">{identifiedItem.quantity} <span className="text-xs font-medium text-md-on-surface-variant">{identifiedItem.unit}</span></span>
                    </div>
                  </div>
                </div>
              </div>

              {compatiblePlants.length > 0 && (
                <div className="p-4 bg-md-primary-container/25 rounded-2xl border border-md-primary/20">
                  <p className="text-[11px] font-semibold text-md-primary uppercase tracking-wider mb-3">{t('lbl_compatible_with_collection')}</p>
                  <div className="flex flex-wrap gap-2">
                    {compatiblePlants.map(p => (
                      <div key={p.id} className="flex items-center gap-2 bg-md-surface-container-lowest px-2.5 py-1 rounded-lg border border-md-outline-variant/30 shadow-sm">
                        {p.images && p.images[0] ? (
                          <img src={p.images[0]} className="w-5 h-5 rounded-md object-cover" alt="" referrerPolicy="no-referrer" />
                        ) : (
                          <div className="w-5 h-5 rounded-md bg-md-primary-container flex items-center justify-center">
                            <span className="text-[10px] font-bold text-md-on-primary-container">?</span>
                          </div>
                        )}
                        <span className="text-xs font-medium text-md-on-surface">{lv(p.nickname)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <p className="text-xs font-semibold text-md-on-surface-variant uppercase tracking-wider px-1">{t('lbl_desc')}</p>
                <p className="text-xs text-md-on-surface italic leading-relaxed">"{lv(identifiedItem.description)}"</p>
              </div>

              {(identifiedItem.applicationUsage || identifiedItem.instructions) && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-md-on-surface-variant uppercase tracking-wider px-1">{t('lbl_usage_instructions')}</p>
                  <p className="text-xs text-md-on-surface leading-relaxed whitespace-pre-wrap">{lv(identifiedItem.applicationUsage) || lv(identifiedItem.instructions)}</p>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <Button variant="outlined" className="flex-1 h-12 rounded-2xl" onClick={resetForm}>{t('cancel')}</Button>
              <Button
                className="flex-[2] h-12 rounded-2xl"
                onClick={() => {
                  addItem(identifiedItem);
                  onClose();
                  resetForm();
                }}
              >
                {t('btn_confirm_add')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};