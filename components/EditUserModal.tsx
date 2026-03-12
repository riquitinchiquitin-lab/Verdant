import React, { useState, useEffect } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { User, UserRole, House } from '../types';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

interface EditUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User;
  houses: House[];
  onSave: (userId: string, updates: Partial<User>) => void;
}

export const EditUserModal: React.FC<EditUserModalProps> = ({ isOpen, onClose, user: targetUser, houses, onSave }) => {
  const { user: currentUser } = useAuth();
  const { t, lv } = useLanguage();
  
  const [role, setRole] = useState<UserRole>(targetUser.role);
  const [houseId, setHouseId] = useState<string>(targetUser.houseId || '');
  const [startDate, setStartDate] = useState(targetUser.caretakerStart || '');
  const [endDate, setEndDate] = useState(targetUser.caretakerEnd || '');
  const [isRevoked, setIsRevoked] = useState(!!targetUser.deletedAt);

  const isLeadHand = currentUser?.role === 'LEAD_HAND';

  const ROLES: { value: UserRole; label: string; desc: string }[] = [
      { value: 'OWNER', label: t('role_owner'), desc: 'Full system control and high-level operations.' },
      { value: 'CO_CEO', label: t('role_co_ceo'), desc: 'Global management of all houses and personnel.' },
      { value: 'LEAD_HAND', label: t('role_lead_hand'), desc: 'Manager of a specific house and its local team.' },
      { value: 'GARDENER', label: t('role_gardener'), desc: 'Operational tasks and specimen data logging.' },
      { value: 'SEASONAL', label: t('role_seasonal'), desc: 'Temporal access with restricted operation windows.' }
  ];

  const filteredRoles = ROLES.filter(r => {
      if (currentUser?.role === 'OWNER' || currentUser?.role === 'CO_CEO') return true;
      if (isLeadHand) return ['GARDENER', 'SEASONAL'].includes(r.value);
      return false;
  });

  const handleSave = () => {
      const updates: Partial<User> = {
          role,
          houseId: isLeadHand ? currentUser?.houseId : (houseId || null),
          deletedAt: isRevoked ? new Date().toISOString() : null
      };

      if (role === 'SEASONAL') {
          updates.caretakerStart = startDate;
          updates.caretakerEnd = endDate;
      }

      onSave(targetUser.id, updates);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('modify_personnel_authority')}>
      <div className="space-y-8 py-2">
        <div className="flex items-center gap-4 bg-gray-50 dark:bg-slate-800/50 p-6 rounded-[32px] border border-gray-100 dark:border-slate-800 shadow-inner">
            <div className="w-14 h-14 bg-verdant/10 text-verdant rounded-2xl flex items-center justify-center font-black text-xl border border-verdant/20 shrink-0">
                {(lv(targetUser.name) || '?').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
                <h3 className="font-black text-gray-900 dark:text-white uppercase tracking-tight truncate">{lv(targetUser.name) || 'Anonymous'}</h3>
                <p className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-widest truncate">{targetUser.email}</p>
            </div>
        </div>

        <div className="space-y-6">
            <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">{t('auth_level_label')}</label>
                <div className="grid grid-cols-1 gap-2">
                    {filteredRoles.map(r => (
                        <button
                            key={r.value}
                            onClick={() => setRole(r.value)}
                            className={`p-4 rounded-2xl text-left border-2 transition-all group ${role === r.value ? 'bg-verdant/5 border-verdant shadow-md ring-4 ring-verdant/10' : 'bg-white dark:bg-slate-900 border-gray-100 dark:border-slate-800 hover:border-verdant/30'}`}
                        >
                            <div className="flex justify-between items-center mb-1">
                                <span className={`font-black uppercase tracking-tight text-sm ${role === r.value ? 'text-verdant' : 'text-gray-700 dark:text-white'}`}>{r.label}</span>
                                {role === r.value && <div className="w-2 h-2 rounded-full bg-verdant animate-pulse" />}
                            </div>
                            <p className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest leading-relaxed">{r.desc}</p>
                        </button>
                    ))}
                </div>
            </div>

            <div className="animate-in slide-in-from-top-2 duration-300">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">{t('primary_command')}</label>
                <select 
                    disabled={isLeadHand}
                    className={`w-full h-14 bg-gray-50 dark:bg-slate-800 rounded-2xl px-6 font-bold outline-none border border-gray-100 dark:border-slate-700 dark:text-white focus:ring-4 focus:ring-verdant/10 transition-all appearance-none ${isLeadHand ? 'opacity-60 cursor-not-allowed' : ''}`}
                    value={isLeadHand ? currentUser?.houseId || '' : houseId}
                    onChange={e => setHouseId(e.target.value)}
                >
                    {!isLeadHand && <option value="">-- {t('unassigned_location')} --</option>}
                    {houses.map(h => <option key={h.id} value={h.id}>{lv(h.name)}</option>)}
                </select>
                {isLeadHand && <p className="mt-2 text-[8px] font-black text-amber-600 uppercase tracking-[0.2em] px-2">AUTHORITY RESTRICTED TO SITE</p>}
            </div>

            {role === 'SEASONAL' && (
                <div className="grid grid-cols-2 gap-4 animate-in zoom-in-95 duration-300">
                    <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">{t('access_start')}</label>
                        <input type="date" className="w-full h-14 bg-gray-50 dark:bg-slate-800 rounded-2xl px-4 font-bold outline-none dark:text-white border border-gray-100 dark:border-slate-700" value={startDate} onChange={e => setStartDate(e.target.value)} />
                    </div>
                    <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">{t('access_expiry')}</label>
                        <input type="date" className="w-full h-14 bg-gray-50 dark:bg-slate-800 rounded-2xl px-4 font-bold outline-none dark:text-white border border-gray-100 dark:border-slate-700" value={endDate} onChange={e => setEndDate(e.target.value)} />
                    </div>
                </div>
            )}

            <div className="pt-6 border-t border-gray-100 dark:border-slate-800">
                <button 
                    onClick={() => setIsRevoked(!isRevoked)}
                    className={`flex items-center gap-3 w-full p-4 rounded-2xl transition-all border-2 ${isRevoked ? 'bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-900/10' : 'bg-red-50 text-red-600 border-red-100 dark:bg-red-900/10'}`}
                >
                    <div className="w-10 h-10 rounded-xl bg-white/50 flex items-center justify-center shrink-0">
                        {isRevoked ? <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> : <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636" /></svg>}
                    </div>
                    <div className="text-left">
                        <span className="block font-black uppercase tracking-widest text-xs">{isRevoked ? t('restore_authority') : t('revoke_credentials')}</span>
                    </div>
                </button>
            </div>
        </div>

        <div className="flex gap-3 pt-4">
            <Button variant="ghost" onClick={onClose} className="flex-1 font-black uppercase tracking-widest text-xs">{t('discard')}</Button>
            <Button onClick={handleSave} className="flex-[2] h-14 rounded-2xl shadow-xl shadow-verdant/20 font-black uppercase tracking-widest">{t('apply_protocol_updates')}</Button>
        </div>
      </div>
    </Modal>
  );
};