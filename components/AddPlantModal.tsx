import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Camera, ImagePlus, PenLine, Sprout, AlertTriangle, Plus, X, RotateCcw, Printer, Download, Zap, CheckCircle2 } from 'lucide-react';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { identifyPlantWithPlantNet, identifyPlantWithGemini, generatePlantDetails, createPlant, refreshPlantRecord } from '../services/plantAi';
import { fetchAggregatedSpeciesData } from '../services/botanicalServices';
import { printLabelsToNiimbotD110, getShortBarcodeId } from '../services/barcodeService';
import { exportPlantsToNiimbotExcel } from '../services/exportService';
import { translateInput } from '../services/translationService';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { usePlants } from '../context/PlantContext';
import { useInventory } from '../context/InventoryContext';
import { Plant, InventoryItem } from '../types';
import { PlantCard } from './PlantCard';
import { compressImage, dataURLtoBlob } from '../services/imageUtils';
import { CameraCapture } from './ui/CameraCapture';
import { getCompatibleItems } from '../services/compatibilityService';
import { CURRENCIES, getCurrencyForLanguage } from '../constants';
import { generateUUID } from '../services/crypto';
import { inferPlantCategory } from '../utils/botanicalCategory';

interface AddPlantModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (plant: Plant) => Promise<void> | void;
}

type ScanMode = 'CHOICE' | 'SPECIMENS' | 'CAMERA' | 'PROCESSING' | 'REVIEW' | 'MANUAL' | 'DONE';

interface ProtocolLog {
  timestamp: string;
  source: string;
  message: string;
  type: 'SYSTEM' | 'DEBUG' | 'NETWORK' | 'GEMINI' | 'WARNING';
  key?: string;
}

export const AddPlantModal: React.FC<AddPlantModalProps> = ({ isOpen, onClose, onSave }) => {
  const { t, lv, language } = useLanguage();
  const { user } = useAuth();
  const { houses, allRooms, getEffectiveApiKey, updatePlant, setAlertMessage } = usePlants();
  const { inventory } = useInventory();

  const isAdmin = user?.role === 'OWNER' || user?.role === 'CO_CEO';

  const [scanMode, setScanMode] = useState<ScanMode>('CHOICE');
  const [processingContext, setProcessingContext] = useState<'IDENTIFY' | 'SAVE' | null>(null);
  const [logs, setLogs] = useState<ProtocolLog[]>([]);
  const [specimenImages, setSpecimenImages] = useState<string[]>([]);
  const [identifiedPlant, setIdentifiedPlant] = useState<Partial<Plant> | null>(null);
  const [editNickname, setEditNickname] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editRoom, setEditRoom] = useState('');
  const [editWateringInterval, setEditWateringInterval] = useState<number | null>(null);
  const [editRepottingFrequency, setEditRepottingFrequency] = useState<number | null>(null);
  const [editLastPotSize, setEditLastPotSize] = useState('');
  const [editLastPotSizeInches, setEditLastPotSizeInches] = useState<number | null>(null);
  const [editLastPotSizeCm, setEditLastPotSizeCm] = useState<number | null>(null);
  const [selectedHouseId, setSelectedHouseId] = useState<string | null>(user?.houseId || null);
  const [nursery, setNursery] = useState('');
  const [dateOfPurchase, setDateOfPurchase] = useState(new Date().toISOString().split('T')[0]);
  const [editLastWateredDate, setEditLastWateredDate] = useState<string | null>(null);
  const [cost, setCost] = useState<number | null>(null);
  const [currency, setCurrency] = useState(getCurrencyForLanguage(language));
  const [compatibleItems, setCompatibleItems] = useState<InventoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [quickSpecies, setQuickSpecies] = useState('');
  const [quickSpecimenType, setQuickSpecimenType] = useState<'PLANT' | 'TREE'>('PLANT');
  const [savedPlant, setSavedPlant] = useState<Plant | null>(null);
  const [isPrintingLabel, setIsPrintingLabel] = useState(false);
  const [printStatus, setPrintStatus] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const manualFileInputRef = useRef<HTMLInputElement>(null);

  const progressState = useMemo(() => {
    if (logs.length === 0) return { percent: 0, status: t('status_initializing'), time: 42 };
    const lastLog = logs[logs.length - 1];
    const lastKey = lastLog.key;
    const lastMsg = lastLog.message.toLowerCase();

    if (lastKey === 'SAVING_START') return { percent: 10, status: t('status_saving_specimen'), time: 15 };
    if (lastKey === 'TRANSLATING') return { percent: 50, status: t('lbl_translating'), time: 10 };
    if (lastKey === 'FINALIZING') return { percent: 90, status: t('status_finalizing_translations'), time: 2 };

    if (lastMsg.includes('multi-specimen')) return { percent: 10, status: t('status_initializing_protocol'), time: 40 };
    if (lastMsg.includes('uplinking to pl@ntnet')) return { percent: 25, status: t('status_visual_pattern_matching'), time: 35 };
    if (lastMsg.includes('gemini vision')) return { percent: 40, status: t('status_neural_specimen_identification'), time: 25 };
    if (lastMsg.includes('fetching technical parameters') || lastMsg.includes('accessing global')) return { percent: 65, status: t('status_querying_global_archives'), time: 15 };
    if (lastMsg.includes('harmonizing')) return { percent: 85, status: t('status_synthesizing_botanical_dossier'), time: 5 };
    if (lastMsg.includes('finalized')) return { percent: 100, status: t('status_identity_confirmed'), time: 0 };
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

  const addLog = (
    message: string,
    source: string = 'SYSTEM',
    type: 'SYSTEM' | 'DEBUG' | 'NETWORK' | 'GEMINI' | 'WARNING' = 'SYSTEM',
    key?: string
  ) => {
    setLogs(prev => [
      ...prev,
      {
        timestamp: new Date().toLocaleTimeString([], { hour12: false, fractionalSecondDigits: 1 } as any),
        source: source.toUpperCase(),
        message,
        type,
        key
      }
    ]);
  };

  const reset = () => {
    setScanMode('CHOICE');
    setProcessingContext(null);
    setLogs([]);
    setSpecimenImages([]);
    setIdentifiedPlant(null);
    setEditNickname('');
    setEditCategory('');
    setEditRoom('');
    setSelectedHouseId(user?.houseId || null);
    setEditWateringInterval(7);
    setEditRepottingFrequency(12);
    setEditLastPotSize('');
    setEditLastPotSizeInches(null);
    setEditLastPotSizeCm(null);
    setNursery('');
    setDateOfPurchase(new Date().toISOString().split('T')[0]);
    setEditLastWateredDate(null);
    setCost(null);
    setCurrency(getCurrencyForLanguage(language));
    setCompatibleItems([]);
    setError(null);
    setIsBusy(false);
    setQuickSpecies('');
    setQuickSpecimenType('PLANT');
    setSavedPlant(null);
    setIsPrintingLabel(false);
    setPrintStatus(null);
  };

  const initiateSync = async () => {
    if (specimenImages.length === 0) return;

    setProcessingContext('IDENTIFY');
    setScanMode('PROCESSING');
    setIsBusy(true);
    setError(null);
    setLogs([]);
    addLog(t('msg_sync_init'), 'SYSTEM');

    try {
      addLog(t('msg_uplink_plantnet'), 'NETWORK');
      const blobs = specimenImages.map(img => dataURLtoBlob(img));
      let idResult = await identifyPlantWithPlantNet(blobs);

      if (!idResult || idResult.score < 0.15) {
        addLog(t('msg_rerouting_gemini'), 'GEMINI');
        idResult = await identifyPlantWithGemini(specimenImages[0], getEffectiveApiKey());
      }

      if (!idResult) throw new Error(t('msg_uplink_fault'));

      addLog(t('msg_identity_confirmed_log', { species: idResult.bestMatch }), 'SYSTEM');
      addLog(t('msg_fetching_params'), 'NETWORK');

      const details = await generatePlantDetails(
        idResult.bestMatch,
        specimenImages[0],
        (msg, src) => {
          addLog(t(msg) || msg, src === 'NETWORK' ? 'NETWORK' : 'GEMINI');
        },
        getEffectiveApiKey()
      );

      const resolvedPlant = createPlant({
        ...details,
        houseId: selectedHouseId,
        createdAt: new Date().toISOString(),
        images: specimenImages
      });

      setIdentifiedPlant(resolvedPlant);

      setEditNickname(lv(resolvedPlant.nickname));
      setEditCategory(lv(resolvedPlant.category as any) || '');
      setEditRoom('');
      setEditWateringInterval(details.wateringInterval || null);
      setEditRepottingFrequency(details.repottingFrequency || null);
      setEditLastPotSize(details.lastPotSize ? details.lastPotSize.toString().replace(/cm$/i, '').trim() : '');
      setEditLastPotSizeCm(details.lastPotSize ? parseFloat(details.lastPotSize.toString()) || null : null);
      if (details.lastPotSize) {
        const cm = parseFloat(details.lastPotSize.toString());
        if (!isNaN(cm)) {
          setEditLastPotSizeInches(Number((cm / 2.54).toFixed(2)));
        }
      }

      if (!nursery && details.origin) {
        setNursery(lv(details.origin));
      }

      setCompatibleItems(getCompatibleItems(details as Plant, inventory));

      addLog(t('msg_dossier_finalized'), 'SYSTEM');
      setScanMode('REVIEW');
    } catch (err: any) {
      console.error('Sync Error:', err);
      let msg = err.message || t('msg_uplink_fault');
      if (msg.includes('API_KEY_INVALID') || msg.toLowerCase().includes('api key not valid')) {
        msg = 'The Gemini API Key is invalid. Please check your configuration in settings or .env file.';
      } else {
        msg = `Uplink Protocol Fault: ${err.message || 'Unknown Error'}`;
      }
      setError(msg);
    } finally {
      setIsBusy(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>, stayManual = false) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const base64 = await compressImage(file);
      setSpecimenImages(prev => [...prev, base64].slice(0, 4));
      if (!stayManual) {
        setScanMode('SPECIMENS');
      }
    } catch (err) {
      addLog(t('msg_compression_fault'), 'DEBUG', 'WARNING');
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (manualFileInputRef.current) manualFileInputRef.current.value = '';
  };

  const handleManualGenerate = async () => {
    if (!identifiedPlant?.species?.trim()) return;
    setIsBusy(true);
    setError(null);
    setProcessingContext('IDENTIFY');
    setScanMode('PROCESSING');
    setLogs([]);
    addLog(t('msg_fetching_params'), 'NETWORK');
    try {
      const details = await generatePlantDetails(
        identifiedPlant.species.trim(),
        specimenImages[0],
        (msg, src) => {
          addLog(t(msg) || msg, src === 'NETWORK' ? 'NETWORK' : 'GEMINI');
        },
        getEffectiveApiKey()
      );
      const manualPropInstr = identifiedPlant.propagationInstructions;
      const manualRepotInstr = identifiedPlant.repottingInstructions;
      const newPlant = createPlant({
        ...details,
        nickname: (identifiedPlant.nickname && lv(identifiedPlant.nickname)) ? identifiedPlant.nickname : details.nickname,
        propagationInstructions: (manualPropInstr && lv(manualPropInstr)) ? manualPropInstr : details.propagationInstructions,
        repottingInstructions: (manualRepotInstr && lv(manualRepotInstr)) ? manualRepotInstr : details.repottingInstructions,
        images: specimenImages.length > 0 ? specimenImages : details.images,
        houseId: selectedHouseId,
        createdAt: new Date().toISOString()
      });
      setIdentifiedPlant(newPlant);
      setEditNickname(lv(newPlant.nickname) || identifiedPlant.species);
      setEditCategory(lv(newPlant.category as any) || '');
      setEditWateringInterval(newPlant.wateringInterval || 7);
      setEditRepottingFrequency(newPlant.repottingFrequency || 12);
      setCompatibleItems(getCompatibleItems(newPlant, inventory));
      addLog(t('msg_dossier_finalized'), 'SYSTEM');
      setScanMode('REVIEW');
    } catch (err: any) {
      setError(err.message || t('msg_uplink_fault'));
      setScanMode('MANUAL');
    } finally {
      setIsBusy(false);
    }
  };

  const handlePrintSavedLabel = async (plantToPrint: Plant) => {
    if (isPrintingLabel) return;
    setIsPrintingLabel(true);
    setPrintStatus('Connecting to Niimbot D110...');
    try {
      await printLabelsToNiimbotD110([plantToPrint], lv, (info) => {
        setPrintStatus(info.message || (info.page ? `Printing ${info.page}/${info.total}...` : 'Printing...'));
      });
      setPrintStatus('Label printed successfully!');
    } catch (err: any) {
      console.error('Label print failed:', err);
      setPrintStatus(err?.message || 'Bluetooth printer not connected. You can download the Excel label instead.');
    } finally {
      setIsPrintingLabel(false);
    }
  };

  const handleQuickAdd = async (speciesInput?: string, printAfter = false) => {
    const query = (speciesInput ?? quickSpecies).trim();
    if (!query || isBusy) return;
    setIsBusy(true);
    setError(null);
    try {
      const agg = await fetchAggregatedSpeciesData(query).catch(() => null);
      const commonName = agg?.commonNames?.en?.[0] || query;
      const inferredCategory = inferPlantCategory({
        species: agg?.scientificName || query,
        nickname: commonName,
        family: agg?.family || null,
        genus: agg?.genus || null,
        specimenType: agg?.specimenType === 'TREE' ? 'TREE' : quickSpecimenType,
        growthHabit: agg?.ecologicalTraits?.growthForm || agg?.ecologicalTraits?.lifeform
      });
      const newPlant = createPlant({
        species: agg?.scientificName || query,
        scientificAuthor: agg?.authority || null,
        family: agg?.family || null,
        genus: agg?.genus || null,
        synonyms: agg?.synonyms || [],
        specimenType: agg?.specimenType === 'TREE' ? 'TREE' : quickSpecimenType,
        category: inferredCategory,
        nickname: { en: commonName, [language]: commonName },
        hardinessZoneMin: agg?.traits?.hardinessZoneMin ? String(agg.traits.hardinessZoneMin) : null,
        hardinessZoneMax: agg?.traits?.hardinessZoneMax ? String(agg.traits.hardinessZoneMax) : null,
        droughtTolerant: agg?.traits?.droughtTolerant ?? false,
        iucnStatus: agg?.conservation?.iucnCategory || null,
        gbifId: agg?.sourceIds?.gbif || null,
        powoId: agg?.sourceIds?.powo || null,
        wfoId: agg?.sourceIds?.wfo || null,
        vascanId: agg?.sourceIds?.vascan ? Number(agg.sourceIds.vascan) : null,
        wikidataId: agg?.sourceIds?.wikidata || null,
        inaturalistId: agg?.sourceIds?.inaturalist ? Number(agg.sourceIds.inaturalist) : null,
        images: specimenImages,
        houseId: isAdmin ? selectedHouseId : (user?.houseId || null),
        id: `p-${generateUUID()}`,
        createdAt: new Date().toISOString(),
        provenance: {
          nursery,
          dateOfPurchase,
          cost: cost ?? undefined,
          currency
        }
      });

      await onSave(newPlant);
      setSavedPlant(newPlant);
      setScanMode('DONE');
      if (printAfter) {
        void handlePrintSavedLabel(newPlant);
      }

      // Continue full AI & open-source botanical enrichment in the background
      const apiKey = getEffectiveApiKey();
      void (async () => {
        try {
          const enriched = await refreshPlantRecord(newPlant, apiKey);
          await updatePlant(newPlant.id, enriched);
          setAlertMessage(`Botanical dossier & AI data ready for ${commonName}`);
          setTimeout(() => setAlertMessage(null), 4000);
        } catch (bgErr) {
          console.warn('Background botanical enrichment skipped/failed:', bgErr);
        }
      })();
    } catch (err: any) {
      console.error('Quick add failure:', err);
      setError(err?.message || t('msg_uplink_fault'));
    } finally {
      setIsBusy(false);
    }
  };

  const handleSave = async (printAfter = false) => {
    if (!identifiedPlant || isBusy) return;
    setIsBusy(true);
    setError(null);
    try {
      const apiKey = getEffectiveApiKey();
      const trimmedNickname = editNickname.trim();
      const existingNickname = lv(identifiedPlant.nickname).trim();

      const [nicknameObj, roomObj] = await Promise.all([
        !trimmedNickname
          ? Promise.resolve(identifiedPlant.nickname || { en: identifiedPlant.species || 'Plant' })
          : trimmedNickname === existingNickname && identifiedPlant.nickname
            ? Promise.resolve(identifiedPlant.nickname)
            : translateInput(trimmedNickname, language, apiKey).catch(() => ({ en: trimmedNickname, [language]: trimmedNickname })),
        editRoom.trim()
          ? translateInput(editRoom.trim(), language, apiKey).catch(() => ({ en: editRoom.trim(), [language]: editRoom.trim() }))
          : Promise.resolve(null)
      ]);

      const categoryObj = editCategory.trim()
        ? inferPlantCategory({ ...identifiedPlant, category: editCategory.trim() })
        : (identifiedPlant.category || inferPlantCategory(identifiedPlant));

      const newPlant: Plant = {
        ...identifiedPlant,
        id: `p-${generateUUID()}`,
        nickname: nicknameObj,
        category: categoryObj,
        room: roomObj,
        wateringInterval: editWateringInterval,
        repottingFrequency: editRepottingFrequency,
        lastPotSize: editLastPotSize,
        lastPotSizeInches: editLastPotSizeInches,
        lastPotSizeCm: editLastPotSizeCm,
        lastWatered: editLastWateredDate,
        houseId: isAdmin ? selectedHouseId : (user?.houseId || null),
        provenance: {
          nursery,
          dateOfPurchase,
          cost,
          currency
        }
      } as Plant;

      await onSave(newPlant);
      setSavedPlant(newPlant);
      setScanMode('DONE');
      if (printAfter) {
        void handlePrintSavedLabel(newPlant);
      }
    } catch (err: any) {
      console.error('Save failure:', err);
      setError(err?.message || t('msg_uplink_fault'));
    } finally {
      setIsBusy(false);
    }
  };

  const inputClass =
    'w-full h-12 px-4 bg-md-surface-container-highest border border-md-outline-variant/60 rounded-2xl font-medium text-sm text-md-on-surface placeholder:text-md-on-surface-variant/60 outline-none focus:border-md-primary focus:ring-2 focus:ring-md-primary/20 transition-all';
  const labelClass = 'block text-xs font-semibold text-md-on-surface-variant ml-1 mb-1.5';

  return (
    <Modal isOpen={isOpen} onClose={() => { onClose(); reset(); }} title={t('deploy_specimen')}>
      <div className="space-y-6 max-h-[85vh] overflow-y-auto no-scrollbar px-1 pb-4 font-sans">
        {scanMode === 'CHOICE' && (
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
            {/* FAST QUICK ADD */}
            <div className="p-4 bg-md-surface-container-high border border-md-primary/30 rounded-[24px] space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-md-primary" />
                  <span className="text-xs font-bold uppercase tracking-wider text-md-primary">Quick Add</span>
                </div>
                <div className="inline-flex bg-md-surface-container rounded-full p-0.5 border border-md-outline-variant/30">
                  {(['PLANT', 'TREE'] as const).map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setQuickSpecimenType(type)}
                      className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-all ${
                        quickSpecimenType === type
                          ? 'bg-md-primary text-md-on-primary'
                          : 'text-md-on-surface-variant hover:text-md-on-surface'
                      }`}
                    >
                      {type === 'TREE' ? 'Tree' : 'Plant'}
                    </button>
                  ))}
                </div>
              </div>
              <input
                type="text"
                value={quickSpecies}
                onChange={(e) => setQuickSpecies(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && quickSpecies.trim() && !isBusy) {
                    void handleQuickAdd(quickSpecies, false);
                  }
                }}
                placeholder="Enter species or common name (e.g. African Violet, Acer rubrum)..."
                className={inputClass}
              />
              {error && (
                <p className="text-xs font-semibold text-md-error px-1">⚠️ {error}</p>
              )}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  className="flex-1"
                  disabled={!quickSpecies.trim() || isBusy}
                  isLoading={isBusy}
                  onClick={() => void handleQuickAdd(quickSpecies, false)}
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>Quick Save</span>
                </Button>
                <Button
                  type="button"
                  variant="tonal"
                  size="sm"
                  className="flex-1"
                  disabled={!quickSpecies.trim() || isBusy}
                  onClick={() => void handleQuickAdd(quickSpecies, true)}
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Save & Print</span>
                </Button>
              </div>
            </div>

            <div className="text-center py-1 space-y-2">
              <h3 className="text-xs font-bold text-md-on-surface-variant uppercase tracking-widest">
                {t('lbl_input_source')}
              </h3>
              <p className="text-sm text-md-on-surface-variant px-4 leading-relaxed">
                {t('msg_choose_input_source')}
              </p>
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-md-primary-container text-md-on-primary-container rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-md-primary animate-pulse" />
                <span className="text-[11px] font-semibold tracking-wide">{t('msg_ai_ready')}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3.5">
              <button
                onClick={() => setScanMode('CAMERA')}
                className="m3-state-layer group flex items-center p-5 bg-md-surface-container-high border border-md-outline-variant/50 rounded-[24px] hover:border-md-primary transition-all text-left"
              >
                <div className="w-14 h-14 bg-md-primary-container text-md-on-primary-container rounded-2xl flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <Camera className="w-7 h-7" />
                </div>
                <div className="ml-4">
                  <span className="block text-xs font-semibold text-md-primary mb-0.5">{t('live_identity_lens')}</span>
                  <h4 className="text-lg font-bold text-md-on-surface tracking-tight">{t('use_camera')}</h4>
                </div>
              </button>

              <button
                onClick={() => fileInputRef.current?.click()}
                className="m3-state-layer group flex items-center p-5 bg-md-surface-container-high border border-md-outline-variant/50 rounded-[24px] hover:border-md-secondary transition-all text-left"
              >
                <div className="w-14 h-14 bg-md-secondary-container text-md-on-secondary-container rounded-2xl flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <ImagePlus className="w-7 h-7" />
                </div>
                <div className="ml-4">
                  <span className="block text-xs font-semibold text-md-secondary mb-0.5">{t('archive_search')}</span>
                  <h4 className="text-lg font-bold text-md-on-surface tracking-tight">{t('choose_picture')}</h4>
                </div>
              </button>

              <button
                onClick={() => setScanMode('MANUAL')}
                className="m3-state-layer group flex items-center p-5 bg-md-surface-container-high border border-md-outline-variant/50 rounded-[24px] hover:border-md-tertiary transition-all text-left"
              >
                <div className="w-14 h-14 bg-md-tertiary-container text-md-on-tertiary-container rounded-2xl flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <PenLine className="w-7 h-7" />
                </div>
                <div className="ml-4">
                  <span className="block text-xs font-semibold text-md-tertiary mb-0.5">{t('direct_protocol')}</span>
                  <h4 className="text-lg font-bold text-md-on-surface tracking-tight">{t('manual_entry')}</h4>
                </div>
              </button>
            </div>
            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={(e) => handleFileSelect(e, false)} />
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
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
            <div className="text-center space-y-1">
              <h3 className="text-xs font-bold text-md-on-surface-variant uppercase tracking-widest">{t('lbl_specimen_gallery')}</h3>
              <p className="text-xs text-md-on-surface-variant">{t('msg_captured_specimens')}</p>
            </div>

            <div className="grid grid-cols-2 gap-3.5">
              {specimenImages.map((img, idx) => (
                <div key={idx} className="relative aspect-square rounded-[24px] overflow-hidden border border-md-outline-variant/40 shadow-sm group">
                  <img src={img} className="w-full h-full object-cover" alt={`Specimen ${idx}`} />
                  <button
                    onClick={() => setSpecimenImages(prev => prev.filter((_, i) => i !== idx))}
                    aria-label="Remove specimen image"
                    className="absolute top-2.5 right-2.5 w-8 h-8 bg-md-inverse-surface/80 text-md-inverse-on-surface rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {specimenImages.length < 4 && (
                <button
                  onClick={() => setScanMode('CAMERA')}
                  className="aspect-square rounded-[24px] border-2 border-dashed border-md-outline-variant flex flex-col items-center justify-center gap-2 text-md-on-surface-variant hover:border-md-primary hover:text-md-primary transition-all"
                >
                  <Plus className="w-7 h-7" />
                  <span className="text-xs font-semibold">{t('btn_add_more')}</span>
                </button>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="tonal" className="flex-1" onClick={reset}>{t('cancel')}</Button>
              <Button variant="primary" className="flex-[2]" onClick={initiateSync} disabled={specimenImages.length === 0}>
                {t('btn_analyze_specimens')}
              </Button>
            </div>
          </div>
        )}

        {scanMode === 'MANUAL' && (
          <div className="space-y-5 animate-in fade-in zoom-in-95 duration-300">
            <div className="text-center space-y-1">
              <h3 className="text-xs font-bold text-md-on-surface-variant uppercase tracking-widest">{t('lbl_manual_dossier')}</h3>
              <p className="text-xs text-md-on-surface-variant">{t('msg_manual_entry_desc')}</p>
            </div>

            {error && (
              <div className="p-4 rounded-2xl bg-md-error-container text-md-on-error-container flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                <div className="text-xs font-medium leading-relaxed">{error}</div>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className={labelClass}>{t('lbl_species_name')}</label>
                <input
                  type="text"
                  value={identifiedPlant?.species || ''}
                  placeholder={t('placeholder_species')}
                  className={inputClass}
                  onChange={(e) => setIdentifiedPlant(prev => ({ ...prev, species: e.target.value }))}
                />
              </div>
              <div>
                <label className={labelClass}>{t('lbl_nickname')}</label>
                <input
                  type="text"
                  value={identifiedPlant?.nickname ? lv(identifiedPlant.nickname) : ''}
                  placeholder={t('placeholder_nickname')}
                  className={inputClass}
                  onChange={(e) => setIdentifiedPlant(prev => ({ ...prev, nickname: { en: e.target.value } as any }))}
                />
              </div>

              <div>
                <label className={labelClass}>Photo (Optional)</label>
                <div className="flex items-center gap-3 flex-wrap">
                  {specimenImages.map((img, idx) => (
                    <div key={idx} className="relative w-16 h-16 rounded-2xl overflow-hidden border border-md-outline-variant/50 group">
                      <img src={img} className="w-full h-full object-cover" alt={`Manual specimen ${idx}`} />
                      <button
                        type="button"
                        onClick={() => setSpecimenImages(prev => prev.filter((_, i) => i !== idx))}
                        className="absolute inset-0 bg-black/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  {specimenImages.length < 4 && (
                    <button
                      type="button"
                      onClick={() => manualFileInputRef.current?.click()}
                      className="w-16 h-16 rounded-2xl border-2 border-dashed border-md-outline-variant flex items-center justify-center text-md-on-surface-variant hover:border-md-primary hover:text-md-primary transition-colors"
                      title={t('choose_picture')}
                    >
                      <ImagePlus className="w-5 h-5" />
                    </button>
                  )}
                  <input type="file" ref={manualFileInputRef} className="hidden" accept="image/*" onChange={(e) => handleFileSelect(e, true)} />
                </div>
              </div>

              <div>
                <label className={labelClass}>{t('lbl_propagation_instructions')}</label>
                <textarea
                  value={identifiedPlant?.propagationInstructions ? lv(identifiedPlant.propagationInstructions) : ''}
                  placeholder={t('placeholder_guide')}
                  className="w-full p-4 bg-md-surface-container-highest border border-md-outline-variant/60 rounded-2xl text-sm text-md-on-surface placeholder:text-md-on-surface-variant/60 outline-none focus:border-md-primary focus:ring-2 focus:ring-md-primary/20 transition-all min-h-[96px]"
                  onChange={(e) => setIdentifiedPlant(prev => ({ ...prev, propagationInstructions: { en: e.target.value } as any }))}
                />
              </div>
              <div>
                <label className={labelClass}>{t('lbl_repotting_instructions')}</label>
                <textarea
                  value={identifiedPlant?.repottingInstructions ? lv(identifiedPlant.repottingInstructions) : ''}
                  placeholder={t('placeholder_guide')}
                  className="w-full p-4 bg-md-surface-container-highest border border-md-outline-variant/60 rounded-2xl text-sm text-md-on-surface placeholder:text-md-on-surface-variant/60 outline-none focus:border-md-primary focus:ring-2 focus:ring-md-primary/20 transition-all min-h-[96px]"
                  onChange={(e) => setIdentifiedPlant(prev => ({ ...prev, repottingInstructions: { en: e.target.value } as any }))}
                />
              </div>

              <div className="pt-4 border-t border-md-outline-variant/30 space-y-4">
                <h4 className="text-xs font-bold text-md-primary uppercase tracking-wider ml-1">{t('lbl_provenance_history')}</h4>
                <div>
                  <label className={labelClass}>{t('lbl_nursery_origin')}</label>
                  <input
                    type="text"
                    value={nursery}
                    onChange={(e) => setNursery(e.target.value)}
                    className={inputClass}
                    placeholder={t('lbl_nursery_origin')}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3.5">
                  <div>
                    <label className={labelClass}>{t('lbl_acquisition_date')}</label>
                    <input
                      type="date"
                      value={dateOfPurchase}
                      onChange={(e) => setDateOfPurchase(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>{t('lbl_last_watered_date')}</label>
                    <input
                      type="date"
                      value={editLastWateredDate || ''}
                      onChange={(e) => setEditLastWateredDate(e.target.value || null)}
                      className={inputClass}
                    />
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="flex-[3]">
                    <label className={labelClass}>{t('lbl_cost')}</label>
                    <input
                      type="number"
                      value={cost || ''}
                      onChange={(e) => setCost(parseFloat(e.target.value) || null)}
                      className={inputClass}
                    />
                  </div>
                  <div className="flex-1 min-w-[90px]">
                    <label className={labelClass}>{t('lbl_ccy')}</label>
                    <select
                      className={`${inputClass} appearance-none`}
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

            <div className="flex flex-wrap gap-2.5 pt-2">
              <Button variant="tonal" className="flex-1" onClick={reset}>{t('cancel')}</Button>
              <Button
                variant="outlined"
                className="flex-1"
                onClick={() => void handleQuickAdd(identifiedPlant?.species || '', false)}
                disabled={!identifiedPlant?.species?.trim() || isBusy}
                isLoading={isBusy}
              >
                <Zap className="w-4 h-4" />
                <span>Quick Save</span>
              </Button>
              <Button
                variant="primary"
                className="flex-[1.5]"
                onClick={handleManualGenerate}
                disabled={!identifiedPlant?.species?.trim() || isBusy}
              >
                {t('btn_generate_dossier')}
              </Button>
            </div>
          </div>
        )}

        {scanMode === 'PROCESSING' && (
          <div className="flex flex-col items-center justify-center space-y-8 py-10 animate-in fade-in duration-300">
            <div className="relative">
              <div className="w-24 h-24 rounded-[28px] bg-md-primary-container text-md-on-primary-container shadow-md flex items-center justify-center">
                <Sprout className="w-11 h-11 animate-pulse" />
              </div>
              <div className="absolute -inset-3 border-2 border-md-primary/25 rounded-[36px] animate-[spin_10s_linear_infinite]" />
            </div>

            <div className="text-center space-y-2 max-w-md px-4">
              <h2 className="text-xl md:text-2xl font-bold text-md-on-surface tracking-tight">
                {progressState.status}
              </h2>
              <p className="text-xs font-semibold text-md-primary tracking-wider uppercase animate-pulse">
                {t('msg_establishing_uplink')}
              </p>
            </div>

            <div className="w-full max-w-xs space-y-2">
              <div className="h-2 w-full bg-md-surface-container-highest rounded-full overflow-hidden">
                <div
                  className="h-full bg-md-primary transition-all duration-500 rounded-full"
                  style={{ width: `${progressState.percent}%` }}
                />
              </div>
              <div className="flex justify-between text-xs font-semibold text-md-on-surface-variant">
                <span>{progressState.percent}%</span>
                <span>{t('lbl_est_remaining').replace('{time}', countdown.toString())}</span>
              </div>
            </div>

            <div className="w-full max-w-md bg-md-surface-container rounded-2xl p-4 border border-md-outline-variant/30 space-y-2">
              {logs.slice(-3).map((log, idx) => (
                <div key={idx} className="flex items-center gap-2.5 text-xs font-medium text-md-on-surface-variant animate-in slide-in-from-bottom-2 fade-in duration-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-md-primary shrink-0" />
                  <span className="truncate">{log.message}</span>
                </div>
              ))}
            </div>

            {error && (
              <div className="w-full max-w-md bg-md-error-container text-md-on-error-container p-5 rounded-[24px] text-center space-y-3">
                <div className="w-10 h-10 bg-md-error/15 text-md-error rounded-full flex items-center justify-center mx-auto">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <h4 className="text-xs font-bold uppercase tracking-wider">{t('lbl_uplink_fault')}</h4>
                <p className="text-xs leading-relaxed opacity-90">
                  {error.includes('503') || error.includes('high demand') ? t('msg_server_overloaded') : error}
                </p>
                <div className="flex gap-2.5 justify-center pt-1">
                  {processingContext === 'SAVE' ? (
                    <>
                      <Button variant="tonal" size="sm" onClick={() => void handleSave(false)}>
                        <RotateCcw className="w-3.5 h-3.5" />
                        {t('btn_retry')}
                      </Button>
                      <Button variant="outlined" size="sm" onClick={() => { setError(null); setScanMode('REVIEW'); }}>
                        Back to Review
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button variant="tonal" size="sm" onClick={initiateSync}>
                        <RotateCcw className="w-3.5 h-3.5" />
                        {t('btn_retry')}
                      </Button>
                      <Button variant="outlined" size="sm" onClick={reset}>
                        {t('btn_reset_protocol')}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {scanMode === 'REVIEW' && identifiedPlant && (
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
            <div className="transform scale-95 -mt-2 origin-top">
              <PlantCard
                plant={{
                  ...identifiedPlant,
                  nickname: { en: editNickname } as any,
                  category: editCategory ? inferPlantCategory({ ...identifiedPlant, category: editCategory }) : identifiedPlant.category,
                  room: { en: editRoom } as any
                }}
                showActions={false}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 px-1">
              <div>
                <label className={labelClass}>{t('lbl_nickname')}</label>
                <input
                  type="text"
                  value={editNickname}
                  onChange={(e) => setEditNickname(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>{t('lbl_category') || 'Category'}</label>
                <input
                  type="text"
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  className={inputClass}
                  placeholder={t('placeholder_category') || 'e.g. Tree, Aroid, Succulent...'}
                />
              </div>
              <div>
                <label className={labelClass}>Specimen Type</label>
                <select
                  className={`${inputClass} appearance-none`}
                  value={identifiedPlant.specimenType || 'PLANT'}
                  onChange={(e) => {
                    const nextType = e.target.value as 'PLANT' | 'TREE';
                    setIdentifiedPlant({ ...identifiedPlant, specimenType: nextType });
                    if (nextType === 'TREE' && (!editCategory || editCategory === 'Foliage Plant')) {
                      setEditCategory(lv(inferPlantCategory({ ...identifiedPlant, specimenType: 'TREE' }) as any));
                    }
                  }}
                >
                  <option value="PLANT">Plant / Houseplant</option>
                  <option value="TREE">Tree / Woody Specimen</option>
                </select>
              </div>
              {isAdmin && (
                <div>
                  <label className={labelClass}>{t('lbl_house')}</label>
                  <select
                    className={`${inputClass} appearance-none`}
                    value={selectedHouseId || ''}
                    onChange={(e) => setSelectedHouseId(e.target.value || null)}
                  >
                    <option value="">{t('labels_all_global_properties')}</option>
                    {houses.map(h => (
                      <option key={h.id} value={h.id}>{lv(h.name)}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className={labelClass}>{t('lbl_room')}</label>
                <select
                  className={`${inputClass} appearance-none`}
                  value={editRoom}
                  onChange={(e) => setEditRoom(e.target.value)}
                >
                  <option value="">{t('assign_room_label')}</option>
                  {allRooms.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>{t('lbl_hydration_interval_days')}</label>
                <input
                  type="number"
                  value={editWateringInterval || ''}
                  onChange={(e) => setEditWateringInterval(parseInt(e.target.value) || null)}
                  className={inputClass}
                  placeholder={t('placeholder_days')}
                />
              </div>
              <div>
                <label className={labelClass}>{t('lbl_repot_frequency')}</label>
                <input
                  type="number"
                  value={editRepottingFrequency || ''}
                  onChange={(e) => setEditRepottingFrequency(parseInt(e.target.value) || null)}
                  className={inputClass}
                  placeholder={t('lbl_months')}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>{t('lbl_size_cm')}</label>
                  <input
                    type="number"
                    value={editLastPotSizeCm || ''}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || null;
                      setEditLastPotSizeCm(val);
                      if (val) {
                        setEditLastPotSizeInches(Number((val / 2.54).toFixed(2)));
                        setEditLastPotSize(val.toString());
                      } else {
                        setEditLastPotSizeInches(null);
                        setEditLastPotSize('');
                      }
                    }}
                    className={inputClass}
                    placeholder="cm"
                  />
                </div>
                <div>
                  <label className={labelClass}>{t('lbl_size_inches')}</label>
                  <input
                    type="number"
                    value={editLastPotSizeInches || ''}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || null;
                      setEditLastPotSizeInches(val);
                      if (val) {
                        const cm = Number((val * 2.54).toFixed(2));
                        setEditLastPotSizeCm(cm);
                        setEditLastPotSize(cm.toString());
                      } else {
                        setEditLastPotSizeCm(null);
                        setEditLastPotSize('');
                      }
                    }}
                    className={inputClass}
                    placeholder="inches"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4 px-1">
              <div>
                <label className={labelClass}>{t('lbl_nursery_origin')}</label>
                <input
                  type="text"
                  value={nursery}
                  onChange={(e) => setNursery(e.target.value)}
                  className={inputClass}
                  placeholder={t('lbl_nursery_origin')}
                />
              </div>
              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className={labelClass}>{t('lbl_acquisition_date')}</label>
                  <input
                    type="date"
                    value={dateOfPurchase}
                    onChange={(e) => setDateOfPurchase(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>{t('lbl_last_watered_date')}</label>
                  <input
                    type="date"
                    value={editLastWateredDate || ''}
                    onChange={(e) => setEditLastWateredDate(e.target.value || null)}
                    className={inputClass}
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex-[3]">
                  <label className={labelClass}>{t('lbl_cost')}</label>
                  <input
                    type="number"
                    value={cost || ''}
                    onChange={(e) => setCost(parseFloat(e.target.value) || null)}
                    className={inputClass}
                  />
                </div>
                <div className="flex-1 min-w-[90px]">
                  <label className={labelClass}>{t('lbl_ccy')}</label>
                  <select
                    className={`${inputClass} appearance-none`}
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

            {compatibleItems.length > 0 && (
              <div className="p-5 bg-md-secondary-container/40 rounded-[24px] border border-md-outline-variant/30">
                <p className="text-xs font-bold text-md-primary uppercase tracking-wider mb-3">{t('lbl_compatible_items')}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {compatibleItems.map(item => (
                    <div key={item.id} className="flex items-center gap-3 bg-md-surface-container-lowest p-3 rounded-2xl border border-md-outline-variant/30">
                      <div className="w-10 h-10 rounded-xl overflow-hidden bg-md-surface-container-highest shrink-0">
                        {item.images && item.images[0] && <img src={item.images[0]} className="w-full h-full object-cover" alt="" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold truncate text-md-on-surface">{lv(item.name)}</p>
                        <p className="text-[11px] text-md-on-surface-variant">{t(`cat_${item.category.replace('-', '_')}`)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2.5 pt-2">
              <Button variant="tonal" className="flex-1" onClick={reset}>{t('cancel')}</Button>
              <Button variant="outlined" className="flex-1" onClick={() => void handleSave(false)} isLoading={isBusy} disabled={isBusy}>
                {t('btn_confirm_specimen')}
              </Button>
              <Button variant="primary" className="flex-[1.5]" onClick={() => void handleSave(true)} isLoading={isBusy} disabled={isBusy}>
                <Printer className="w-4 h-4" />
                <span>Save & Print Label</span>
              </Button>
            </div>
          </div>
        )}

        {scanMode === 'DONE' && savedPlant && (
          <div className="py-6 px-2 space-y-6 text-center animate-in fade-in zoom-in-95 duration-300">
            <div className="w-16 h-16 rounded-full bg-md-primary-container text-md-on-primary-container flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h3 className="text-xl font-bold text-md-on-surface tracking-tight">
                {lv(savedPlant.nickname) || savedPlant.species} Added
              </h3>
              <p className="text-sm italic font-serif text-md-primary">{savedPlant.species}</p>
              <p className="text-xs font-mono text-md-on-surface-variant pt-1">
                Barcode ID: {getShortBarcodeId(savedPlant.id)}
              </p>
              <p className="text-[11px] text-md-primary font-medium pt-1">
                AI & botanical archive enrichment continues in the background.
              </p>
            </div>

            {printStatus && (
              <div className="p-3 rounded-2xl bg-md-surface-container-high border border-md-outline-variant/30 text-xs font-medium text-md-on-surface">
                {printStatus}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Button
                type="button"
                variant="primary"
                isLoading={isPrintingLabel}
                onClick={() => void handlePrintSavedLabel(savedPlant)}
              >
                <Printer className="w-4 h-4" />
                <span>Print Label (Niimbot D110)</span>
              </Button>
              <Button
                type="button"
                variant="tonal"
                onClick={() => {
                  const name = (lv(savedPlant.nickname) || savedPlant.species || 'label').replace(/[^a-z0-9_-]+/gi, '_');
                  exportPlantsToNiimbotExcel([savedPlant], lv, `verdant_${name}_label.xlsx`);
                  setPrintStatus('Label spreadsheet downloaded (.xlsx)');
                }}
              >
                <Download className="w-4 h-4" />
                <span>Download Label (.xlsx)</span>
              </Button>
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outlined" className="flex-1" onClick={reset}>
                <Plus className="w-4 h-4" />
                <span>Add Another</span>
              </Button>
              <Button type="button" variant="ghost" className="flex-1" onClick={() => { onClose(); reset(); }}>
                Done
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};