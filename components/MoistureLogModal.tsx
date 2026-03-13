import React, { useState } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { useLanguage } from '../context/LanguageContext';

interface MoistureLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLog: (value: number) => void;
}

export const MoistureLogModal: React.FC<MoistureLogModalProps> = ({ isOpen, onClose, onLog }) => {
  const { t } = useLanguage();
  const [value, setValue] = useState<number>(5);

  const handleConfirm = () => {
    onLog(value);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('btn_log_moisture')}>
      <div className="space-y-8 p-4">
        <div className="flex flex-col items-center gap-6">
          <div className="text-6xl font-black text-blue-500">{value}</div>
          <input 
            type="range" 
            min="1" 
            max="10" 
            value={value} 
            onChange={(e) => setValue(parseInt(e.target.value))}
            className="w-full h-4 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
          />
          <div className="flex justify-between w-full text-xs font-serif font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
            <span>{t('lbl_dry')} (1)</span>
            <span>{t('lbl_wet')} (10)</span>
          </div>
        </div>
        <div className="flex gap-3 pt-4">
          <Button variant="ghost" className="flex-1 rounded-2xl h-14 font-black uppercase tracking-widest text-xs" onClick={onClose}>{t('cancel')}</Button>
          <Button className="flex-1 rounded-2xl h-14 font-black uppercase tracking-widest text-xs shadow-xl shadow-blue-500/20 bg-blue-600 hover:bg-blue-700 text-white" onClick={handleConfirm}>{t('btn_log_moisture')}</Button>
        </div>
      </div>
    </Modal>
  );
};
