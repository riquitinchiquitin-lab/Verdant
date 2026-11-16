import React, { useState, useEffect } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { User, UserRole, House } from '../types';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useSystem } from '../context/SystemContext';
import { fetchWithAuth } from '../services/api';

interface EditUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User;
  houses: House[];
  onSave: (userId: string, updates: Partial<User>) => void;
}

export const EditUserModal: React.FC<EditUserModalProps> = ({ isOpen, onClose, user: targetUser, houses, onSave }) => {
  const { user: currentUser, token } = useAuth();
  const { t, lv } = useLanguage();
  const { showNotification } = useSystem();
  
  const [role, setRole] = useState<UserRole>(targetUser.role);
  const [houseId, setHouseId] = useState<string>(targetUser.houseId || '');
  const [startDate, setStartDate] = useState(targetUser.caretakerStart || '');
  const [endDate, setEndDate] = useState(targetUser.caretakerEnd || '');
  const [isRevoked, setIsRevoked] = useState(!!targetUser.deletedAt);
  const [passkeyCount, setPasskeyCount] = useState<number>(targetUser.passkeyCount ?? 0);
  const [resettingPasskeys, setResettingPasskeys] = useState(false);
  const [hasPassword, setHasPassword] = useState<boolean>(!!targetUser.hasPassword);
  const [resettingPassword, setResettingPassword] = useState(false);

  const handleResetPasskeys = async () => {
    if (!token) return;
    setResettingPasskeys(true);
    try {
      const res = await fetchWithAuth(`/api/users/${targetUser.id}/reset-passkeys`, token, { method: 'POST' });
      if (res.ok) {
        setPasskeyCount(0);
        showNotification('USER PASSKEYS RESET', 'SUCCESS');
      } else {
        showNotification('FAILED TO RESET PASSKEYS', 'ERROR');
      }
    } catch {
      showNotification('FAILED TO RESET PASSKEYS', 'ERROR');
    } finally {
      setResettingPasskeys(false);
    }
  };

  const handleResetPassword = async () => {
    if (!token) return;
    setResettingPassword(true);
    try {
      const res = await fetchWithAuth(`/api/users/${targetUser.id}/reset-password`, token, { method: 'POST' });
      if (res.ok) {
        setHasPassword(false);
        showNotification('USER PASSWORD CLEARED', 'SUCCESS');
      } else {
        showNotification('FAILED TO RESET PASSWORD', 'ERROR');
      }
    } catch {
      showNotification('FAILED TO RESET PASSWORD', 'ERROR');
    } finally {
      setResettingPassword(false);
    }
  };

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
      <div className="space-y-6 py-2 font-sans">
        <div className="flex items-center gap-4 bg-md-surface-container p-5 rounded-[24px] border border-md-outline-variant/30">
          <div className="w-14 h-14 bg-md-primary-container text-md-on-primary-container rounded-2xl flex items-center justify-center font-bold text-xl shrink-0">
            {(lv(targetUser.name) || '?').charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-md-on-surface tracking-tight truncate">{lv(targetUser.name) || 'Anonymous'}</h3>
            <p className="text-xs font-medium text-md-on-surface-variant truncate">{targetUser.email}</p>
          </div>
        </div>

        <div className="space-y-5">
          <div>
            <label className="text-xs font-semibold text-md-on-surface-variant mb-2 block ml-1">{t('auth_level_label')}</label>
            <div className="grid grid-cols-1 gap-2">
              {filteredRoles.map(r => (
                <button
                  key={r.value}
                  onClick={() => setRole(r.value)}
                  className={`m3-state-layer p-4 rounded-2xl text-left border transition-all ${
                    role === r.value
                      ? 'bg-md-primary-container/50 border-md-primary ring-2 ring-md-primary/20'
                      : 'bg-md-surface-container-high border-md-outline-variant/40 hover:border-md-primary/50'
                  }`}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className={`font-bold text-sm ${role === r.value ? 'text-md-primary' : 'text-md-on-surface'}`}>{r.label}</span>
                    {role === r.value && <div className="w-2 h-2 rounded-full bg-md-primary animate-pulse" />}
                  </div>
                  <p className="text-xs font-medium text-md-on-surface-variant leading-relaxed">{r.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="animate-in slide-in-from-top-2 duration-200">
            <label className="text-xs font-semibold text-md-on-surface-variant mb-2 block ml-1">{t('primary_command')}</label>
            <select 
              disabled={isLeadHand}
              className={`w-full h-12 bg-md-surface-container-highest rounded-2xl px-4 text-sm font-medium outline-none border border-md-outline-variant/60 text-md-on-surface focus:border-md-primary focus:ring-2 focus:ring-md-primary/20 transition-all appearance-none ${isLeadHand ? 'opacity-60 cursor-not-allowed' : ''}`}
              value={isLeadHand ? currentUser?.houseId || '' : houseId}
              onChange={e => setHouseId(e.target.value)}
            >
              {!isLeadHand && <option value="">-- {t('unassigned_location')} --</option>}
              {houses.map(h => <option key={h.id} value={h.id}>{lv(h.name)}</option>)}
            </select>
            {isLeadHand && <p className="mt-1.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400 px-1">Authority restricted to site</p>}
          </div>

          {role === 'SEASONAL' && (
            <div className="grid grid-cols-2 gap-3.5 animate-in zoom-in-95 duration-200">
              <div>
                <label className="text-xs font-semibold text-md-on-surface-variant mb-1.5 block ml-1">{t('access_start')}</label>
                <input type="date" className="w-full h-12 bg-md-surface-container-highest rounded-2xl px-4 text-sm font-medium outline-none text-md-on-surface border border-md-outline-variant/60 focus:border-md-primary" value={startDate} onChange={e => setStartDate(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-semibold text-md-on-surface-variant mb-1.5 block ml-1">{t('access_expiry')}</label>
                <input type="date" className="w-full h-12 bg-md-surface-container-highest rounded-2xl px-4 text-sm font-medium outline-none text-md-on-surface border border-md-outline-variant/60 focus:border-md-primary" value={endDate} onChange={e => setEndDate(e.target.value)} />
              </div>
            </div>
          )}

          <div className="pt-5 border-t border-md-outline-variant/30 space-y-3">
            <div className="flex items-center justify-between p-4 rounded-2xl bg-md-surface-container border border-md-outline-variant/30">
              <div>
                <span className="block font-semibold text-xs text-md-on-surface">
                  Argon2id Password: {hasPassword ? 'Configured' : 'Not Set'}
                </span>
                <span className="text-[11px] text-md-on-surface-variant font-medium">
                  {hasPassword ? 'User can sign in with password' : 'User can set password on login'}
                </span>
              </div>
              {hasPassword && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleResetPassword}
                  disabled={resettingPassword}
                  className="h-9 px-4 rounded-xl text-xs"
                >
                  {resettingPassword ? 'Clearing...' : 'Reset Password'}
                </Button>
              )}
            </div>

            <div className="flex items-center justify-between p-4 rounded-2xl bg-md-surface-container border border-md-outline-variant/30">
              <div>
                <span className="block font-semibold text-xs text-md-on-surface">
                  FIDO2 Passkeys: {passkeyCount}
                </span>
                <span className="text-[11px] text-md-on-surface-variant font-medium">
                  {passkeyCount > 0 ? 'Device enrolled' : 'Awaiting first-time enrollment'}
                </span>
              </div>
              {passkeyCount > 0 && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleResetPasskeys}
                  disabled={resettingPasskeys}
                  className="h-9 px-4 rounded-xl text-xs"
                >
                  {resettingPasskeys ? 'Resetting...' : 'Reset Keys'}
                </Button>
              )}
            </div>

            <button
              onClick={() => setIsRevoked(!isRevoked)}
              className={`flex items-center gap-3 w-full p-4 rounded-2xl transition-all border ${isRevoked ? 'bg-md-primary-container/40 text-md-on-primary-container border-md-primary/30' : 'bg-md-error-container/40 text-md-on-error-container border-md-error/30'}`}
            >
              <div className="w-10 h-10 rounded-xl bg-md-surface-container-lowest/70 flex items-center justify-center shrink-0">
                {isRevoked ? <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> : <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636" /></svg>}
              </div>
              <div className="text-left">
                <span className="block font-semibold text-xs uppercase tracking-wider">{isRevoked ? t('restore_authority') : t('revoke_credentials')}</span>
              </div>
            </button>
          </div>
        </div>

        <div className="flex gap-3 pt-4">
          <Button variant="ghost" onClick={onClose} className="flex-1 h-12 rounded-2xl">{t('discard')}</Button>
          <Button onClick={handleSave} className="flex-[2] h-12 rounded-2xl">{t('apply_protocol_updates')}</Button>
        </div>
      </div>
    </Modal>
  );
};