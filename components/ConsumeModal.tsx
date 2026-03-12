import React, { useState } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { useLanguage } from '../context/LanguageContext';
import { useInventory } from '../context/InventoryContext';
import { InventoryItem } from '../types';
import { formatVolume } from '../services/unitUtils';

interface ConsumeModalProps {
  item: InventoryItem;
  isOpen: boolean;
  onClose: () => void;
}

export const ConsumeModal: React.FC<ConsumeModalProps> = ({ item, isOpen, onClose }) => {
  const { t, lv } = useLanguage();
  const { consumeItem } = useInventory();
  const [amount, setAmount] = useState<string>('0');
  
  const formatted = formatVolume(item.quantity, item.unit);
  const isOutOfStock = item.quantity <= 0;

  const handleConsume = () => {
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) return;
    consumeItem(item.id, numAmount);
    onClose();
  };

  const setPercent = (percent: number) => {
    setAmount((item.quantity * percent).toFixed(2));
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`${t('btn_consume')}: ${lv(item.name)}`}>
      <div className="space-y-6">
        <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700">
           <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{t('stats_total')}</p>
              <p className="text-xl font-black text-gray-900 dark:text-white">{formatted.value} <span className="text-xs">{formatted.unit}</span></p>
           </div>
           {isOutOfStock && <span className="px-2 py-1 bg-red-100 text-red-600 text-[10px] font-black uppercase rounded-lg">{t('out_of_stock')}</span>}
        </div>

        <div className="space-y-4">
          <label className="block text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">{t('lbl_consume_amount')} ({item.unit})</label>
          
          <div className="relative">
            <input 
              type="text"
              inputMode="decimal"
              value={amount} 
              onChange={(e) => {
                const val = e.target.value;
                if (val === '' || /^\d*\.?\d*$/.test(val)) {
                  const num = parseFloat(val);
                  if (!isNaN(num) && num > item.quantity) {
                    setAmount(item.quantity.toString());
                  } else {
                    setAmount(val);
                  }
                }
              }}
              className="w-full bg-white dark:bg-slate-900 border-2 border-gray-100 dark:border-slate-800 rounded-2xl px-6 py-4 text-2xl font-black text-verdant outline-none focus:border-verdant transition-all"
            />
            <div className="absolute right-6 top-1/2 -translate-y-1/2 text-gray-400 font-bold uppercase text-sm">{item.unit}</div>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {[0.25, 0.5, 0.75, 1].map(p => (
              <button 
                key={p} 
                onClick={() => setPercent(p)}
                className="py-2 rounded-xl border border-gray-100 dark:border-slate-800 text-[10px] font-black uppercase tracking-widest hover:bg-verdant hover:text-white transition-all dark:text-slate-300"
              >
                {p * 100}%
              </button>
            ))}
          </div>
        </div>

        {parseFloat(amount) > 0 && (
          <div className="space-y-3">
            <div className="flex flex-col items-center justify-center p-4 bg-verdant/5 dark:bg-verdant/10 rounded-2xl border border-verdant/10 animate-in fade-in zoom-in-95 duration-300">
              <p className="text-[10px] font-black text-verdant uppercase tracking-[0.2em] mb-1">Consumption Ratio</p>
              <p className="text-lg font-black text-gray-900 dark:text-white">
                {amount} {item.unit} <span className="text-gray-400 mx-2">/</span> {item.quantity} {item.unit}
              </p>
              <div className="w-full h-1.5 bg-gray-100 dark:bg-slate-800 rounded-full mt-3 overflow-hidden">
                <div 
                  className="h-full bg-verdant transition-all duration-500 ease-out" 
                  style={{ width: `${Math.min(100, (parseFloat(amount) / item.quantity) * 100)}%` }}
                />
              </div>
            </div>

            <div className="flex justify-between items-center p-4 bg-gray-50 dark:bg-slate-800/50 rounded-2xl border border-gray-100 dark:border-slate-700 animate-in fade-in slide-in-from-bottom-2 duration-500">
               <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Remaining Stock</span>
               <span className="text-sm font-black text-verdant">
                 {(item.quantity - parseFloat(amount)).toFixed(2)} {item.unit}
               </span>
            </div>
          </div>
        )}

        <div className="flex gap-3 pt-4">
          <Button variant="ghost" className="flex-1" onClick={onClose}>{t('cancel')}</Button>
          <Button 
            className="flex-1 shadow-lg shadow-verdant/20" 
            disabled={!amount || parseFloat(amount) <= 0 || isOutOfStock}
            onClick={handleConsume}
          >
            {t('btn_consume')}
          </Button>
        </div>
      </div>
    </Modal>
  );
};