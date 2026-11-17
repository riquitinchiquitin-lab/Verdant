
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Leaf, Camera, Edit3, Activity, ScanBarcode, Droplets, FileText, Star, FlaskConical, Scissors, Sprout, Flower2, ArrowLeftRight, Globe, Ruler, Tag, Home, Sun, X, RefreshCw, Calendar, Dna, Wheat, Snowflake, Trash2, ShieldCheck, ShieldAlert, Sparkles, Bug, Plus, SlidersHorizontal, AlertTriangle, MapPin } from 'lucide-react';
import { Plant, Log, LogType, LocalizedString } from '../types';
import { Button } from './ui/Button';
import { usePlants } from '../context/PlantContext';
import { useLanguage } from '../context/LanguageContext';
import { compressImage } from '../services/imageUtils';
import { EditPlantModal } from './EditPlantModal';
import { useAuth } from '../context/AuthContext';
import { CameraCapture } from './ui/CameraCapture';
import { TransferModal } from './TransferModal';
import { ConfirmationDialog } from './ui/ConfirmationDialog';
import { Logo } from './ui/Logo';
import { FertilizerLogModal } from './FertilizerLogModal';
import { MoistureLogModal } from './MoistureLogModal';
import { PhenophaseLogModal } from './PhenophaseLogModal';
import { HealthCheckModal } from './HealthCheckModal';
import { PlantLogEntry } from './PlantLogEntry';
import { PotRotationIcon } from './ui/Icons';
import { useInventory } from '../context/InventoryContext';
import { PhenophaseType } from '../types';
import { translateInput } from '../services/translationService';
import { generateUUID } from '../services/crypto';
import { getShortBarcodeId } from '../services/barcodeService';
import { checkPlantCompatibility } from '../utils/compatibility';
import { refreshPlantRecord } from '../services/plantAi';

interface PlantDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  plant: Plant | null;
}

const MoistureProbeIcon = ({ className }: { className?: string }) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <rect x="7" y="2" width="10" height="9" rx="2" />
    <path d="M10 11v11" />
    <path d="M14 11v11" />
    <path d="M10 6h4" />
  </svg>
);

export const PlantDetailsModal: React.FC<PlantDetailsModalProps> = ({ isOpen, onClose, plant: initialPlant }) => {
  const { updatePlant, plants, houses, addLog, deleteLog, deletePlant, setAlertMessage, getEffectiveApiKey } = usePlants();
  const { consumeItem } = useInventory();
  const { t, lv, lva, language } = useLanguage();
  const { user } = useAuth();
  const [compatHouseId, setCompatHouseId] = useState<string>('');

  const PassportItem = ({ icon, label, value, subValue }: { icon: React.ReactNode, label: string, value: string, subValue?: string }) => (
    <div className="space-y-2">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-xl bg-md-surface-container-highest text-md-primary flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div className="flex flex-col">
          <span className="text-[11px] font-semibold text-md-on-surface-variant uppercase tracking-wider">{label}</span>
          {subValue && <span className="text-[10px] text-md-primary font-semibold">{subValue}</span>}
        </div>
      </div>
      <p className="text-sm font-medium text-md-on-surface leading-relaxed pl-[42px]">{value || t('lbl_na')}</p>
    </div>
  );

  const TechMetric = ({
    label,
    min,
    max,
    unit,
    advice,
    scaleMin = 0,
    scaleMax = 100
  }: {
    label: string;
    min?: number | null;
    max?: number | null;
    unit: string;
    advice: string;
    scaleMin?: number;
    scaleMax?: number;
  }) => {
    const hasMin = min !== undefined && min !== null;
    const hasMax = max !== undefined && max !== null;
    const span = Math.max(scaleMax - scaleMin, 1);

    let leftPct = 0;
    let widthPct = 0;
    let dotPct = 50;
    let isSingleTarget = false;

    if (hasMin && hasMax) {
      const clampedMin = Math.max(scaleMin, Math.min(scaleMax, min!));
      const clampedMax = Math.max(clampedMin, Math.min(scaleMax, max!));
      leftPct = ((clampedMin - scaleMin) / span) * 100;
      widthPct = Math.max(((clampedMax - clampedMin) / span) * 100, 10);
    } else if (hasMin || hasMax) {
      isSingleTarget = true;
      const val = (hasMin ? min! : max!);
      const clamped = Math.max(scaleMin, Math.min(scaleMax, val));
      dotPct = ((clamped - scaleMin) / span) * 100;
    }

    return (
      <div className="relative space-y-3 p-5 bg-md-surface-container rounded-[20px] border border-md-outline-variant/25 hover:border-md-primary/40 transition-all duration-300" title={advice}>
        <p className="text-xs font-medium text-md-on-surface-variant">{label}</p>
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl sm:text-3xl font-bold text-md-on-surface tracking-tight">
            {hasMin && hasMax ? `${min}–${max}` : (min ?? max ?? t('lbl_na'))}
          </span>
          <span className="text-xs font-medium text-md-on-surface-variant">{unit}</span>
        </div>
        <div className="space-y-1.5 pt-1">
          <div className="relative h-2 w-full bg-md-surface-container-highest rounded-full overflow-visible">
            {hasMin || hasMax ? (
              isSingleTarget ? (
                <div
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-md-primary shadow-sm ring-4 ring-md-primary/20 transition-all duration-500"
                  style={{ left: `${dotPct}%` }}
                />
              ) : (
                <div
                  className="absolute top-0 bottom-0 bg-md-primary rounded-full shadow-xs transition-all duration-500"
                  style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                />
              )
            ) : null}
          </div>
          <div className="flex justify-between text-[10px] font-medium text-md-on-surface-variant/70">
            <span>{isSingleTarget ? `${min ?? max}` : 'min'}</span>
            <span>{isSingleTarget ? unit : 'max'}</span>
          </div>
        </div>
      </div>
    );
  };

  const getSuggestedRepotFrequency = (p: Plant): number => {
    if (p.repottingFrequency) return p.repottingFrequency;
    const category = lv(p.category as any).toLowerCase();
    const growthRate = lv(p.growthRate as any).toLowerCase() || 'moderate';
    if (category.includes('araceae') || category.includes('philodendron') || category.includes('monstera')) {
      return growthRate === 'fast' ? 12 : 18;
    }
    if (category.includes('succulent') || category.includes('cactus')) return 24;
    if (growthRate === 'fast') return 12;
    if (growthRate === 'slow') return 24;
    return 18;
  };
  
  const [isHealthOpen, setIsHealthOpen] = useState(false);
  const [isAddingPhoto, setIsAddingPhoto] = useState(false);
  const [isCapturingFromCamera, setIsCapturingFromCamera] = useState(false);
  const [enlargedImageIndex, setEnlargedImageIndex] = useState<number | null>(null);
  const [enlargedLogImage, setEnlargedLogImage] = useState<string | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [isFertilizerOpen, setIsFertilizerOpen] = useState(false);
  const [isMoistureOpen, setIsMoistureOpen] = useState(false);
  const [isPhenophaseOpen, setIsPhenophaseOpen] = useState(false);
  const [isNoteOpen, setIsNoteOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'DOSSIER' | 'TIMELINE' | 'TECH' | 'PHENOPHASE'>('DOSSIER');
  const [lastLoggedAction, setLastLoggedAction] = useState<LogType | null>(null);
  const [isDeleteConfirmationOpen, setIsDeleteConfirmationOpen] = useState(false);
  const [isTogglingPriority, setIsTogglingPriority] = useState(false);
  const [isRefreshingData, setIsRefreshingData] = useState(false);
  const [showMoreActions, setShowMoreActions] = useState(false);
  
  
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const addPhotoInputRef = useRef<HTMLInputElement>(null);
  
  const plant = useMemo(() => plants.find(p => p.id === initialPlant?.id) || initialPlant, [plants, initialPlant]);

  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!plant) return null;

  const handleAddNewImageFromCamera = async (base64: string) => {
    setIsCapturingFromCamera(false);
    try {
        await updatePlant(plant.id, { images: [...(plant.images || []), base64] });
    } catch (e) { console.error(e); }
  };

  const handleUpdateMainImageFromFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
        try {
            const base64 = await compressImage(e.target.files[0]);
            await updatePlant(plant.id, { images: [base64, ...(plant.images?.slice(1) || [])] });
        } catch (e) { console.error(e); }
    }
    if (avatarInputRef.current) avatarInputRef.current.value = '';
  };

  const handleAddNewImageFromFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
        try {
            const base64 = await compressImage(e.target.files[0]);
            await updatePlant(plant.id, { images: [...(plant.images || []), base64] });
        } catch (e) { console.error(e); }
    }
    if (addPhotoInputRef.current) addPhotoInputRef.current.value = '';
  };

  const handleDeleteImage = async (index: number) => {
    if (!plant.images || plant.images.length <= 1) return;
    const newImages = [...plant.images];
    newImages.splice(index, 1);
    await updatePlant(plant.id, { images: newImages });
    setEnlargedImageIndex(null);
  };

  const handleSetMainImage = async (index: number) => {
    if (!plant.images || index === 0) return;
    const newImages = [...plant.images];
    const mainImage = newImages.splice(index, 1);
    newImages.unshift(mainImage[0]);
    await updatePlant(plant.id, { images: newImages });
  };

  const handleLogAction = async (type: LogType) => {
    if (type === 'FERTILIZED') {
      setIsFertilizerOpen(true);
      return;
    }
    if (type === 'PHENOPHASE') {
      setIsPhenophaseOpen(true);
      return;
    }
    if (type === 'TRANSFER' as any) {
      setIsTransferOpen(true);
      return;
    }
    const date = new Date();
    // Simplified: addLog handles default note translation using the correct API key
    await addLog(plant.id, { 
      id: `l-${generateUUID()}`, 
      date: date.toISOString(), 
      type
    });
    setLastLoggedAction(type);

    const actionTextMap: { [key in LogType]?: string } = {
      'WATER': t('log_action_watered'),
      'FERTILIZED': t('log_action_fertilized'),
      'PRUNED': t('log_action_pruned'),
      'REPOTTED': t('log_action_repotted'),
      'FLOWER': t('log_action_flowered'),
      'NEW_LEAF': t('log_new_leaf'),
      'ROTATED': t('log_rotated_manual'),
    };
    const actionText = actionTextMap[type] || type;

    const dateString = date.toLocaleDateString(language, { month: 'long', day: 'numeric' });
    const message = t('log_alert_message').replace('{action}', actionText).replace('{date}', dateString);
    setAlertMessage(message);

    setTimeout(() => setLastLoggedAction(null), 2000);
    setTimeout(() => setAlertMessage(null), 4000);
  };

  const handleMoistureLog = async (value: number) => {
    const date = new Date();
    const noteText = t('lbl_moisture_level_log', { value: value.toString() });
    const localizedNote = await translateInput(noteText, language, getEffectiveApiKey());
    await addLog(plant.id, { 
      id: `l-${generateUUID()}`, 
      date: date.toISOString(), 
      type: 'MOISTURE', 
      value,
      localizedNote
    });
    setLastLoggedAction('MOISTURE');
    const dateString = date.toLocaleDateString(language, { month: 'long', day: 'numeric' });
    setAlertMessage(t('lbl_logged_moisture_alert', { value: value.toString(), date: dateString }));
    setTimeout(() => setLastLoggedAction(null), 2000);
    setTimeout(() => setAlertMessage(null), 4000);
  };

  const handleFertilizerLog = async (fertilizer: any, amount: number) => {
    const date = new Date();
    const noteText = t('lbl_fertilized_with_log', { amount: amount.toString(), unit: fertilizer.unit, name: lv(fertilizer.name) });
    const localizedNote = await translateInput(noteText, language, getEffectiveApiKey());
    await addLog(plant.id, { 
      id: `l-${generateUUID()}`, 
      date: date.toISOString(), 
      type: 'FERTILIZED', 
      localizedNote,
      metadata: { fertilizerId: fertilizer.id, amount, unit: fertilizer.unit }
    });
    consumeItem(fertilizer.id, amount);
    setLastLoggedAction('FERTILIZED');

    const dateString = date.toLocaleDateString(language, { month: 'long', day: 'numeric' });
    const message = t('log_alert_message').replace('{action}', t('log_action_fertilized')).replace('{date}', dateString);
    setAlertMessage(message);

    setTimeout(() => setLastLoggedAction(null), 2000);
    setTimeout(() => setAlertMessage(null), 4000);
  };

  const handlePhenophaseLog = async (phase: PhenophaseType, date: string, note: string) => {
    const localizedNote = await translateInput(note, language, getEffectiveApiKey());
    await addLog(plant.id, { 
      id: `l-${generateUUID()}`, 
      date: new Date(date).toISOString(), 
      type: 'PHENOPHASE', 
      localizedNote,
      metadata: { phase }
    });
    setLastLoggedAction('PHENOPHASE');
    setAlertMessage(t('lbl_recorded_phenophase_alert', { phase: t(`PHASE_${phase}` as any) }));
    setTimeout(() => setLastLoggedAction(null), 2000);
    setTimeout(() => setAlertMessage(null), 4000);
  };

  const handleManualLog = (type: LogType, localizedNote: LocalizedString) => {
    const date = new Date();
    addLog(plant.id, { 
      id: `l-${generateUUID()}`, 
      date: date.toISOString(), 
      type, 
      localizedNote
    });
    setLastLoggedAction(type);
    
    const actionTextMap: { [key in LogType]?: string } = {
      'NOTE': t('log_note'),
      'WATER': t('log_water'),
      'FERTILIZED': t('log_fertilized'),
      'REPOTTED': t('log_repotted'),
      'PRUNED': t('log_pruned'),
      'NEW_LEAF': t('log_new_leaf'),
      'FLOWER': t('log_flower'),
      'DISEASE_CHECK': t('log_disease_check'),
    };
    const actionText = actionTextMap[type] || type;
    
    const dateString = date.toLocaleDateString(language, { month: 'long', day: 'numeric' });
    setAlertMessage(t('log_alert_message').replace('{action}', actionText).replace('{date}', dateString));
    
    setTimeout(() => setLastLoggedAction(null), 2000);
    setTimeout(() => setAlertMessage(null), 4000);
  };

  const handleTogglePriority = async () => {
    if (isTogglingPriority) return;
    setIsTogglingPriority(true);
    try {
      const newPriorityStatus = !plant.isPriority;
      await updatePlant(plant.id, { isPriority: newPriorityStatus });
      
      const actionText = newPriorityStatus ? t('btn_set_priority') : t('btn_remove_priority');
      const dateString = new Date().toLocaleDateString(language, { month: 'long', day: 'numeric' });
      const message = t('log_alert_message').replace('{action}', actionText).replace('{date}', dateString);
      setAlertMessage(message);
      setTimeout(() => setAlertMessage(null), 4000);
    } catch (e) {
      console.error("Failed to toggle priority:", e);
    } finally {
      setIsTogglingPriority(false);
    }
  };

  const handleRefreshPlantData = async () => {
    if (isRefreshingData || !plant) return;
    setIsRefreshingData(true);
    try {
      const updates = await refreshPlantRecord(plant, getEffectiveApiKey());
      await updatePlant(plant.id, updates);
      setAlertMessage(`Botanical data refreshed for ${lv(plant.nickname) || plant.species}`);
      setTimeout(() => setAlertMessage(null), 4000);
    } catch (e: any) {
      console.error('Failed to refresh botanical data:', e);
      setAlertMessage(e?.message || 'Failed to refresh botanical data');
      setTimeout(() => setAlertMessage(null), 4000);
    } finally {
      setIsRefreshingData(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleteConfirmationOpen(false);
    await deletePlant(plant.id);
    onClose();
  };

  const lastWateredDate = plant.lastWatered ? new Date(plant.lastWatered).toLocaleDateString(language, { month: 'short', day: 'numeric', year: 'numeric' }) : t('lbl_na');

  const getLogIcon = (log: Log): React.ReactNode => {
    if (log.type === 'PHENOPHASE' && log.metadata?.phase) {
      switch(log.metadata.phase) {
        case 'FIRST_BUD': return <Sprout className="w-5 h-5" />;
        case 'FULL_BLOOM': return <Flower2 className="w-5 h-5" />;
        case 'SEED_SET': return <Wheat className="w-5 h-5" />;
        case 'DORMANCY_ENTRANCE': return <Leaf className="w-5 h-5" />;
        case 'FIRST_LEAF_SPRING': return <Leaf className="w-5 h-5" />;
        case 'BUDDING': return <Sprout className="w-5 h-5" />;
        case 'IN_FLOWER': return <Flower2 className="w-5 h-5" />;
        case 'DORMANCY_START': return <Snowflake className="w-5 h-5" />;
      }
    }
    switch(log.type) {
        case 'WATER': return <Droplets className="w-5 h-5" />;
        case 'FERTILIZED': return <FlaskConical className="w-5 h-5" />;
        case 'REPOTTED': return <Sprout className="w-5 h-5" />;
        case 'PRUNED': return <Scissors className="w-5 h-5" />;
        case 'NEW_LEAF': return <Leaf className="w-5 h-5" />;
        case 'FLOWER': return <Flower2 className="w-5 h-5" />;
        case 'DISEASE_CHECK': return <Activity className="w-5 h-5" />;
        case 'IMAGE': return <Camera className="w-5 h-5" />;
        case 'NOTE': return <FileText className="w-5 h-5" />;
        case 'MOISTURE': return <MoistureProbeIcon className="w-5 h-5" />;
        case 'PHENOPHASE': return <Dna className="w-5 h-5" />;
        case 'ROTATED': return <PotRotationIcon className="w-5 h-5" />;
        default: return <Tag className="w-5 h-5" />;
    }
  };

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-500 ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
      <div className="absolute inset-0 bg-black/80 backdrop-blur-xl" onClick={onClose} />
      
      <div className="relative w-full h-full lg:w-[90vw] lg:h-[90vh] lg:max-h-[96vh] bg-md-surface text-md-on-surface lg:rounded-[28px] shadow-2xl lg:m-4 animate-in zoom-in-95 duration-300 border border-md-outline-variant/40 overflow-hidden flex flex-col">
        {/* TOP NAVIGATION / SEGMENTED PILL TABS + CLOSE BUTTON */}
        <div className="flex items-center justify-between gap-3 border-b border-md-outline-variant/25 bg-md-surface-container-low/95 backdrop-blur-md shrink-0 z-50 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-3 px-4 md:px-6">
            <div className="hidden md:block w-10 shrink-0" />
            <div className="flex items-center p-1 rounded-full bg-md-surface-container-highest/80 border border-md-outline-variant/25 overflow-x-auto no-scrollbar flex-nowrap">
                {[
                    { id: 'DOSSIER', label: t('tab_dossier') }, 
                    { id: 'TECH', label: t('tab_tech') }, 
                    { id: 'PHENOPHASE', label: t('tab_phenophase') },
                    { id: 'TIMELINE', label: t('tab_history') }
                ].map(tab => (
                    <button 
                        key={tab.id} 
                        onClick={() => setActiveTab(tab.id as any)} 
                        className={`m3-state-layer text-xs font-semibold transition-all relative px-4 md:px-6 h-9 rounded-full whitespace-nowrap flex items-center justify-center min-w-0 ${
                          activeTab === tab.id 
                            ? 'bg-md-primary-container text-md-on-primary-container shadow-xs' 
                            : 'text-md-on-surface-variant hover:text-md-on-surface'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>
            <button 
                onClick={onClose}
                className="m3-state-layer w-10 h-10 shrink-0 bg-md-surface-container-high text-md-on-surface rounded-full flex items-center justify-center transition-all border border-md-outline-variant/40 group"
                title={t('btn_close')}
                aria-label={t('btn_close')}
            >
                <X className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300" />
            </button>
        </div>
        
        <div className="flex-1 overflow-y-auto no-scrollbar flex flex-col bg-md-surface text-md-on-surface">
            <div className="max-w-5xl mx-auto w-full p-4 sm:p-6 lg:p-8 space-y-5">
                {/* HERO SECTION */}
                <div className="relative rounded-[24px] overflow-hidden shadow-md border border-md-outline-variant/25">
                  <div className="relative h-[260px] sm:h-[320px] md:h-[380px] w-full overflow-hidden bg-md-surface-container-highest">
                    {plant.images?.[0] ? (
                      <motion.img
                        initial={{ scale: 1.04, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        src={plant.images[0]}
                        alt={lv(plant.nickname)}
                        className="h-full w-full object-cover relative z-10 cursor-pointer"
                        onClick={() => setEnlargedImageIndex(0)}
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center relative z-10">
                        <Leaf className="h-20 w-20 text-md-on-surface-variant/40" />
                      </div>
                    )}

                    {/* Top Barcode Pill + Priority Star */}
                    <div className="absolute top-4 left-4 right-4 z-20 flex items-center justify-between gap-2 pointer-events-none">
                      <div className="flex items-center gap-1.5 text-[11px] font-mono font-semibold text-white/95 px-3 py-1.5 rounded-full bg-black/55 backdrop-blur-md border border-white/15 pointer-events-auto">
                        <ScanBarcode className="w-3.5 h-3.5 text-emerald-300" />
                        <span>{getShortBarcodeId(plant.id)}</span>
                      </div>
                      {plant.isPriority && (
                        <div className="flex items-center gap-1 bg-amber-400/25 backdrop-blur-md px-2.5 py-1 rounded-full border border-amber-300/35">
                          <Star className="w-3.5 h-3.5 text-amber-300 fill-current" />
                          <span className="text-[11px] font-semibold text-amber-100">{t('lbl_priority_specimen')}</span>
                        </div>
                      )}
                    </div>

                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent z-10 pointer-events-none" />
                    
                    <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-7 md:p-8 z-20 pointer-events-none">
                      <motion.div
                        initial={{ y: 16, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.1, duration: 0.45 }}
                      >
                        <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white tracking-tight leading-tight">
                          {lv(plant.nickname)}
                        </h2>
                        <p className="text-sm sm:text-base md:text-lg italic font-serif text-white/85 mt-0.5">
                          {plant.species || t('unclassified_specimen')}
                          {plant.variety ? <span className="not-italic font-sans text-xs text-white/70 ml-2">· {plant.variety}</span> : null}
                        </p>
                      </motion.div>
                    </div>
                  </div>
                </div>

                {/* UNIFIED CARE PULSE BAR */}
                {(() => {
                  const interval = plant.wateringInterval || 7;
                  let waterPulseText = `${interval}d`;
                  let waterOverdue = false;
                  if (plant.lastWatered) {
                    const nextWaterMs = new Date(plant.lastWatered).getTime() + interval * 86400000;
                    const daysAway = Math.ceil((nextWaterMs - Date.now()) / 86400000);
                    if (daysAway > 0) waterPulseText = `${daysAway}d`;
                    else if (daysAway === 0) { waterPulseText = t('due_today'); waterOverdue = true; }
                    else { waterPulseText = `-${Math.abs(daysAway)}d`; waterOverdue = true; }
                  }

                  const potDisplay = plant.lastPotSizeCm || plant.lastPotSizeInches
                    ? `${plant.lastPotSizeCm || '--'}cm`
                    : (plant.lastPotSize ? String(plant.lastPotSize) : t('lbl_na'));
                  const potMat = lv(plant.potMaterial as any);
                  const exposureDisplay = lv(plant.windowExposure as any)
                    || (plant.minLightLux && plant.maxLightLux ? `${plant.minLightLux}–${plant.maxLightLux} Lux` : (plant.minLightLux ? `${plant.minLightLux}+ Lux` : t('lbl_na')));

                  return (
                    <div className="bg-md-surface-container rounded-[20px] border border-md-outline-variant/25 grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-md-outline-variant/25">
                      <div className="px-4 py-3 space-y-0.5">
                        <p className="text-[11px] font-medium text-md-on-surface-variant">{t('lbl_next_water') || 'Next Water'}:</p>
                        <p className={`text-sm font-bold truncate ${waterOverdue ? 'text-md-error' : 'text-md-on-surface'}`}>{waterPulseText}</p>
                      </div>
                      <div className="px-4 py-3 space-y-0.5">
                        <p className="text-[11px] font-medium text-md-on-surface-variant">{t('lbl_light') || 'Light'}:</p>
                        <p className="text-sm font-bold text-md-on-surface truncate">{exposureDisplay}</p>
                      </div>
                      <div className="px-4 py-3 space-y-0.5">
                        <p className="text-[11px] font-medium text-md-on-surface-variant">{t('lbl_pot') || 'Pot'}:</p>
                        <p className="text-sm font-bold text-md-on-surface truncate">{potMat ? `${potDisplay} ${potMat}` : potDisplay}</p>
                      </div>
                      <div className="px-4 py-3 space-y-0.5">
                        <p className="text-[11px] font-medium text-md-on-surface-variant">{t('lbl_pet_safety_short') || 'Pet Safety'}:</p>
                        <p className={`text-sm font-bold truncate ${plant.isPetSafe ? 'text-md-primary' : 'text-md-error'}`}>
                          {plant.isPetSafe ? (t('lbl_pet_safe') || 'Pet Safe') : (t('lbl_toxic_short') || 'Toxic')}
                        </p>
                      </div>
                    </div>
                  );
                })()}

                {/* COMPACT PILL ACTION ROW */}
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <motion.button
                      whileTap={{ scale: 0.96 }}
                      onClick={() => handleLogAction('WATER')}
                      className={`m3-state-layer h-11 px-4 sm:px-5 rounded-full text-xs font-semibold flex items-center gap-2 transition-all ${lastLoggedAction === 'WATER' ? 'bg-md-primary text-md-on-primary' : 'bg-md-primary-container text-md-on-primary-container'}`}
                    >
                      <Droplets className="w-4 h-4" />
                      <span>{t('btn_hydrate')}</span>
                    </motion.button>
                    <motion.button
                      whileTap={{ scale: 0.96 }}
                      onClick={() => setIsMoistureOpen(true)}
                      className={`m3-state-layer h-11 px-4 sm:px-5 rounded-full text-xs font-semibold flex items-center gap-2 transition-all ${lastLoggedAction === 'MOISTURE' ? 'bg-md-primary text-md-on-primary' : 'bg-md-secondary-container text-md-on-secondary-container'}`}
                    >
                      <MoistureProbeIcon className="w-4 h-4" />
                      <span>{t('btn_probe')}</span>
                    </motion.button>
                    <motion.button
                      whileTap={{ scale: 0.96 }}
                      onClick={() => setIsNoteOpen(true)}
                      className={`m3-state-layer h-11 px-4 sm:px-5 rounded-full text-xs font-semibold flex items-center gap-2 transition-all ${lastLoggedAction === 'NOTE' ? 'bg-md-primary text-md-on-primary' : 'bg-md-tertiary-container text-md-on-tertiary-container'}`}
                    >
                      <FileText className="w-4 h-4" />
                      <span>{t('btn_log_caps')}</span>
                    </motion.button>
                    <motion.button
                      whileTap={{ scale: 0.96 }}
                      onClick={() => setIsHealthOpen(true)}
                      className="m3-state-layer h-11 px-4 sm:px-5 rounded-full bg-md-error-container text-md-on-error-container text-xs font-semibold flex items-center gap-2 transition-all"
                    >
                      <Activity className="w-4 h-4" />
                      <span>{t('lbl_health')}</span>
                    </motion.button>

                    <div className="flex items-center gap-2 ml-auto">
                      <motion.button
                        whileTap={{ scale: 0.94 }}
                        onClick={handleRefreshPlantData}
                        disabled={isRefreshingData}
                        title={t('btn_refresh_ai') || 'Refresh Botanical Data'}
                        aria-label={t('btn_refresh_ai') || 'Refresh Botanical Data'}
                        className="m3-state-layer h-11 px-3.5 rounded-full bg-md-surface-container-high border border-md-outline-variant/30 text-md-on-surface-variant hover:text-md-primary flex items-center gap-1.5 text-xs font-semibold transition-colors disabled:opacity-60"
                      >
                        <RefreshCw className={`w-4 h-4 ${isRefreshingData ? 'animate-spin text-md-primary' : ''}`} />
                        <span className="hidden sm:inline">{isRefreshingData ? 'Refreshing...' : 'Refresh'}</span>
                      </motion.button>
                      <motion.button
                        whileTap={{ scale: 0.94 }}
                        onClick={() => setIsAddingPhoto(true)}
                        title={t('btn_add_image')}
                        className="m3-state-layer w-11 h-11 rounded-full bg-md-surface-container-high border border-md-outline-variant/30 text-md-on-surface-variant hover:text-md-primary flex items-center justify-center transition-colors"
                      >
                        <Camera className="w-4 h-4" />
                      </motion.button>
                      <motion.button
                        whileTap={{ scale: 0.94 }}
                        onClick={() => setIsEditOpen(true)}
                        title={t('btn_edit_data')}
                        className="m3-state-layer w-11 h-11 rounded-full bg-md-surface-container-high border border-md-outline-variant/30 text-md-on-surface-variant hover:text-md-primary flex items-center justify-center transition-colors"
                      >
                        <Edit3 className="w-4 h-4" />
                      </motion.button>
                      <motion.button
                        whileTap={{ scale: 0.94 }}
                        onClick={handleTogglePriority}
                        disabled={isTogglingPriority}
                        title={plant.isPriority ? t('btn_remove_priority') : t('btn_set_priority')}
                        className={`m3-state-layer w-11 h-11 rounded-full border flex items-center justify-center transition-colors ${
                          plant.isPriority
                            ? 'bg-amber-300/90 text-amber-950 border-amber-400/50'
                            : 'bg-md-surface-container-high border-md-outline-variant/30 text-md-on-surface-variant hover:text-md-primary'
                        }`}
                      >
                        <Star className={`w-4 h-4 ${plant.isPriority ? 'fill-current' : ''}`} />
                      </motion.button>
                      <motion.button
                        whileTap={{ scale: 0.94 }}
                        onClick={() => setShowMoreActions(prev => !prev)}
                        title={t('btn_more_actions') || 'More Actions & Photos'}
                        className={`m3-state-layer w-11 h-11 rounded-full border flex items-center justify-center transition-colors ${
                          showMoreActions
                            ? 'bg-md-primary text-md-on-primary border-transparent'
                            : 'bg-md-surface-container-high border-md-outline-variant/30 text-md-on-surface-variant hover:text-md-primary'
                        }`}
                      >
                        <SlidersHorizontal className="w-4 h-4" />
                      </motion.button>
                    </div>
                  </div>

                  {showMoreActions && (
                    <div className="p-4 rounded-[22px] bg-md-surface-container border border-md-outline-variant/25 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-2.5">
                        {[
                          { type: 'FERTILIZED', icon: <FlaskConical className="w-4 h-4" />, label: t('btn_feed') },
                          { type: 'PRUNED', icon: <Scissors className="w-4 h-4" />, label: t('btn_prune_caps') },
                          { type: 'REPOTTED', icon: <Sprout className="w-4 h-4" />, label: t('btn_repot_caps') },
                          { type: 'NEW_LEAF', icon: <Leaf className="w-4 h-4" />, label: t('btn_growth') },
                          ...(plant.flowers ? [{ type: 'FLOWER', icon: <Flower2 className="w-4 h-4" />, label: t('btn_bloom') }] : []),
                          { type: 'ROTATED', icon: <PotRotationIcon className="w-4 h-4" />, label: t('btn_rotate_caps') },
                          { type: 'TRANSFER', icon: <ArrowLeftRight className="w-4 h-4" />, label: t('btn_transfer') }
                        ].map(action => (
                          <button
                            key={action.type}
                            onClick={() => handleLogAction(action.type as any)}
                            className={`m3-state-layer h-16 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all border ${
                              lastLoggedAction === action.type
                                ? 'bg-md-primary-container text-md-on-primary-container border-md-primary/40'
                                : 'bg-md-surface-container-low text-md-on-surface-variant hover:text-md-on-surface border-md-outline-variant/25'
                            }`}
                          >
                            <span>{action.icon}</span>
                            <span className="text-[10px] font-semibold text-center leading-tight px-1">{action.label}</span>
                          </button>
                        ))}
                      </div>

                      {plant.images && plant.images.length > 0 && (
                        <div className="space-y-2 pt-2 border-t border-md-outline-variant/20">
                          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-md-on-surface-variant">{t('lbl_image_archive')}</h4>
                          <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1">
                            {plant.images.map((img, idx) => (
                              <button
                                key={idx}
                                onClick={() => setEnlargedImageIndex(idx)}
                                className="w-16 h-16 rounded-xl overflow-hidden border border-md-outline-variant/40 shrink-0 hover:scale-105 transition-transform bg-md-surface-container-highest"
                              >
                                <img src={img} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* TAB CONTENT */}
                <div className="animate-in fade-in duration-500">
                    {activeTab === 'DOSSIER' && (
                        <div className="space-y-5">
                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                                {/* LEFT: BOTANICAL PASSPORT & MICROCLIMATE (KEY-VALUE LIST) */}
                                <div className="lg:col-span-7 space-y-5">
                                    <section className="bg-md-surface-container rounded-[24px] p-6 border border-md-outline-variant/25 space-y-4">
                                        <h3 className="text-lg font-bold text-md-on-surface tracking-tight">{t('botanical_passport')}</h3>
                                        <div className="divide-y divide-md-outline-variant/20">
                                            {[
                                              { label: t('lbl_origin'), value: lv(plant.origin) },
                                              { label: t('lbl_family_genus'), value: `${plant.family || t('lbl_na')} / ${plant.genus || t('lbl_na')}` },
                                              {
                                                label: t('lbl_growth_size'),
                                                value: (plant.maxHeight || plant.maxSpread)
                                                  ? `${plant.maxHeight ? `${plant.maxHeight} cm H` : ''}${plant.maxHeight && plant.maxSpread ? ' × ' : ''}${plant.maxSpread ? `${plant.maxSpread} cm W` : ''} (${lv(plant.growthRate as any) || t('lbl_standard')})`
                                                  : (lv(plant.growthRate as any) || t('lbl_na'))
                                              },
                                              ...(lv(plant.growthHabit as any) ? [{ label: t('lbl_growth_habit') || 'Growth Habit', value: lv(plant.growthHabit as any) }] : []),
                                              ...(lv(plant.lifespan as any) ? [{ label: t('lbl_lifespan') || 'Life Cycle', value: lv(plant.lifespan as any) }] : []),
                                              { label: t('lbl_category'), value: lv(plant.category as any) || t('lbl_na') },
                                              { label: t('lbl_room'), value: lv(plant.room as any) || t('lbl_unassigned') },
                                              { label: t('lbl_window_exposure') || 'Window Exposure', value: lv(plant.windowExposure as any) || lv(plant.lightAdvice) },
                                              ...(lv(plant.careDifficulty as any) || plant.droughtTolerant ? [{
                                                label: t('lbl_care_difficulty') || 'Care Difficulty',
                                                value: `${lv(plant.careDifficulty as any) || t('lbl_standard')}${plant.droughtTolerant ? ` · ${t('lbl_drought_tolerant') || 'Drought Tolerant'}` : ''}`
                                              }] : []),
                                              ...(lv(plant.dormancyPeriod as any) ? [{
                                                label: t('lbl_dormancy') || 'Seasonal Dormancy',
                                                value: lv(plant.dormancyPeriod as any)
                                              }] : []),
                                              ...(lv(plant.citesStatus as any) ? [{
                                                label: t('lbl_cites_status') || 'CITES / Conservation',
                                                value: lv(plant.citesStatus as any)
                                              }] : []),
                                              ...((plant.hardinessZoneMin || plant.hardinessZoneMax) ? [{
                                                label: t('lbl_hardiness_zones') || 'USDA Hardiness',
                                                value: plant.hardinessZoneMin && plant.hardinessZoneMax
                                                  ? `Zones ${plant.hardinessZoneMin}–${plant.hardinessZoneMax}`
                                                  : `Zone ${plant.hardinessZoneMin || plant.hardinessZoneMax}`
                                              }] : [])
                                            ].map((row, idx) => (
                                              <div key={idx} className="flex items-center justify-between gap-4 py-3 first:pt-1 last:pb-1">
                                                <span className="text-xs font-medium text-md-on-surface-variant shrink-0">{row.label}</span>
                                                <span className="text-xs sm:text-sm font-semibold text-md-on-surface text-right">{row.value || t('lbl_na')}</span>
                                              </div>
                                            ))}
                                        </div>

                                        {(plant.trefleId || plant.opbId || plant.gbifId || plant.powoId || plant.inaturalistId || plant.iucnStatus || plant.ncsuUrl || plant.vascanId) && (
                                          <div className="pt-3 border-t border-md-outline-variant/20 flex flex-wrap items-center gap-2">
                                            <span className="text-[10px] font-semibold uppercase tracking-wider text-md-on-surface-variant mr-1">
                                              {t('lbl_taxon_links') || 'Archives'}:
                                            </span>
                                            {plant.iucnStatus && (
                                              <span className="px-2.5 py-1 rounded-full text-[11px] font-mono font-semibold bg-md-tertiary-container text-md-on-tertiary-container">
                                                IUCN: {plant.iucnStatus}
                                              </span>
                                            )}
                                            {plant.gbifId && (
                                              <a
                                                href={`https://www.gbif.org/species/${plant.gbifId}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="px-2.5 py-1 rounded-full text-[11px] font-mono font-semibold bg-md-surface-container-highest text-md-primary hover:bg-md-primary-container transition-colors"
                                              >
                                                GBIF #{plant.gbifId}
                                              </a>
                                            )}
                                            {plant.powoId && (
                                              <a
                                                href={`https://powo.science.kew.org/taxon/${plant.powoId}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="px-2.5 py-1 rounded-full text-[11px] font-mono font-semibold bg-md-surface-container-highest text-md-primary hover:bg-md-primary-container transition-colors"
                                              >
                                                POWO
                                              </a>
                                            )}
                                            {plant.inaturalistId && (
                                              <a
                                                href={`https://www.inaturalist.org/taxa/${plant.inaturalistId}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="px-2.5 py-1 rounded-full text-[11px] font-mono font-semibold bg-md-surface-container-highest text-md-primary hover:bg-md-primary-container transition-colors"
                                              >
                                                iNaturalist
                                              </a>
                                            )}
                                            {plant.ncsuUrl && (
                                              <a
                                                href={plant.ncsuUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="px-2.5 py-1 rounded-full text-[11px] font-mono font-semibold bg-md-surface-container-highest text-md-primary hover:bg-md-primary-container transition-colors"
                                              >
                                                NC State
                                              </a>
                                            )}
                                            {plant.vascanId && (
                                              <a
                                                href={`https://data.canadensys.net/vascan/taxon/${plant.vascanId}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="px-2.5 py-1 rounded-full text-[11px] font-mono font-semibold bg-md-surface-container-highest text-md-primary hover:bg-md-primary-container transition-colors"
                                              >
                                                VASCAN
                                              </a>
                                            )}
                                            {plant.trefleId && (
                                              <span className="px-2.5 py-1 rounded-full text-[11px] font-mono font-semibold bg-md-surface-container-highest text-md-on-surface-variant">
                                                Trefle #{plant.trefleId}
                                              </span>
                                            )}
                                            {plant.opbId && (
                                              <span className="px-2.5 py-1 rounded-full text-[11px] font-mono font-semibold bg-md-surface-container-highest text-md-on-surface-variant">
                                                OPB: {plant.opbId}
                                              </span>
                                            )}
                                          </div>
                                        )}
                                    </section>

                                    {(lv(plant.foliageTraits as any) || lv(plant.flowerTraits as any) || (lva(plant.nativeRegions as any)?.length > 0) || (lva(plant.attracts as any)?.length > 0) || (plant.ecologicalFlags && Object.values(plant.ecologicalFlags).some(Boolean))) && (
                                      <section className="bg-md-surface-container rounded-[24px] p-6 border border-md-outline-variant/25 space-y-4">
                                        <h3 className="text-base font-bold text-md-on-surface tracking-tight">
                                          {t('lbl_morphology_ecology') || 'Morphology & Ecology'}
                                        </h3>

                                        {plant.ecologicalFlags && Object.values(plant.ecologicalFlags).some(Boolean) && (
                                          <div className="flex flex-wrap gap-2">
                                            {plant.ecologicalFlags.indoor && <span className="px-3 py-1 rounded-full text-xs font-semibold bg-md-primary-container/60 text-md-on-primary-container">Indoor</span>}
                                            {plant.ecologicalFlags.tropical && <span className="px-3 py-1 rounded-full text-xs font-semibold bg-md-tertiary-container/60 text-md-on-tertiary-container">Tropical</span>}
                                            {plant.ecologicalFlags.medicinal && <span className="px-3 py-1 rounded-full text-xs font-semibold bg-md-secondary-container text-md-on-secondary-container">Medicinal</span>}
                                            {plant.ecologicalFlags.saltTolerant && <span className="px-3 py-1 rounded-full text-xs font-semibold bg-md-surface-container-highest text-md-on-surface">Salt Tolerant</span>}
                                            {plant.ecologicalFlags.thorny && <span className="px-3 py-1 rounded-full text-xs font-semibold bg-md-error-container/50 text-md-on-error-container">Thorny</span>}
                                            {plant.ecologicalFlags.invasive && <span className="px-3 py-1 rounded-full text-xs font-semibold bg-md-error-container/70 text-md-on-error-container">Invasive</span>}
                                          </div>
                                        )}

                                        {(lv(plant.foliageTraits as any) || lv(plant.flowerTraits as any)) && (
                                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            {lv(plant.foliageTraits as any) && (
                                              <div className="p-3.5 rounded-2xl bg-md-surface-container-low border border-md-outline-variant/20 space-y-1">
                                                <p className="text-[10px] font-semibold uppercase tracking-wider text-md-on-surface-variant">{t('lbl_foliage') || 'Foliage'}</p>
                                                <p className="text-xs text-md-on-surface leading-relaxed">{lv(plant.foliageTraits as any)}</p>
                                              </div>
                                            )}
                                            {lv(plant.flowerTraits as any) && (
                                              <div className="p-3.5 rounded-2xl bg-md-surface-container-low border border-md-outline-variant/20 space-y-1">
                                                <p className="text-[10px] font-semibold uppercase tracking-wider text-md-on-surface-variant">{t('lbl_flowers') || 'Flowers'}</p>
                                                <p className="text-xs text-md-on-surface leading-relaxed">{lv(plant.flowerTraits as any)}</p>
                                              </div>
                                            )}
                                          </div>
                                        )}

                                        {lva(plant.nativeRegions as any)?.length > 0 && (
                                          <div className="space-y-1.5">
                                            <p className="text-[10px] font-semibold uppercase tracking-wider text-md-on-surface-variant">{t('lbl_native_regions') || 'Native Distribution'}</p>
                                            <div className="flex flex-wrap gap-1.5">
                                              {lva(plant.nativeRegions as any).slice(0, 12).map((region, idx) => (
                                                <span key={idx} className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-md-surface-container-highest text-md-on-surface">
                                                  {region}
                                                </span>
                                              ))}
                                            </div>
                                          </div>
                                        )}

                                        {lva(plant.attracts as any)?.length > 0 && (
                                          <div className="space-y-1.5">
                                            <p className="text-[10px] font-semibold uppercase tracking-wider text-md-on-surface-variant">{t('lbl_attracts') || 'Attracts Wildlife'}</p>
                                            <div className="flex flex-wrap gap-1.5">
                                              {lva(plant.attracts as any).map((item, idx) => (
                                                <span key={idx} className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-md-secondary-container/70 text-md-on-secondary-container">
                                                  {item}
                                                </span>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                        </section>
                                      )}

                                      {(lv(plant.etymology as any) || lv(plant.naturalHabitat as any) || (lva(plant.specialFeatures as any)?.length > 0) || lv(plant.wateringMethod as any) || lv(plant.feedingSchedule as any) || lv(plant.trainingAdvice as any)) && (
                                        <section className="bg-md-surface-container rounded-[24px] p-6 border border-md-outline-variant/25 space-y-4">
                                          <div className="flex items-center gap-2">
                                            <FileText className="w-4 h-4 text-md-primary shrink-0" />
                                            <h3 className="text-base font-bold text-md-on-surface tracking-tight">
                                              {t('lbl_field_guide') || 'Field Guide & Cultivation Monograph'}
                                            </h3>
                                          </div>

                                          {lva(plant.specialFeatures as any)?.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5">
                                              {lva(plant.specialFeatures as any).map((feat, idx) => (
                                                <span key={idx} className="px-3 py-1 rounded-full text-xs font-semibold bg-md-primary-container/60 text-md-on-primary-container">
                                                  {feat}
                                                </span>
                                              ))}
                                            </div>
                                          )}

                                          {(lv(plant.etymology as any) || lv(plant.naturalHabitat as any)) && (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                              {lv(plant.etymology as any) && (
                                                <div className="p-3.5 rounded-2xl bg-md-surface-container-low border border-md-outline-variant/20 space-y-1">
                                                  <p className="text-[10px] font-semibold uppercase tracking-wider text-md-on-surface-variant">{t('lbl_etymology') || 'Etymology & Name'}</p>
                                                  <p className="text-xs text-md-on-surface leading-relaxed">{lv(plant.etymology as any)}</p>
                                                </div>
                                              )}
                                              {lv(plant.naturalHabitat as any) && (
                                                <div className="p-3.5 rounded-2xl bg-md-surface-container-low border border-md-outline-variant/20 space-y-1">
                                                  <p className="text-[10px] font-semibold uppercase tracking-wider text-md-on-surface-variant">{t('lbl_natural_habitat') || 'Natural Habitat'}</p>
                                                  <p className="text-xs text-md-on-surface leading-relaxed">{lv(plant.naturalHabitat as any)}</p>
                                                </div>
                                              )}
                                            </div>
                                          )}

                                          {(lv(plant.wateringMethod as any) || lv(plant.feedingSchedule as any) || lv(plant.trainingAdvice as any)) && (
                                            <div className="divide-y divide-md-outline-variant/20 pt-1">
                                              {lv(plant.wateringMethod as any) && (
                                                <div className="py-2.5 first:pt-1 last:pb-1 space-y-1">
                                                  <p className="text-[10px] font-semibold uppercase tracking-wider text-md-primary">{t('lbl_watering_method') || 'Watering Method'}</p>
                                                  <p className="text-xs text-md-on-surface leading-relaxed">{lv(plant.wateringMethod as any)}</p>
                                                </div>
                                              )}
                                              {lv(plant.feedingSchedule as any) && (
                                                <div className="py-2.5 first:pt-1 last:pb-1 space-y-1">
                                                  <p className="text-[10px] font-semibold uppercase tracking-wider text-md-primary">{t('lbl_feeding_schedule') || 'Feeding Schedule'}</p>
                                                  <p className="text-xs text-md-on-surface leading-relaxed">{lv(plant.feedingSchedule as any)}</p>
                                                </div>
                                              )}
                                              {lv(plant.trainingAdvice as any) && (
                                                <div className="py-2.5 first:pt-1 last:pb-1 space-y-1">
                                                  <p className="text-[10px] font-semibold uppercase tracking-wider text-md-primary">{t('lbl_training_advice') || 'Pruning & Training'}</p>
                                                  <p className="text-xs text-md-on-surface leading-relaxed">{lv(plant.trainingAdvice as any)}</p>
                                                </div>
                                              )}
                                            </div>
                                          )}

                                          {plant.cultivars && plant.cultivars.length > 0 && (
                                            <div className="space-y-1.5 pt-2 border-t border-md-outline-variant/20">
                                              <p className="text-[10px] font-semibold uppercase tracking-wider text-md-on-surface-variant">Cultivars / Varieties (NC State)</p>
                                              <div className="flex flex-wrap gap-1.5">
                                                {plant.cultivars.map((cv, idx) => (
                                                  <span key={idx} className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-md-surface-container-highest text-md-on-surface">
                                                    {cv}
                                                  </span>
                                                ))}
                                              </div>
                                            </div>
                                          )}

                                          {plant.canadianProvinces && plant.canadianProvinces.length > 0 && (
                                            <div className="space-y-1.5 pt-2 border-t border-md-outline-variant/20">
                                              <p className="text-[10px] font-semibold uppercase tracking-wider text-md-on-surface-variant">Canadian Distribution (VASCAN)</p>
                                              <div className="flex flex-wrap gap-1.5">
                                                {plant.canadianProvinces.map((prov, idx) => (
                                                  <span key={idx} className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-md-secondary-container/70 text-md-on-secondary-container">
                                                    {prov}
                                                  </span>
                                                ))}
                                              </div>
                                            </div>
                                          )}
                                        </section>
                                      )}
                                </div>

                                {/* RIGHT: TOXICITY ALERT + SOIL RECIPE PILL BARS + AI INSIGHT */}
                                <div className="lg:col-span-5 space-y-5">
                                    <div className={`rounded-[24px] p-5 border space-y-2.5 ${plant.isPetSafe ? 'bg-md-primary-container/40 border-md-primary/25' : 'bg-md-error-container/50 border-md-error/30'}`}>
                                        <div className="flex items-center justify-between gap-2">
                                          <h3 className={`text-base font-bold ${plant.isPetSafe ? 'text-md-primary' : 'text-md-error'}`}>
                                              {t('lbl_toxicity')}
                                          </h3>
                                          {plant.isPetSafe ? (
                                            <ShieldCheck className="w-5 h-5 text-md-primary shrink-0" />
                                          ) : (
                                            <AlertTriangle className="w-5 h-5 text-md-error shrink-0" />
                                          )}
                                        </div>
                                        <p className="text-xs sm:text-sm text-md-on-surface leading-relaxed">{lv(plant.petSafety)}</p>
                                        {lv(plant.humanSafety as any) && (
                                          <p className="text-xs text-md-on-surface-variant pt-2 border-t border-md-outline-variant/20">
                                            <span className="font-semibold uppercase tracking-wider mr-1.5">{t('lbl_human_safety') || 'Humans'}:</span>
                                            {lv(plant.humanSafety as any)}
                                          </p>
                                        )}
                                        {lv(plant.toxicPrinciple as any) && (
                                          <p className="text-xs text-md-on-surface-variant pt-2 border-t border-md-outline-variant/20">
                                            <span className="font-semibold uppercase tracking-wider mr-1.5">Toxic Principle:</span>
                                            {lv(plant.toxicPrinciple as any)}
                                          </p>
                                        )}
                                    </div>

                                    {plant.soilComposition && plant.soilComposition.length > 0 && (
                                    <section className="bg-md-surface-container rounded-[24px] p-5 border border-md-outline-variant/25 space-y-4">
                                            <h3 className="text-base font-bold text-md-on-surface tracking-tight">{t('lbl_soil_recipe')}</h3>
                                            <div className="space-y-2.5">
                                                {plant.soilComposition.map((item, idx) => {
                                                  const barColors = [
                                                    'bg-md-primary-container text-md-on-primary-container',
                                                    'bg-md-secondary-container text-md-on-secondary-container',
                                                    'bg-md-tertiary-container text-md-on-tertiary-container',
                                                    'bg-md-surface-container-highest text-md-on-surface'
                                                  ];
                                                  const barStyle = barColors[idx % barColors.length];
                                                  return (
                                                    <div key={idx} className="flex items-center gap-3">
                                                        <div className="flex-1 h-9 bg-md-surface-container-low rounded-xl overflow-hidden flex items-center">
                                                          <div
                                                            className={`h-full rounded-xl px-3 flex items-center text-xs font-bold ${barStyle}`}
                                                            style={{ width: `${Math.max(item.percent, 18)}%` }}
                                                          >
                                                            {item.percent}%
                                                          </div>
                                                        </div>
                                                        <span className="text-xs font-medium text-md-on-surface w-28 truncate">{lv(item.component)}</span>
                                                    </div>
                                                  );
                                                })}
                                            </div>
                                        </section>
                                    )}

                                    {lv(plant.aiInsight) && (
                                      <section className="rounded-[24px] p-5 bg-md-secondary-container/30 border border-md-outline-variant/25 space-y-2">
                                        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-md-primary">
                                          <Sparkles className="w-4 h-4" />
                                          <span>{t('lbl_botanical_insight') || 'Botanical Insight'}</span>
                                        </div>
                                        <p className="text-xs sm:text-sm text-md-on-surface leading-relaxed">{lv(plant.aiInsight)}</p>
                                      </section>
                                    )}

                                    {(() => {
                                      const activeHouseId = compatHouseId || plant.houseId || user?.houseId || houses[0]?.id || '';
                                      const selectedHouse = houses.find(h => h.id === activeHouseId) || null;
                                      const report = checkPlantCompatibility(plant, selectedHouse);
                                      const badgeStyle =
                                        report.overall === 'COMPATIBLE'
                                          ? 'bg-md-primary-container text-md-on-primary-container'
                                          : report.overall === 'CONDITIONAL'
                                            ? 'bg-md-tertiary-container text-md-on-tertiary-container'
                                            : report.overall === 'INCOMPATIBLE'
                                              ? 'bg-md-error-container text-md-on-error-container'
                                              : 'bg-md-surface-container-highest text-md-on-surface-variant';
                                      const badgeLabel =
                                        report.overall === 'COMPATIBLE'
                                          ? 'Compatible'
                                          : report.overall === 'CONDITIONAL'
                                            ? 'Conditional'
                                            : report.overall === 'INCOMPATIBLE'
                                              ? 'Indoor / Amend'
                                              : 'Setup Needed';

                                      return (
                                        <section className="bg-md-surface-container rounded-[24px] p-5 border border-md-outline-variant/25 space-y-3.5">
                                          <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2">
                                              <MapPin className="w-4 h-4 text-md-primary shrink-0" />
                                              <h3 className="text-base font-bold text-md-on-surface tracking-tight">Area & Soil Compatibility</h3>
                                            </div>
                                            <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${badgeStyle}`}>
                                              {badgeLabel}
                                            </span>
                                          </div>

                                          {houses.length > 0 && (
                                            <select
                                              value={activeHouseId}
                                              onChange={(e) => setCompatHouseId(e.target.value)}
                                              className="w-full bg-md-surface-container-low border border-md-outline-variant/40 rounded-xl px-3 py-2 text-xs font-semibold text-md-on-surface outline-none focus:border-md-primary"
                                            >
                                              {houses.map(h => (
                                                <option key={h.id} value={h.id}>
                                                  {lv(h.name)}{h.hardinessZone ? ` · Zone ${h.hardinessZone}` : ''}
                                                </option>
                                              ))}
                                            </select>
                                          )}

                                          <div className="space-y-2">
                                            <div className="p-3 rounded-2xl bg-md-surface-container-low border border-md-outline-variant/20 space-y-1">
                                              <p className="text-xs font-bold text-md-on-surface">{report.climateTitle}</p>
                                              <p className="text-[11px] text-md-on-surface-variant leading-relaxed">{report.climateDetail}</p>
                                            </div>
                                            <div className="p-3 rounded-2xl bg-md-surface-container-low border border-md-outline-variant/20 space-y-1">
                                              <p className="text-xs font-bold text-md-on-surface">{report.soilTitle}</p>
                                              <p className="text-[11px] text-md-on-surface-variant leading-relaxed">{report.soilDetail}</p>
                                            </div>
                                          </div>
                                        </section>
                                      );
                                    })()}
                                </div>
                            </div>

                            {plant.troubleshooting && plant.troubleshooting.length > 0 && (
                              <section className="bg-md-surface-container rounded-[24px] p-6 border border-md-outline-variant/25 space-y-4">
                                <div className="flex items-center gap-2">
                                  <AlertTriangle className="w-4 h-4 text-md-tertiary shrink-0" />
                                  <h3 className="text-base font-bold text-md-on-surface tracking-tight">
                                    {t('lbl_troubleshooting') || 'Field Guide Troubleshooting'}
                                  </h3>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                  {plant.troubleshooting.map((item, idx) => (
                                    <div key={idx} className="p-4 rounded-2xl bg-md-surface-container-low border border-md-outline-variant/20 space-y-2">
                                      <p className="text-xs font-bold text-md-on-surface">{lv(item.symptom)}</p>
                                      <p className="text-[11px] text-md-on-surface-variant leading-relaxed">
                                        <span className="font-semibold text-md-on-surface">{t('lbl_cause') || 'Cause'}: </span>
                                        {lv(item.cause)}
                                      </p>
                                      <p className="text-[11px] text-md-primary leading-relaxed pt-1.5 border-t border-md-outline-variant/15">
                                        <span className="font-semibold">{t('lbl_fix') || 'Fix'}: </span>
                                        {lv(item.fix)}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              </section>
                            )}
                        </div>
                    )}

                    {activeTab === 'TECH' && (
                        <div className="space-y-6">
                            {/* ENVIRONMENTAL OPTIMAL RANGES */}
                            <section className="space-y-3">
                                <h3 className="text-base font-bold text-md-on-surface px-1">{t('lbl_atmospheric_soil_bounds')}</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                    <TechMetric label={t('lbl_moisture')} min={plant.minSoilMoist} max={plant.maxSoilMoist} unit="%" advice={lv(plant.moistureAdvice)} scaleMin={0} scaleMax={100} />
                                    <TechMetric label={t('lbl_temperature')} min={plant.minTemp} max={plant.maxTemp} unit="°C" advice={lv(plant.tempAdvice)} scaleMin={0} scaleMax={45} />
                                    <TechMetric
                                      label={t('lbl_illuminance')}
                                      min={plant.minLightLux}
                                      max={plant.maxLightLux}
                                      unit={plant.targetDli ? `Lux / ${plant.targetDli} DLI` : 'Lux'}
                                      advice={lv(plant.lightAdvice)}
                                      scaleMin={0}
                                      scaleMax={Math.max(25000, plant.maxLightLux || 25000)}
                                    />
                                    <TechMetric label={t('lbl_humidity')} min={plant.minEnvHumid} max={plant.maxEnvHumid} unit="%" advice={lv(plant.humidityAdvice)} scaleMin={0} scaleMax={100} />
                                    <TechMetric label={t('lbl_target_ph')} min={plant.minPh ?? plant.targetPh} max={plant.maxPh} unit="pH" advice={t('lbl_target_ph_desc')} scaleMin={3} scaleMax={9} />
                                    <TechMetric label={t('lbl_target_vpd')} min={plant.targetVpd} unit="kPa" advice={t('lbl_target_vpd_desc')} scaleMin={0} scaleMax={3} />
                                    <TechMetric label={t('lbl_soil_ec')} min={plant.minSoilEc} max={plant.maxSoilEc} unit="mS/cm" advice={lv(plant.nutritionAdvice)} scaleMin={0} scaleMax={4} />
                                    <TechMetric label={t('lbl_target_ec')} min={plant.targetEc} unit="mS/cm" advice={t('lbl_target_ec_desc')} scaleMin={0} scaleMax={4} />
                                    <TechMetric label={t('lbl_target_dli')} min={plant.targetDli} unit="mol/m²/d" advice={t('lbl_target_dli_desc')} scaleMin={0} scaleMax={40} />
                                </div>
                            </section>

                            {/* SEASONAL CADENCE & NUTRITION + SUSCEPTIBLE PESTS */}
                            <section className="space-y-3">
                                <h3 className="text-base font-bold text-md-on-surface px-1">{t('lbl_seasonal_cadence') || 'Seasonal Cadence & Nutrition'}</h3>
                                <div className="bg-md-surface-container rounded-[24px] p-5 sm:p-6 border border-md-outline-variant/25 space-y-5">
                                    <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-md-outline-variant/25">
                                        <div className="pb-4 md:pb-0 md:pr-6 space-y-1">
                                            <p className="text-sm font-bold text-md-on-surface flex items-center gap-2">
                                              <Sun className="w-4 h-4 text-amber-500" />
                                              <span>{t('lbl_summer_cadence') || 'Summer Active'}</span>
                                            </p>
                                            <p className="text-xs sm:text-sm text-md-on-surface-variant">
                                              {plant.summerWateringInterval || plant.wateringInterval}d {t('lbl_water_short') || 'water'}
                                              {plant.npkRatio ? `, ${plant.npkRatio} ${t('lbl_feed_short') || 'feed'}` : ''}
                                            </p>
                                        </div>
                                        <div className="pt-4 md:pt-0 md:pl-6 space-y-1">
                                            <p className="text-sm font-bold text-md-on-surface flex items-center gap-2">
                                              <Snowflake className="w-4 h-4 text-sky-500" />
                                              <span>{t('lbl_winter_cadence') || 'Winter Dormant'}</span>
                                            </p>
                                            <p className="text-xs sm:text-sm text-md-on-surface-variant">
                                              {plant.winterWateringInterval || Math.round((plant.wateringInterval || 7) * 1.6)}d {t('lbl_water_short') || 'water'}
                                              {lv(plant.dormancyPeriod as any) ? `, ${lv(plant.dormancyPeriod as any)}` : ''}
                                            </p>
                                        </div>
                                    </div>

                                    {(lva(plant.susceptiblePests as any)?.length > 0 || lv(plant.bloomSeason as any) || lv(plant.pruningMonths as any)) && (
                                      <div className="pt-4 border-t border-md-outline-variant/20 space-y-3">
                                        {lva(plant.susceptiblePests as any)?.length > 0 && (
                                          <div className="space-y-2">
                                            <p className="text-xs font-bold text-md-on-surface flex items-center gap-1.5">
                                              <Bug className="w-3.5 h-3.5 text-md-error" />
                                              <span>{t('lbl_susceptible_pests') || 'Susceptible Pests'}</span>
                                            </p>
                                            <div className="flex flex-wrap gap-2">
                                              {lva(plant.susceptiblePests as any).map((pest, idx) => (
                                                <span key={idx} className="px-3.5 py-1.5 rounded-full text-xs font-medium bg-md-surface-container-highest text-md-on-surface border border-md-outline-variant/25">
                                                  {pest}
                                                </span>
                                              ))}
                                            </div>
                                          </div>
                                        )}

                                        {(lv(plant.bloomSeason as any) || lv(plant.pruningMonths as any)) && (
                                          <div className="flex flex-wrap gap-2 pt-1">
                                            {lv(plant.bloomSeason as any) && (
                                              <span className="px-3 py-1.5 rounded-full text-xs font-medium bg-md-primary-container/40 text-md-on-primary-container flex items-center gap-1.5">
                                                <Flower2 className="w-3.5 h-3.5" />
                                                {lv(plant.bloomSeason as any)}
                                              </span>
                                            )}
                                            {lv(plant.pruningMonths as any) && (
                                              <span className="px-3 py-1.5 rounded-full text-xs font-medium bg-md-secondary-container/50 text-md-on-secondary-container flex items-center gap-1.5">
                                                <Scissors className="w-3.5 h-3.5" />
                                                {lv(plant.pruningMonths as any)}
                                              </span>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                </div>
                            </section>

                            {/* UPCOMING CARE TIMELINE PILLS */}
                            <section className="space-y-3">
                                <h3 className="text-base font-bold text-md-on-surface px-1">{t('lbl_upcoming_care_schedule')}</h3>
                                <div className="bg-md-surface-container rounded-[24px] p-5 border border-md-outline-variant/25 flex flex-wrap gap-2.5">
                                    {plant.wateringInterval && [1, 2, 3].map(i => {
                                      const lastDate = plant.lastWatered ? new Date(plant.lastWatered) : new Date();
                                      const nextDate = new Date(lastDate.getTime() + i * (plant.wateringInterval || 7) * 86400000);
                                      const daysAway = Math.ceil((nextDate.getTime() - Date.now()) / 86400000);
                                      const dateStr = nextDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                                      return (
                                        <span key={`w-${i}`} className={`px-3.5 py-2 rounded-full text-xs font-semibold flex items-center gap-2 border ${daysAway <= 0 ? 'bg-md-error-container/50 text-md-on-error-container border-md-error/30' : 'bg-md-surface-container-highest text-md-on-surface border-md-outline-variant/25'}`}>
                                          <Droplets className="w-3.5 h-3.5 text-md-primary" />
                                          <span>{t('log_water')} {dateStr}</span>
                                          <span className="text-[11px] opacity-75">
                                            {daysAway > 0 ? `(${daysAway}d)` : (daysAway === 0 ? `(${t('due_today')})` : `(-${Math.abs(daysAway)}d)`)}
                                          </span>
                                        </span>
                                      );
                                    })}
                                    {plant.npkRatio && (
                                      <span className="px-3.5 py-2 rounded-full text-xs font-semibold bg-md-surface-container-highest text-md-on-surface border border-md-outline-variant/25 flex items-center gap-2">
                                        <FlaskConical className="w-3.5 h-3.5 text-md-secondary" />
                                        <span>{t('btn_feed')} {plant.npkRatio}</span>
                                      </span>
                                    )}
                                    {plant.rotationFrequency && [1, 2].map(i => {
                                      const lastDate = plant.lastRotated ? new Date(plant.lastRotated) : new Date();
                                      const nextDate = new Date(lastDate.getTime() + i * (plant.rotationFrequency || 30) * 86400000);
                                      const dateStr = nextDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                                      return (
                                        <span key={`r-${i}`} className="px-3.5 py-2 rounded-full text-xs font-semibold bg-md-surface-container-highest text-md-on-surface border border-md-outline-variant/25 flex items-center gap-2">
                                          <PotRotationIcon className="w-3.5 h-3.5 text-md-tertiary" />
                                          <span>{t('btn_rotate_caps')} {dateStr}</span>
                                        </span>
                                      );
                                    })}
                                    {plant.minRootDepthCm ? (
                                      <span className="px-3.5 py-2 rounded-full text-xs font-semibold bg-md-surface-container-highest text-md-on-surface-variant border border-md-outline-variant/25">
                                        {t('lbl_min_root_depth') || 'Min Root Depth'}: {plant.minRootDepthCm} cm
                                      </span>
                                    ) : null}
                                    {plant.frostFreeDaysMin ? (
                                      <span className="px-3.5 py-2 rounded-full text-xs font-semibold bg-md-surface-container-highest text-md-on-surface-variant border border-md-outline-variant/25">
                                        {t('lbl_frost_free_days') || 'Frost-Free'}: {plant.frostFreeDaysMin}d
                                      </span>
                                    ) : null}
                                </div>
                            </section>
                        </div>
                    )}

                    {activeTab === 'PHENOPHASE' && (
                        <div className="space-y-6">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                <section className="m3-card-elevated rounded-[28px] p-6 md:p-8 border border-md-outline-variant/30 space-y-6">
                                    <h3 className="text-xs font-semibold uppercase tracking-widest text-md-primary">{t('lbl_biological_milestones')}</h3>
                                    <div className="grid grid-cols-1 gap-6">
                                        <PassportItem 
                                            icon={<RefreshCw className="w-4 h-4" />} 
                                            label={t('lbl_repot_cadence')} 
                                            value={plant.repottingFrequency ? `${t('lbl_every')} ${plant.repottingFrequency} ${t('lbl_months')}` : `${t('lbl_every')} ${getSuggestedRepotFrequency(plant)} ${t('lbl_months')}`} 
                                            subValue={!plant.repottingFrequency ? '(Suggested based on species)' : undefined}
                                        />
                                        <PassportItem 
                                            icon={<Sprout className="w-4 h-4" />} 
                                            label={t('lbl_last_pot_size')} 
                                            value={plant.lastPotSizeCm || plant.lastPotSizeInches ? `${plant.lastPotSizeCm || '--'} cm / ${plant.lastPotSizeInches || '--'} in` : (plant.lastPotSize ? (String(plant.lastPotSize).match(/^\d+(\.\d+)?$/) ? `${plant.lastPotSize} cm` : String(plant.lastPotSize)) : t('lbl_na'))}
                                        />
                                        <PassportItem 
                                            icon={<PotRotationIcon className="w-4 h-4" />} 
                                            label={t('lbl_rotation_frequency')} 
                                            value={plant.rotationFrequency ? `${plant.rotationFrequency} ${t('days')}` : t('lbl_na')} 
                                        />
                                        <PassportItem 
                                            icon={<Calendar className="w-4 h-4" />} 
                                            label={t('lbl_last_rotated')} 
                                            value={plant.lastRotated ? new Date(plant.lastRotated).toLocaleDateString() : t('lbl_na')}
                                        />
                                        <PassportItem 
                                            icon={<Droplets className="w-4 h-4" />} 
                                            label={t('lbl_last_watered_date')} 
                                            value={plant.lastWatered ? new Date(plant.lastWatered).toLocaleDateString() : t('lbl_na')} 
                                        />
                                        <PassportItem icon={<Dna className="w-4 h-4" />} label={t('lbl_propagation')} value={lva(plant.propagationMethods as any)?.join(', ') || t('lbl_na')} />
                                    </div>
                                </section>

                                {lv(plant.propagationInstructions) ? (
                                    <section className="m3-card-elevated rounded-[28px] p-6 md:p-8 border border-md-outline-variant/30 space-y-6">
                                        <h3 className="text-xs font-semibold uppercase tracking-widest text-md-primary">{t('lbl_propagation_instructions')}</h3>
                                        <p className="text-sm text-md-on-surface leading-relaxed whitespace-pre-wrap">
                                            {lv(plant.propagationInstructions)}
                                        </p>
                                    </section>
                                ) : (
                                    <section className="bg-md-surface-container-low/50 rounded-[28px] p-8 border border-dashed border-md-outline-variant/50 space-y-4 flex flex-col items-center justify-center text-center">
                                        <div className="w-12 h-12 bg-md-surface-container-highest text-md-on-surface-variant rounded-2xl flex items-center justify-center">
                                            <Dna className="w-6 h-6" />
                                        </div>
                                        <div className="space-y-1">
                                            <h3 className="text-xs font-semibold uppercase tracking-wider text-md-on-surface-variant">{t('lbl_propagation_instructions')}</h3>
                                            <p className="text-xs text-md-on-surface-variant/80">{t('msg_no_propagation_instructions')}</p>
                                        </div>
                                        <Button variant="ghost" size="sm" className="text-[11px] font-semibold uppercase tracking-wider text-md-primary" onClick={() => setIsEditOpen(true)}>
                                            + {t('btn_add_instructions')}
                                        </Button>
                                    </section>
                                )}

                                <section className="m3-card-elevated rounded-[28px] p-6 md:p-8 border border-md-outline-variant/30 space-y-6">
                                    <h3 className="text-xs font-semibold uppercase tracking-widest text-md-primary">{t('lbl_provenance_source')}</h3>
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center py-3 border-b border-md-outline-variant/25">
                                            <span className="text-[11px] font-semibold text-md-on-surface-variant uppercase tracking-wider">{t('lbl_nursery_source')}</span>
                                            <span className="text-sm font-medium text-md-on-surface">{plant.provenance?.nursery || t('lbl_unknown')}</span>
                                        </div>
                                        <div className="flex justify-between items-center py-3 border-b border-md-outline-variant/25">
                                            <span className="text-[11px] font-semibold text-md-on-surface-variant uppercase tracking-wider">{t('lbl_acquisition_date')}</span>
                                            <span className="text-sm font-medium text-md-on-surface">{plant.provenance?.dateOfPurchase ? new Date(plant.provenance.dateOfPurchase).toLocaleDateString() : t('lbl_na')}</span>
                                        </div>
                                        <div className="flex justify-between items-center py-3 border-b border-md-outline-variant/25">
                                            <span className="text-[11px] font-semibold text-md-on-surface-variant uppercase tracking-wider">{t('lbl_investment')}</span>
                                            <span className="text-sm font-medium text-md-on-surface">{plant.provenance?.cost ? `${plant.provenance.cost} ${plant.provenance.currency || 'USD'}` : t('lbl_na')}</span>
                                        </div>
                                    </div>
                                </section>

                                {lv(plant.repottingInstructions) ? (
                                    <section className="m3-card-elevated rounded-[28px] p-6 md:p-8 border border-md-outline-variant/30 space-y-6">
                                        <h3 className="text-xs font-semibold uppercase tracking-widest text-md-primary">{t('lbl_repotting_instructions')}</h3>
                                        <p className="text-sm text-md-on-surface leading-relaxed whitespace-pre-wrap">
                                            {lv(plant.repottingInstructions)}
                                        </p>
                                    </section>
                                ) : (
                                    <section className="bg-md-surface-container-low/50 rounded-[28px] p-8 border border-dashed border-md-outline-variant/50 space-y-4 flex flex-col items-center justify-center text-center">
                                        <div className="w-12 h-12 bg-md-surface-container-highest text-md-on-surface-variant rounded-2xl flex items-center justify-center">
                                            <Sprout className="w-6 h-6" />
                                        </div>
                                        <div className="space-y-1">
                                            <h3 className="text-xs font-semibold uppercase tracking-wider text-md-on-surface-variant">{t('lbl_repotting_instructions')}</h3>
                                            <p className="text-xs text-md-on-surface-variant/80">{t('msg_no_repotting_instructions')}</p>
                                        </div>
                                        <Button variant="ghost" size="sm" className="text-[11px] font-semibold uppercase tracking-wider text-md-primary" onClick={() => setIsEditOpen(true)}>
                                            + {t('btn_add_instructions')}
                                        </Button>
                                    </section>
                                )}
                            </div>

                            <section className="m3-card-elevated rounded-[28px] p-6 md:p-8 border border-md-outline-variant/30 space-y-6">
                                <h3 className="text-xs font-semibold uppercase tracking-widest text-md-primary">{t('lbl_phenophase_tracking')}</h3>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left">
                                        <thead>
                                            <tr className="border-b border-md-outline-variant/30">
                                                <th className="pb-3 text-[11px] font-semibold text-md-on-surface-variant uppercase tracking-wider">{t('lbl_phase')}</th>
                                                <th className="pb-3 text-[11px] font-semibold text-md-on-surface-variant uppercase tracking-wider">{t('lbl_date')}</th>
                                                <th className="pb-3 text-[11px] font-semibold text-md-on-surface-variant uppercase tracking-wider">{t('lbl_notes')}</th>
                                                <th className="pb-3"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-md-outline-variant/20">
                                            {plant.logs?.filter(l => l.type === 'PHENOPHASE').map(log => (
                                                <tr key={log.id}>
                                                    <td className="py-4 text-sm font-semibold text-md-on-surface">{t(`PHASE_${log.metadata?.phase}` as any)}</td>
                                                    <td className="py-4 text-sm text-md-on-surface-variant">{new Date(log.date).toLocaleDateString()}</td>
                                                    <td className="py-4 text-sm text-md-on-surface-variant">{lv(log.localizedNote)}</td>
                                                    <td className="py-4 text-right">
                                                        <button 
                                                            onClick={() => deleteLog(plant.id, log.id)}
                                                            className="p-2 text-md-on-surface-variant hover:text-md-error transition-colors rounded-lg"
                                                            title={t('btn_delete')}
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                            {(!plant.logs || plant.logs.filter(l => l.type === 'PHENOPHASE').length === 0) && (
                                                <tr>
                                                    <td colSpan={4} className="py-8 text-center text-xs text-md-on-surface-variant">{t('msg_no_phenophase')}</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                                <Button 
                                    variant="secondary" 
                                    className="w-full rounded-2xl border-dashed border-2 border-md-outline-variant/50 text-md-on-surface-variant hover:text-md-primary hover:border-md-primary transition-all"
                                    onClick={() => handleLogAction('PHENOPHASE')}
                                >
                                    + {t('btn_record_phenophase')}
                                </Button>
                            </section>
                        </div>
                    )}

                    {activeTab === 'TIMELINE' && (
                        <div className="space-y-6">
                            <section className="m3-card-elevated rounded-[28px] p-6 md:p-8 border border-md-outline-variant/30 space-y-6">
                                <h3 className="text-xs font-semibold uppercase tracking-widest text-md-primary">{t('tab_history')}</h3>
                                <div className="divide-y divide-md-outline-variant/20">
                                    {plant.logs && plant.logs.length > 0 ? (
                                        plant.logs.map((log) => (
                                            <div key={log.id} className="flex gap-4 md:gap-5 items-start py-6 first:pt-0 last:pb-0">
                                                <div className="w-11 h-11 bg-md-surface-container-highest text-md-primary rounded-2xl flex items-center justify-center shrink-0">
                                                    {getLogIcon(log)}
                                                </div>
                                                <div className="flex-1 space-y-1.5">
                                                    <div className="flex justify-between items-center">
                                                        <p className="text-[11px] font-semibold uppercase tracking-wider text-md-primary">
                                                            {log.type === 'PHENOPHASE' && log.metadata?.phase 
                                                                ? t(`PHASE_${log.metadata.phase}`) 
                                                                : t('lbl_record_type', { type: t(`log_${log.type.toLowerCase()}`) })}
                                                        </p>
                                                        <span className="text-[11px] font-medium text-md-on-surface-variant uppercase tracking-wider">{new Date(log.date).toLocaleDateString(language)}</span>
                                                    </div>
                                                    <div className="flex justify-between items-start gap-4">
                                                        <p className="text-sm md:text-base text-md-on-surface leading-relaxed flex-1">{lv(log.localizedNote) || log.note || '...'}</p>
                                                        <button 
                                                            onClick={() => deleteLog(plant.id, log.id)}
                                                            className="p-2 text-md-on-surface-variant hover:text-md-error transition-colors shrink-0 rounded-lg"
                                                            title={t('btn_delete')}
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                    {log.imageUrl && (
                                                        <div 
                                                            className="mt-3 w-32 h-32 rounded-2xl overflow-hidden border border-md-outline-variant/30 shadow-sm cursor-pointer hover:scale-105 transition-transform"
                                                            onClick={() => {
                                                                setEnlargedLogImage(log.imageUrl || null);
                                                            }}
                                                        >
                                                            <img src={log.imageUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                                        </div>
                                                    )}
                                                    {log.type === 'DISEASE_CHECK' && log.metadata?.recoveryPlan && (
                                                      <div className="mt-3 space-y-1.5">
                                                        <p className="text-[10px] font-semibold text-md-primary uppercase tracking-wider">{t('lbl_recovery_plan')}</p>
                                                        <div className="space-y-1">
                                                          {lva(log.metadata.recoveryPlan).map((step, sidx) => (
                                                            <div key={sidx} className="flex gap-2 items-start text-xs text-md-on-surface-variant">
                                                              <span className="shrink-0 text-md-primary">•</span>
                                                              <span>{step}</span>
                                                            </div>
                                                          ))}
                                                        </div>
                                                      </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="py-12 text-center space-y-4">
                                            <p className="text-xs font-medium text-md-on-surface-variant uppercase tracking-wider">{t('msg_no_history')}</p>
                                            <Button
                                                variant="outlined"
                                                size="sm"
                                                onClick={() => setIsNoteOpen(true)}
                                            >
                                                <Plus className="w-4 h-4" />
                                                <span>{t('btn_add_log')}</span>
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </section>
                        </div>
                    )}
                </div>
            </div>
        </div>
      </div>

      {/* MODALS & OVERLAYS */}
      {isAddingPhoto && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/90 backdrop-blur-2xl p-6 pl-[calc(1.5rem+env(safe-area-inset-left))] pr-[calc(1.5rem+env(safe-area-inset-right))] pt-[calc(1.5rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))]" onClick={() => setIsAddingPhoto(false)}>
              <div className="w-full max-w-md space-y-4">
                  <div onClick={(e) => { e.stopPropagation(); setIsAddingPhoto(false); setIsCapturingFromCamera(true); }} className="bg-white/10 border-2 border-dashed border-emerald-400/50 rounded-3xl p-6 flex items-center gap-6 cursor-pointer hover:bg-white/20 transition-all">
                      <div className="w-16 h-16 bg-emerald-400/20 rounded-2xl flex items-center justify-center">
                          <svg className="w-8 h-8 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812-1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><circle cx="12" cy="13" r="3" /></svg>
                      </div>
                      <p className="text-2xl font-bold text-white">{t('use_camera')}</p>
                  </div>
                  <div onClick={(e) => { e.stopPropagation(); setIsAddingPhoto(false); addPhotoInputRef.current?.click(); }} className="bg-white/10 border-2 border-dashed border-blue-400/50 rounded-3xl p-6 flex items-center gap-6 cursor-pointer hover:bg-white/20 transition-all">
                      <div className="w-16 h-16 bg-blue-400/20 rounded-2xl flex items-center justify-center">
                          <svg className="w-8 h-8 text-blue-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                      </div>
                      <p className="text-2xl font-bold text-white">{t('choose_picture')}</p>
                  </div>
              </div>
          </div>
      )}

      {isCapturingFromCamera && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/95 backdrop-blur-2xl p-6 pl-[calc(1.5rem+env(safe-area-inset-left))] pr-[calc(1.5rem+env(safe-area-inset-right))] pt-[calc(1.5rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
              <div className="w-full max-w-xl">
                  <CameraCapture onCapture={handleAddNewImageFromCamera} onCancel={() => setIsCapturingFromCamera(false)} />
              </div>
          </div>
      )}

      {enlargedImageIndex !== null && (
          <div className="fixed inset-0 z-[1000] flex flex-col items-center justify-center bg-black/95 p-4" onClick={() => setEnlargedImageIndex(null)}>
              <div className="relative flex-1 w-full flex items-center justify-center overflow-hidden" onClick={(e) => e.stopPropagation()}>
                  {plant.images?.[enlargedImageIndex] ? (
                      <img 
                        src={plant.images[enlargedImageIndex]} 
                        className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl animate-in zoom-in-95 duration-300" 
                        referrerPolicy="no-referrer"
                      />
                  ) : (
                      <div className="w-full h-full flex items-center justify-center">
                          <p className="text-white">Image not available</p>
                      </div>
                  )}
                  
                  <button 
                    onClick={(e) => { e.stopPropagation(); setEnlargedImageIndex(enlargedImageIndex > 0 ? enlargedImageIndex - 1 : (plant.images?.length || 0) - 1) }} 
                    className="absolute left-4 top-1/2 -translate-y-1/2 w-14 h-14 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white transition-all border border-white/20"
                  >
                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                  </button>
                  
                  <button 
                    onClick={(e) => { e.stopPropagation(); setEnlargedImageIndex((enlargedImageIndex + 1) % (plant.images?.length || 1)) }} 
                    className="absolute right-4 top-1/2 -translate-y-1/2 w-14 h-14 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white transition-all border border-white/20"
                  >
                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  </button>

                  <div className="absolute top-[calc(1rem+env(safe-area-inset-top))] right-[calc(1rem+env(safe-area-inset-right))] flex gap-4">
                      {enlargedImageIndex !== 0 && (
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleSetMainImage(enlargedImageIndex); setEnlargedImageIndex(0); }} 
                            className="w-12 h-12 bg-verdant/20 hover:bg-verdant backdrop-blur-md rounded-full flex items-center justify-center text-white transition-all border border-white/20"
                            title={t('btn_set_primary')}
                          >
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                          </button>
                      )}
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleDeleteImage(enlargedImageIndex); }} 
                        className={`w-12 h-12 bg-red-500/20 hover:bg-red-500 backdrop-blur-md rounded-full flex items-center justify-center text-white transition-all border border-white/20 ${plant.images && plant.images.length <= 1 ? 'opacity-50 cursor-not-allowed' : ''}`} 
                        disabled={plant.images && plant.images.length <= 1}
                        title={t('btn_delete_image')}
                      >
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); setEnlargedImageIndex(null); }} 
                        className="w-12 h-12 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white transition-all border border-white/20"
                        title={t('btn_close')}
                      >
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                  </div>
              </div>

              {/* THUMBNAIL STRIP */}
              <div className="w-full max-w-4xl flex justify-center gap-2 py-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] overflow-x-auto no-scrollbar" onClick={(e) => e.stopPropagation()}>
                  {plant.images?.map((img, idx) => (
                      <button 
                        key={idx} 
                        onClick={() => setEnlargedImageIndex(idx)}
                        className={`w-16 h-16 rounded-xl overflow-hidden border-2 transition-all shrink-0 ${enlargedImageIndex === idx ? 'border-verdant scale-110 shadow-lg' : 'border-transparent opacity-50 hover:opacity-100'}`}
                      >
                          <img src={img} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      </button>
                  ))}
              </div>
          </div>
      )}

      {enlargedLogImage && (
          <div className="fixed inset-0 z-[1000] flex flex-col items-center justify-center bg-black/95 p-4" onClick={() => setEnlargedLogImage(null)}>
              <div className="relative flex-1 w-full flex items-center justify-center overflow-hidden" onClick={(e) => e.stopPropagation()}>
                  <img 
                    src={enlargedLogImage} 
                    className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl animate-in zoom-in-95 duration-300" 
                    referrerPolicy="no-referrer"
                  />
                  <button 
                    onClick={() => setEnlargedLogImage(null)} 
                    className="absolute top-[calc(1rem+env(safe-area-inset-top))] right-[calc(1rem+env(safe-area-inset-right))] w-12 h-12 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white transition-all"
                  >
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
              </div>
          </div>
      )}

      <EditPlantModal isOpen={isEditOpen} onClose={() => setIsEditOpen(false)} plant={plant} onSave={(id, updates) => updatePlant(id, updates)} onDelete={() => { setIsEditOpen(false); setIsDeleteConfirmationOpen(true); }} />
      <HealthCheckModal isOpen={isHealthOpen} onClose={() => setIsHealthOpen(false)} plant={plant} />
      <TransferModal isOpen={isTransferOpen} onClose={() => setIsTransferOpen(false)} plant={plant} />
      <FertilizerLogModal 
        isOpen={isFertilizerOpen} 
        onClose={() => setIsFertilizerOpen(false)} 
        plant={plant} 
        onLog={handleFertilizerLog} 
      />
      <MoistureLogModal
        isOpen={isMoistureOpen}
        onClose={() => setIsMoistureOpen(false)}
        onLog={handleMoistureLog}
      />
      <PhenophaseLogModal
        isOpen={isPhenophaseOpen}
        onClose={() => setIsPhenophaseOpen(false)}
        plant={plant}
        onLog={handlePhenophaseLog}
      />
      <input type="file" ref={avatarInputRef} className="hidden" accept="image/*" onChange={handleUpdateMainImageFromFile} />
      <input type="file" ref={addPhotoInputRef} className="hidden" accept="image/*" onChange={handleAddNewImageFromFile} />
      <PlantLogEntry
        isOpen={isNoteOpen}
        onClose={() => setIsNoteOpen(false)}
        onLog={handleManualLog}
        apiKey={getEffectiveApiKey()}
        language={language}
      />
      <ConfirmationDialog 
        isOpen={isDeleteConfirmationOpen} 
        onClose={() => setIsDeleteConfirmationOpen(false)} 
        onConfirm={handleDelete} 
        title={t('lbl_decommission_confirm')} 
        message={t('confirm_decommission_message', { name: lv(plant.nickname) })}
      />
    </div>
  );
};