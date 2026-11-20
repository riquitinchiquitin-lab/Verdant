import React, { useState, useRef } from 'react';
import { RefreshCw, CheckCircle2, AlertCircle, TreeDeciduous, Sprout, Globe2, Sparkles, X, Play, Square } from 'lucide-react';
import { usePlants } from '../context/PlantContext';
import { useLanguage } from '../context/LanguageContext';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Plant } from '../types';
import { isPlantTree } from '../utils/botanicalCategory';
import { refreshPlantRecord } from '../services/plantAi';

interface BatchRefreshModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialScope?: 'ALL' | 'TREES' | 'PLANTS';
}

interface RefreshLogItem {
  id: string;
  name: string;
  species: string;
  status: 'success' | 'warn' | 'error';
  details: string;
}

export const BatchRefreshModal: React.FC<BatchRefreshModalProps> = ({
  isOpen,
  onClose,
  initialScope = 'ALL',
}) => {
  const { plants, updatePlant, refreshAllData, getEffectiveApiKey } = usePlants();
  const { lv } = useLanguage();

  const [scope, setScope] = useState<'ALL' | 'TREES' | 'PLANTS'>(initialScope);
  const [isRunning, setIsRunning] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPlant, setCurrentPlant] = useState<Plant | null>(null);
  const [logs, setLogs] = useState<RefreshLogItem[]>([]);
  const [isDone, setIsDone] = useState(false);

  // Stats
  const [treesCategorized, setTreesCategorized] = useState(0);
  const [mapsPopulated, setMapsPopulated] = useState(0);

  const stopRequestedRef = useRef(false);

  const getTargetPlants = (): Plant[] => {
    if (scope === 'TREES') {
      return plants.filter((p) => isPlantTree(p));
    }
    if (scope === 'PLANTS') {
      return plants.filter((p) => !isPlantTree(p));
    }
    return plants;
  };

  const handleStart = async () => {
    const targets = getTargetPlants();
    if (targets.length === 0) return;

    setIsRunning(true);
    setIsDone(false);
    setCurrentIndex(0);
    setTotalCount(targets.length);
    setLogs([]);
    setTreesCategorized(0);
    setMapsPopulated(0);
    stopRequestedRef.current = false;

    let apiKey: string | undefined = undefined;
    try {
      if (typeof getEffectiveApiKey === 'function') {
        apiKey = getEffectiveApiKey();
      }
    } catch {
      apiKey = undefined;
    }

    let treesUpdatedCount = 0;
    let mapsUpdatedCount = 0;

    try {
      for (let i = 0; i < targets.length; i++) {
        if (stopRequestedRef.current) {
          break;
        }

        const plant = targets[i];
        setCurrentIndex(i + 1);
        setCurrentPlant(plant);

        // Yield execution to the browser to ensure progress UI repaints smoothly
        await new Promise((r) => setTimeout(r, 60));

        const plantName = lv(plant.nickname) || plant.species || 'Specimen';

        try {
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Registry query timed out')), 9000)
          );
          const updates = await Promise.race([
            refreshPlantRecord(plant, apiKey),
            timeoutPromise,
          ]);

          await updatePlant(plant.id, updates);

          const isTree = updates.specimenType === 'TREE' || isPlantTree({ ...plant, ...updates });
          if (isTree) treesUpdatedCount++;

          const hasMap = Boolean(
            (updates.nativeRegions as any)?.en?.length ||
            (plant.nativeRegions as any)?.en?.length ||
            updates.origin
          );
          if (hasMap) mapsUpdatedCount++;

          setTreesCategorized(treesUpdatedCount);
          setMapsPopulated(mapsUpdatedCount);

          const summaryParts: string[] = [];
          if (isTree) summaryParts.push('Tree classified');
          if (hasMap) summaryParts.push('Origin map synced');
          if (updates.minPh || updates.hardinessZoneMin) summaryParts.push('Care bounds updated');

          setLogs((prev) => [
            {
              id: plant.id,
              name: plantName,
              species: updates.species || plant.species,
              status: 'success',
              details: summaryParts.length > 0 ? summaryParts.join(' · ') : 'Botanical taxonomy refreshed',
            },
            ...prev,
          ]);
        } catch (err: any) {
          setLogs((prev) => [
            {
              id: plant.id,
              name: plantName,
              species: plant.species,
              status: 'warn',
              details: err?.message || 'Could not reach botanical registries',
            },
            ...prev,
          ]);
        }
      }

      try {
        await refreshAllData();
      } catch {}
    } finally {
      setIsRunning(false);
      setIsDone(true);
      setCurrentPlant(null);
    }
  };

  const handleStop = () => {
    stopRequestedRef.current = true;
    setIsRunning(false);
    setCurrentPlant(null);
  };

  const percent = totalCount > 0 ? Math.min(100, Math.round((currentIndex / totalCount) * 100)) : 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={isRunning ? () => {} : onClose}
      title="Refresh All Botanical Data & Maps"
      size="xl"
    >
      <div className="space-y-5 py-1">
        {/* Scope Selector */}
        {!isRunning && !isDone && (
          <div className="space-y-3">
            <p className="text-xs text-md-on-surface-variant leading-relaxed">
              Synchronize your collection against Kew Royal Botanic Gardens POWO, GBIF, VASCAN, and OpenPlantBook.
              This accurately updates tree classifications, populates native origin distribution maps, and optimizes care bounds.
            </p>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-xs font-semibold text-md-on-surface-variant uppercase tracking-wider">
                Target:
              </span>
              <div className="inline-flex rounded-2xl bg-md-surface-container-high p-1 border border-md-outline-variant/30">
                <button
                  type="button"
                  onClick={() => setScope('ALL')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    scope === 'ALL'
                      ? 'bg-md-primary text-md-on-primary shadow-xs'
                      : 'text-md-on-surface-variant hover:text-md-on-surface'
                  }`}
                >
                  All Specimens ({plants.length})
                </button>
                <button
                  type="button"
                  onClick={() => setScope('TREES')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    scope === 'TREES'
                      ? 'bg-md-primary text-md-on-primary shadow-xs'
                      : 'text-md-on-surface-variant hover:text-md-on-surface'
                  }`}
                >
                  <TreeDeciduous className="w-3.5 h-3.5" />
                  Trees ({plants.filter(isPlantTree).length})
                </button>
                <button
                  type="button"
                  onClick={() => setScope('PLANTS')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    scope === 'PLANTS'
                      ? 'bg-md-primary text-md-on-primary shadow-xs'
                      : 'text-md-on-surface-variant hover:text-md-on-surface'
                  }`}
                >
                  <Sprout className="w-3.5 h-3.5" />
                  Plants ({plants.filter((p) => !isPlantTree(p)).length})
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Progress Bar & Current Status */}
        {(isRunning || isDone) && (
          <div className="space-y-3.5 p-5 rounded-3xl bg-md-surface-container border border-md-outline-variant/30">
            <div className="flex items-center justify-between text-xs font-bold">
              <span className="text-md-on-surface flex items-center gap-2">
                {isRunning ? (
                  <>
                    <RefreshCw className="w-4 h-4 text-md-primary animate-spin" />
                    <span>Syncing Botanical Records...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <span>Batch Refresh Complete</span>
                  </>
                )}
              </span>
              <span className="text-md-primary font-mono font-bold text-sm">
                {percent}% ({currentIndex} / {totalCount})
              </span>
            </div>

            {/* Progress Track */}
            <div className="w-full h-3 bg-md-surface-container-highest rounded-full overflow-hidden p-0.5 border border-md-outline-variant/20">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-md-primary rounded-full transition-all duration-300"
                style={{ width: `${percent}%` }}
              />
            </div>

            {/* Active Specimen Banner */}
            {currentPlant && isRunning && (
              <div className="flex items-center gap-3 pt-2">
                {currentPlant.images && currentPlant.images[0] ? (
                  <img
                    src={currentPlant.images[0]}
                    alt=""
                    className="w-10 h-10 rounded-xl object-cover shrink-0 border border-md-outline-variant/30"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-md-primary/10 text-md-primary flex items-center justify-center shrink-0">
                    <Sprout className="w-5 h-5" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-xs font-bold text-md-on-surface truncate">
                    {lv(currentPlant.nickname) || currentPlant.species}
                  </p>
                  <p className="text-[11px] text-md-on-surface-variant font-mono truncate">
                    {currentPlant.species}
                  </p>
                </div>
              </div>
            )}

            {/* Completion Summary Stats */}
            {isDone && (
              <div className="grid grid-cols-3 gap-2.5 pt-2 border-t border-md-outline-variant/20">
                <div className="p-3 rounded-2xl bg-md-surface-container-high text-center">
                  <p className="text-lg font-bold text-md-primary leading-none">{currentIndex}</p>
                  <p className="text-[10px] font-semibold text-md-on-surface-variant mt-1">Refreshed</p>
                </div>
                <div className="p-3 rounded-2xl bg-md-surface-container-high text-center">
                  <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 leading-none">{treesCategorized}</p>
                  <p className="text-[10px] font-semibold text-md-on-surface-variant mt-1">Trees Verified</p>
                </div>
                <div className="p-3 rounded-2xl bg-md-surface-container-high text-center">
                  <p className="text-lg font-bold text-sky-600 dark:text-sky-400 leading-none">{mapsPopulated}</p>
                  <p className="text-[10px] font-semibold text-md-on-surface-variant mt-1">Maps Populated</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Live Change Feed / Log Stream */}
        {logs.length > 0 && (
          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-md-on-surface-variant px-1">
              Live Activity Stream ({logs.length})
            </span>
            <div className="max-h-56 overflow-y-auto rounded-2xl bg-md-surface-container-low border border-md-outline-variant/30 p-2.5 space-y-1.5 divide-y divide-md-outline-variant/15 text-xs">
              {logs.map((item, idx) => (
                <div key={`${item.id}-${idx}`} className="pt-1.5 first:pt-0 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-bold text-md-on-surface">{item.name}</span>
                    <span className="text-md-on-surface-variant text-[11px] ml-1.5 font-mono italic">
                      ({item.species})
                    </span>
                    <p className="text-[11px] text-md-primary font-medium">{item.details}</p>
                  </div>
                  {item.status === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Controls */}
        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-md-outline-variant/20">
          {isRunning ? (
            <Button variant="outlined" size="md" onClick={handleStop} className="text-md-error">
              <Square className="w-4 h-4" />
              Pause / Stop
            </Button>
          ) : isDone ? (
            <Button variant="primary" size="md" onClick={onClose}>
              <CheckCircle2 className="w-4 h-4" />
              Done
            </Button>
          ) : (
            <>
              <Button variant="tonal" size="md" onClick={onClose}>
                Cancel
              </Button>
              <Button variant="primary" size="md" onClick={handleStart}>
                <RefreshCw className="w-4 h-4" />
                Start Botanical Refresh ({getTargetPlants().length})
              </Button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
};
