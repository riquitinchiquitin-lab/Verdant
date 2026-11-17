import React, { useState } from 'react';
import { FileText, Droplets, FlaskConical, Sprout, Scissors, Leaf, Flower2, Activity } from 'lucide-react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { useLanguage } from '../context/LanguageContext';
import { LogType, LocalizedString } from '../types';
import { translateInput } from '../services/translationService';

interface PlantLogEntryProps {
  isOpen: boolean;
  onClose: () => void;
  onLog: (type: LogType, note: LocalizedString) => void;
  initialType?: LogType;
  apiKey?: string;
  language?: string;
}

export const PlantLogEntry: React.FC<PlantLogEntryProps> = ({ 
  isOpen, 
  onClose, 
  onLog, 
  initialType = 'NOTE',
  apiKey,
  language: propLanguage
}) => {
  const { t, language: contextLanguage } = useLanguage();
  const language = propLanguage || contextLanguage;
  const [type, setType] = useState<LogType>(initialType);
  const [note, setNote] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);

  const logTypes: { value: LogType; icon: React.ReactNode; label: string }[] = [
    { value: 'NOTE', icon: <FileText className="w-5 h-5" />, label: t('log_note') || 'Note' },
    { value: 'WATER', icon: <Droplets className="w-5 h-5" />, label: t('log_water') || 'Water' },
    { value: 'FERTILIZED', icon: <FlaskConical className="w-5 h-5" />, label: t('log_fertilized') || 'Fertilize' },
    { value: 'REPOTTED', icon: <Sprout className="w-5 h-5" />, label: t('log_repotted') || 'Repot' },
    { value: 'PRUNED', icon: <Scissors className="w-5 h-5" />, label: t('log_pruned') || 'Prune' },
    { value: 'NEW_LEAF', icon: <Leaf className="w-5 h-5" />, label: t('log_new_leaf') || 'New Leaf' },
    { value: 'FLOWER', icon: <Flower2 className="w-5 h-5" />, label: t('log_flower') || 'Flower' },
    { value: 'DISEASE_CHECK', icon: <Activity className="w-5 h-5" />, label: t('log_disease_check') || 'Health Check' },
  ];

  const handleConfirm = async () => {
    if (!note.trim()) return;
    
    setIsTranslating(true);
    try {
      const localizedNote = await translateInput(note, language, apiKey);
      onLog(type, localizedNote);
      setNote('');
      onClose();
    } catch (error) {
      console.error("Translation failed:", error);
      // Fallback to English only if translation fails
      onLog(type, { en: note, [language]: note });
      setNote('');
      onClose();
    } finally {
      setIsTranslating(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('btn_add_log') || 'Add Log Entry'}>
      <div className="space-y-6">
        <div className="space-y-2.5">
          <label className="block text-xs font-semibold text-md-on-surface-variant uppercase tracking-wider px-1">
            {t('lbl_entry_type')}
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {logTypes.map((lt) => {
              const isSelected = type === lt.value;
              return (
                <button
                  key={lt.value}
                  type="button"
                  onClick={() => setType(lt.value)}
                  className={`m3-state-layer flex flex-col items-center justify-center gap-2 py-3.5 px-2.5 rounded-2xl border transition-all ${
                    isSelected
                      ? 'bg-md-primary-container text-md-on-primary-container border-md-primary/40 shadow-xs'
                      : 'bg-md-surface-container text-md-on-surface-variant border-md-outline-variant/30 hover:bg-md-surface-container-high hover:text-md-on-surface'
                  }`}
                >
                  <span className={isSelected ? 'text-md-on-primary-container' : 'text-md-primary'}>
                    {lt.icon}
                  </span>
                  <span className="text-[11px] font-semibold text-center leading-tight line-clamp-2">
                    {lt.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2.5">
          <label className="block text-xs font-semibold text-md-on-surface-variant uppercase tracking-wider px-1">
            {t('lbl_note_will_be_translated')}
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('placeholder_write_observation')}
            className="w-full h-32 p-4 bg-md-surface-container-low border border-md-outline-variant/40 rounded-2xl text-sm text-md-on-surface placeholder:text-md-on-surface-variant/60 outline-none focus:border-md-primary focus:ring-2 focus:ring-md-primary/20 transition-all resize-none"
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-1">
          <Button
            variant="outlined"
            size="lg"
            onClick={onClose}
            disabled={isTranslating}
            className="px-6"
          >
            {t('btn_cancel') || t('cancel') || 'Cancel'}
          </Button>
          <Button
            variant="primary"
            size="lg"
            onClick={handleConfirm}
            disabled={!note.trim() || isTranslating}
            className="flex-1 sm:flex-none sm:min-w-[180px]"
          >
            {isTranslating ? t('lbl_translating') : t('btn_save_entry')}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
