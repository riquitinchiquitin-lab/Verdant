import React, { useState, useEffect } from 'react';
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

  useEffect(() => {
    if (isOpen) setAmount('0');
  }, [isOpen, item.id]);
  
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
      <div className="space-y-5 font-sans">
        <div className="flex items-center justify-between p-4 bg-md-surface-container rounded-2xl border border-md-outline-variant/30">
          <div>
            <p className="text-xs font-semibold text-md-on-surface-variant">{t('stats_total')}</p>
            <p className="text-xl font-bold text-md-on-surface">{formatted.value} <span className="text-xs font-medium text-md-on-surface-variant">{formatted.unit}</span></p>
          </div>
          {isOutOfStock && <span className="px-2.5 py-1 bg-md-error-container text-md-on-error-container text-xs font-semibold rounded-full">{t('out_of_stock')}</span>}
        </div>

        <div className="space-y-3">
          <label className="block text-xs font-semibold text-md-on-surface-variant ml-1">{t('lbl_consume_amount')} ({item.unit})</label>
          
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
              className="w-full bg-md-surface-container-highest border border-md-outline-variant/60 rounded-2xl px-5 py-3.5 text-2xl font-bold text-md-primary outline-none focus:border-md-primary focus:ring-2 focus:ring-md-primary/20 transition-all"
            />
            <div className="absolute right-5 top-1/2 -translate-y-1/2 text-md-on-surface-variant font-semibold uppercase text-xs">{item.unit}</div>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {[0.25, 0.5, 0.75, 1].map(p => (
              <button 
                key={p} 
                onClick={() => setPercent(p)}
                className="m3-state-layer py-2.5 rounded-xl bg-md-surface-container-high border border-md-outline-variant/40 text-xs font-semibold text-md-on-surface hover:bg-md-secondary-container hover:text-md-on-secondary-container transition-all"
              >
                {p * 100}%
              </button>
            ))}
          </div>
        </div>

        {parseFloat(amount) > 0 && (
          <div className="space-y-3">
            <div className="flex flex-col items-center justify-center p-4 bg-md-primary-container/40 rounded-2xl border border-md-primary/20 animate-in fade-in zoom-in-95 duration-200">
              <p className="text-xs font-semibold text-md-primary mb-1">Consumption Ratio</p>
              <p className="text-lg font-bold text-md-on-surface">
                {amount} {item.unit} <span className="text-md-on-surface-variant mx-1.5">/</span> {item.quantity} {item.unit}
              </p>
              <div className="w-full h-1.5 bg-md-surface-container-highest rounded-full mt-3 overflow-hidden">
                <div 
                  className="h-full bg-md-primary transition-all duration-500 ease-out rounded-full" 
                  style={{ width: `${Math.min(100, (parseFloat(amount) / item.quantity) * 100)}%` }}
                />
              </div>
            </div>

            <div className="flex justify-between items-center p-4 bg-md-surface-container rounded-2xl border border-md-outline-variant/30 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <span className="text-xs font-semibold text-md-on-surface-variant">Remaining Stock</span>
              <span className="text-sm font-bold text-md-primary">
                {(item.quantity - parseFloat(amount)).toFixed(2)} {item.unit}
              </span>
            </div>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <Button variant="tonal" className="flex-1" onClick={onClose}>{t('cancel')}</Button>
          <Button 
            variant="primary"
            className="flex-1" 
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