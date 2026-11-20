import React, { useState, useMemo } from 'react';
import { Ruler, Sparkles, Sprout, ArrowUpRight, Scale } from 'lucide-react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { useLanguage } from '../context/LanguageContext';
import { Plant } from '../types';

interface GrowthLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  plant: Plant;
  onLog: (data: {
    heightCm: number;
    spreadCm?: number;
    leafCount?: number;
    stemDiameterMm?: number;
    notes?: string;
  }) => Promise<void>;
}

export const GrowthLogModal: React.FC<GrowthLogModalProps> = ({ isOpen, onClose, plant, onLog }) => {
  const { t } = useLanguage();
  const [unit, setUnit] = useState<'cm' | 'in'>('cm');

  // Find previous growth log if any
  const previousGrowth = useMemo(() => {
    const growthLogs = (plant.logs || [])
      .filter((l) => l.type === 'GROWTH')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    if (growthLogs.length > 0) {
      const latest = growthLogs[0];
      return {
        date: latest.date,
        heightCm: latest.metadata?.heightCm ?? latest.value ?? plant.avgHeight ?? plant.maxHeight,
        spreadCm: latest.metadata?.spreadCm ?? plant.maxSpread,
        leafCount: latest.metadata?.leafCount,
      };
    }
    return {
      date: null,
      heightCm: plant.avgHeight || plant.maxHeight || null,
      spreadCm: plant.maxSpread || null,
      leafCount: null,
    };
  }, [plant]);

  // Initial values populated from previous known sizes
  const initialHeightVal = previousGrowth.heightCm ? (unit === 'in' ? Math.round(previousGrowth.heightCm / 2.54) : previousGrowth.heightCm) : '';
  const initialSpreadVal = previousGrowth.spreadCm ? (unit === 'in' ? Math.round(previousGrowth.spreadCm / 2.54) : previousGrowth.spreadCm) : '';

  const [heightInput, setHeightInput] = useState<string>(String(initialHeightVal || ''));
  const [spreadInput, setSpreadInput] = useState<string>(String(initialSpreadVal || ''));
  const [leafCountInput, setLeafCountInput] = useState<string>(previousGrowth.leafCount ? String(previousGrowth.leafCount) : '');
  const [stemInput, setStemInput] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Growth calculation in cm
  const currentHeightCm = useMemo(() => {
    const val = parseFloat(heightInput);
    if (isNaN(val) || val <= 0) return null;
    return unit === 'in' ? Math.round(val * 2.54 * 10) / 10 : val;
  }, [heightInput, unit]);

  const heightDelta = useMemo(() => {
    if (!currentHeightCm || !previousGrowth.heightCm) return null;
    const diff = Math.round((currentHeightCm - previousGrowth.heightCm) * 10) / 10;
    return diff;
  }, [currentHeightCm, previousGrowth.heightCm]);

  const handleUnitToggle = (newUnit: 'cm' | 'in') => {
    if (newUnit === unit) return;
    if (newUnit === 'in') {
      if (heightInput) setHeightInput(String(Math.round((parseFloat(heightInput) / 2.54) * 10) / 10));
      if (spreadInput) setSpreadInput(String(Math.round((parseFloat(spreadInput) / 2.54) * 10) / 10));
    } else {
      if (heightInput) setHeightInput(String(Math.round(parseFloat(heightInput) * 2.54 * 10) / 10));
      if (spreadInput) setSpreadInput(String(Math.round(parseFloat(spreadInput) * 2.54 * 10) / 10));
    }
    setUnit(newUnit);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentHeightCm || currentHeightCm <= 0) return;

    setIsSubmitting(true);
    try {
      const spreadVal = parseFloat(spreadInput);
      const spreadCm = !isNaN(spreadVal) && spreadVal > 0 ? (unit === 'in' ? Math.round(spreadVal * 2.54) : spreadVal) : undefined;
      const leafCount = parseInt(leafCountInput, 10);
      const stemDiameterMm = parseFloat(stemInput);

      await onLog({
        heightCm: currentHeightCm,
        spreadCm,
        leafCount: !isNaN(leafCount) && leafCount > 0 ? leafCount : undefined,
        stemDiameterMm: !isNaN(stemDiameterMm) && stemDiameterMm > 0 ? stemDiameterMm : undefined,
        notes: notes.trim() || undefined,
      });

      onClose();
    } catch (err) {
      console.error('Failed to log growth size:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('log_growth') || 'Log Growth & Dimensions'}>
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* UNIT SELECTOR */}
        <div className="flex items-center justify-between bg-md-surface-container p-2 rounded-2xl border border-md-outline-variant/30">
          <div className="flex items-center gap-2 pl-2">
            <Scale className="w-4 h-4 text-md-primary" />
            <span className="text-xs font-semibold text-md-on-surface">Measurement System</span>
          </div>
          <div className="inline-flex bg-md-surface-container-high p-1 rounded-xl">
            <button
              type="button"
              onClick={() => handleUnitToggle('cm')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                unit === 'cm'
                  ? 'bg-md-primary text-md-on-primary shadow-xs'
                  : 'text-md-on-surface-variant hover:text-md-on-surface'
              }`}
            >
              Metric (cm)
            </button>
            <button
              type="button"
              onClick={() => handleUnitToggle('in')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                unit === 'in'
                  ? 'bg-md-primary text-md-on-primary shadow-xs'
                  : 'text-md-on-surface-variant hover:text-md-on-surface'
              }`}
            >
              Imperial (in)
            </button>
          </div>
        </div>

        {/* PREVIOUS RECORD PREVIEW WITH DELTA BADGE */}
        {previousGrowth.heightCm && (
          <div className="p-3.5 rounded-2xl bg-md-surface-container-low border border-md-outline-variant/20 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-md-secondary-container flex items-center justify-center text-md-on-secondary-container">
                <Ruler className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[11px] font-semibold text-md-on-surface-variant uppercase tracking-wider">
                  Previous Record
                </p>
                <p className="text-xs font-bold text-md-on-surface">
                  {unit === 'in' ? `${Math.round(previousGrowth.heightCm / 2.54)} in` : `${previousGrowth.heightCm} cm`}
                  {previousGrowth.spreadCm ? ` · Spread: ${unit === 'in' ? `${Math.round(previousGrowth.spreadCm / 2.54)} in` : `${previousGrowth.spreadCm} cm`}` : ''}
                </p>
              </div>
            </div>

            {heightDelta !== null && heightDelta !== 0 && (
              <div
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold shadow-xs ${
                  heightDelta > 0
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
                    : 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200'
                }`}
              >
                <ArrowUpRight className={`w-3.5 h-3.5 ${heightDelta < 0 ? 'rotate-90' : ''}`} />
                <span>
                  {heightDelta > 0 ? `+${unit === 'in' ? Math.round(heightDelta / 2.54 * 10) / 10 : heightDelta}` : (unit === 'in' ? Math.round(heightDelta / 2.54 * 10) / 10 : heightDelta)}{' '}
                  {unit}
                </span>
              </div>
            )}
          </div>
        )}

        {/* INPUT FIELDS: HEIGHT & SPREAD */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-md-on-surface-variant uppercase tracking-wider">
              {t('lbl_plant_height') || 'Current Height'} ({unit}) <span className="text-md-error">*</span>
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.1"
                min="0.1"
                required
                value={heightInput}
                onChange={(e) => setHeightInput(e.target.value)}
                placeholder={unit === 'in' ? 'e.g. 18' : 'e.g. 45'}
                className="w-full h-12 px-4 rounded-xl bg-md-surface-container border border-md-outline-variant/40 text-md-on-surface font-semibold text-sm focus:ring-2 focus:ring-md-primary/30 outline-none transition-all"
              />
              <span className="absolute right-3.5 top-3.5 text-xs font-semibold text-md-on-surface-variant pointer-events-none">
                {unit}
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-md-on-surface-variant uppercase tracking-wider">
              {t('lbl_plant_spread') || 'Canopy Spread'} ({unit})
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.1"
                min="0.1"
                value={spreadInput}
                onChange={(e) => setSpreadInput(e.target.value)}
                placeholder={unit === 'in' ? 'e.g. 12' : 'e.g. 30'}
                className="w-full h-12 px-4 rounded-xl bg-md-surface-container border border-md-outline-variant/40 text-md-on-surface font-semibold text-sm focus:ring-2 focus:ring-md-primary/30 outline-none transition-all"
              />
              <span className="absolute right-3.5 top-3.5 text-xs font-semibold text-md-on-surface-variant pointer-events-none">
                {unit}
              </span>
            </div>
          </div>
        </div>

        {/* SECONDARY METRICS: LEAF COUNT & STEM DIAMETER */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-md-on-surface-variant uppercase tracking-wider flex items-center gap-1.5">
              <Sprout className="w-3.5 h-3.5 text-md-primary" />
              <span>{t('lbl_leaf_count') || 'Total Leaves'} (optional)</span>
            </label>
            <input
              type="number"
              min="0"
              step="1"
              value={leafCountInput}
              onChange={(e) => setLeafCountInput(e.target.value)}
              placeholder="e.g. 14"
              className="w-full h-12 px-4 rounded-xl bg-md-surface-container border border-md-outline-variant/40 text-md-on-surface font-semibold text-sm focus:ring-2 focus:ring-md-primary/30 outline-none transition-all"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-md-on-surface-variant uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Trunk / Stem Caliper (mm)</span>
            </label>
            <input
              type="number"
              min="0"
              step="0.5"
              value={stemInput}
              onChange={(e) => setStemInput(e.target.value)}
              placeholder="e.g. 12.5"
              className="w-full h-12 px-4 rounded-xl bg-md-surface-container border border-md-outline-variant/40 text-md-on-surface font-semibold text-sm focus:ring-2 focus:ring-md-primary/30 outline-none transition-all"
            />
          </div>
        </div>

        {/* NOTES */}
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-md-on-surface-variant uppercase tracking-wider">
            {t('lbl_notes') || 'Observations & Notes'}
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Strong vertical growth after repotting; two new top nodes active..."
            rows={2}
            className="w-full p-3 rounded-xl bg-md-surface-container border border-md-outline-variant/40 text-md-on-surface text-xs focus:ring-2 focus:ring-md-primary/30 outline-none resize-none transition-all"
          />
        </div>

        {/* ACTIONS */}
        <div className="flex gap-3 pt-2">
          <Button type="button" variant="ghost" className="flex-1 rounded-xl h-12" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button
            type="submit"
            variant="primary"
            className="flex-1 rounded-xl h-12 font-bold shadow-md"
            disabled={!currentHeightCm || isSubmitting}
            isLoading={isSubmitting}
          >
            {t('btn_save_log') || 'Save Dimension Log'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
