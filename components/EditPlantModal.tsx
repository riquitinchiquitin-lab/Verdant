import React, { useState, useEffect, useRef } from 'react';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { Plant } from '../types';
import { useLanguage } from '../context/LanguageContext';
import { usePlants } from '../context/PlantContext';
import { useAuth } from '../context/AuthContext';
import { translateInput, translateArrayInput, translateObjectInput } from '../services/translationService';
import { refreshPlantRecord } from '../services/plantAi';
import { RefreshCw, Trash2 } from 'lucide-react';
import { CameraCapture } from './ui/CameraCapture';
import { compressImage } from '../services/imageUtils';
import { ROOM_TYPES, CURRENCIES, getCurrencyForLanguage } from '../constants';
import { inferPlantCategory } from '../utils/botanicalCategory';

interface EditPlantModalProps {
  isOpen: boolean;
  onClose: () => void;
  plant: Plant;
  onSave: (id: string, updates: Partial<Plant>) => void;
  onDelete: () => void;
}

export const EditPlantModal: React.FC<EditPlantModalProps> = ({ isOpen, onClose, plant, onSave, onDelete }) => {
  const { t, lv, lva, language } = useLanguage();
  const { houses, getEffectiveApiKey } = usePlants();
  const { user } = useAuth();
  
  const [nickname, setNickname] = useState('');
  const [room, setRoom] = useState('');
  const [houseId, setHouseId] = useState<string | null>(null);
  const [wateringInterval, setWateringInterval] = useState<number | null>(null);
  const [lastWatered, setLastWatered] = useState<string | null>(null);
  const [targetPh, setTargetPh] = useState<number | null>(null);
  const [targetEc, setTargetEc] = useState<number | null>(null);
  const [targetVpd, setTargetVpd] = useState<number | null>(null);
  const [targetDli, setTargetDli] = useState<number | null>(null);
  const [category, setCategory] = useState('');
  const [growthRate, setGrowthRate] = useState('');
  const [repottingFrequency, setRepottingFrequency] = useState<number | null>(null);
  const [lastPotSize, setLastPotSize] = useState('');
  const [lastPotSizeInches, setLastPotSizeInches] = useState<number | null>(null);
  const [lastPotSizeCm, setLastPotSizeCm] = useState<number | null>(null);
  const [rotationFrequency, setRotationFrequency] = useState<number | null>(null);
  const [lastRotated, setLastRotated] = useState<string | null>(null);
  const [propagationMethods, setPropagationMethods] = useState('');
  const [propagationInstructions, setPropagationInstructions] = useState('');
  const [repottingInstructions, setRepottingInstructions] = useState('');
  const [nursery, setNursery] = useState('');
  const [dateOfPurchase, setDateOfPurchase] = useState('');
  const [cost, setCost] = useState<number | null>(null);
  const [currency, setCurrency] = useState('USD');
  const [images, setImages] = useState<string[]>([]);
  const [isCustom, setIsCustom] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshedData, setRefreshedData] = useState<Partial<Plant> | null>(null);
  const [isAddingImage, setIsAddingImage] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);

  // LOGIC: If a plant has no house, only Owner or CEO can assign it to one.
  const isUnattributed = !plant.houseId;
  const isAdmin = user?.role === 'OWNER' || user?.role === 'CO_CEO';
  const canTransfer = !isUnattributed || isAdmin;

  const lastInitKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
        lastInitKeyRef.current = null;
        return;
    }
    const initKey = `${plant.id}`;
    if (lastInitKeyRef.current === initKey) return;
    lastInitKeyRef.current = initKey;

    const currentNickname = lv(plant.nickname);
    const currentRoom = lv(plant.room as any);
    setNickname(currentNickname);
    setRoom(currentRoom);
    const initialCategory = lv(plant.category as any);
    if (initialCategory && initialCategory.trim()) {
      setCategory(initialCategory);
    } else {
      const autoInferred = inferPlantCategory(plant);
      setCategory(lv(autoInferred as any) || '');
    }
    setGrowthRate(lv(plant.growthRate as any));
    setHouseId(plant.houseId || null);
    setWateringInterval(plant.wateringInterval || null);
    setLastWatered(plant.lastWatered || null);
    setTargetPh(plant.targetPh || null);
    setTargetEc(plant.targetEc || null);
    setTargetVpd(plant.targetVpd || null);
    setTargetDli(plant.targetDli || null);
    setRepottingFrequency(plant.repottingFrequency || null);
    setLastPotSize(plant.lastPotSize ? plant.lastPotSize.toString().replace(/cm$/i, '').trim() : '');
    setLastPotSizeInches(plant.lastPotSizeInches || null);
    setLastPotSizeCm(plant.lastPotSizeCm || null);
    setRotationFrequency(plant.rotationFrequency || null);
    setLastRotated(plant.lastRotated || null);
    setPropagationMethods(lva(plant.propagationMethods as any)?.join(', ') || '');
    setPropagationInstructions(lv(plant.propagationInstructions));
    setRepottingInstructions(lv(plant.repottingInstructions));
    setNursery(plant.provenance?.nursery || '');
    setDateOfPurchase(plant.provenance?.dateOfPurchase || '');
    setCost(plant.provenance?.cost || null);
    setCurrency(plant.provenance?.currency || getCurrencyForLanguage(language));
    setImages(plant.images || []);
    setRefreshedData(null);
    setError(null);
    setRefreshSuccess(null);
    const isPredefined = ROOM_TYPES.includes(currentRoom);
    setIsCustom(!!currentRoom && !isPredefined);
  }, [isOpen, plant, lv, lva, language]);

  const [refreshSuccess, setRefreshSuccess] = useState<string | null>(null);

  const handleRefreshData = async () => {
    setIsRefreshing(true);
    setError(null);
    setRefreshSuccess(null);
    try {
        const apiKey = getEffectiveApiKey();
        const details = await refreshPlantRecord(plant, apiKey);
        setRefreshedData(details);

        // Update local states with refreshed data for immediate UI feedback
        if (!nickname && details.nickname) setNickname(lv(details.nickname));
        const refreshedCategory = details.category
          ? lv(details.category as any)
          : lv(inferPlantCategory({ ...plant, ...details }) as any);
        if (refreshedCategory) setCategory(refreshedCategory);
        if (details.growthRate) setGrowthRate(lv(details.growthRate as any));
        if (details.wateringInterval) setWateringInterval(details.wateringInterval);
        if (details.targetPh) setTargetPh(details.targetPh);
        if (details.targetEc) setTargetEc(details.targetEc);
        if (details.targetVpd) setTargetVpd(details.targetVpd);
        if (details.targetDli) setTargetDli(details.targetDli);
        if (details.repottingFrequency) setRepottingFrequency(details.repottingFrequency);
        if (details.propagationMethods) setPropagationMethods(lva(details.propagationMethods as any)?.join(', ') || '');
        if (details.propagationInstructions) setPropagationInstructions(lv(details.propagationInstructions));
        if (details.repottingInstructions) setRepottingInstructions(lv(details.repottingInstructions));
        if (!nursery && details.origin) {
            setNursery(lv(details.origin));
        }

        setRefreshSuccess('Botanical data refreshed. Review changes and click Save.');
    } catch (e: any) {
        console.error(`[UI] Botanical data refresh failed:`, e);
        setError(e?.message || 'Refresh failed');
    } finally {
        setIsRefreshing(false);
    }
  };

  const handleSave = async () => {
      setIsSaving(true);
      setError(null);
      try {
          const apiKey = getEffectiveApiKey();

          const needsTranslation = (current: string, original: any) => {
              const originalStr = lv(original);
              return current.trim() !== originalStr.trim();
          };

          // Batch all translations into a single API call to avoid sequential queue delays
          const toTranslate: Record<string, string> = {};
          if (needsTranslation(nickname, plant.nickname)) toTranslate.nickname = nickname;
          if (needsTranslation(category, plant.category)) toTranslate.category = category;
          if (needsTranslation(growthRate, plant.growthRate)) toTranslate.growthRate = growthRate;
          if (needsTranslation(propagationInstructions, plant.propagationInstructions)) toTranslate.propagationInstructions = propagationInstructions;
          if (needsTranslation(repottingInstructions, plant.repottingInstructions)) toTranslate.repottingInstructions = repottingInstructions;
          
          const propMethodsStr = propagationMethods.split(',').map(s => s.trim()).filter(Boolean).join(', ');
          const originalPropMethodsStr = lva(plant.propagationMethods).join(', ');
          if (propMethodsStr !== originalPropMethodsStr) toTranslate.propagationMethods = propMethodsStr;

          if (isCustom && room.trim() !== '' && room.trim() !== lv(plant.room as any).trim()) toTranslate.room = room;

          const batchResults = await translateObjectInput(toTranslate, 'en', apiKey);

          const safeRefreshed = refreshedData
            ? (({ id: _id, logs: _logs, createdAt: _ca, updatedAt: _ua, images: _imgs, houseId: _hid, ...rest }) => rest)(refreshedData)
            : {};

          const finalUpdates: Partial<Plant> = { 
              ...safeRefreshed,
              species: plant.species,
              nickname: batchResults.nickname || safeRefreshed.nickname || plant.nickname, 
              room: batchResults.room ? batchResults.room : (room.trim() ? room.trim() : null),
              category: category.trim()
                ? (batchResults.category || inferPlantCategory({ ...plant, category: category.trim() }))
                : (safeRefreshed.category || plant.category || inferPlantCategory(plant)),
              growthRate: batchResults.growthRate || safeRefreshed.growthRate || plant.growthRate,
              houseId: houseId,
              wateringInterval: wateringInterval,
              lastWatered: lastWatered,
              targetPh,
              targetEc,
              targetVpd,
              targetDli,
              repottingFrequency,
              lastPotSize,
              lastPotSizeInches,
              lastPotSizeCm,
              rotationFrequency,
              lastRotated,
              propagationMethods: batchResults.propagationMethods ? 
                  Object.keys(batchResults.propagationMethods).reduce((acc, lang) => {
                      acc[lang] = (batchResults.propagationMethods as any)[lang].split(',').map((s: string) => s.trim()).filter(Boolean);
                      return acc;
                  }, {} as any)
                  : (safeRefreshed.propagationMethods || plant.propagationMethods),
              propagationInstructions: batchResults.propagationInstructions || safeRefreshed.propagationInstructions || plant.propagationInstructions,
              repottingInstructions: batchResults.repottingInstructions || safeRefreshed.repottingInstructions || plant.repottingInstructions,
              images,
              provenance: {
                  nursery,
                  dateOfPurchase,
                  cost: cost ?? undefined,
                  currency
              }
          };

          await onSave(plant.id, finalUpdates);
          onClose();
      } catch (e: any) {
          console.error("[EditPlantModal] Save failed:", e);
          setError(e.message || "Save failed");
      } finally {
          setIsSaving(false);
      }
  };

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const value = e.target.value;
      if (value === 'CUSTOM_OPTION') {
          setIsCustom(true);
          setRoom('');
      } else {
          setIsCustom(false);
          setRoom(value);
      }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('edit_plant')}>
      <div className="space-y-6 max-h-[80vh] overflow-y-auto no-scrollbar px-1">
          {error && (
              <div className="p-4 bg-md-error-container border border-md-error/30 rounded-2xl">
                  <p className="text-xs font-semibold text-md-on-error-container leading-tight">
                      ⚠️ {error}
                  </p>
              </div>
          )}
          <div>
              <label className="block text-xs font-semibold text-md-on-surface-variant uppercase tracking-wider mb-1.5 px-1">{t('lbl_nickname')}</label>
              <input
                  type="text"
                  className="w-full h-12 px-4 border border-md-outline-variant/50 rounded-2xl outline-none focus:ring-2 focus:ring-md-primary/30 focus:border-md-primary bg-md-surface-container-high text-md-on-surface font-medium transition-all"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
              />
          </div>

          <div>
              <label className="block text-xs font-semibold text-md-on-surface-variant uppercase tracking-wider mb-1.5 px-1">{t('primary_command_site')}</label>
              <div className="relative">
                <select
                    disabled={!canTransfer}
                    className={`w-full h-12 px-4 border border-md-outline-variant/50 rounded-2xl outline-none focus:ring-2 focus:ring-md-primary/30 focus:border-md-primary bg-md-surface-container-high text-md-on-surface font-medium appearance-none transition-opacity ${!canTransfer ? 'opacity-50 grayscale cursor-not-allowed' : ''}`}
                    value={houseId || ''}
                    onChange={e => setHouseId(e.target.value || null)}
                >
                    <option value="">{t('unassigned_location_label')}</option>
                    {houses.map(h => <option key={h.id} value={h.id}>{lv(h.name)}</option>)}
                </select>
                {!canTransfer && (
                    <div className="mt-2 p-3 bg-md-tertiary-container/40 rounded-xl border border-md-tertiary/30">
                        <p className="text-xs font-medium text-md-on-tertiary-container leading-tight">
                            ⚠️ {t('msg_admin_transfer_only')}
                        </p>
                    </div>
                )}
              </div>
          </div>

          <div>
              <label className="block text-xs font-semibold text-md-on-surface-variant uppercase tracking-wider mb-1.5 px-1">{t('lbl_category')}</label>
              <input
                  type="text"
                  className="w-full h-12 px-4 border border-md-outline-variant/50 rounded-2xl outline-none focus:ring-2 focus:ring-md-primary/30 focus:border-md-primary bg-md-surface-container-high text-md-on-surface font-medium transition-all"
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  placeholder={t('placeholder_category')}
              />
          </div>

          <div>
              <label className="block text-xs font-semibold text-md-on-surface-variant uppercase tracking-wider mb-1.5 px-1">{t('lbl_growth_rate')}</label>
              <input
                  type="text"
                  className="w-full h-12 px-4 border border-md-outline-variant/50 rounded-2xl outline-none focus:ring-2 focus:ring-md-primary/30 focus:border-md-primary bg-md-surface-container-high text-md-on-surface font-medium transition-all"
                  value={growthRate}
                  onChange={e => setGrowthRate(e.target.value)}
                  placeholder={t('growth_moderate_fast')}
              />
          </div>

          <div>
              <label className="block text-xs font-semibold text-md-on-surface-variant uppercase tracking-wider mb-1.5 px-1">{t('lbl_room')}</label>
              <select
                  className="w-full h-12 px-4 border border-md-outline-variant/50 rounded-2xl outline-none focus:ring-2 focus:ring-md-primary/30 focus:border-md-primary bg-md-surface-container-high text-md-on-surface font-medium appearance-none transition-all"
                  value={isCustom ? 'CUSTOM_OPTION' : room}
                  onChange={handleSelectChange}
              >
                  <option value="">{t('assign_room_label')}</option>
                  {ROOM_TYPES.map(r => (
                      <option key={r} value={r}>{r}</option>
                  ))}
                  <option value="CUSTOM_OPTION">{t('other_room')}</option>
              </select>

              {isCustom && (
                  <div className="mt-3 animate-in fade-in slide-in-from-top-1 duration-200">
                      <input
                          type="text"
                          placeholder={t('enter_custom_room')}
                          className="w-full h-12 px-4 border border-md-primary/40 rounded-2xl outline-none focus:ring-2 focus:ring-md-primary/30 bg-md-primary-container/20 text-md-on-surface font-medium"
                          value={room}
                          onChange={(e) => setRoom(e.target.value)}
                          autoFocus
                      />
                  </div>
              )}
          </div>

          <div className="grid grid-cols-2 gap-4">
              <div>
                  <label className="block text-xs font-semibold text-md-on-surface-variant uppercase tracking-wider mb-1.5 px-1">{t('lbl_hydration_interval_days')}</label>
                  <input
                      type="number"
                      className="w-full h-12 px-4 border border-md-outline-variant/50 rounded-2xl outline-none focus:ring-2 focus:ring-md-primary/30 focus:border-md-primary bg-md-surface-container-high text-md-on-surface font-medium transition-all"
                      value={wateringInterval || ''}
                      onChange={(e) => setWateringInterval(parseInt(e.target.value) || null)}
                      placeholder={t('placeholder_days')}
                  />
              </div>
              <div>
                  <label className="block text-xs font-semibold text-md-on-surface-variant uppercase tracking-wider mb-1.5 px-1">{t('lbl_last_watered_date')}</label>
                  <input
                      type="date"
                      className="w-full h-12 px-4 border border-md-outline-variant/50 rounded-2xl outline-none focus:ring-2 focus:ring-md-primary/30 focus:border-md-primary bg-md-surface-container-high text-md-on-surface font-medium transition-all"
                      value={lastWatered ? lastWatered.split('T')[0] : ''}
                      onChange={(e) => setLastWatered(e.target.value || null)}
                  />
              </div>
          </div>

          <div className="pt-6 border-t border-md-outline-variant/30">
              <h3 className="text-xs font-bold text-md-primary uppercase tracking-wider mb-4">{t('lbl_specimen_documentation')}</h3>
              <div className="grid grid-cols-3 gap-4 mb-4">
                  {images.map((img, idx) => (
                      <div key={idx} className="relative aspect-square rounded-2xl overflow-hidden group border border-md-outline-variant/40">
                          <img src={img} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          <button
                            type="button"
                            onClick={() => setImages(prev => prev.filter((_, i) => i !== idx))}
                            className="absolute top-2 right-2 w-8 h-8 bg-md-error text-md-on-error rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                          {idx === 0 && (
                              <div className="absolute bottom-0 left-0 right-0 bg-md-primary/90 text-md-on-primary text-[10px] font-semibold uppercase tracking-wider py-1 text-center">
                                  {t('lbl_primary')}
                              </div>
                          )}
                          {idx > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                    const newImages = [...images];
                                    const [moved] = newImages.splice(idx, 1);
                                    newImages.unshift(moved);
                                    setImages(newImages);
                                }}
                                className="absolute bottom-2 left-2 px-2 py-1 bg-md-surface-container-lowest/90 text-md-on-surface text-[10px] font-semibold uppercase tracking-wider rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                {t('btn_set_primary')}
                              </button>
                          )}
                      </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = 'image/*';
                        input.onchange = async (e) => {
                            const file = (e.target as HTMLInputElement).files?.[0];
                            if (file) {
                                const base64 = await compressImage(file);
                                setImages(prev => [...prev, base64]);
                            }
                        };
                        input.click();
                    }}
                    className="aspect-square rounded-2xl border-2 border-dashed border-md-outline-variant/50 flex flex-col items-center justify-center text-md-on-surface-variant hover:border-md-primary hover:text-md-primary transition-all"
                  >
                      <svg className="w-7 h-7 mb-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                      <span className="text-[11px] font-semibold uppercase tracking-wider">{t('btn_add_photo')}</span>
                  </button>
              </div>
          </div>

          <div className="pt-6 border-t border-md-outline-variant/30">
              <h3 className="text-xs font-bold text-md-primary uppercase tracking-wider mb-4">{t('lbl_advanced_technical_metrics')}</h3>
              <div className="grid grid-cols-2 gap-4">
                  <div>
                      <label className="block text-xs font-semibold text-md-on-surface-variant uppercase tracking-wider mb-1.5 px-1">{t('lbl_target_ph')}</label>
                      <input type="number" step="0.1" className="w-full h-12 px-4 border border-md-outline-variant/50 rounded-2xl outline-none focus:ring-2 focus:ring-md-primary/30 focus:border-md-primary bg-md-surface-container-high text-md-on-surface font-medium transition-all" value={targetPh || ''} onChange={e => setTargetPh(parseFloat(e.target.value) || null)} />
                  </div>
                  <div>
                      <label className="block text-xs font-semibold text-md-on-surface-variant uppercase tracking-wider mb-1.5 px-1">{t('lbl_target_ec_unit')}</label>
                      <input type="number" step="0.1" className="w-full h-12 px-4 border border-md-outline-variant/50 rounded-2xl outline-none focus:ring-2 focus:ring-md-primary/30 focus:border-md-primary bg-md-surface-container-high text-md-on-surface font-medium transition-all" value={targetEc || ''} onChange={e => setTargetEc(parseFloat(e.target.value) || null)} />
                  </div>
                  <div>
                      <label className="block text-xs font-semibold text-md-on-surface-variant uppercase tracking-wider mb-1.5 px-1">{t('lbl_target_vpd_unit')}</label>
                      <input type="number" step="0.1" className="w-full h-12 px-4 border border-md-outline-variant/50 rounded-2xl outline-none focus:ring-2 focus:ring-md-primary/30 focus:border-md-primary bg-md-surface-container-high text-md-on-surface font-medium transition-all" value={targetVpd || ''} onChange={e => setTargetVpd(parseFloat(e.target.value) || null)} />
                  </div>
                  <div>
                      <label className="block text-xs font-semibold text-md-on-surface-variant uppercase tracking-wider mb-1.5 px-1">{t('lbl_target_dli_unit')}</label>
                      <input type="number" step="0.1" className="w-full h-12 px-4 border border-md-outline-variant/50 rounded-2xl outline-none focus:ring-2 focus:ring-md-primary/30 focus:border-md-primary bg-md-surface-container-high text-md-on-surface font-medium transition-all" value={targetDli || ''} onChange={e => setTargetDli(parseFloat(e.target.value) || null)} />
                  </div>
              </div>
          </div>

          <div className="pt-6 border-t border-md-outline-variant/30">
              <h3 className="text-xs font-bold text-md-primary uppercase tracking-wider mb-4">{t('lbl_lifecycle_phenology')}</h3>
              <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                      <div>
                          <label className="block text-xs font-semibold text-md-on-surface-variant uppercase tracking-wider mb-1.5 px-1">{t('lbl_repot_frequency')}</label>
                          <input type="number" className="w-full h-12 px-4 border border-md-outline-variant/50 rounded-2xl outline-none focus:ring-2 focus:ring-md-primary/30 focus:border-md-primary bg-md-surface-container-high text-md-on-surface font-medium transition-all" value={repottingFrequency || ''} onChange={e => setRepottingFrequency(parseInt(e.target.value) || null)} />
                      </div>
                      <div className="space-y-4">
                          <div>
                              <label className="block text-xs font-semibold text-md-on-surface-variant uppercase tracking-wider mb-1.5 px-1">{t('lbl_size_cm')}</label>
                              <input
                                  type="number"
                                  className="w-full h-12 px-4 border border-md-outline-variant/50 rounded-2xl outline-none focus:ring-2 focus:ring-md-primary/30 focus:border-md-primary bg-md-surface-container-high text-md-on-surface font-medium transition-all"
                                  value={lastPotSizeCm || ''}
                                  onChange={e => {
                                      const val = parseFloat(e.target.value) || null;
                                      setLastPotSizeCm(val);
                                      if (val) {
                                          setLastPotSizeInches(Number((val / 2.54).toFixed(2)));
                                          setLastPotSize(val.toString());
                                      } else {
                                          setLastPotSizeInches(null);
                                          setLastPotSize('');
                                      }
                                  }}
                                  placeholder="cm"
                              />
                          </div>
                          <div>
                              <label className="block text-xs font-semibold text-md-on-surface-variant uppercase tracking-wider mb-1.5 px-1">{t('lbl_size_inches')}</label>
                              <input
                                  type="number"
                                  className="w-full h-12 px-4 border border-md-outline-variant/50 rounded-2xl outline-none focus:ring-2 focus:ring-md-primary/30 focus:border-md-primary bg-md-surface-container-high text-md-on-surface font-medium transition-all"
                                  value={lastPotSizeInches || ''}
                                  onChange={e => {
                                      const val = parseFloat(e.target.value) || null;
                                      setLastPotSizeInches(val);
                                      if (val) {
                                          const cm = Number((val * 2.54).toFixed(2));
                                          setLastPotSizeCm(cm);
                                          setLastPotSize(cm.toString());
                                      } else {
                                          setLastPotSizeCm(null);
                                          setLastPotSize('');
                                      }
                                  }}
                                  placeholder="inches"
                              />
                          </div>
                      </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                      <div>
                          <label className="block text-xs font-semibold text-md-on-surface-variant uppercase tracking-wider mb-1.5 px-1">{t('lbl_rotation_frequency')}</label>
                          <input type="number" className="w-full h-12 px-4 border border-md-outline-variant/50 rounded-2xl outline-none focus:ring-2 focus:ring-md-primary/30 focus:border-md-primary bg-md-surface-container-high text-md-on-surface font-medium transition-all" value={rotationFrequency || ''} onChange={e => setRotationFrequency(parseInt(e.target.value) || null)} />
                      </div>
                      <div>
                          <label className="block text-xs font-semibold text-md-on-surface-variant uppercase tracking-wider mb-1.5 px-1">{t('lbl_last_rotated')}</label>
                          <input type="date" className="w-full h-12 px-4 border border-md-outline-variant/50 rounded-2xl outline-none focus:ring-2 focus:ring-md-primary/30 focus:border-md-primary bg-md-surface-container-high text-md-on-surface font-medium transition-all" value={lastRotated ? lastRotated.split('T')[0] : ''} onChange={e => setLastRotated(e.target.value || null)} />
                      </div>
                  </div>
                  <div>
                      <label className="block text-xs font-semibold text-md-on-surface-variant uppercase tracking-wider mb-1.5 px-1">{t('lbl_propagation_methods')}</label>
                      <input type="text" className="w-full h-12 px-4 border border-md-outline-variant/50 rounded-2xl outline-none focus:ring-2 focus:ring-md-primary/30 focus:border-md-primary bg-md-surface-container-high text-md-on-surface font-medium transition-all" value={propagationMethods} onChange={e => setPropagationMethods(e.target.value)} placeholder={t('placeholder_propagation_methods')} />
                  </div>
                  <div>
                      <label className="block text-xs font-semibold text-md-on-surface-variant uppercase tracking-wider mb-1.5 px-1">{t('lbl_propagation_instructions')}</label>
                      <textarea
                          className="w-full p-4 border border-md-outline-variant/50 rounded-2xl outline-none focus:ring-2 focus:ring-md-primary/30 focus:border-md-primary bg-md-surface-container-high text-md-on-surface text-sm min-h-[110px]"
                          value={propagationInstructions}
                          onChange={e => setPropagationInstructions(e.target.value)}
                          placeholder="Step-by-step guide..."
                      />
                  </div>
                  <div>
                      <label className="block text-xs font-semibold text-md-on-surface-variant uppercase tracking-wider mb-1.5 px-1">{t('lbl_repotting_instructions')}</label>
                      <textarea
                          className="w-full p-4 border border-md-outline-variant/50 rounded-2xl outline-none focus:ring-2 focus:ring-md-primary/30 focus:border-md-primary bg-md-surface-container-high text-md-on-surface text-sm min-h-[110px]"
                          value={repottingInstructions}
                          onChange={e => setRepottingInstructions(e.target.value)}
                          placeholder="Step-by-step guide..."
                      />
                  </div>
              </div>
          </div>

          <div className="pt-6 border-t border-md-outline-variant/30">
              <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xs font-bold text-md-primary uppercase tracking-wider">{t('lbl_provenance_history')}</h3>
              </div>
              <div className="space-y-4">
                  <div>
                      <label className="block text-xs font-semibold text-md-on-surface-variant uppercase tracking-wider mb-1.5 px-1">{t('lbl_nursery_origin')}</label>
                      <input
                          type="text"
                          value={nursery}
                          onChange={e => setNursery(e.target.value)}
                          className="w-full h-12 px-4 border border-md-outline-variant/50 rounded-2xl outline-none focus:ring-2 focus:ring-md-primary/30 focus:border-md-primary bg-md-surface-container-high text-md-on-surface font-medium transition-all"
                          placeholder={t('lbl_nursery_origin')}
                      />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                      <div>
                          <label className="block text-xs font-semibold text-md-on-surface-variant uppercase tracking-wider mb-1.5 px-1">{t('lbl_acquisition_date')}</label>
                          <input type="date" className="w-full h-12 px-4 border border-md-outline-variant/50 rounded-2xl outline-none focus:ring-2 focus:ring-md-primary/30 focus:border-md-primary bg-md-surface-container-high text-md-on-surface font-medium transition-all" value={dateOfPurchase} onChange={e => setDateOfPurchase(e.target.value)} />
                      </div>
                      <div className="flex gap-3">
                           <div className="flex-[3]">
                               <label className="block text-xs font-semibold text-md-on-surface-variant uppercase tracking-wider mb-1.5 px-1">{t('lbl_cost')}</label>
                               <input type="number" className="w-full h-12 px-4 border border-md-outline-variant/50 rounded-2xl outline-none focus:ring-2 focus:ring-md-primary/30 focus:border-md-primary bg-md-surface-container-high text-md-on-surface font-medium transition-all" value={cost || ''} onChange={e => setCost(parseFloat(e.target.value) || null)} />
                           </div>
                           <div className="flex-1 min-w-[100px]">
                               <label className="block text-xs font-semibold text-md-on-surface-variant uppercase tracking-wider mb-1.5 px-1">{t('lbl_ccy')}</label>
                               <select
                                   className="w-full h-12 px-4 border border-md-outline-variant/50 rounded-2xl outline-none focus:ring-2 focus:ring-md-primary/30 focus:border-md-primary bg-md-surface-container-high text-md-on-surface font-medium appearance-none transition-all"
                                   value={currency}
                                   onChange={e => setCurrency(e.target.value)}
                               >
                                   {CURRENCIES.map(c => (
                                       <option key={c.code} value={c.code}>{c.code} ({c.symbol})</option>
                                   ))}
                               </select>
                           </div>
                      </div>
                  </div>
              </div>
          </div>

          {(error || refreshSuccess) && (
              <div className={`p-3.5 rounded-2xl border text-xs font-semibold leading-tight ${
                error
                  ? 'bg-md-error-container border-md-error/30 text-md-on-error-container'
                  : 'bg-md-primary-container border-md-primary/30 text-md-on-primary-container'
              }`}>
                {error ? `⚠️ ${error}` : `✓ ${refreshSuccess}`}
              </div>
          )}

          <div className="flex items-center gap-3 pt-4">
              <Button
                type="button"
                onClick={handleRefreshData}
                variant="tonal"
                className="w-12 h-12 px-0 rounded-2xl flex items-center justify-center shrink-0"
                disabled={isSaving || isRefreshing}
                title={t('btn_refresh_ai') || 'Refresh Botanical Data'}
                aria-label={t('btn_refresh_ai') || 'Refresh Botanical Data'}
              >
                <RefreshCw className={`w-5 h-5 shrink-0 ${isRefreshing ? 'animate-spin' : ''}`} />
              </Button>
              <Button
                type="button"
                onClick={onDelete}
                variant="danger"
                className="w-12 h-12 px-0 rounded-2xl flex items-center justify-center shrink-0"
                disabled={isSaving || isRefreshing}
                title={t('btn_delete') || 'Delete'}
                aria-label={t('btn_delete') || 'Delete'}
              >
                <Trash2 className="w-5 h-5 shrink-0" />
              </Button>
              <Button type="button" variant="ghost" className="flex-1 h-12 rounded-2xl" onClick={onClose} disabled={isSaving || isRefreshing}>{t('cancel')}</Button>
              <Button type="button" className="flex-[2] h-12 rounded-2xl" onClick={handleSave} isLoading={isSaving} disabled={isRefreshing}>{t('btn_save_changes')}</Button>
          </div>
      </div>
    </Modal>
  );
};