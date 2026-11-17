import React, { useState } from 'react';
import { Sprout, Flower2, Wheat, Wind, Leaf, Sparkles, Flower, Snowflake, Calendar } from 'lucide-react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Plant, PhenophaseType } from '../types';
import { useLanguage } from '../context/LanguageContext';

interface PhenophaseLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  plant: Plant;
  onLog: (phase: PhenophaseType, date: string, note: string) => void;
}

export const PhenophaseLogModal: React.FC<PhenophaseLogModalProps> = ({ isOpen, onClose, plant, onLog }) => {
  const { t } = useLanguage();

  const PHASES: { value: PhenophaseType; label: string; icon: React.ReactNode }[] = [
    { value: 'FIRST_BUD', label: t('PHASE_FIRST_BUD'), icon: <Sprout className="w-5 h-5" /> },
    { value: 'FULL_BLOOM', label: t('PHASE_FULL_BLOOM'), icon: <Flower2 className="w-5 h-5" /> },
    { value: 'SEED_SET', label: t('PHASE_SEED_SET'), icon: <Wheat className="w-5 h-5" /> },
    { value: 'DORMANCY_ENTRANCE', label: t('PHASE_DORMANCY_ENTRANCE'), icon: <Wind className="w-5 h-5" /> },
    { value: 'FIRST_LEAF_SPRING', label: t('PHASE_FIRST_LEAF_SPRING'), icon: <Leaf className="w-5 h-5" /> },
    { value: 'BUDDING', label: t('PHASE_BUDDING'), icon: <Sparkles className="w-5 h-5" /> },
    { value: 'IN_FLOWER', label: t('PHASE_IN_FLOWER'), icon: <Flower className="w-5 h-5" /> },
    { value: 'DORMANCY_START', label: t('PHASE_DORMANCY_START'), icon: <Snowflake className="w-5 h-5" /> },
  ];

  const filteredPhases = PHASES.filter(p => {
    if (!plant.flowers) {
      return !['FIRST_BUD', 'FULL_BLOOM', 'BUDDING', 'IN_FLOWER'].includes(p.value);
    }
    return true;
  });

  const toLocalDateStr = (d: Date = new Date()) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const [selectedPhase, setSelectedPhase] = useState<PhenophaseType>(filteredPhases[0]?.value || PHASES[0].value);
  const [date, setDate] = useState(toLocalDateStr());
  const [note, setNote] = useState('');

  React.useEffect(() => {
    if (isOpen) {
      setSelectedPhase(filteredPhases[0]?.value || PHASES[0].value);
      setDate(toLocalDateStr());
    }
  }, [isOpen, plant.flowers]);

  const handleSubmit = () => {
    onLog(selectedPhase, new Date(`${date}T12:00:00`).toISOString(), note);
    onClose();
    setNote('');
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('btn_record_phenophase')}>
      <div className="space-y-6">
        <div className="space-y-2.5">
          <label className="block text-xs font-semibold text-md-on-surface-variant uppercase tracking-wider px-1">
            {t('lbl_select_biological_phase')}
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {filteredPhases.map((phase) => {
              const isSelected = selectedPhase === phase.value;
              return (
                <button
                  key={phase.value}
                  type="button"
                  onClick={() => setSelectedPhase(phase.value)}
                  className={`m3-state-layer flex items-center gap-3 p-3.5 rounded-2xl border transition-all text-left ${
                    isSelected
                      ? 'bg-md-primary-container text-md-on-primary-container border-md-primary/40 shadow-xs'
                      : 'bg-md-surface-container text-md-on-surface-variant border-md-outline-variant/30 hover:bg-md-surface-container-high hover:text-md-on-surface'
                  }`}
                >
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                      isSelected
                        ? 'bg-md-primary text-md-on-primary'
                        : 'bg-md-surface-container-highest text-md-primary'
                    }`}
                  >
                    {phase.icon}
                  </div>
                  <span className="text-xs font-semibold leading-snug">
                    {phase.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2.5">
          <label className="block text-xs font-semibold text-md-on-surface-variant uppercase tracking-wider px-1">
            {t('lbl_observation_date')}
          </label>
          <div className="relative">
            <Calendar className="w-4 h-4 text-md-on-surface-variant absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="date"
              className="w-full h-13 pl-11 pr-4 bg-md-surface-container-low border border-md-outline-variant/40 rounded-2xl text-sm font-medium text-md-on-surface outline-none focus:border-md-primary focus:ring-2 focus:ring-md-primary/20 transition-all"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2.5">
          <label className="block text-xs font-semibold text-md-on-surface-variant uppercase tracking-wider px-1">
            {t('lbl_notes_observations')}
          </label>
          <textarea
            className="w-full min-h-[108px] p-4 bg-md-surface-container-low border border-md-outline-variant/40 rounded-2xl text-sm text-md-on-surface placeholder:text-md-on-surface-variant/60 outline-none focus:border-md-primary focus:ring-2 focus:ring-md-primary/20 transition-all resize-none"
            placeholder={t('placeholder_describe_specimen')}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-1">
          <Button variant="outlined" size="lg" onClick={onClose} className="px-6">
            {t('btn_cancel')}
          </Button>
          <Button variant="primary" size="lg" onClick={handleSubmit} className="flex-1 sm:flex-none sm:min-w-[180px]">
            {t('btn_record_event')}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
