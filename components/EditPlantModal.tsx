import React, { useState, useEffect } from 'react';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { Plant } from '../types';
import { useLanguage } from '../context/LanguageContext';
import { usePlants } from '../context/PlantContext';
import { useAuth } from '../context/AuthContext';
import { translateInput, translateArrayInput } from '../services/translationService';
import { generatePlantDetails } from '../services/plantAi';
import { ROOM_TYPES } from '../constants';

interface EditPlantModalProps {
  isOpen: boolean;
  onClose: () => void;
  plant: Plant;
  onSave: (id: string, updates: Partial<Plant>) => void;
  onDelete: () => void;
}

export const EditPlantModal: React.FC<EditPlantModalProps> = ({ isOpen, onClose, plant, onSave, onDelete }) => {
  const { t, lv, lva } = useLanguage();
  const { houses, getEffectiveApiKey } = usePlants();
  const { user } = useAuth();
  
  const [nickname, setNickname] = useState('');
  const [room, setRoom] = useState('');
  const [houseId, setHouseId] = useState<string | null>(null);
  const [wateringInterval, setWateringInterval] = useState<number | null>(null);
  const [targetPh, setTargetPh] = useState<number | null>(null);
  const [targetEc, setTargetEc] = useState<number | null>(null);
  const [targetVpd, setTargetVpd] = useState<number | null>(null);
  const [targetDli, setTargetDli] = useState<number | null>(null);
  const [category, setCategory] = useState('');
  const [growthRate, setGrowthRate] = useState('');
  const [repottingFrequency, setRepottingFrequency] = useState<number | null>(null);
  const [lastPotSize, setLastPotSize] = useState('');
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
  const [refreshedData, setRefreshedData] = useState<Partial<Plant> | null>(null);
  const [isAddingImage, setIsAddingImage] = useState(false);

  // LOGIC: If a plant has no house, only Owner or CEO can assign it to one.
  const isUnattributed = !plant.houseId;
  const isAdmin = user?.role === 'OWNER' || user?.role === 'CO_CEO';
  const canTransfer = !isUnattributed || isAdmin;

  useEffect(() => {
    if (isOpen) {
        const currentNickname = lv(plant.nickname);
        const currentRoom = lv(plant.room as any);
        setNickname(currentNickname);
        setRoom(currentRoom);
        setCategory(lv(plant.category as any));
        setGrowthRate(lv(plant.growthRate as any));
        setHouseId(plant.houseId || null);
        setWateringInterval(plant.wateringInterval || null);
        setTargetPh(plant.targetPh || null);
        setTargetEc(plant.targetEc || null);
        setTargetVpd(plant.targetVpd || null);
        setTargetDli(plant.targetDli || null);
        setRepottingFrequency(plant.repottingFrequency || null);
        setLastPotSize(plant.lastPotSize || '');
        setRotationFrequency(plant.rotationFrequency || null);
        setLastRotated(plant.lastRotated || null);
        setPropagationMethods(lva(plant.propagationMethods as any)?.join(', ') || '');
        setPropagationInstructions(lv(plant.propagationInstructions));
        setRepottingInstructions(lv(plant.repottingInstructions));
        setNursery(plant.provenance?.nursery || '');
        setDateOfPurchase(plant.provenance?.dateOfPurchase || '');
        setCost(plant.provenance?.cost || null);
        setCurrency(plant.provenance?.currency || 'USD');
        setImages(plant.images || []);
        const isPredefined = ROOM_TYPES.includes(currentRoom);
        setIsCustom(!!currentRoom && !isPredefined);
    }
  }, [isOpen, plant, lv, lva]);

  const handleRefreshData = async () => {
    if (!plant.species) return;
    setIsRefreshing(true);
    try {
        const apiKey = getEffectiveApiKey();
        const details = await generatePlantDetails(plant.species, undefined, undefined, apiKey);
        
        setRefreshedData(details);

        // Update local states with new AI data for immediate UI feedback
        setNickname(lv(details.nickname));
        setCategory(lv(details.category as any));
        setGrowthRate(lv(details.growthRate as any));
        setWateringInterval(details.wateringInterval || null);
        setTargetPh(details.targetPh || null);
        setTargetEc(details.targetEc || null);
        setTargetVpd(details.targetVpd || null);
        setTargetDli(details.targetDli || null);
        setRepottingFrequency(details.repottingFrequency || null);
        setPropagationMethods(lva(details.propagationMethods as any)?.join(', ') || '');
        setPropagationInstructions(lv(details.propagationInstructions));
        setRepottingInstructions(lv(details.repottingInstructions));
        
    } catch (e) {
        console.error("Refresh failed:", e);
    } finally {
        setIsRefreshing(false);
    }
  };

  const handleSave = async () => {
      setIsSaving(true);
      try {
          const apiKey = getEffectiveApiKey();
          const nicknameObj = await translateInput(nickname, 'en', apiKey);
          const categoryObj = await translateInput(category, 'en', apiKey);
          const growthRateObj = await translateInput(growthRate, 'en', apiKey);
          const propagationInstructionsObj = await translateInput(propagationInstructions, 'en', apiKey);
          const repottingInstructionsObj = await translateInput(repottingInstructions, 'en', apiKey);
          const propagationMethodsObj = await translateArrayInput(propagationMethods.split(',').map(s => s.trim()).filter(Boolean), 'en', apiKey);
          
          let roomResult: any = room;
          if (isCustom && room.trim() !== '') {
            roomResult = await translateInput(room, 'en', apiKey);
          } else if (!room) {
            roomResult = null;
          }

          onSave(plant.id, { 
              ...refreshedData,
              nickname: nicknameObj, 
              room: roomResult,
              category: categoryObj,
              growthRate: growthRateObj,
              houseId: houseId,
              wateringInterval: wateringInterval,
              targetPh,
              targetEc,
              targetVpd,
              targetDli,
              repottingFrequency,
              lastPotSize,
              rotationFrequency,
              lastRotated,
              propagationMethods: propagationMethodsObj,
              propagationInstructions: propagationInstructionsObj,
              repottingInstructions: repottingInstructionsObj,
              images,
              provenance: {
                  nursery,
                  dateOfPurchase,
                  cost: cost ?? undefined,
                  currency
              }
          });
          onClose();
      } catch (e) {
          console.error(e);
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
          <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 px-1">{t('lbl_nickname')}</label>
              <input 
                  type="text" 
                  className="w-full h-14 px-4 border border-gray-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-4 focus:ring-verdant/10 bg-white dark:bg-slate-800 dark:text-white font-bold"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
              />
          </div>

          <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 px-1">{t('primary_command_site')}</label>
              <div className="relative">
                <select 
                    disabled={!canTransfer}
                    className={`w-full h-14 px-4 border border-gray-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-4 focus:ring-verdant/10 bg-white dark:bg-slate-800 dark:text-white font-bold appearance-none transition-opacity ${!canTransfer ? 'opacity-50 grayscale cursor-not-allowed' : ''}`}
                    value={houseId || ''}
                    onChange={e => setHouseId(e.target.value || null)}
                >
                    <option value="">{t('unassigned_location_label')}</option>
                    {houses.map(h => <option key={h.id} value={h.id}>{lv(h.name)}</option>)}
                </select>
                {!canTransfer && (
                    <div className="mt-2 p-3 bg-amber-50 dark:bg-amber-900/10 rounded-xl border border-amber-100 dark:border-amber-900/20">
                        <p className="text-[9px] font-black text-amber-600 dark:text-amber-500 uppercase tracking-widest leading-tight">
                            ⚠️ {t('msg_admin_transfer_only')}
                        </p>
                    </div>
                )}
              </div>
          </div>

          <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 px-1">{t('lbl_category')}</label>
              <input 
                  type="text" 
                  className="w-full h-14 px-4 border border-gray-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-4 focus:ring-verdant/10 bg-white dark:bg-slate-800 dark:text-white font-bold transition-all"
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  placeholder={t('placeholder_category')}
              />
          </div>

          <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 px-1">{t('lbl_growth_rate')}</label>
              <input 
                  type="text" 
                  className="w-full h-14 px-4 border border-gray-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-4 focus:ring-verdant/10 bg-white dark:bg-slate-800 dark:text-white font-bold transition-all"
                  value={growthRate}
                  onChange={e => setGrowthRate(e.target.value)}
                  placeholder={t('growth_moderate_fast')}
              />
          </div>

          <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 px-1">{t('lbl_room')}</label>
              <select 
                  className="w-full h-14 px-4 border border-gray-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-4 focus:ring-verdant/10 bg-white dark:bg-slate-800 dark:text-white font-bold appearance-none"
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
                          className="w-full h-14 px-4 border border-verdant/30 dark:border-verdant/20 rounded-2xl outline-none focus:ring-4 focus:ring-verdant/10 bg-verdant/5 dark:bg-verdant/10 dark:text-white font-bold"
                          value={room}
                          onChange={(e) => setRoom(e.target.value)}
                          autoFocus
                      />
                  </div>
              )}
          </div>

          <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 px-1">{t('lbl_hydration_interval_days')}</label>
              <input 
                  type="number" 
                  className="w-full h-14 px-4 border border-gray-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-4 focus:ring-verdant/10 bg-white dark:bg-slate-800 dark:text-white font-bold"
                  value={wateringInterval || ''}
                  onChange={(e) => setWateringInterval(parseInt(e.target.value) || null)}
                  placeholder={t('placeholder_days')}
              />
          </div>

          <div className="pt-8 border-t border-gray-100 dark:border-slate-800">
              <h3 className="text-[11px] font-serif font-black text-verdant uppercase tracking-[0.3em] mb-6">{t('lbl_specimen_documentation')}</h3>
              <div className="grid grid-cols-3 gap-4 mb-4">
                  {images.map((img, idx) => (
                      <div key={idx} className="relative aspect-square rounded-2xl overflow-hidden group border border-gray-100 dark:border-slate-700">
                          <img src={img} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          <button 
                            type="button"
                            onClick={() => setImages(prev => prev.filter((_, i) => i !== idx))}
                            className="absolute top-2 right-2 w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                          {idx === 0 && (
                              <div className="absolute bottom-0 left-0 right-0 bg-verdant/80 text-white text-[8px] font-black uppercase tracking-widest py-1 text-center">
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
                                className="absolute bottom-2 left-2 px-2 py-1 bg-white/80 dark:bg-slate-800/80 text-gray-900 dark:text-white text-[8px] font-black uppercase tracking-widest rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
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
                                const { compressImage } = await import('../services/imageUtils');
                                const base64 = await compressImage(file);
                                setImages(prev => [...prev, base64]);
                            }
                        };
                        input.click();
                    }}
                    className="aspect-square rounded-2xl border-2 border-dashed border-gray-200 dark:border-slate-700 flex flex-col items-center justify-center text-gray-400 hover:border-verdant hover:text-verdant transition-all"
                  >
                      <svg className="w-8 h-8 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                      <span className="text-[9px] font-black uppercase tracking-widest">{t('btn_add_photo')}</span>
                  </button>
              </div>
          </div>


          <div className="pt-8 border-t border-gray-100 dark:border-slate-800">
              <h3 className="text-[11px] font-serif font-black text-verdant uppercase tracking-[0.3em] mb-6">{t('lbl_advanced_technical_metrics')}</h3>
              <div className="grid grid-cols-2 gap-4">
                  <div>
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 px-1">{t('lbl_target_ph')}</label>
                      <input type="number" step="0.1" className="w-full h-14 px-4 border border-gray-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-4 focus:ring-verdant/10 bg-white dark:bg-slate-800 dark:text-white font-bold" value={targetPh || ''} onChange={e => setTargetPh(parseFloat(e.target.value) || null)} />
                  </div>
                  <div>
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 px-1">{t('lbl_target_ec_unit')}</label>
                      <input type="number" step="0.1" className="w-full h-14 px-4 border border-gray-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-4 focus:ring-verdant/10 bg-white dark:bg-slate-800 dark:text-white font-bold" value={targetEc || ''} onChange={e => setTargetEc(parseFloat(e.target.value) || null)} />
                  </div>
                  <div>
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 px-1">{t('lbl_target_vpd_unit')}</label>
                      <input type="number" step="0.1" className="w-full h-14 px-4 border border-gray-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-4 focus:ring-verdant/10 bg-white dark:bg-slate-800 dark:text-white font-bold" value={targetVpd || ''} onChange={e => setTargetVpd(parseFloat(e.target.value) || null)} />
                  </div>
                  <div>
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 px-1">{t('lbl_target_dli_unit')}</label>
                      <input type="number" step="0.1" className="w-full h-14 px-4 border border-gray-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-4 focus:ring-verdant/10 bg-white dark:bg-slate-800 dark:text-white font-bold" value={targetDli || ''} onChange={e => setTargetDli(parseFloat(e.target.value) || null)} />
                  </div>
              </div>
          </div>

          <div className="pt-8 border-t border-gray-100 dark:border-slate-800">
              <h3 className="text-[11px] font-serif font-black text-verdant uppercase tracking-[0.3em] mb-6">{t('lbl_lifecycle_phenology')}</h3>
              <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                      <div>
                          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 px-1">{t('lbl_repot_frequency')}</label>
                          <input type="number" className="w-full h-14 px-4 border border-gray-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-4 focus:ring-verdant/10 bg-white dark:bg-slate-800 dark:text-white font-bold" value={repottingFrequency || ''} onChange={e => setRepottingFrequency(parseInt(e.target.value) || null)} />
                      </div>
                      <div>
                          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 px-1">{t('lbl_last_pot_size')}</label>
                          <input type="text" className="w-full h-14 px-4 border border-gray-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-4 focus:ring-verdant/10 bg-white dark:bg-slate-800 dark:text-white font-bold" value={lastPotSize} onChange={e => setLastPotSize(e.target.value)} placeholder={t('placeholder_pot_size')} />
                      </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                      <div>
                          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 px-1">{t('lbl_rotation_frequency')}</label>
                          <input type="number" className="w-full h-14 px-4 border border-gray-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-4 focus:ring-verdant/10 bg-white dark:bg-slate-800 dark:text-white font-bold" value={rotationFrequency || ''} onChange={e => setRotationFrequency(parseInt(e.target.value) || null)} />
                      </div>
                      <div>
                          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 px-1">{t('lbl_last_rotated')}</label>
                          <input type="date" className="w-full h-14 px-4 border border-gray-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-4 focus:ring-verdant/10 bg-white dark:bg-slate-800 dark:text-white font-bold" value={lastRotated || ''} onChange={e => setLastRotated(e.target.value)} />
                      </div>
                  </div>
                  <div>
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 px-1">{t('lbl_propagation_methods')}</label>
                      <input type="text" className="w-full h-14 px-4 border border-gray-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-4 focus:ring-verdant/10 bg-white dark:bg-slate-800 dark:text-white font-bold" value={propagationMethods} onChange={e => setPropagationMethods(e.target.value)} placeholder={t('placeholder_propagation_methods')} />
                  </div>
                  <div>
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 px-1">{t('lbl_propagation_instructions')}</label>
                      <textarea 
                          className="w-full p-4 border border-gray-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-4 focus:ring-verdant/10 bg-white dark:bg-slate-800 dark:text-white font-serif italic min-h-[120px]" 
                          value={propagationInstructions} 
                          onChange={e => setPropagationInstructions(e.target.value)} 
                          placeholder="Step-by-step guide..."
                      />
                  </div>
                  <div>
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 px-1">{t('lbl_repotting_instructions')}</label>
                      <textarea 
                          className="w-full p-4 border border-gray-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-4 focus:ring-verdant/10 bg-white dark:bg-slate-800 dark:text-white font-serif italic min-h-[120px]" 
                          value={repottingInstructions} 
                          onChange={e => setRepottingInstructions(e.target.value)} 
                          placeholder="Step-by-step guide..."
                      />
                  </div>
              </div>
          </div>

          <div className="pt-8 border-t border-gray-100 dark:border-slate-800">
              <h3 className="text-[11px] font-serif font-black text-verdant uppercase tracking-[0.3em] mb-6">{t('lbl_provenance_history')}</h3>
              <div className="space-y-4">
                  <div>
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 px-1">{t('lbl_nursery_origin')}</label>
                      <input type="text" className="w-full h-14 px-4 border border-gray-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-4 focus:ring-verdant/10 bg-white dark:bg-slate-800 dark:text-white font-bold" value={nursery} onChange={e => setNursery(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                      <div>
                          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 px-1">{t('lbl_acquisition_date')}</label>
                          <input type="date" className="w-full h-14 px-4 border border-gray-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-4 focus:ring-verdant/10 bg-white dark:bg-slate-800 dark:text-white font-bold" value={dateOfPurchase} onChange={e => setDateOfPurchase(e.target.value)} />
                      </div>
                      <div className="flex gap-2">
                           <div className="flex-1">
                               <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 px-1">{t('lbl_cost')}</label>
                               <input type="number" className="w-full h-14 px-4 border border-gray-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-4 focus:ring-verdant/10 bg-white dark:bg-slate-800 dark:text-white font-bold" value={cost || ''} onChange={e => setCost(parseFloat(e.target.value) || null)} />
                           </div>
                           <div className="w-20">
                               <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 px-1">{t('lbl_ccy')}</label>
                               <input type="text" className="w-full h-14 px-4 border border-gray-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-4 focus:ring-verdant/10 bg-white dark:bg-slate-800 dark:text-white font-bold" value={currency} onChange={e => setCurrency(e.target.value)} />
                           </div>
                      </div>
                  </div>
              </div>
          </div>

          <div className="flex items-center gap-3 pt-6">
              <Button 
                onClick={handleRefreshData} 
                variant="ghost" 
                className="w-14 h-14 rounded-2xl flex items-center justify-center text-blue-500 hover:bg-blue-50" 
                disabled={isSaving || isRefreshing}
                title={t('btn_refresh_ai')}
              >
                <svg className={`w-6 h-6 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </Button>
              <Button onClick={onDelete} variant="danger" className="w-14 h-14 rounded-2xl flex items-center justify-center" disabled={isSaving || isRefreshing}><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></Button>
              <Button variant="ghost" className="flex-1 h-14 rounded-2xl font-black uppercase tracking-widest text-xs" onClick={onClose} disabled={isSaving || isRefreshing}>{t('cancel')}</Button>
              <Button className="flex-[2] h-14 rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-verdant/20" onClick={handleSave} isLoading={isSaving} disabled={isRefreshing}>{t('btn_save_changes')}</Button>
          </div>
      </div>
    </Modal>
  );
};