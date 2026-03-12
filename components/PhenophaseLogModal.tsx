import React, { useState } from 'react';
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
  
  const PHASES: { value: PhenophaseType; label: string; icon: string }[] = [
    { value: 'FIRST_BUD', label: t('PHASE_FIRST_BUD'), icon: '🌱' },
    { value: 'FULL_BLOOM', label: t('PHASE_FULL_BLOOM'), icon: '🌸' },
    { value: 'SEED_SET', label: t('PHASE_SEED_SET'), icon: '🌾' },
    { value: 'DORMANCY_ENTRANCE', label: t('PHASE_DORMANCY_ENTRANCE'), icon: '🍂' },
    { value: 'FIRST_LEAF_SPRING', label: t('PHASE_FIRST_LEAF_SPRING'), icon: '🌿' },
    { value: 'BUDDING', label: t('PHASE_BUDDING'), icon: '🎋' },
    { value: 'IN_FLOWER', label: t('PHASE_IN_FLOWER'), icon: '🌺' },
    { value: 'DORMANCY_START', label: t('PHASE_DORMANCY_START'), icon: '❄️' },
  ];

  const filteredPhases = PHASES.filter(p => {
    if (!plant.flowers) {
      return !['FIRST_BUD', 'FULL_BLOOM', 'BUDDING', 'IN_FLOWER'].includes(p.value);
    }
    return true;
  });

  const [selectedPhase, setSelectedPhase] = useState<PhenophaseType>(filteredPhases[0]?.value || PHASES[0].value);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [note, setNote] = useState('');

  React.useEffect(() => {
    if (isOpen) {
      setSelectedPhase(filteredPhases[0]?.value || PHASES[0].value);
    }
  }, [isOpen, plant.flowers]);

  const handleSubmit = () => {
    onLog(selectedPhase, date, note);
    onClose();
    setNote('');
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('btn_record_phenophase')}>
      <div className="space-y-6">
        <div>
          <label className="block text-[10px] font-serif font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-3 px-1">{t('lbl_select_biological_phase')}</label>
          <div className="grid grid-cols-2 gap-3">
            {filteredPhases.map((phase) => (
              <button
                key={phase.value}
                onClick={() => setSelectedPhase(phase.value)}
                className={`flex items-center gap-3 p-4 rounded-2xl border-2 transition-all text-left ${
                  selectedPhase === phase.value
                    ? 'border-verdant bg-verdant/5 ring-4 ring-verdant/10 dark:bg-verdant/20'
                    : 'border-gray-100 bg-white dark:bg-slate-800/50 dark:border-slate-800 hover:border-gray-200 dark:hover:border-slate-700'
                }`}
              >
                <span className="text-2xl">{phase.icon}</span>
                <span className={`text-xs font-bold ${selectedPhase === phase.value ? 'text-verdant' : 'text-gray-900 dark:text-slate-200'}`}>
                  {phase.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-serif font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1 px-1">{t('lbl_observation_date')}</label>
          <input
            type="date"
            className="w-full h-14 px-4 border border-gray-200 rounded-2xl outline-none focus:ring-4 focus:ring-verdant/10 font-bold text-gray-900 dark:text-white dark:bg-slate-800 dark:border-slate-700"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-[10px] font-serif font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1 px-1">{t('lbl_notes_observations')}</label>
          <textarea
            className="w-full p-4 border border-gray-200 rounded-2xl outline-none focus:ring-4 focus:ring-verdant/10 font-serif italic min-h-[100px] text-gray-900 dark:text-white dark:bg-slate-800 dark:border-slate-700"
            placeholder={t('placeholder_describe_specimen')}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        <div className="flex gap-3 pt-4">
          <Button variant="ghost" className="flex-1 h-14 rounded-2xl font-black uppercase tracking-widest text-xs" onClick={onClose}>
            {t('btn_cancel')}
          </Button>
          <Button className="flex-1 h-14 rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-verdant/20" onClick={handleSubmit}>
            {t('btn_record_event')}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
