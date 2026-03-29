import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { identifyPlantWithPlantNet, identifyPlantWithGemini, generatePlantDetails, createPlant, analyzeReceipt } from '../services/plantAi';
import { translateInput } from '../services/translationService';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { usePlants } from '../context/PlantContext';
import { useInventory } from '../context/InventoryContext';
import { Plant, InventoryItem } from '../types';
import { PlantCard } from './PlantCard';
import { Logo } from './ui/Logo';
import { compressImage, dataURLtoBlob } from '../services/imageUtils';
import { CameraCapture } from './ui/CameraCapture';
import { getCompatibleItems } from '../services/compatibilityService';
import { ROOM_TYPES, CURRENCIES, getCurrencyForLanguage } from '../constants';
import { generateUUID } from '../services/crypto';

interface AddPlantModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (plant: Plant) => void;
}

type ScanMode = 'CHOICE' | 'SPECIMENS' | 'CAMERA' | 'PROCESSING' | 'REVIEW' | 'MANUAL';

interface ProtocolLog {
    timestamp: string;
    source: string;
    message: string;
    type: 'SYSTEM' | 'DEBUG' | 'NETWORK' | 'GEMINI' | 'WARNING';
}

export const AddPlantModal: React.FC<AddPlantModalProps> = ({ isOpen, onClose, onSave }) => {
  const { t, lv, language } = useLanguage();
  const { user } = useAuth();
  const { houses, getEffectiveApiKey } = usePlants();
  const { inventory } = useInventory();
  
  const [scanMode, setScanMode] = useState<ScanMode>('CHOICE');
  const [logs, setLogs] = useState<ProtocolLog[]>([]);
  const [specimenImages, setSpecimenImages] = useState<string[]>([]);
  const [identifiedPlant, setIdentifiedPlant] = useState<Partial<Plant> | null>(null);
  const [editNickname, setEditNickname] = useState('');
  const [editRoom, setEditRoom] = useState('');
  const [selectedHouseId, setSelectedHouseId] = useState<string | null>(user?.houseId || null);
  const [nursery, setNursery] = useState('');
  const [dateOfPurchase, setDateOfPurchase] = useState(new Date().toISOString().split('T')[0]);
  const [cost, setCost] = useState<number | null>(null);
  const [currency, setCurrency] = useState(getCurrencyForLanguage(language));
  const [compatibleItems, setCompatibleItems] = useState<InventoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isScanningReceipt, setIsScanningReceipt] = useState(false);
  const [isAnalyzingReceipt, setIsAnalyzingReceipt] = useState(false);
  const [countdown, setCountdown] = useState(0);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fix: Removed manual API key management per guidelines; key is obtained from process.env.API_KEY in services
  const currentHouse = useMemo(() => houses.find(h => h.id === user?.houseId), [houses, user?.houseId]);

  const progressState = useMemo(() => {
    if (logs.length === 0) return { percent: 0, status: t('status_initializing'), time: 42 };
    const lastMsg = logs[logs.length - 1].message.toLowerCase();
    if (lastMsg.includes("multi-specimen")) return { percent: 10, status: t('status_initializing_protocol'), time: 40 };
    if (lastMsg.includes("uplinking to pl@ntnet")) return { percent: 25, status: t('status_visual_pattern_matching'), time: 35 };
    if (lastMsg.includes("gemini vision")) return { percent: 40, status: t('status_neural_specimen_identification'), time: 25 };
    if (lastMsg.includes("fetching technical parameters") || lastMsg.includes("accessing global")) return { percent: 65, status: t('status_querying_global_archives'), time: 15 };
    if (lastMsg.includes("harmonizing")) return { percent: 85, status: t('status_synthesizing_botanical_dossier'), time: 5 };
    if (lastMsg.includes("finalized")) return { percent: 100, status: t('status_identity_confirmed'), time: 0 };
    return { percent: 50, status: t('status_processing_specimen'), time: 20 };
  }, [logs, t]);

  useEffect(() => {
    setCountdown(progressState.time);
  }, [progressState.time]);

  useEffect(() => {
    if (scanMode === 'PROCESSING' && countdown > 0) {
      const timer = setInterval(() => {
        setCountdown(prev => Math.max(0, prev - 1));
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [scanMode, countdown]);

  const addLog = (message: string, source: string = 'SYSTEM', type: 'SYSTEM' | 'DEBUG' | 'NETWORK' | 'GEMINI' | 'WARNING' = 'SYSTEM') => {
    setLogs(prev => [...prev, {
        timestamp: new Date().toLocaleTimeString([], { hour12: false, fractionalSecondDigits: 1 } as any),
        source: source.toUpperCase(),
        message,
        type
    }]);
  };

  const reset = () => {
    setScanMode('CHOICE');
    setLogs([]);
    setSpecimenImages([]);
    setIdentifiedPlant(null);
    setEditNickname('');
    setEditRoom('');
    setNursery('');
    setDateOfPurchase(new Date().toISOString().split('T')[0]);
    setCost(null);
    setCurrency(getCurrencyForLanguage(language));
    setCompatibleItems([]);
    setError(null);
    setIsBusy(false);
    setIsScanningReceipt(false);
    setIsAnalyzingReceipt(false);
  };

  const handleReceiptCapture = async (base64: string) => {
    setIsScanningReceipt(false);
    setIsAnalyzingReceipt(true);
    try {
      const data = await analyzeReceipt(base64, getEffectiveApiKey());
      if (data) {
        if (data.nursery) setNursery(data.nursery);
        if (data.dateOfPurchase) setDateOfPurchase(data.dateOfPurchase);
        if (data.cost) setCost(data.cost);
        if (data.currency) setCurrency(data.currency);
      }
    } catch (err) {
      console.error("Receipt analysis failed:", err);
    } finally {
      setIsAnalyzingReceipt(false);
    }
  };

  const initiateSync = async () => {
    if (specimenImages.length === 0) return;
    
    setScanMode('PROCESSING');
    setIsBusy(true);
    setError(null);
    setLogs([]);
    addLog(t('msg_sync_init'), "SYSTEM");
    
    try {
      addLog(t('msg_uplink_plantnet'), "NETWORK");
      const blobs = specimenImages.map(img => dataURLtoBlob(img));
      let idResult = await identifyPlantWithPlantNet(blobs);
      
      if (!idResult || idResult.score < 0.15) {
          addLog(t('msg_rerouting_gemini'), "GEMINI");
          idResult = await identifyPlantWithGemini(specimenImages[0], getEffectiveApiKey());
      }

      if (!idResult) throw new Error(t('msg_uplink_fault'));

      addLog(t('msg_identity_confirmed_log', { species: idResult.bestMatch }), "SYSTEM");
      addLog(t('msg_fetching_params'), "NETWORK");
      
      const details = await generatePlantDetails(idResult.bestMatch, specimenImages[0], (msg, src) => {
          addLog(t(msg) || msg, src === 'NETWORK' ? 'NETWORK' : 'GEMINI');
      }, getEffectiveApiKey());

      setIdentifiedPlant(createPlant({
        ...details,
        houseId: selectedHouseId,
        createdAt: new Date().toISOString(),
        images: specimenImages 
      }));
      
      setEditNickname(lv(details.nickname));
      setEditRoom('');
      
      // If nursery is empty, try to fill it with origin data
      if (!nursery && details.origin) {
          setNursery(lv(details.origin));
      }

      setCompatibleItems(getCompatibleItems(details as Plant, inventory));

      addLog(t('msg_dossier_finalized'), "SYSTEM");
      setScanMode('REVIEW');
    } catch (err: any) {
      console.error("Sync Error:", err);
      let msg = err.message || t('msg_uplink_fault');
      if (msg.includes("API_KEY_INVALID") || msg.toLowerCase().includes("api key not valid")) {
          msg = "The Gemini API Key is invalid. Please check your configuration in settings or .env file.";
      } else {
          // If it's another error, show a more descriptive message if possible
          msg = `Uplink Protocol Fault: ${err.message || 'Unknown Error'}`;
      }
      setError(msg);
    } finally {
      setIsBusy(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const base64 = await compressImage(file);
      setSpecimenImages(prev => [...prev, base64].slice(0, 4));
      setScanMode('SPECIMENS');
    } catch (err) { addLog(t('msg_compression_fault'), "DEBUG", "WARNING"); }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSave = async () => {
    if (identifiedPlant) {
      setIsBusy(true);
      try {
        const apiKey = getEffectiveApiKey();
        
        // Parallelize translations to speed up the saving process
        const [nicknameObj, roomObj] = await Promise.all([
          translateInput(editNickname, 'en', apiKey),
          editRoom.trim() ? translateInput(editRoom, 'en', apiKey) : Promise.resolve(null)
        ]);

        onSave({ 
          ...identifiedPlant, 
          id: `p-${generateUUID()}`,
          nickname: nicknameObj,
          room: roomObj,
          houseId: selectedHouseId,
          provenance: {
            nursery,
            dateOfPurchase,
            cost,
            currency
          }
        } as Plant);
        onClose();
        reset();
      } catch (err) {
        console.error("Save failure:", err);
        setError(t('msg_uplink_fault'));
      } finally {
        setIsBusy(false);
      }
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={() => { onClose(); reset(); }} title={t('deploy_specimen')}>
      <div className="space-y-6 max-h-[85vh] overflow-y-auto no-scrollbar px-2 pb-4">
        {scanMode === 'CHOICE' && (
          <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500">
            <div className="text-center py-6">
                <h3 className="text-sm font-black text-slate-600 dark:text-slate-300 uppercase tracking-[0.4em] mb-3">{t('lbl_input_source')}</h3>
                <p className="text-xs text-gray-700 dark:text-slate-200 font-medium italic px-6 leading-relaxed">{t('msg_choose_input_source')}</p>
                <div className="mt-4 inline-flex items-center gap-2 px-3 py-1 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 rounded-full border border-emerald-200 dark:border-emerald-800/50">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400 animate-pulse"></span>
                    <p className="text-[8px] font-black uppercase tracking-[0.2em]">
                        {t('msg_ai_ready')}
                    </p>
                </div>
            </div>
            <div className="grid grid-cols-1 gap-4">
                <button onClick={() => setScanMode('CAMERA')} className="group relative flex items-center p-8 bg-emerald-50/50 border-2 border-dashed border-emerald-200/50 rounded-[40px] hover:border-emerald-500 hover:bg-emerald-50 transition-all duration-500 text-left">
                  <div className="w-16 h-16 bg-white dark:bg-slate-800 rounded-3xl shadow-xl flex items-center justify-center text-emerald-600 shrink-0 group-hover:scale-110 transition-all"><svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812-1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><circle cx="12" cy="13" r="3" /></svg></div>
                  <div className="ml-6"><span className="block text-[11px] font-black uppercase tracking-[0.2em] text-emerald-700 mb-1">{t('live_identity_lens')}</span><h4 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">{t('use_camera')}</h4></div>
                </button>
                <button onClick={() => fileInputRef.current?.click()} className="group relative flex items-center p-8 bg-blue-50/50 border-2 border-dashed border-blue-200/50 rounded-[40px] hover:border-blue-500 hover:bg-blue-50 transition-all duration-500 text-left">
                  <div className="w-16 h-16 bg-white dark:bg-slate-800 rounded-3xl shadow-xl flex items-center justify-center text-blue-600 shrink-0 group-hover:scale-110 transition-all"><svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg></div>
                  <div className="ml-6"><span className="block text-[11px] font-black uppercase tracking-[0.2em] text-blue-700 mb-1">{t('archive_search')}</span><h4 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">{t('choose_picture')}</h4></div>
                </button>
                <button onClick={() => setScanMode('MANUAL')} className="group relative flex items-center p-8 bg-amber-50/50 border-2 border-dashed border-amber-200/50 rounded-[40px] hover:border-amber-500 hover:bg-amber-50 transition-all duration-500 text-left">
                  <div className="w-16 h-16 bg-white dark:bg-slate-800 rounded-3xl shadow-xl flex items-center justify-center text-amber-600 shrink-0 group-hover:scale-110 transition-all"><svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></div>
                  <div className="ml-6"><span className="block text-[11px] font-black uppercase tracking-[0.2em] text-amber-700 mb-1">{t('direct_protocol')}</span><h4 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">{t('manual_entry')}</h4></div>
                </button>
            </div>
            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileSelect} />
          </div>
        )}

        {scanMode === 'CAMERA' && (
          <CameraCapture 
            onCapture={(base64) => {
              setSpecimenImages(prev => [...prev, base64].slice(0, 4));
              setScanMode('SPECIMENS');
            }}
            onCancel={() => setScanMode('CHOICE')}
          />
        )}

        {scanMode === 'SPECIMENS' && (
          <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500">
            <div className="text-center">
              <h3 className="text-sm font-black text-slate-600 dark:text-slate-300 uppercase tracking-[0.4em] mb-2">{t('lbl_specimen_gallery')}</h3>
              <p className="text-[10px] text-gray-700 dark:text-slate-200 font-medium italic">{t('msg_captured_specimens')}</p>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              {specimenImages.map((img, idx) => (
                <div key={idx} className="relative aspect-square rounded-[32px] overflow-hidden border-4 border-white dark:border-slate-800 shadow-lg group">
                  <img src={img} className="w-full h-full object-cover" alt={`Specimen ${idx}`} />
                  <button 
                    onClick={() => setSpecimenImages(prev => prev.filter((_, i) => i !== idx))}
                    className="absolute top-2 right-2 w-8 h-8 bg-black/50 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity border border-white/20"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              ))}
              {specimenImages.length < 4 && (
                <button 
                  onClick={() => setScanMode('CAMERA')}
                  className="aspect-square rounded-[32px] border-4 border-dashed border-gray-200 dark:border-slate-800 flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-emerald-500 hover:text-emerald-500 transition-all"
                >
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300">{t('btn_add_more')}</span>
                </button>
              )}
            </div>

            <div className="flex gap-4 pt-4">
              <button className="flex-1 h-14 bg-gray-100 dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-2xl text-[10px] font-black uppercase tracking-[0.3em] text-gray-700 dark:text-slate-200" onClick={reset}>{t('cancel')}</button>
              <Button 
                variant="primary"
                className="flex-[2] h-14 rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-verdant/20" 
                onClick={initiateSync}
                disabled={specimenImages.length === 0}
              >
                {t('btn_analyze_specimens')}
              </Button>
            </div>
          </div>
        )}

        {scanMode === 'MANUAL' && (
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500">
            <div className="text-center">
              <h3 className="text-sm font-black text-slate-600 dark:text-slate-300 uppercase tracking-[0.4em] mb-2">{t('lbl_manual_dossier')}</h3>
              <p className="text-[10px] text-gray-700 dark:text-slate-200 font-medium italic">{t('msg_manual_entry_desc')}</p>
            </div>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 ml-2">{t('lbl_species_name')}</label>
                <input 
                  type="text" 
                  placeholder={t('placeholder_species')}
                  className="w-full h-14 px-6 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-emerald-500/10 transition-all text-gray-900 dark:text-white"
                  onChange={(e) => setIdentifiedPlant(prev => ({ ...prev, species: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 ml-2">{t('lbl_nickname')}</label>
                <input 
                  type="text" 
                  placeholder={t('placeholder_nickname')}
                  className="w-full h-14 px-6 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-emerald-500/10 transition-all text-gray-900 dark:text-white"
                  onChange={(e) => setIdentifiedPlant(prev => ({ ...prev, nickname: { en: e.target.value } as any }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 ml-2">{t('lbl_propagation_instructions')}</label>
                <textarea 
                  placeholder={t('placeholder_guide')}
                  className="w-full p-4 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-2xl font-serif italic text-sm outline-none focus:ring-4 focus:ring-emerald-500/10 transition-all text-gray-900 dark:text-white min-h-[100px]"
                  onChange={(e) => setIdentifiedPlant(prev => ({ ...prev, propagationInstructions: { en: e.target.value } as any }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 ml-2">{t('lbl_repotting_instructions')}</label>
                <textarea 
                  placeholder={t('placeholder_guide')}
                  className="w-full p-4 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-2xl font-serif italic text-sm outline-none focus:ring-4 focus:ring-emerald-500/10 transition-all text-gray-900 dark:text-white min-h-[100px]"
                  onChange={(e) => setIdentifiedPlant(prev => ({ ...prev, repottingInstructions: { en: e.target.value } as any }))}
                />
              </div>

              <div className="pt-4 border-t border-gray-100 dark:border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600 ml-2">{t('lbl_provenance_history')}</h4>
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-[9px] font-black uppercase tracking-widest text-emerald-600"
                        onClick={() => setIsScanningReceipt(true)}
                        isLoading={isAnalyzingReceipt}
                    >
                        {t('btn_scan_receipt')}
                    </Button>
                </div>
                <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 ml-2">{t('lbl_nursery_origin')}</label>
                    <input 
                        type="text"
                        value={nursery}
                        onChange={(e) => setNursery(e.target.value)}
                        className="w-full h-12 px-4 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-xl font-bold text-xs outline-none focus:ring-4 focus:ring-emerald-500/10 transition-all text-gray-900 dark:text-white"
                        placeholder={t('lbl_nursery_origin')}
                    />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 ml-2">{t('lbl_acquisition_date')}</label>
                        <input 
                            type="date" 
                            value={dateOfPurchase}
                            onChange={(e) => setDateOfPurchase(e.target.value)}
                            className="w-full h-12 px-4 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-xl font-bold text-xs outline-none focus:ring-4 focus:ring-emerald-500/10 transition-all text-gray-900 dark:text-white"
                        />
                    </div>
                    <div className="flex gap-3">
                        <div className="flex-[3] space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 ml-2">{t('lbl_cost')}</label>
                            <input 
                                type="number" 
                                value={cost || ''}
                                onChange={(e) => setCost(parseFloat(e.target.value) || null)}
                                className="w-full h-12 px-4 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-xl font-bold text-xs outline-none focus:ring-4 focus:ring-emerald-500/10 transition-all text-gray-900 dark:text-white"
                            />
                        </div>
                        <div className="flex-1 space-y-2 min-w-[80px]">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 ml-2">{t('lbl_ccy')}</label>
                            <select 
                                className="w-full h-12 px-4 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-xl font-bold text-xs outline-none focus:ring-4 focus:ring-emerald-500/10 transition-all text-gray-900 dark:text-white appearance-none"
                                value={currency}
                                onChange={(e) => setCurrency(e.target.value)}
                            >
                                {CURRENCIES.map(c => (
                                    <option key={c.code} value={c.code}>{c.code}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>
              </div>
            </div>

            <div className="flex gap-4 pt-4">
              <button className="flex-1 h-14 bg-gray-100 dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-2xl text-[10px] font-black uppercase tracking-[0.3em] text-gray-700 dark:text-slate-200" onClick={reset}>{t('cancel')}</button>
              <Button 
                variant="primary"
                className="flex-[2] h-14 rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-verdant/20" 
                onClick={async () => {
                  if (!identifiedPlant?.species) return;
                  setIsBusy(true);
                  setScanMode('PROCESSING');
                  try {
                    const details = await generatePlantDetails(identifiedPlant.species, undefined, undefined, getEffectiveApiKey());
                    setIdentifiedPlant(createPlant({
                      ...details,
                      nickname: identifiedPlant.nickname || details.nickname,
                      houseId: selectedHouseId,
                      createdAt: new Date().toISOString()
                    }));
                    setScanMode('REVIEW');
                  } catch (err: any) {
                    setError(err.message);
                    setScanMode('MANUAL');
                  } finally {
                    setIsBusy(false);
                  }
                }}
                disabled={!identifiedPlant?.species}
              >
                {t('btn_generate_dossier')}
              </Button>
            </div>
          </div>
        )}

        {scanMode === 'PROCESSING' && (
          <div className="flex flex-col items-center justify-center space-y-12 py-12 animate-in fade-in duration-500">
            <div className="relative">
                <div className="w-24 h-24 md:w-32 md:h-32 rounded-[40px] bg-white dark:bg-slate-900 shadow-2xl flex items-center justify-center border border-gray-100 dark:border-white/5 animate-float">
                    <div className="text-4xl md:text-5xl">🌱</div>
                </div>
                <div className="absolute -inset-4 border-2 border-verdant/20 rounded-[48px] animate-[spin_10s_linear_infinite]"></div>
            </div>
            
            <div className="text-center space-y-4 max-w-md px-6">
                <h2 className="text-2xl md:text-3xl font-black text-gray-900 dark:text-white tracking-tighter uppercase leading-none italic">
                    {progressState.status}
                </h2>
                <p className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.4em] animate-pulse">
                    {t('msg_establishing_uplink')}
                </p>
            </div>

            <div className="w-full max-w-xs space-y-3">
                <div className="h-1.5 w-full bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden relative">
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer"></div>
                    <div 
                        className="h-full bg-verdant transition-all duration-500 rounded-full" 
                        style={{ width: `${progressState.percent}%` }} 
                    />
                </div>
                <div className="flex justify-between text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    <span>{progressState.percent}%</span>
                    <span>{t('lbl_est_remaining').replace('{time}', countdown.toString())}</span>
                </div>
            </div>

            <div className="w-full max-w-md bg-white/50 dark:bg-slate-900/50 rounded-3xl p-6 border border-gray-100 dark:border-white/5 space-y-3">
                {logs.slice(-3).map((log, idx) => (
                    <div key={idx} className="flex items-center gap-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest animate-in slide-in-from-bottom-2 fade-in duration-500">
                        <span className="w-1.5 h-1.5 rounded-full bg-verdant/40" />
                        {log.message}
                    </div>
                ))}
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-900/10 p-6 rounded-[32px] border-2 border-red-100 dark:border-red-900/30 text-center space-y-3">
                <div className="w-10 h-10 bg-red-100 dark:bg-red-900/40 text-red-500 rounded-full flex items-center justify-center mx-auto">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                </div>
                <h4 className="text-[11px] font-black uppercase tracking-widest text-red-600">{t('lbl_uplink_fault')}</h4>
                <p className="text-[10px] font-bold text-red-500/80 leading-relaxed">
                  {error.includes("503") || error.includes("high demand") 
                    ? t('msg_server_overloaded')
                    : error}
                </p>
                <div className="flex gap-2 justify-center">
                  <button onClick={initiateSync} className="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-600 hover:text-emerald-700 transition-colors border border-emerald-100 dark:border-emerald-900/30 px-3 py-1 rounded-lg">{t('btn_retry')}</button>
                  <button onClick={reset} className="text-[9px] font-black uppercase tracking-[0.2em] text-red-400 hover:text-red-600 transition-colors border border-red-100 dark:border-red-900/30 px-3 py-1 rounded-lg">{t('btn_reset_protocol')}</button>
                </div>
              </div>
            )}
          </div>
        )}

        {scanMode === 'REVIEW' && identifiedPlant && (
          <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500">
            <div className="transform scale-95 -mt-4 origin-top">
                <PlantCard plant={{ ...identifiedPlant, nickname: { en: editNickname } as any, room: { en: editRoom } as any }} showActions={false} />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 px-2">
                <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 ml-2">{t('lbl_nickname')}</label>
                    <input 
                        type="text" 
                        value={editNickname}
                        onChange={(e) => setEditNickname(e.target.value)}
                        className="w-full h-12 px-4 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-xl font-bold text-xs outline-none focus:ring-4 focus:ring-emerald-500/10 transition-all text-gray-900 dark:text-white"
                    />
                </div>
                <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 ml-2">{t('lbl_house')}</label>
                    <select 
                        className="w-full h-12 px-4 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-xl font-bold text-xs outline-none focus:ring-4 focus:ring-emerald-500/10 transition-all text-gray-900 dark:text-white appearance-none"
                        value={selectedHouseId || ''}
                        onChange={(e) => setSelectedHouseId(e.target.value || null)}
                    >
                        <option value="">{t('labels_all_global_properties')}</option>
                        {houses.map(h => (
                            <option key={h.id} value={h.id}>{lv(h.name)}</option>
                        ))}
                    </select>
                </div>
                <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 ml-2">{t('lbl_room')}</label>
                    <select 
                        className="w-full h-12 px-4 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-xl font-bold text-xs outline-none focus:ring-4 focus:ring-emerald-500/10 transition-all text-gray-900 dark:text-white appearance-none"
                        value={editRoom}
                        onChange={(e) => setEditRoom(e.target.value)}
                    >
                        <option value="">{t('assign_room_label')}</option>
                        {ROOM_TYPES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                </div>
            </div>

            <div className="space-y-4 px-2">
                <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 ml-2">{t('lbl_nursery_origin')}</label>
                    <input 
                        type="text"
                        value={nursery}
                        onChange={(e) => setNursery(e.target.value)}
                        className="w-full h-12 px-4 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-xl font-bold text-xs outline-none focus:ring-4 focus:ring-emerald-500/10 transition-all text-gray-900 dark:text-white"
                        placeholder={t('lbl_nursery_origin')}
                    />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 ml-2">{t('lbl_acquisition_date')}</label>
                        <input 
                            type="date" 
                            value={dateOfPurchase}
                            onChange={(e) => setDateOfPurchase(e.target.value)}
                            className="w-full h-12 px-4 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-xl font-bold text-xs outline-none focus:ring-4 focus:ring-emerald-500/10 transition-all text-gray-900 dark:text-white"
                        />
                    </div>
                    <div className="flex gap-3">
                        <div className="flex-[3] space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 ml-2">{t('lbl_cost')}</label>
                            <input 
                                type="number" 
                                value={cost || ''}
                                onChange={(e) => setCost(parseFloat(e.target.value) || null)}
                                className="w-full h-12 px-4 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-xl font-bold text-xs outline-none focus:ring-4 focus:ring-emerald-500/10 transition-all text-gray-900 dark:text-white"
                            />
                        </div>
                        <div className="flex-1 space-y-2 min-w-[80px]">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 ml-2">{t('lbl_ccy')}</label>
                            <select 
                                className="w-full h-12 px-4 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-xl font-bold text-xs outline-none focus:ring-4 focus:ring-emerald-500/10 transition-all text-gray-900 dark:text-white appearance-none"
                                value={currency}
                                onChange={(e) => setCurrency(e.target.value)}
                            >
                                {CURRENCIES.map(c => (
                                    <option key={c.code} value={c.code}>{c.code}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>
            </div>

            {compatibleItems.length > 0 && (
              <div className="p-6 bg-blue-50/50 dark:bg-blue-900/10 rounded-[32px] border border-blue-100 dark:border-blue-800/30">
                <p className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-[0.2em] mb-4">{t('lbl_compatible_items')}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {compatibleItems.map(item => (
                    <div key={item.id} className="flex items-center gap-3 bg-white dark:bg-slate-800 p-3 rounded-2xl shadow-sm border border-blue-100/20">
                      <div className="w-10 h-10 rounded-xl overflow-hidden bg-gray-100 dark:bg-slate-700 shrink-0">
                        {item.images && item.images[0] && <img src={item.images[0]} className="w-full h-full object-cover" alt="" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-black truncate dark:text-white leading-none mb-1 uppercase tracking-tight">{lv(item.name)}</p>
                        <p className="text-[8px] text-gray-700 dark:text-slate-200 uppercase tracking-widest">{t(`cat_${item.category.replace('-', '_')}`)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-4">
                <button className="flex-1 h-14 bg-gray-100 dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-2xl text-[10px] font-black uppercase tracking-[0.3em] text-gray-700 dark:text-slate-200" onClick={reset}>{t('cancel')}</button>
                <Button variant="primary" className="flex-[2] h-14 rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-verdant/20" onClick={handleSave}>{t('btn_confirm_specimen')}</Button>
            </div>
          </div>
        )}
      </div>

      {isScanningReceipt && (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col">
          <CameraCapture 
            onCapture={handleReceiptCapture}
            onCancel={() => setIsScanningReceipt(false)}
          />
        </div>
      )}
    </Modal>
  );
};