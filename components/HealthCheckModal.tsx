import React, { useState, useRef, useMemo } from 'react';
import {
  Activity,
  Camera,
  ImagePlus,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Check,
  Package,
  Droplets,
  FlaskConical,
  Sprout,
  ListChecks,
} from 'lucide-react';
import { Plant } from '../types';
import { Button } from './ui/Button';
import { useLanguage } from '../context/LanguageContext';
import { analyzePlantHealth, PlantHealthDiagnosisResult, HealthSeverity } from '../services/plantAi';
import { usePlants } from '../context/PlantContext';
import { useInventory } from '../context/InventoryContext';
import { CameraCapture } from './ui/CameraCapture';
import { compressImage } from '../services/imageUtils';
import { generateUUID } from '../services/crypto';

interface HealthCheckModalProps {
  isOpen: boolean;
  onClose: () => void;
  plant: Plant;
}

const QUICK_SYMPTOMS = [
  'Yellowing leaves (Chlorosis)',
  'Brown crispy leaf tips',
  'Drooping / Wilting stems',
  'Black or mushy stems / roots',
  'Dark fungal spots with yellow halo',
  'Fine white webbing / Spider mites',
  'Sticky residue / Scale or Aphids',
  'Sudden leaf drop',
  'Curling or deformed new growth',
  'White powdery coating',
];

const SEVERITY_CONFIG: Record<
  HealthSeverity,
  { label: string; badgeClass: string; cardClass: string }
> = {
  HEALTHY: {
    label: 'Optimal / Healthy',
    badgeClass: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
    cardClass: 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/40',
  },
  MILD: {
    label: 'Mild Stress',
    badgeClass: 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30',
    cardClass: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/40',
  },
  MODERATE: {
    label: 'Moderate Pathology',
    badgeClass: 'bg-orange-500/20 text-orange-700 dark:text-orange-300 border-orange-500/30',
    cardClass: 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800/40',
  },
  CRITICAL: {
    label: 'Critical Intervention Required',
    badgeClass: 'bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/30',
    cardClass: 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800/40',
  },
};

export const HealthCheckModal: React.FC<HealthCheckModalProps> = ({ isOpen, onClose, plant }) => {
  const { t, lv, lva } = useLanguage();
  const { addLog, updatePlant, addTask, setAlertMessage, getEffectiveApiKey } = usePlants();
  const { inventory } = useInventory();

  const [observations, setObservations] = useState('');
  const [selectedChips, setSelectedChips] = useState<string[]>([]);
  const [photo, setPhoto] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<PlantHealthDiagnosisResult | null>(null);
  const [addedTaskIndices, setAddedTaskIndices] = useState<Set<number>>(new Set());
  const [addedAllTasks, setAddedAllTasks] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Compute live care telemetry snapshot to display & send to AI
  const careSnapshot = useMemo(() => {
    const logs = [...(plant.logs || [])].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    const lastWaterLog = logs.find((l) => l.type === 'WATER');
    const lastWaterDate = plant.lastWatered || lastWaterLog?.date;
    const daysSinceWatered = lastWaterDate
      ? Math.floor((Date.now() - new Date(lastWaterDate).getTime()) / 86400000)
      : null;
    const lastMoistureLog = logs.find((l) => l.type === 'MOISTURE');
    const lastFertilizerLog = logs.find((l) => l.type === 'FERTILIZED');

    return {
      daysSinceWatered,
      wateringInterval: plant.wateringInterval || 7,
      moistureLevel: lastMoistureLog?.metadata?.moistureLevel ?? null,
      lastFertilized: lastFertilizerLog
        ? new Date(lastFertilizerLog.date).toLocaleDateString()
        : null,
    };
  }, [plant]);

  // Filter inventory items relevant to plant treatment & care
  const relevantInventory = useMemo(() => {
    const careCategories = new Set([
      'fungicide',
      'insecticide',
      'pesticide',
      'fertiliser',
      'soil',
      'custom-mix',
    ]);
    return inventory
      .filter(
        (item) =>
          !item.deletedAt &&
          item.quantity > 0 &&
          careCategories.has(item.category) &&
          (!item.houseId || !plant.houseId || item.houseId === plant.houseId)
      )
      .map((item) => ({
        id: item.id,
        name: lv(item.name),
        category: item.category,
        raw: item,
      }));
  }, [inventory, plant.houseId, lv]);

  const toggleSymptomChip = (symptom: string) => {
    setSelectedChips((prev) =>
      prev.includes(symptom) ? prev.filter((s) => s !== symptom) : [...prev, symptom]
    );
  };

  const combinedObservations = useMemo(() => {
    const parts = [...selectedChips];
    if (observations.trim()) parts.push(observations.trim());
    return parts.join('; ');
  }, [selectedChips, observations]);

  const handleCapture = (base64: string) => {
    setPhoto(base64);
    setIsCapturing(false);
    setErrorMessage(null);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const base64 = await compressImage(e.target.files[0]);
      setPhoto(base64);
      setErrorMessage(null);
    }
  };

  const handleRunCheck = async () => {
    if (!photo && !combinedObservations.trim()) return;
    setIsLoading(true);
    setErrorMessage(null);
    setAddedTaskIndices(new Set());
    setAddedAllTasks(false);

    try {
      const diagnosis = await analyzePlantHealth(
        plant,
        photo,
        combinedObservations,
        getEffectiveApiKey(),
        relevantInventory.map(({ id, name, category }) => ({ id, name, category }))
      );

      if (diagnosis) {
        setResult(diagnosis);
        const severityTag = diagnosis.severity ? `[${diagnosis.severity}] ` : '';

        // Save to plant timeline history
        await addLog(plant.id, {
          id: `h-${generateUUID()}`,
          date: new Date().toISOString(),
          type: 'DISEASE_CHECK',
          imageUrl: photo || undefined,
          localizedNote: diagnosis.diagnosis,
          metadata: {
            recoveryPlan: diagnosis.recoveryPlan,
            observations: combinedObservations,
            severity: diagnosis.severity,
            causeCategory: diagnosis.causeCategory,
          },
        });

        // Update plant healthStatus with structured severity + concise summary
        const diagText = lv(diagnosis.diagnosis);
        if (diagText) {
          await updatePlant(plant.id, {
            healthStatus: `${severityTag}${diagText}`.slice(0, 120),
          });
        }
      } else {
        setErrorMessage(
          'Diagnostic analysis could not be completed. Please ensure your Gemini API key is configured or provide a clearer photo / symptom description.'
        );
      }
    } catch (e: any) {
      console.error(e);
      setErrorMessage(
        e?.message || 'Botanical diagnostic service encountered an unexpected error.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateTaskFromStep = async (stepText: string, index: number) => {
    if (addedTaskIndices.has(index)) return;
    const plantName = lv(plant.nickname) || plant.species;
    await addTask({
      id: `t-${generateUUID()}`,
      title: { en: `[Health Recovery] ${plantName}: ${stepText}` },
      description: { en: lv(result?.diagnosis) || stepText },
      type: 'GENERAL',
      date: new Date().toISOString().split('T')[0],
      plantIds: [plant.id],
      completed: false,
      houseId: plant.houseId || null,
    });
    setAddedTaskIndices((prev) => new Set(prev).add(index));
    setAlertMessage(`Added recovery task for ${plantName}`);
    setTimeout(() => setAlertMessage(null), 3000);
  };

  const handleCreateAllTasks = async () => {
    if (!result || addedAllTasks) return;
    const steps = lva(result.recoveryPlan) || [];
    const plantName = lv(plant.nickname) || plant.species;
    const nextSet = new Set(addedTaskIndices);

    for (let i = 0; i < steps.length; i++) {
      if (nextSet.has(i)) continue;
      const stepText = steps[i];
      // Space follow-up steps across consecutive days
      const dueDate = new Date(Date.now() + i * 86400000).toISOString().split('T')[0];
      await addTask({
        id: `t-${generateUUID()}`,
        title: { en: `[Step ${i + 1}] ${plantName}: ${stepText}` },
        description: { en: lv(result.diagnosis) || stepText },
        type: 'GENERAL',
        date: dueDate,
        plantIds: [plant.id],
        completed: false,
        houseId: plant.houseId || null,
      });
      nextSet.add(i);
    }

    setAddedTaskIndices(nextSet);
    setAddedAllTasks(true);
    setAlertMessage(`All ${steps.length} recovery steps scheduled in Tasks!`);
    setTimeout(() => setAlertMessage(null), 3500);
  };

  const matchedInventoryItems = useMemo(() => {
    if (!result?.recommendedInventoryIds?.length) return [];
    const idSet = new Set(result.recommendedInventoryIds);
    return relevantInventory.filter((item) => idSet.has(item.id));
  }, [result, relevantInventory]);

  const reset = () => {
    setObservations('');
    setSelectedChips([]);
    setPhoto(null);
    setResult(null);
    setErrorMessage(null);
    setIsLoading(false);
    setAddedTaskIndices(new Set());
    setAddedAllTasks(false);
  };

  if (!isOpen) return null;

  const severity: HealthSeverity = result?.severity || 'MILD';
  const sevStyle = SEVERITY_CONFIG[severity] || SEVERITY_CONFIG.MILD;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 md:p-6 pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] transition-all">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-xl" onClick={onClose} />

      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-[32px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-300 mb-[env(safe-area-inset-bottom)] border border-slate-200/60 dark:border-slate-800">
        {/* Header */}
        <div className="p-6 border-b border-gray-100 dark:border-slate-800 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black uppercase tracking-wider text-gray-900 dark:text-white">
                {t('health_check_title') || 'Botanical Health Check'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 italic font-serif">
                {lv(plant.nickname)} · {plant.species}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 no-scrollbar">
          {/* Live Care Telemetry Context Bar */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700/70 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-semibold">
              <Droplets className="w-3.5 h-3.5 text-sky-500" />
              <span>
                Watered:{' '}
                {careSnapshot.daysSinceWatered !== null
                  ? `${careSnapshot.daysSinceWatered}d ago (Target: ${careSnapshot.wateringInterval}d)`
                  : 'Not logged'}
              </span>
            </div>
            {careSnapshot.moistureLevel !== null && (
              <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-semibold">
                <Sprout className="w-3.5 h-3.5 text-emerald-500" />
                <span>Probe: {careSnapshot.moistureLevel}/10</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-semibold">
              <FlaskConical className="w-3.5 h-3.5 text-amber-500" />
              <span>Feed: {careSnapshot.lastFertilized || 'None recent'}</span>
            </div>
          </div>

          {errorMessage && (
            <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/40 text-xs text-rose-800 dark:text-rose-200 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium leading-relaxed">{errorMessage}</div>
            </div>
          )}

          {!result ? (
            <>
              {/* 1-Tap Quick-Symptom Chips */}
              <div className="space-y-2.5">
                <label className="block text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                  1-Tap Common Symptoms (Select any that apply)
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_SYMPTOMS.map((symptom) => {
                    const active = selectedChips.includes(symptom);
                    return (
                      <button
                        key={symptom}
                        type="button"
                        onClick={() => toggleSymptomChip(symptom)}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
                          active
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                            : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-emerald-500/50'
                        }`}
                      >
                        {active ? '✓ ' : '+ '}
                        {symptom}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom Observations Textarea */}
              <div className="space-y-2">
                <label className="block text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                  {t('lbl_observations') || 'Additional Observations'}
                </label>
                <textarea
                  value={observations}
                  onChange={(e) => setObservations(e.target.value)}
                  placeholder={
                    t('placeholder_observations') ||
                    'Describe any other details (how long ago it started, soil smell, recent drafts)...'
                  }
                  className="w-full h-24 p-4 bg-gray-50 dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 text-sm focus:ring-2 focus:ring-emerald-500 outline-none transition-all resize-none dark:text-white"
                />
              </div>

              {/* Specimen Photo */}
              <div className="space-y-2.5">
                <label className="block text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                  {t('lbl_specimen_photo') || 'Specimen Photo (Optional if symptoms selected)'}
                </label>

                {photo ? (
                  <div className="relative aspect-video rounded-2xl overflow-hidden border-2 border-emerald-500">
                    <img src={photo} className="w-full h-full object-cover" alt="Specimen" />
                    <button
                      onClick={() => setPhoto(null)}
                      className="absolute top-2 right-2 w-8 h-8 bg-black/60 text-white rounded-full flex items-center justify-center hover:bg-black/80 transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3.5">
                    <button
                      type="button"
                      onClick={() => setIsCapturing(true)}
                      className="py-7 rounded-2xl border-2 border-dashed border-gray-200 dark:border-slate-700 flex flex-col items-center justify-center gap-2 hover:border-emerald-500 hover:bg-emerald-500/5 transition-all text-gray-500 dark:text-slate-400 hover:text-emerald-600"
                    >
                      <Camera className="w-7 h-7" />
                      <span className="text-[11px] font-bold uppercase tracking-wider">
                        {t('use_camera')}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="py-7 rounded-2xl border-2 border-dashed border-gray-200 dark:border-slate-700 flex flex-col items-center justify-center gap-2 hover:border-emerald-500 hover:bg-emerald-500/5 transition-all text-gray-500 dark:text-slate-400 hover:text-emerald-600"
                    >
                      <ImagePlus className="w-7 h-7" />
                      <span className="text-[11px] font-bold uppercase tracking-wider">
                        {t('choose_picture')}
                      </span>
                    </button>
                    <input
                      type="file"
                      ref={fileInputRef}
                      className="hidden"
                      accept="image/*"
                      onChange={handleFileChange}
                    />
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {/* Clinical Diagnosis Card with Severity & Cause Badges */}
              <div className={`p-6 rounded-3xl border space-y-3.5 ${sevStyle.cardClass}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    {t('lbl_diagnosis') || 'Clinical Diagnosis'}
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase border ${sevStyle.badgeClass}`}
                    >
                      {sevStyle.label}
                    </span>
                    {result.causeCategory && result.causeCategory !== 'NONE' && (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-900/10 dark:bg-white/10 text-slate-800 dark:text-slate-200">
                        {result.causeCategory.replace('_', ' ')}
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-base sm:text-lg font-serif italic text-slate-900 dark:text-white leading-relaxed">
                  "{lv(result.diagnosis)}"
                </p>
              </div>

              {/* Matched In-Stock Inventory Items */}
              {matchedInventoryItems.length > 0 && (
                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-2.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-800 dark:text-emerald-300">
                    <Package className="w-4 h-4" />
                    <span>Matched Treatment Products in Your Inventory</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {matchedInventoryItems.map((item) => (
                      <div
                        key={item.id}
                        className="p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-emerald-500/20 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                            {item.name}
                          </p>
                          <p className="text-[10px] uppercase font-semibold text-slate-500">
                            {item.category} · {item.raw.quantity} {item.raw.unit} available
                          </p>
                        </div>
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Step-by-Step Recovery Plan + 1-Click Task Conversion */}
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                    {t('lbl_recovery_plan') || 'Step-by-Step Recovery Plan'}
                  </h3>
                  <Button
                    type="button"
                    variant={addedAllTasks ? 'tonal' : 'primary'}
                    size="sm"
                    disabled={addedAllTasks}
                    onClick={handleCreateAllTasks}
                  >
                    {addedAllTasks ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Scheduled in Tasks</span>
                      </>
                    ) : (
                      <>
                        <ListChecks className="w-3.5 h-3.5" />
                        <span>Schedule All as Tasks</span>
                      </>
                    )}
                  </Button>
                </div>

                <div className="space-y-2.5">
                  {lva(result.recoveryPlan)?.map((step, idx) => {
                    const isAdded = addedTaskIndices.has(idx);
                    return (
                      <div
                        key={idx}
                        className="flex gap-3.5 items-start justify-between p-4 bg-gray-50 dark:bg-slate-800/80 rounded-2xl border border-gray-200/70 dark:border-slate-700"
                      >
                        <div className="flex gap-3.5 items-start">
                          <span className="w-6 h-6 bg-emerald-600 text-white rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                            {idx + 1}
                          </span>
                          <p className="text-sm text-gray-800 dark:text-slate-200 leading-relaxed">
                            {step}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={isAdded}
                          onClick={() => void handleCreateTaskFromStep(step, idx)}
                          title={isAdded ? 'Added to Tasks' : 'Add this step to Tasks'}
                          className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all border ${
                            isAdded
                              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                              : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-emerald-500'
                          }`}
                        >
                          {isAdded ? (
                            <>
                              <Check className="w-3 h-3" />
                              <span>Task Added</span>
                            </>
                          ) : (
                            <>
                              <Plus className="w-3 h-3" />
                              <span>Add Task</span>
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-100 dark:border-slate-800 flex gap-3">
          {!result ? (
            <Button
              variant="primary"
              className="w-full rounded-2xl h-13 font-black uppercase tracking-widest"
              onClick={handleRunCheck}
              disabled={(!photo && !combinedObservations.trim()) || isLoading}
              isLoading={isLoading}
            >
              {t('btn_run_check') || 'Initiate Botanical Analysis'}
            </Button>
          ) : (
            <>
              <Button
                variant="outlined"
                className="flex-1 rounded-2xl h-12 font-bold"
                onClick={reset}
              >
                {t('btn_new_check') || 'New Check'}
              </Button>
              <Button
                variant="primary"
                className="flex-1 rounded-2xl h-12 font-bold"
                onClick={onClose}
              >
                Done
              </Button>
            </>
          )}
        </div>
      </div>

      {isCapturing && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/95 backdrop-blur-2xl p-6 pl-[calc(1.5rem+env(safe-area-inset-left))] pr-[calc(1.5rem+env(safe-area-inset-right))] pt-[calc(1.5rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          <div className="w-full max-w-xl">
            <CameraCapture onCapture={handleCapture} onCancel={() => setIsCapturing(false)} />
          </div>
        </div>
      )}
    </div>
  );
};
