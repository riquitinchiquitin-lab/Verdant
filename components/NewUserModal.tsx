import React, { useState } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { User, UserRole, House } from '../types';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { generateUUID } from '../services/crypto';

interface NewUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  houses: House[];
  onSave: (newUser: User) => void;
}

export const NewUserModal: React.FC<NewUserModalProps> = ({ isOpen, onClose, houses, onSave }) => {
  const { user: currentUser } = useAuth();
  const { t, lv } = useLanguage();
  
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('GARDENER');
  const [houseId, setHouseId] = useState<string>(currentUser?.houseId || '');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

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
      if (!name || !email) return;

      const newUser: User = {
          id: `u-${generateUUID()}`,
          name,
          email,
          role,
          houseId: isLeadHand ? currentUser?.houseId : (houseId || null),
          createdAt: new Date().toISOString(),
          deletedAt: null
      };

      if (role === 'SEASONAL') {
          newUser.caretakerStart = startDate;
          newUser.caretakerEnd = endDate;
      }

      onSave(newUser);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('auth_personnel')}>
      <div className="space-y-8 py-2">
        <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">{t('full_legal_name')}</label>
                    <input 
                        className="w-full h-14 bg-gray-50 dark:bg-slate-800 rounded-2xl px-6 font-bold outline-none border border-gray-100 dark:border-slate-700 dark:text-white"
                        placeholder="e.g. John Doe"
                        value={name}
                        onChange={e => setName(e.target.value)}
                    />
                </div>
                <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">{t('enterprise_email')}</label>
                    <input 
                        type="email"
                        className="w-full h-14 bg-gray-50 dark:bg-slate-800 rounded-2xl px-6 font-bold outline-none border border-gray-100 dark:border-slate-700 dark:text-white"
                        placeholder="name@example.com"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                    />
                </div>
            </div>

            <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">{t('auth_level_label')}</label>
                <div className="grid grid-cols-1 gap-2">
                    {filteredRoles.map(r => (
                        <button
                            key={r.value}
                            onClick={() => setRole(r.value)}
                            className={`p-4 rounded-2xl text-left border-2 transition-all ${role === r.value ? 'bg-verdant/5 border-verdant shadow-md ring-4 ring-verdant/10' : 'bg-white dark:bg-slate-900 border-gray-100 dark:border-slate-800 hover:border-verdant/30'}`}
                        >
                            <span className={`font-black uppercase tracking-tight text-sm block ${role === r.value ? 'text-verdant' : 'text-gray-700 dark:text-white'}`}>{r.label}</span>
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
                    {!isLeadHand && <option value="">-- {t('unassigned_location')} ({t('global_view')}) --</option>}
                    {houses.map(h => <option key={h.id} value={h.id}>{lv(h.name)}</option>)}
                </select>
                {isLeadHand && <p className="mt-2 text-[8px] font-black text-amber-600 uppercase tracking-[0.2em] px-2">LOCKED TO HOUSE ARCHIVE</p>}
            </div>

            {role === 'SEASONAL' && (
                <div className="grid grid-cols-2 gap-4 animate-in zoom-in-95 duration-300">
                    <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">{t('access_start')}</label>
                        <input type="date" className="w-full h-14 bg-gray-50 dark:bg-slate-800 rounded-2xl px-4 font-bold outline-none border border-gray-100 dark:border-slate-700 dark:text-white" value={startDate} onChange={e => setStartDate(e.target.value)} />
                    </div>
                    <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">{t('access_expiry')}</label>
                        <input type="date" className="w-full h-14 bg-gray-50 dark:bg-slate-800 rounded-2xl px-4 font-bold outline-none border border-gray-100 dark:border-slate-700 dark:text-white" value={endDate} onChange={e => setEndDate(e.target.value)} />
                    </div>
                </div>
            )}
        </div>

        <div className="flex gap-3 pt-4">
            <Button variant="ghost" onClick={onClose} className="flex-1 font-black uppercase tracking-widest text-xs">{t('cancel')}</Button>
            <Button onClick={handleSave} disabled={!name || !email} className="flex-[2] h-14 rounded-2xl shadow-xl shadow-verdant/20 font-black uppercase tracking-widest">{t('auth_creation')}</Button>
        </div>
      </div>
    </Modal>
  );
};