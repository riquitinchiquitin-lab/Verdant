import React, { useState } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { House, User } from '../types';
import { usePersonnel } from '../context/PersonnelContext';
import { useLanguage } from '../context/LanguageContext';
import { usePlants } from '../context/PlantContext';
import { verifyApiKey } from '../services/plantAi';

interface ManageHousePersonnelModalProps {
  isOpen: boolean;
  onClose: () => void;
  house: House;
}

export const ManageHousePersonnelModal: React.FC<ManageHousePersonnelModalProps> = ({ isOpen, onClose, house }) => {
  const { users, updateUser } = usePersonnel();
  const { t, lv } = useLanguage();
  
  const assignedUsers = users.filter(u => u.houseId === house.id && !u.deletedAt);
  const availableUsers = users.filter(u => u.houseId !== house.id && !u.deletedAt);

  const handleToggleAssignment = (targetUser: User, assign: boolean) => {
      updateUser(targetUser.id, { houseId: assign ? house.id : null });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`${t('menu_admin')}: ${lv(house.name)}`} size="lg">
      <div className="space-y-8 py-2 max-h-[80vh] overflow-y-auto no-scrollbar px-1">
        
        <div>
            <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 px-1">{t('assigned_personnel')}</h4>
            <div className="space-y-2">
                {assignedUsers.length > 0 ? assignedUsers.map(u => (
                    <div key={u.id} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-slate-800/50 border border-gray-100 dark:border-slate-800 rounded-2xl">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-emerald-500 text-white rounded-xl flex items-center justify-center font-black text-xs">
                                {(lv(u.name) || '?').charAt(0).toUpperCase()}
                            </div>
                            <div>
                                <p className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-tight">{lv(u.name)}</p>
                                <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest opacity-80">{t('role_' + u.role.toLowerCase())}</p>
                            </div>
                        </div>
                        <button onClick={() => handleToggleAssignment(u, false)} className="p-2 text-gray-400 hover:text-red-500 transition-colors">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                )) : (
                    <div className="p-8 text-center border-2 border-dashed border-gray-100 dark:border-slate-800 rounded-3xl">
                        <p className="text-[10px] font-black text-gray-300 uppercase tracking-[0.3em]">No personnel assigned</p>
                    </div>
                )}
            </div>
        </div>
        
        <div className="pt-6 border-t border-gray-100 dark:border-slate-800">
            <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 px-1">{t('available_personnel')}</h4>
            <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto no-scrollbar">
                {availableUsers.map(u => (
                    <div key={u.id} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-slate-800/50 rounded-2xl hover:bg-white dark:hover:bg-slate-800 transition-all border border-transparent hover:border-gray-100">
                        <p className="text-sm font-black text-gray-700 dark:text-white uppercase truncate pr-4">{lv(u.name)}</p>
                        <button onClick={() => handleToggleAssignment(u, true)} className="px-4 py-1.5 bg-verdant/10 text-verdant text-[9px] font-black uppercase tracking-widest rounded-xl">Assign</button>
                    </div>
                ))}
            </div>
        </div>

        <Button className="w-full h-14 rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-verdant/20" onClick={onClose}>{t('done')}</Button>
      </div>
    </Modal>
  );
};
