import React, { useState } from 'react';
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

  const logTypes: { value: LogType; icon: string; label: string }[] = [
    { value: 'NOTE', icon: '📝', label: t('log_note') || 'Note' },
    { value: 'WATER', icon: '💧', label: t('log_water') || 'Water' },
    { value: 'FERTILIZED', icon: '🧪', label: t('log_fertilized') || 'Fertilize' },
    { value: 'REPOTTED', icon: '🪴', label: t('log_repotted') || 'Repot' },
    { value: 'PRUNED', icon: '✂️', label: t('log_pruned') || 'Prune' },
    { value: 'NEW_LEAF', icon: '🌿', label: t('log_new_leaf') || 'New Leaf' },
    { value: 'FLOWER', icon: '🌸', label: t('log_flower') || 'Flower' },
    { value: 'DISEASE_CHECK', icon: '✚', label: t('log_disease_check') || 'Health Check' },
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
        <div className="space-y-3">
          <label className="block text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest px-1">{t('lbl_entry_type')}</label>
          <div className="grid grid-cols-4 gap-2">
            {logTypes.map((lt) => (
              <button
                key={lt.value}
                onClick={() => setType(lt.value)}
                className={`flex flex-col items-center justify-center p-3 rounded-2xl border-2 transition-all ${
                  type === lt.value 
                    ? 'bg-verdant/10 border-verdant shadow-lg' 
                    : 'bg-white dark:bg-slate-900 border-gray-100 dark:border-slate-800 hover:border-verdant/30'
                }`}
              >
                <span className="text-xl mb-1">{lt.icon}</span>
                <span className="text-[8px] font-black uppercase tracking-tighter text-center leading-none truncate w-full">
                  {lt.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <label className="block text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest px-1">{t('lbl_note_will_be_translated')}</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('placeholder_write_observation')}
            className="w-full h-32 p-4 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-2xl font-serif italic text-sm outline-none focus:ring-4 focus:ring-verdant/10 transition-all dark:text-white resize-none"
          />
        </div>

        <div className="flex gap-4 pt-2">
          <button 
            className="flex-1 h-14 bg-gray-100 dark:bg-slate-800 rounded-2xl text-[10px] font-black uppercase tracking-[0.3em] text-gray-500" 
            onClick={onClose}
            disabled={isTranslating}
          >
            {t('btn_cancel') || t('cancel') || 'Cancel'}
          </button>
          <Button 
            className="flex-[2] h-14 rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-verdant/20" 
            onClick={handleConfirm}
            disabled={!note.trim() || isTranslating}
          >
            {isTranslating ? t('lbl_translating') : t('btn_save_entry')}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
