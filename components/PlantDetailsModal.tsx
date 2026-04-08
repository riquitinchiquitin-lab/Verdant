
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Leaf, Camera, Edit3, Activity, QrCode } from 'lucide-react';
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
  const { updatePlant, plants, addLog, deleteLog, deletePlant, setAlertMessage, getEffectiveApiKey } = usePlants();
  const { consumeItem } = useInventory();
  const { t, lv, lva, language } = useLanguage();
  const { user } = useAuth();

  const PassportItem = ({ icon, label, value, subValue }: { icon: string, label: string, value: string, subValue?: string }) => (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-lg">{icon}</span>
        <div className="flex flex-col">
          <span className="text-[10px] font-serif font-black text-slate-600 dark:text-slate-300 uppercase tracking-widest">{label}</span>
          {subValue && <span className="text-[9px] font-serif text-verdant font-bold uppercase tracking-tighter">{subValue}</span>}
        </div>
      </div>
      <p className="text-sm font-serif italic text-gray-900 dark:text-gray-100 leading-relaxed">{value || t('lbl_na')}</p>
    </div>
  );

  const TechMetric = ({ label, min, max, unit, advice }: { label: string, min?: number | null, max?: number | null, unit: string, advice: string }) => (
    <div className="relative space-y-4 p-6 bg-white dark:bg-slate-900 rounded-3xl border border-gray-100 dark:border-slate-800 shadow-sm overflow-hidden group hover:scale-105 transition-all duration-300 cursor-pointer">
      {/* Hardware Decoration: Corner Accent */}
      <div className="absolute top-0 right-0 w-8 h-8 opacity-10">
        <div className="absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-verdant" />
      </div>
      
      <p className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">{label}</p>
      <div className="flex items-baseline gap-1">
        <span className="text-4xl font-black text-gray-900 dark:text-white tracking-tighter">
          {min !== undefined && min !== null && max !== undefined && max !== null ? `${min}-${max}` : (min ?? max ?? t('lbl_na'))}
        </span>
        <span className="text-xs font-bold text-verdant uppercase tracking-widest">{unit}</span>
      </div>
      <div className="h-0.5 w-full bg-gray-50 dark:bg-slate-800 rounded-full overflow-hidden">
        <div className="h-full bg-verdant w-2/3 opacity-30 group-hover:w-full transition-all duration-700" />
      </div>
      <p className="text-[13px] font-serif italic text-slate-600 dark:text-slate-300 leading-relaxed">"{advice}"</p>
    </div>
  );

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

  const handleDelete = async () => {
    await deletePlant(plant.id);
    onClose();
  };

  const lastWateredDate = plant.lastWatered ? new Date(plant.lastWatered).toLocaleDateString(language, { month: 'short', day: 'numeric', year: 'numeric' }) : t('lbl_na');

  const getLogIcon = (log: Log): React.ReactNode => {
    if (log.type === 'PHENOPHASE' && log.metadata?.phase) {
      switch(log.metadata.phase) {
        case 'FIRST_BUD': return '🌱';
        case 'FULL_BLOOM': return '🌸';
        case 'SEED_SET': return '🌾';
        case 'DORMANCY_ENTRANCE': return '🍂';
        case 'FIRST_LEAF_SPRING': return '🌿';
        case 'BUDDING': return '🎋';
        case 'IN_FLOWER': return '🌺';
        case 'DORMANCY_START': return '❄️';
      }
    }
    switch(log.type) {
        case 'WATER': return '💧';
        case 'FERTILIZED': return '🧪';
        case 'REPOTTED': return '🪴';
        case 'PRUNED': return '✂️';
        case 'NEW_LEAF': return '🌿';
        case 'FLOWER': return '🌸';
        case 'DISEASE_CHECK': return '✚';
        case 'IMAGE': return '📸';
        case 'NOTE': return '📝';
        case 'MOISTURE': return <MoistureProbeIcon className="w-6 h-6" />;
        case 'PHENOPHASE': return '🧬';
        case 'ROTATED': return <PotRotationIcon className="w-6 h-6" />;
        default: return '📍';
    }
  };

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-500 ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
      <div className="absolute inset-0 bg-black/80 backdrop-blur-xl" onClick={onClose} />
      
      <div className="relative w-full h-full lg:w-[90vw] lg:h-[90vh] lg:max-h-[96vh] bg-white dark:bg-slate-950 lg:rounded-[48px] shadow-2xl lg:m-4 animate-in zoom-in-95 duration-500 border border-gray-100 dark:border-white/10 overflow-hidden flex flex-col">
        {/* CLOSE BUTTON - TOP RIGHT */}
        <button 
            onClick={onClose}
            className="absolute top-[calc(1rem+env(safe-area-inset-top))] right-[calc(1rem+env(safe-area-inset-right))] md:top-8 md:right-8 z-[100] w-10 h-10 md:w-14 md:h-14 bg-white/90 dark:bg-slate-800/90 backdrop-blur-xl rounded-full flex items-center justify-center text-gray-900 dark:text-white transition-all shadow-2xl border border-gray-200 dark:border-slate-700 group hover:scale-110"
            title={t('btn_close')}
        >
            <svg className="w-5 h-5 md:w-7 md:h-7 group-hover:rotate-90 transition-transform duration-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
        
        <div className="flex-1 overflow-y-auto no-scrollbar flex flex-col">
            {/* TOP NAVIGATION / TABS */}
            <div className="flex justify-start md:justify-center items-center gap-3 md:gap-4 lg:gap-10 border-b border-gray-100 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md sticky top-0 z-50 pt-[calc(2rem+env(safe-area-inset-top))] pb-6 md:pt-10 md:pb-8 overflow-x-auto pl-4 pr-20 md:px-6 flex-nowrap scroll-smooth no-scrollbar">
                {[
                    { id: 'DOSSIER', label: t('tab_dossier') }, 
                    { id: 'TECH', label: t('tab_tech') }, 
                    { id: 'PHENOPHASE', label: t('tab_phenophase') },
                    { id: 'TIMELINE', label: t('tab_history') }
                ].map(tab => (
                    <button 
                        key={tab.id} 
                        onClick={() => {
                            setActiveTab(tab.id as any);
                        }} 
                        className={`text-[8px] md:text-[11px] font-black uppercase tracking-[0.1em] md:tracking-[0.4em] transition-all relative px-4 md:px-6 py-2 md:py-2.5 rounded-full whitespace-nowrap flex items-center justify-center min-w-0 border border-transparent ${
                          activeTab === tab.id 
                            ? 'bg-verdant text-white shadow-lg shadow-verdant/20 border-verdant' 
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 border-gray-100 dark:border-slate-800'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>
            <div className="max-w-5xl mx-auto w-full p-6 lg:p-12 space-y-12">
                {/* HERO SECTION */}
                <div className="relative -mx-6 lg:-mx-12 -mt-6 lg:-mt-12 mb-12">
                  <div className="relative h-[400px] md:h-[600px] w-full overflow-hidden bg-slate-100 dark:bg-slate-900">
                    {/* Editorial Background Text */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
                      <span className="text-[25vw] font-display text-slate-200 dark:text-slate-800/20 uppercase select-none opacity-30 tracking-tighter">
                        {t('tab_dossier_caps')}
                      </span>
                    </div>

                    {plant.images?.[0] ? (
                      <motion.img
                        initial={{ scale: 1.1, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        src={plant.images[0]}
                        alt={lv(plant.nickname)}
                        className="h-full w-full object-cover relative z-10"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center relative z-10">
                        <Leaf className="h-24 w-24 text-slate-300 dark:text-slate-700" />
                      </div>
                    )}

                    {/* Hardware Telemetry Overlay */}
                    <div className="absolute top-8 left-8 z-20 space-y-2">
                      <div className="flex items-center gap-3 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
                        <div className="w-2 h-2 rounded-full bg-verdant animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                        <span className="text-[10px] font-mono text-white tracking-[0.2em] uppercase">{t('status_uplink_active')}</span>
                      </div>
                      <div className="text-[10px] font-mono text-white/60 tracking-widest pl-1">
                        {t('lbl_id_caps')}: {plant.id.slice(0, 12).toUpperCase()}
                      </div>
                    </div>

                    {/* Vertical Species Label */}
                    <div className="absolute bottom-24 right-8 z-20 [writing-mode:vertical-rl] rotate-180">
                      <span className="text-[11px] font-black text-white/40 uppercase tracking-[0.5em] whitespace-nowrap">
                        {plant.species || t('unclassified_specimen')}
                      </span>
                    </div>

                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent z-10" />
                    
                    <div className="absolute bottom-0 left-0 right-0 p-8 md:p-16 z-20">
                      <motion.div
                        initial={{ y: 30, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.2, duration: 0.8 }}
                      >
                        <div className="flex items-center gap-4 mb-4">
                          <span className="h-px w-12 bg-verdant" />
                          <p className="text-[11px] font-black text-verdant uppercase tracking-[0.4em]">{t('lbl_specimen_profile')}</p>
                        </div>
                        <h2 className="text-6xl md:text-[120px] font-black text-white tracking-tighter leading-[0.8] uppercase mb-4">
                          {lv(plant.nickname)}
                        </h2>
                        <div className="flex flex-wrap items-center gap-6 text-white/60">
                          {plant.isPriority && (
                            <div className="flex items-center gap-2 bg-amber-500/20 backdrop-blur-md px-3 py-1 rounded-full border border-amber-500/30">
                              <span className="text-amber-400 text-lg">⭐</span>
                              <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest">{t('lbl_priority_specimen')}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono uppercase tracking-widest">{t('lbl_variety')}</span>
                            <span className="text-sm font-serif italic text-white">{plant.variety || t('lbl_standard')}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono uppercase tracking-widest">{t('lbl_status')}</span>
                            <span className="text-sm font-serif italic text-white">{plant.healthStatus || t('sys_stable')}</span>
                          </div>
                        </div>
                      </motion.div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col lg:flex-row gap-12">
                  <div className="w-full lg:w-1/3 space-y-8">
                      <div className="grid grid-cols-3 gap-4">
                        <motion.button 
                          whileTap={{ scale: 0.95 }}
                          onClick={() => setIsAddingPhoto(true)} 
                          className="flex flex-col items-center justify-center gap-3 p-6 bg-white dark:bg-slate-900 rounded-[32px] border border-gray-100 dark:border-slate-800 shadow-sm hover:border-verdant transition-all group"
                        >
                          <div className="w-12 h-12 bg-slate-50 dark:bg-slate-800 rounded-2xl flex items-center justify-center group-hover:bg-verdant/10 transition-colors">
                            <Camera className="w-6 h-6 text-slate-400 group-hover:text-verdant" />
                          </div>
                          <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{t('btn_add_image')}</span>
                        </motion.button>
                        <motion.button 
                          whileTap={{ scale: 0.95 }}
                          onClick={() => setIsEditOpen(true)} 
                          className="flex flex-col items-center justify-center gap-3 p-6 bg-white dark:bg-slate-900 rounded-[32px] border border-gray-100 dark:border-slate-800 shadow-sm hover:border-verdant transition-all group"
                        >
                          <div className="w-12 h-12 bg-slate-50 dark:bg-slate-800 rounded-2xl flex items-center justify-center group-hover:bg-verdant/10 transition-colors">
                            <Edit3 className="w-6 h-6 text-slate-400 group-hover:text-verdant" />
                          </div>
                          <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{t('btn_edit_data')}</span>
                        </motion.button>
                        <motion.button 
                          whileTap={{ scale: 0.95 }}
                          onClick={handleTogglePriority} 
                          disabled={isTogglingPriority}
                          className={`flex flex-col items-center justify-center gap-3 p-6 rounded-[32px] border shadow-sm transition-all group col-span-3 md:col-span-1 ${
                            plant.isPriority 
                              ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 hover:border-amber-400' 
                              : 'bg-white dark:bg-slate-900 border-gray-100 dark:border-slate-800 hover:border-verdant'
                          }`}
                        >
                          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors ${
                            plant.isPriority 
                              ? 'bg-amber-100 dark:bg-amber-800/40' 
                              : 'bg-slate-50 dark:bg-slate-800 group-hover:bg-verdant/10'
                          }`}>
                            <span className={`text-2xl transition-transform duration-500 ${plant.isPriority ? 'scale-125' : 'group-hover:scale-110'}`}>
                              {plant.isPriority ? '⭐' : '☆'}
                            </span>
                          </div>
                          <span className={`text-[10px] font-black uppercase tracking-widest ${
                            plant.isPriority ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500'
                          }`}>
                            {plant.isPriority ? t('btn_remove_priority') : t('btn_set_priority')}
                          </span>
                        </motion.button>
                      </div>

                    <div className="space-y-4">
                      <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-2">{t('lbl_image_archive')}</h4>
                      <div className="grid grid-cols-3 gap-3">
                        {plant.images?.map((img, idx) => (
                          <motion.div
                            key={idx}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            className="aspect-square rounded-2xl overflow-hidden border-2 border-white dark:border-slate-800 shadow-sm cursor-pointer"
                            onClick={() => setEnlargedImageIndex(idx)}
                          >
                            <img src={img} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="w-full lg:w-2/3 space-y-12">
                    {/* ACTION GRID */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <Button variant="primary" size="lg" className={`rounded-[32px] h-24 shadow-xl text-[11px] font-black uppercase tracking-[0.2em] flex flex-col items-center justify-center gap-2 transition-all duration-300 ${lastLoggedAction === 'WATER' ? 'bg-emerald-500 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'}`} onClick={() => handleLogAction('WATER')}>
                        <span className="text-3xl">💧</span>
                        <span>{t('btn_hydrate')}</span>
                      </Button>
                      <Button variant="primary" size="lg" className={`rounded-[32px] h-24 shadow-xl text-[11px] font-black uppercase tracking-[0.2em] flex flex-col items-center justify-center gap-2 transition-all duration-300 ${lastLoggedAction === 'MOISTURE' ? 'bg-emerald-500 text-white' : 'bg-sky-500 hover:bg-sky-600 text-white'}`} onClick={() => setIsMoistureOpen(true)}>
                        <MoistureProbeIcon className="w-10 h-10" />
                        <span>{t('btn_probe')}</span>
                      </Button>
                      <Button variant="primary" size="lg" className={`rounded-[32px] h-24 shadow-xl text-[11px] font-black uppercase tracking-[0.2em] flex flex-col items-center justify-center gap-2 transition-all duration-300 ${lastLoggedAction === 'NOTE' ? 'bg-emerald-500 text-white' : 'bg-amber-500 hover:bg-amber-600 text-white'}`} onClick={() => setIsNoteOpen(true)}>
                        <span className="text-3xl">📝</span>
                        <span>{t('btn_log_caps')}</span>
                      </Button>
                      <Button variant="secondary" size="lg" className="rounded-[32px] h-24 border-2 border-red-100 dark:border-red-900/30 text-red-600 bg-red-50/20 text-[11px] font-black uppercase tracking-[0.2em] flex flex-col items-center justify-center gap-2" onClick={() => setIsHealthOpen(true)}>
                        <Activity className="w-10 h-10 text-red-500" />
                        <span>{t('lbl_health')}</span>
                      </Button>
                    </div>

                    <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
                      {[
                        { type: 'FERTILIZED', icon: '🧪', label: t('btn_feed') },
                        { type: 'PRUNED', icon: '✂️', label: t('btn_prune_caps') },
                        { type: 'REPOTTED', icon: '🪴', label: t('btn_repot_caps') },
                        { type: 'NEW_LEAF', icon: '🌱', label: t('btn_growth') },
                        ...(plant.flowers ? [{ type: 'FLOWER', icon: '🌸', label: t('btn_bloom') }] : []),
                        { type: 'ROTATED', icon: <PotRotationIcon className="w-8 h-8 group-hover:animate-[spin_3s_linear_infinite]" />, label: t('btn_rotate_caps') },
                        { type: 'TRANSFER', icon: <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>, label: t('btn_transfer') }
                      ].map(action => (
                        <motion.button 
                          key={action.type}
                          whileTap={{ scale: 0.92 }}
                          onClick={() => handleLogAction(action.type as any)}
                          className={`h-20 rounded-3xl clay-button flex flex-col items-center justify-center gap-1 hover:scale-105 transition-all duration-300 group ${lastLoggedAction === action.type ? 'ring-4 ring-emerald-500/20 bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-500/30' : ''}`}
                        >
                          <span className="text-2xl">{action.icon}</span>
                          <span className="text-[8px] font-black uppercase tracking-widest text-slate-400 group-hover:text-slate-600">{action.label}</span>
                        </motion.button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* TAB CONTENT */}
                <div className="animate-in fade-in duration-700">
                    {activeTab === 'DOSSIER' && (
                        <div className="space-y-8">
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
                                <div className="lg:col-span-2 space-y-8">
                                    <section className="bg-white dark:bg-slate-900 rounded-[40px] p-10 border border-gray-100 dark:border-slate-800 shadow-sm space-y-8">
                                        <h3 className="text-[11px] font-serif font-black uppercase tracking-[0.3em] text-verdant">{t('botanical_passport')}</h3>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                                            <PassportItem icon="🌍" label={t('lbl_origin')} value={lv(plant.origin)} />
                                            <PassportItem icon="🌿" label={t('lbl_family_genus')} value={`${plant.family} / ${plant.genus}`} />
                                            <PassportItem icon="📏" label={t('lbl_growth_size')} value={`${t('lbl_max_height')}: ${plant.maxHeight} cm (${lv(plant.growthRate as any) || t('lbl_standard')})`} />
                                            <PassportItem icon="🏷️" label={t('lbl_category')} value={lv(plant.category as any) || t('lbl_na')} />
                                            <PassportItem icon="🏠" label={t('lbl_room')} value={lv(plant.room as any) || t('lbl_unassigned')} />
                                            <PassportItem icon="☀️" label={t('lbl_light_advice')} value={lv(plant.lightAdvice)} />
                                        </div>
                                    </section>

                                </div>

                                <div className="space-y-8">
                                    <div className="bg-emerald-50 rounded-[40px] p-8 border border-emerald-100 space-y-4">
                                        <h3 className="text-[10px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                            {t('lbl_toxicity')}
                                        </h3>
                                        <p className="text-sm font-serif italic text-emerald-900 leading-relaxed">"{lv(plant.petSafety)}"</p>
                                    </div>

                                    {plant.soilComposition && plant.soilComposition.length > 0 && (
                                    <section className="bg-white dark:bg-slate-900 rounded-[40px] p-8 border border-gray-100 dark:border-slate-800 shadow-sm space-y-6">
                                            <h3 className="text-[10px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-widest">{t('lbl_soil_recipe')}</h3>
                                            <div className="space-y-4">
                                                {plant.soilComposition.map((item, idx) => (
                                                    <div key={idx} className="space-y-2">
                                                        <div className="flex justify-between text-[10px] font-black uppercase tracking-widest">
                                                            <span className="text-gray-700 dark:text-slate-200">{lv(item.component)}</span>
                                                            <span className="text-verdant">{item.percent}%</span>
                                                        </div>
                                                        <div className="h-1.5 w-full bg-gray-50 rounded-full overflow-hidden">
                                                            <div className="h-full bg-verdant rounded-full" style={{ width: `${item.percent}%` }} />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </section>
                                    )}

                                    <Button 
                                        variant="secondary" 
                                        className="w-full h-16 rounded-[32px] border-dashed border-2 border-gray-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-verdant hover:border-verdant transition-all flex items-center justify-center gap-3"
                                        onClick={() => setIsNoteOpen(true)}
                                    >
                                        <span className="text-xl">📝</span>
                                        <span className="text-[10px] font-black uppercase tracking-widest">{t('btn_add_log')}</span>
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'TECH' && (
                        <div className="space-y-8">
                            <section className="bg-white dark:bg-slate-900 rounded-[40px] p-10 border border-gray-100 dark:border-slate-800 shadow-sm space-y-10">
                                <h3 className="text-[11px] font-black uppercase tracking-[0.4em] text-verdant">{t('lbl_atmospheric_soil_bounds')}</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12">
                                    <TechMetric label={t('lbl_moisture')} min={plant.minSoilMoist} max={plant.maxSoilMoist} unit="%" advice={lv(plant.moistureAdvice)} />
                                    <TechMetric label={t('lbl_temperature')} min={plant.minTemp} max={plant.maxTemp} unit="°C" advice={lv(plant.tempAdvice)} />
                                    <TechMetric label={t('lbl_illuminance')} min={plant.minLightLux} unit="Lux" advice={lv(plant.lightAdvice)} />
                                    <TechMetric label={t('lbl_soil_ec')} min={plant.minSoilEc} unit="mS/cm" advice={lv(plant.nutritionAdvice)} />
                                    <TechMetric label={t('lbl_humidity')} min={plant.minEnvHumid} max={plant.maxEnvHumid} unit="%" advice={lv(plant.humidityAdvice)} />
                                    <TechMetric label={t('lbl_target_ph')} min={plant.targetPh} unit="pH" advice={t('lbl_target_ph_desc')} />
                                    <TechMetric label={t('lbl_target_ec')} min={plant.targetEc} unit="mS/cm" advice={t('lbl_target_ec_desc')} />
                                    <TechMetric label={t('lbl_target_vpd')} min={plant.targetVpd} unit="kPa" advice={t('lbl_target_vpd_desc')} />
                                    <TechMetric label={t('lbl_target_dli')} min={plant.targetDli} unit="mol/m²/d" advice={t('lbl_target_dli_desc')} />
                                </div>
                            </section>

                            <section className="bg-white dark:bg-slate-900 rounded-[40px] p-10 border border-gray-100 dark:border-slate-800 shadow-sm space-y-10">
                                <h3 className="text-[11px] font-black uppercase tracking-[0.4em] text-verdant">{t('lbl_environmental_guards')}</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                                    <div className="p-8 bg-gray-50 dark:bg-slate-800/50 rounded-3xl border border-gray-100 dark:border-slate-800">
                                        <p className="text-[10px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-widest mb-4">{t('lbl_watering_delta')}</p>
                                        <p className="text-2xl font-black text-gray-900 dark:text-white">{plant.wateringInterval} {t('days').toUpperCase()}</p>
                                        <p className="text-xs text-gray-700 dark:text-slate-200 mt-2 italic">{t('lbl_watering_delta_desc')}</p>
                                    </div>
                                    <div className="p-8 bg-gray-50 dark:bg-slate-800/50 rounded-3xl border border-gray-100 dark:border-slate-800">
                                        <p className="text-[10px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-widest mb-4">{t('lbl_last_observed_action')}</p>
                                        <p className="text-2xl font-black text-gray-900 dark:text-white uppercase">{lastWateredDate}</p>
                                        <p className="text-xs text-gray-700 dark:text-slate-200 mt-2 italic">{t('lbl_last_observed_action_desc')}</p>
                                    </div>
                                </div>
                            </section>

                            <section className="bg-white dark:bg-slate-900 rounded-[40px] p-10 border border-gray-100 dark:border-slate-800 shadow-sm space-y-8">
                                <h3 className="text-[11px] font-black uppercase tracking-[0.4em] text-verdant">{t('lbl_upcoming_care_schedule')}</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* Watering Schedule */}
                                    {plant.wateringInterval && (
                                        <div className="space-y-3">
                                            <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest px-2">{t('lbl_watering_schedule')}</p>
                                            {[1, 2, 3].map(i => {
                                                const lastDate = plant.lastWatered ? new Date(plant.lastWatered) : new Date();
                                                const nextDate = new Date(lastDate.getTime() + i * (plant.wateringInterval || 7) * 86400000);
                                                const daysAway = Math.ceil((nextDate.getTime() - Date.now()) / 86400000);
                                                return (
                                                    <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-slate-800/50 rounded-2xl border border-gray-100 dark:border-slate-800">
                                                        <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500 text-sm">💧</div>
                                                        <div className="flex-1">
                                                            <p className="text-xs font-bold text-gray-900 dark:text-white">
                                                                {nextDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                                                            </p>
                                                        </div>
                                                        <div className="text-[9px] font-black text-blue-500 uppercase tracking-widest">
                                                            {daysAway > 0 ? t('care_due_in', { days: daysAway.toString() }) : t('due_today')}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {/* Rotation Schedule */}
                                    {plant.rotationFrequency && (
                                        <div className="space-y-3">
                                            <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest px-2">{t('lbl_rotation_schedule')}</p>
                                            {[1, 2, 3].map(i => {
                                                const lastDate = plant.lastRotated ? new Date(plant.lastRotated) : new Date();
                                                const nextDate = new Date(lastDate.getTime() + i * (plant.rotationFrequency || 30) * 86400000);
                                                const daysAway = Math.ceil((nextDate.getTime() - Date.now()) / 86400000);
                                                return (
                                                    <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-slate-800/50 rounded-2xl border border-gray-100 dark:border-slate-800">
                                                        <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500 text-sm">🔄</div>
                                                        <div className="flex-1">
                                                            <p className="text-xs font-bold text-gray-900 dark:text-white">
                                                                {nextDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                                                            </p>
                                                        </div>
                                                        <div className="text-[9px] font-black text-amber-500 uppercase tracking-widest">
                                                            {daysAway > 0 ? t('care_due_in', { days: daysAway.toString() }) : t('due_today')}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </section>
                        </div>
                    )}

                    {activeTab === 'PHENOPHASE' && (
                        <div className="space-y-8">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                                <section className="bg-white dark:bg-slate-900 rounded-[40px] p-10 border border-gray-100 dark:border-slate-800 shadow-sm space-y-8">
                                    <h3 className="text-[11px] font-serif font-black uppercase tracking-[0.3em] text-verdant">{t('lbl_biological_milestones')}</h3>
                                    <div className="grid grid-cols-1 gap-8">
                                        <PassportItem 
                                            icon="🔄" 
                                            label={t('lbl_repot_cadence')} 
                                            value={plant.repottingFrequency ? `${t('lbl_every')} ${plant.repottingFrequency} ${t('lbl_months')}` : `${t('lbl_every')} ${getSuggestedRepotFrequency(plant)} ${t('lbl_months')}`} 
                                            subValue={!plant.repottingFrequency ? '(Suggested based on species)' : undefined}
                                        />
                                        <PassportItem 
                                            icon="🪴" 
                                            label={t('lbl_last_pot_size')} 
                                            value={plant.lastPotSizeCm || plant.lastPotSizeInches ? `${plant.lastPotSizeCm || '--'} cm / ${plant.lastPotSizeInches || '--'} in` : (plant.lastPotSize ? (String(plant.lastPotSize).match(/^\d+(\.\d+)?$/) ? `${plant.lastPotSize} cm` : String(plant.lastPotSize)) : t('lbl_na'))}
                                        />
                                        <PassportItem 
                                            icon="🔄" 
                                            label={t('lbl_rotation_frequency')} 
                                            value={plant.rotationFrequency ? `${plant.rotationFrequency} ${t('days')}` : t('lbl_na')} 
                                        />
                                        <PassportItem 
                                            icon="📅" 
                                            label={t('lbl_last_rotated')} 
                                            value={plant.lastRotated ? new Date(plant.lastRotated).toLocaleDateString() : t('lbl_na')}
                                        />
                                        <PassportItem 
                                            icon="💧" 
                                            label={t('lbl_last_watered_date')} 
                                            value={plant.lastWatered ? new Date(plant.lastWatered).toLocaleDateString() : t('lbl_na')} 
                                        />
                                        <PassportItem icon="🧬" label={t('lbl_propagation')} value={lva(plant.propagationMethods as any)?.join(', ') || t('lbl_na')} />
                                    </div>
                                </section>

                                {lv(plant.propagationInstructions) ? (
                                    <section className="bg-white dark:bg-slate-900 rounded-[40px] p-10 border border-gray-100 dark:border-slate-800 shadow-sm space-y-8">
                                        <h3 className="text-[11px] font-serif font-black uppercase tracking-[0.3em] text-verdant">{t('lbl_propagation_instructions')}</h3>
                                        <p className="text-sm font-serif italic text-gray-900 dark:text-slate-100 leading-relaxed whitespace-pre-wrap">
                                            {lv(plant.propagationInstructions)}
                                        </p>
                                    </section>
                                ) : (
                                    <section className="bg-white/50 dark:bg-slate-900/50 rounded-[40px] p-10 border border-dashed border-gray-200 dark:border-slate-800 space-y-4 flex flex-col items-center justify-center text-center">
                                        <div className="w-12 h-12 bg-gray-50 dark:bg-slate-800 rounded-2xl flex items-center justify-center text-2xl grayscale opacity-50">🧬</div>
                                        <div className="space-y-1">
                                            <h3 className="text-[11px] font-serif font-black uppercase tracking-[0.2em] text-slate-400">{t('lbl_propagation_instructions')}</h3>
                                            <p className="text-xs text-slate-500 italic">{t('msg_no_propagation_instructions')}</p>
                                        </div>
                                        <Button variant="ghost" size="sm" className="text-[9px] font-black uppercase tracking-widest text-verdant" onClick={() => setIsEditOpen(true)}>
                                            + {t('btn_add_instructions')}
                                        </Button>
                                    </section>
                                )}

                                <section className="bg-white dark:bg-slate-900 rounded-[40px] p-10 border border-gray-100 dark:border-slate-800 shadow-sm space-y-8">
                                    <h3 className="text-[11px] font-serif font-black uppercase tracking-[0.3em] text-verdant">{t('lbl_provenance_source')}</h3>
                                    <div className="space-y-6">
                                        <div className="flex justify-between items-center py-4 border-b border-gray-50 dark:border-slate-800">
                                            <span className="text-[10px] font-serif font-black text-slate-600 dark:text-slate-300 uppercase tracking-widest">{t('lbl_nursery_source')}</span>
                                            <span className="text-sm font-serif italic text-gray-900 dark:text-slate-100">{plant.provenance?.nursery || t('lbl_unknown')}</span>
                                        </div>
                                        <div className="flex justify-between items-center py-4 border-b border-gray-50 dark:border-slate-800">
                                            <span className="text-[10px] font-serif font-black text-slate-600 dark:text-slate-300 uppercase tracking-widest">{t('lbl_acquisition_date')}</span>
                                            <span className="text-sm font-serif italic text-gray-900 dark:text-slate-100">{plant.provenance?.dateOfPurchase ? new Date(plant.provenance.dateOfPurchase).toLocaleDateString() : t('lbl_na')}</span>
                                        </div>
                                        <div className="flex justify-between items-center py-4 border-b border-gray-50 dark:border-slate-800">
                                            <span className="text-[10px] font-serif font-black text-slate-600 dark:text-slate-300 uppercase tracking-widest">{t('lbl_investment')}</span>
                                            <span className="text-sm font-serif italic text-gray-900 dark:text-slate-100">{plant.provenance?.cost ? `${plant.provenance.cost} ${plant.provenance.currency || 'USD'}` : t('lbl_na')}</span>
                                        </div>
                                    </div>
                                </section>

                                {lv(plant.repottingInstructions) ? (
                                    <section className="bg-white dark:bg-slate-900 rounded-[40px] p-10 border border-gray-100 dark:border-slate-800 shadow-sm space-y-8">
                                        <h3 className="text-[11px] font-serif font-black uppercase tracking-[0.3em] text-verdant">{t('lbl_repotting_instructions')}</h3>
                                        <p className="text-sm font-serif italic text-gray-900 dark:text-slate-100 leading-relaxed whitespace-pre-wrap">
                                            {lv(plant.repottingInstructions)}
                                        </p>
                                    </section>
                                ) : (
                                    <section className="bg-white/50 dark:bg-slate-900/50 rounded-[40px] p-10 border border-dashed border-gray-200 dark:border-slate-800 space-y-4 flex flex-col items-center justify-center text-center">
                                        <div className="w-12 h-12 bg-gray-50 dark:bg-slate-800 rounded-2xl flex items-center justify-center text-2xl grayscale opacity-50">🪴</div>
                                        <div className="space-y-1">
                                            <h3 className="text-[11px] font-serif font-black uppercase tracking-[0.2em] text-slate-400">{t('lbl_repotting_instructions')}</h3>
                                            <p className="text-xs text-slate-500 italic">{t('msg_no_repotting_instructions')}</p>
                                        </div>
                                        <Button variant="ghost" size="sm" className="text-[9px] font-black uppercase tracking-widest text-verdant" onClick={() => setIsEditOpen(true)}>
                                            + {t('btn_add_instructions')}
                                        </Button>
                                    </section>
                                )}
                            </div>

                            <section className="bg-white dark:bg-slate-900 rounded-[40px] p-10 border border-gray-100 dark:border-slate-800 shadow-sm space-y-8">
                                <h3 className="text-[11px] font-serif font-black uppercase tracking-[0.3em] text-verdant">{t('lbl_phenophase_tracking')}</h3>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left">
                                        <thead>
                                            <tr className="border-b border-gray-100 dark:border-slate-800">
                                                <th className="pb-4 text-[10px] font-serif font-black text-slate-600 dark:text-slate-300 uppercase tracking-widest">{t('lbl_phase')}</th>
                                                <th className="pb-4 text-[10px] font-serif font-black text-slate-600 dark:text-slate-300 uppercase tracking-widest">{t('lbl_date')}</th>
                                                <th className="pb-4 text-[10px] font-serif font-black text-slate-600 dark:text-slate-300 uppercase tracking-widest">{t('lbl_notes')}</th>
                                                <th className="pb-4"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50 dark:divide-slate-800">
                                            {plant.logs?.filter(l => l.type === 'PHENOPHASE').map(log => (
                                                <tr key={log.id}>
                                                    <td className="py-4 text-sm font-serif font-bold text-gray-900 dark:text-white">{t(`PHASE_${log.metadata?.phase}` as any)}</td>
                                                    <td className="py-4 text-sm font-serif text-gray-700 dark:text-slate-200">{new Date(log.date).toLocaleDateString()}</td>
                                                    <td className="py-4 text-sm font-serif text-gray-700 dark:text-slate-200 italic">{lv(log.localizedNote)}</td>
                                                    <td className="py-4 text-right">
                                                        <button 
                                                            onClick={() => deleteLog(plant.id, log.id)}
                                                            className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                                                            title={t('btn_delete')}
                                                        >
                                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                            {(!plant.logs || plant.logs.filter(l => l.type === 'PHENOPHASE').length === 0) && (
                                                <tr>
                                                    <td colSpan={3} className="py-8 text-center text-xs font-serif text-slate-600 dark:text-slate-300 italic">{t('msg_no_phenophase')}</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                                <Button 
                                    variant="secondary" 
                                    className="w-full rounded-2xl border-dashed border-2 border-gray-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-verdant hover:border-verdant transition-all"
                                    onClick={() => handleLogAction('PHENOPHASE')}
                                >
                                    + {t('btn_record_phenophase')}
                                </Button>
                            </section>
                        </div>
                    )}

                    {activeTab === 'TIMELINE' && (
                        <div className="space-y-8">
                            <section className="bg-white dark:bg-slate-900 rounded-[40px] p-10 border border-gray-100 dark:border-slate-800 shadow-sm space-y-8">
                                <h3 className="text-[11px] font-serif font-black uppercase tracking-[0.3em] text-verdant">{t('tab_history')}</h3>
                                <div className="divide-y divide-gray-50 dark:divide-slate-800">
                                    {plant.logs && plant.logs.length > 0 ? (
                                        plant.logs.map((log) => (
                                            <div key={log.id} className="flex gap-6 items-start py-8 first:pt-0 last:pb-0">
                                                <div className="w-12 h-12 bg-gray-50 dark:bg-slate-800 rounded-2xl flex items-center justify-center text-2xl shrink-0">
                                                    {getLogIcon(log)}
                                                </div>
                                                <div className="flex-1 space-y-2">
                                                    <div className="flex justify-between items-center">
                                                        <p className="text-[11px] font-serif font-black uppercase tracking-widest text-verdant">
                                                            {log.type === 'PHENOPHASE' && log.metadata?.phase 
                                                                ? t(`PHASE_${log.metadata.phase}`) 
                                                                : t('lbl_record_type', { type: t(`log_${log.type.toLowerCase()}`) })}
                                                        </p>
                                                        <span className="text-[11px] font-serif font-black text-slate-600 dark:text-slate-300 uppercase tracking-widest">{new Date(log.date).toLocaleDateString(language)}</span>
                                                    </div>
                                                    <div className="flex justify-between items-start gap-4">
                                                        <p className="text-sm md:text-base text-gray-900 dark:text-slate-100 font-serif italic leading-relaxed flex-1">"{lv(log.localizedNote) || log.note || '...'}"</p>
                                                        <button 
                                                            onClick={() => deleteLog(plant.id, log.id)}
                                                            className="p-2 text-slate-400 hover:text-red-500 transition-colors shrink-0"
                                                            title={t('btn_delete')}
                                                        >
                                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                        </button>
                                                    </div>
                                                    {log.imageUrl && (
                                                        <div 
                                                            className="mt-4 w-32 h-32 rounded-2xl overflow-hidden border border-gray-100 dark:border-slate-800 shadow-sm cursor-pointer hover:scale-105 transition-transform"
                                                            onClick={() => {
                                                                // We'll use a temporary state or just open it in a simple way.
                                                                // For now, let's just use the enlargedImageIndex logic but we need to handle non-plant.images.
                                                                // Actually, let's just open it in a new tab or a simple modal if it's a log image.
                                                                // Or better, I'll add a state for `enlargedLogImage`.
                                                                setEnlargedLogImage(log.imageUrl || null);
                                                            }}
                                                        >
                                                            <img src={log.imageUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                                        </div>
                                                    )}
                                                    {log.type === 'DISEASE_CHECK' && log.metadata?.recoveryPlan && (
                                                      <div className="mt-4 space-y-2">
                                                        <p className="text-[9px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">{t('lbl_recovery_plan')}</p>
                                                        <div className="space-y-1">
                                                          {lva(log.metadata.recoveryPlan).map((step, sidx) => (
                                                            <div key={sidx} className="flex gap-2 items-start text-xs text-gray-600 dark:text-slate-400">
                                                              <span className="shrink-0 text-emerald-500">•</span>
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
                                        <div className="py-12 text-center">
                                            <p className="text-[10px] font-serif font-black text-slate-600 dark:text-slate-300 uppercase tracking-widest italic">{t('msg_no_history')}</p>
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

      <EditPlantModal isOpen={isEditOpen} onClose={() => setIsEditOpen(false)} plant={plant} onSave={(id, updates) => updatePlant(id, updates)} onDelete={() => setIsDeleteConfirmationOpen(true)} />
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