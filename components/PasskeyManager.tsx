import React, { useState, useEffect, useCallback } from 'react';
import { Fingerprint, Plus, Trash2, KeyRound, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSystem } from '../context/SystemContext';
import { fetchWithAuth } from '../services/api';
import { registerPasskey, PasskeyCredentialInfo, isWebAuthnSupported } from '../services/webauthn';
import { Button } from './ui/Button';

export const PasskeyManager: React.FC = () => {
  const { user, token, updateCurrentUser } = useAuth();
  const { showNotification } = useSystem();
  const [credentials, setCredentials] = useState<PasskeyCredentialInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [adding, setAdding] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [savingPw, setSavingPw] = useState(false);

  const loadCredentials = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetchWithAuth('/api/auth/webauthn/credentials', token);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setCredentials(data);
      }
    } catch {
      // Ignore transient errors
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadCredentials();
  }, [loadCredentials]);

  const handleAddPasskey = async () => {
    if (!user?.email || !token) return;
    setAdding(true);
    try {
      await registerPasskey({
        email: user.email,
        label: newLabel.trim() || undefined,
        token,
      });
      setNewLabel('');
      showNotification('PASSKEY REGISTERED', 'SUCCESS');
      await loadCredentials();
    } catch (e: any) {
      showNotification(e?.message || 'PASSKEY REGISTRATION FAILED', 'ERROR');
    } finally {
      setAdding(false);
    }
  };

  const handleDeletePasskey = async (id: string) => {
    if (!token) return;
    try {
      const res = await fetchWithAuth(`/api/auth/webauthn/credentials/${encodeURIComponent(id)}`, token, {
        method: 'DELETE',
      });
      if (res.ok) {
        setCredentials((prev) => prev.filter((c) => c.id !== id));
        showNotification('PASSKEY REMOVED', 'SUCCESS');
      }
    } catch {
      showNotification('FAILED TO REMOVE PASSKEY', 'ERROR');
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (newPassword.length < 10) {
      showNotification('PASSWORD MUST BE AT LEAST 10 CHARACTERS', 'ERROR');
      return;
    }
    setSavingPw(true);
    try {
      const res = await fetchWithAuth('/api/auth/password/change', token, {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (res.ok) {
        setCurrentPassword('');
        setNewPassword('');
        updateCurrentUser({ hasPassword: true });
        showNotification('ARGON2ID PASSWORD UPDATED', 'SUCCESS');
      } else {
        const err = await res.json().catch(() => ({}));
        showNotification(err.error || 'PASSWORD UPDATE FAILED', 'ERROR');
      }
    } catch {
      showNotification('PASSWORD UPDATE FAILED', 'ERROR');
    } finally {
      setSavingPw(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Argon2id Password Section */}
      <div className="bg-white dark:bg-slate-900 p-8 rounded-[40px] border border-slate-200 dark:border-slate-800 shadow-sm space-y-6 text-slate-900 dark:text-white">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-xl font-black uppercase">Argon2id Account Password</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {user?.hasPassword
                ? 'Update your Argon2id-hashed login password.'
                : 'Set a local Argon2id-hashed password for your account.'}
            </p>
          </div>
        </div>

        <form onSubmit={handleChangePassword} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {user?.hasPassword && (
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Current password"
              className="h-12 bg-slate-50 dark:bg-slate-800 rounded-xl px-4 text-sm font-bold outline-none border border-slate-200 dark:border-slate-700 dark:text-white"
            />
          )}
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="New password (min 10 chars)"
            className="h-12 bg-slate-50 dark:bg-slate-800 rounded-xl px-4 text-sm font-bold outline-none border border-slate-200 dark:border-slate-700 dark:text-white"
          />
          <Button
            type="submit"
            variant="secondary"
            disabled={savingPw || newPassword.length < 10}
            className="h-12 px-6 rounded-xl font-black uppercase tracking-widest text-xs"
          >
            {savingPw ? 'Saving...' : user?.hasPassword ? 'Update Password' : 'Set Password'}
          </Button>
        </form>
      </div>

      {/* FIDO2 Passkeys Section */}
      <div className="bg-white dark:bg-slate-900 p-8 rounded-[40px] border border-slate-200 dark:border-slate-800 shadow-sm space-y-6 text-slate-900 dark:text-white">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
              <Fingerprint className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xl font-black uppercase">FIDO2 / WebAuthn Passkeys</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Manage hardware security keys and platform passkeys for your account.
              </p>
            </div>
          </div>
        </div>

        {!isWebAuthnSupported() ? (
          <p className="text-xs font-bold text-amber-500 uppercase tracking-widest">
            WebAuthn is not supported in this browser/context (requires HTTPS or localhost).
          </p>
        ) : (
          <>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Key label (e.g. YubiKey Backup, Phone Passkey)"
                className="flex-1 h-12 bg-slate-50 dark:bg-slate-800 rounded-xl px-4 text-sm font-bold outline-none border border-slate-200 dark:border-slate-700 dark:text-white"
              />
              <Button
                variant="secondary"
                onClick={handleAddPasskey}
                disabled={adding}
                className="h-12 px-6 rounded-xl flex items-center justify-center gap-2 font-black uppercase tracking-widest text-xs"
              >
                <Plus className="w-4 h-4" />
                {adding ? 'Enrolling...' : 'Add Passkey'}
              </Button>
            </div>

            <div className="space-y-3">
              {loading ? (
                <p className="text-xs text-slate-400 uppercase tracking-widest font-bold">Loading credentials...</p>
              ) : credentials.length === 0 ? (
                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 text-xs text-slate-500">
                  No FIDO2 passkeys enrolled for this account yet.
                </div>
              ) : (
                credentials.map((cred) => (
                  <div
                    key={cred.id}
                    className="flex items-center justify-between gap-4 p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-100 dark:border-slate-700"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <KeyRound className="w-4 h-4 text-emerald-500 shrink-0" />
                      <div className="min-w-0">
                        <p className="font-bold text-sm truncate">{cred.label || 'Passkey'}</p>
                        <p className="text-[10px] text-slate-400 uppercase tracking-widest">
                          {cred.deviceType === 'multiDevice' ? 'Synced Passkey' : 'Device-Bound Key'} • Enrolled{' '}
                          {new Date(cred.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeletePasskey(cred.id)}
                      className="p-2 text-slate-400 hover:text-red-500 transition-colors rounded-xl hover:bg-red-500/10"
                      title="Remove passkey"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
