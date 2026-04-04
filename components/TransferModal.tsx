import React from 'react';
import { Modal } from './ui/Modal';
import { Plant } from '../types';
import { useLanguage } from '../context/LanguageContext';

interface TransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  plant: Plant;
}

export const TransferModal: React.FC<TransferModalProps> = ({ isOpen, onClose, plant }) => {
  const { t, lv } = useLanguage();
  
  // Helper to ensure protocol fields don't contain the pipe separator
  const sanitize = (val: string | null | undefined, fallback: string) => 
    (val || fallback).replace(/\|/g, '').trim();

  // STRUCTURE: HOUSE_ID|PLANT_ID|SPECIES|FAMILY
  const houseId = sanitize(plant.houseId, 'GLOBAL');
  const plantId = sanitize(plant.id, 'ID');
  const species = sanitize(plant.species, 'SPECIES');
  const family = sanitize(plant.family, 'BOTANICAL');
  
  const hFormatHash = `${houseId}|${plantId}|${species}|${family}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=350x350&data=${encodeURIComponent(hFormatHash)}&bgcolor=FFFFFF&color=5E8F47&margin=10&ecc=H`;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('transfer_plant') || 'Plant Sync'}>
      <div className="flex flex-col items-center justify-center space-y-8 py-4">
        <div className="bg-white p-6 rounded-[40px] border-4 border-gray-50 shadow-inner group transition-all hover:scale-105 duration-500 overflow-hidden">
            <img 
              src={qrUrl} 
              alt="Transfer QR Code" 
              className="w-64 h-64 transition-all" 
              loading="lazy"
              onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
              }}
            />
        </div>
        
        <div className="text-center space-y-4">
            <div>
              <h3 className="font-black text-gray-900 dark:text-white text-3xl tracking-tighter uppercase leading-none mb-1">{lv(plant.nickname)}</h3>
              <p className="text-[10px] font-black text-verdant uppercase tracking-[0.3em] opacity-70">Live Sync Enabled</p>
            </div>
            
            <p className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-widest max-w-xs mx-auto leading-relaxed">
                {t('qr_desc_msg') || "Scan this specimen to sync botanical data across Verdant systems."}
            </p>
            
            <div className="mt-8 p-6 bg-gray-50 dark:bg-slate-900 rounded-[32px] border border-gray-100 dark:border-slate-800 shadow-inner text-left overflow-hidden">
                <div className="flex items-center justify-between mb-3 border-b border-gray-200/50 dark:border-slate-800 pb-2">
                    <p className="text-[9px] text-gray-400 uppercase font-black tracking-[0.2em]">{t('code') || "GARDEN ID"}</p>
                    <span className="text-[8px] bg-verdant/10 text-verdant px-2 py-0.5 rounded-full font-black uppercase tracking-tighter italic">Sync Token</span>
                </div>
                <p className="font-mono text-[10px] select-all font-bold text-gray-700 dark:text-slate-300 break-all leading-relaxed bg-white/40 dark:bg-slate-900/20 p-3 rounded-xl border border-gray-100 dark:border-slate-800 shadow-sm">
                    {hFormatHash}
                </p>
            </div>
        </div>
        
        <div className="w-full pt-4">
          <button 
            onClick={onClose}
            className="w-full h-14 bg-gray-100 dark:bg-slate-800 rounded-2xl text-[10px] font-black uppercase tracking-[0.3em] text-gray-500 hover:text-verdant hover:bg-gray-200 dark:hover:bg-slate-700 transition-all"
          >
            {t('done') || "CLOSE"}
          </button>
        </div>
      </div>
    </Modal>
  );
};