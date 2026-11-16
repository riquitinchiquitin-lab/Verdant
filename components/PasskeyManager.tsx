import React, { useState, useEffect, useCallback } from 'react';
import { Fingerprint, Plus, Trash2, KeyRound, Lock, Smartphone, ShieldAlert, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSystem } from '../context/SystemContext';
import { fetchWithAuth } from '../services/api';
import {
  registerPasskey,
  PasskeyCredentialInfo,
  isWebAuthnSupported,
  setupTotp,
  verifyTotpSetup,
  disableTotp,
  regenerateRecoveryCodes,
  getSecurityPolicy,
  updateSecurityPolicy,
  SecurityPolicyStatus,
} from '../services/webauthn';
import { Button } from './ui/Button';
import { NistPasswordMeter } from './NistPasswordMeter';

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

  // TOTP & Recovery Codes state
  const [totpSecret, setTotpSecret] = useState<string | null>(null);
  const [totpUri, setTotpUri] = useState<string | null>(null);
  const [totpVerifyCode, setTotpVerifyCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [totpBusy, setTotpBusy] = useState(false);

  // Global Security Policy state
  const [policy, setPolicy] = useState<SecurityPolicyStatus | null>(null);
  const [updatingPolicy, setUpdatingPolicy] = useState(false);
  const isAdmin = user?.role === 'OWNER' || user?.role === 'CO_CEO';

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

  const loadPolicy = useCallback(async () => {
    try {
      const p = await getSecurityPolicy();
      setPolicy(p);
    } catch {
      // Ignore transient errors
    }
  }, []);

  useEffect(() => {
    loadCredentials();
    loadPolicy();
  }, [loadCredentials, loadPolicy]);

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
      await loadPolicy();
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
        await loadPolicy();
      }
    } catch {
      showNotification('FAILED TO REMOVE PASSKEY', 'ERROR');
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (newPassword.length < 8) {
      showNotification('PASSWORD MUST BE AT LEAST 8 CHARACTERS (NIST SP 800-63B)', 'ERROR');
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

  const handleStartTotp = async () => {
    if (!token) return;
    setTotpBusy(true);
    try {
      const data = await setupTotp(token);
      setTotpSecret(data.secret);
      setTotpUri(data.otpauthUri);
      setTotpVerifyCode('');
    } catch {
      showNotification('FAILED TO INITIALIZE TOTP', 'ERROR');
    } finally {
      setTotpBusy(false);
    }
  };

  const handleVerifyTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setTotpBusy(true);
    try {
      const res = await verifyTotpSetup(token, totpVerifyCode);
      setTotpSecret(null);
      setTotpUri(null);
      setTotpVerifyCode('');
      setRecoveryCodes(res.recoveryCodes);
      updateCurrentUser({ totpEnabled: true, recoveryCodesRemaining: res.recoveryCodes.length });
      showNotification('TOTP 2FA ENABLED — SAVE RECOVERY CODES', 'SUCCESS');
      await loadPolicy();
    } catch (err: any) {
      showNotification(err?.message || 'INVALID 6-DIGIT CODE', 'ERROR');
    } finally {
      setTotpBusy(false);
    }
  };

  const handleDisableTotp = async () => {
    if (!token) return;
    setTotpBusy(true);
    try {
      await disableTotp(token);
      updateCurrentUser({ totpEnabled: false });
      showNotification('TOTP 2FA DISABLED', 'SUCCESS');
      await loadPolicy();
    } catch {
      showNotification('FAILED TO DISABLE TOTP', 'ERROR');
    } finally {
      setTotpBusy(false);
    }
  };

  const handleRegenerateRecovery = async () => {
    if (!token) return;
    setTotpBusy(true);
    try {
      const res = await regenerateRecoveryCodes(token);
      setRecoveryCodes(res.recoveryCodes);
      updateCurrentUser({ recoveryCodesRemaining: res.recoveryCodes.length });
      showNotification('RECOVERY CODES REGENERATED', 'SUCCESS');
    } catch {
      showNotification('FAILED TO REGENERATE CODES', 'ERROR');
    } finally {
      setTotpBusy(false);
    }
  };

  const handleTogglePolicy = async () => {
    if (!token || !policy) return;
    setUpdatingPolicy(true);
    try {
      await updateSecurityPolicy(token, !policy.allUsersRequired);
      await loadPolicy();
      showNotification(
        !policy.allUsersRequired ? 'GLOBAL 2FA POLICY ENFORCED' : 'GLOBAL 2FA POLICY RELAXED',
        'SUCCESS'
      );
    } catch {
      showNotification('FAILED TO UPDATE SECURITY POLICY', 'ERROR');
    } finally {
      setUpdatingPolicy(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Global 2FA / FIDO2 Policy (Admin Only) */}
      {isAdmin && policy && (
        <div className="bg-white dark:bg-slate-900 p-8 rounded-[40px] border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-slate-900 dark:text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-black uppercase">Global 2FA / FIDO2 Policy</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {policy.compliantUsers} / {policy.totalUsers} personnel enrolled with Passkey or TOTP
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant={policy.allUsersRequired ? 'primary' : 'secondary'}
            onClick={handleTogglePolicy}
            disabled={updatingPolicy}
            className="h-11 px-5 rounded-xl font-black uppercase tracking-widest text-xs shrink-0"
          >
            {policy.allUsersRequired ? '2FA Required: ON' : '2FA Required: OFF'}
          </Button>
        </div>
      )}

      {/* Argon2id + NIST SP 800-63B Password Section */}
      <div className="bg-white dark:bg-slate-900 p-8 rounded-[40px] border border-slate-200 dark:border-slate-800 shadow-sm space-y-6 text-slate-900 dark:text-white">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-xl font-black uppercase">Argon2id Account Password</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {user?.hasPassword
                ? 'NIST SP 800-63B validated & HIBP-screened Argon2id password.'
                : 'Set a NIST SP 800-63B compliant Argon2id password for your account.'}
            </p>
          </div>
        </div>

        <form onSubmit={handleChangePassword} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
              placeholder="New password (min 8 chars, 15+ rec.)"
              className="h-12 bg-slate-50 dark:bg-slate-800 rounded-xl px-4 text-sm font-bold outline-none border border-slate-200 dark:border-slate-700 dark:text-white"
            />
            <Button
              type="submit"
              variant="secondary"
              disabled={savingPw || newPassword.length < 8}
              className="h-12 px-6 rounded-xl font-black uppercase tracking-widest text-xs"
            >
              {savingPw ? 'Saving...' : user?.hasPassword ? 'Update Password' : 'Set Password'}
            </Button>
          </div>
          <NistPasswordMeter password={newPassword} email={user?.email} />
        </form>
      </div>

      {/* Authenticator App (TOTP RFC 6238) & Recovery Codes Section */}
      <div className="bg-white dark:bg-slate-900 p-8 rounded-[40px] border border-slate-200 dark:border-slate-800 shadow-sm space-y-6 text-slate-900 dark:text-white">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xl font-black uppercase">Authenticator App (TOTP 2FA)</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {user?.totpEnabled
                  ? `Active • ${user.recoveryCodesRemaining ?? 0} one-time recovery codes remaining`
                  : 'Use Google Authenticator, 1Password, or Bitwarden for 6-digit 2FA codes.'}
              </p>
            </div>
          </div>

          {user?.totpEnabled ? (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={handleRegenerateRecovery}
                disabled={totpBusy}
                className="h-10 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                New Recovery Codes
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={handleDisableTotp}
                disabled={totpBusy}
                className="h-10 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest text-rose-500 hover:bg-rose-500/10"
              >
                Disable TOTP
              </Button>
            </div>
          ) : (
            !totpSecret && (
              <Button
                type="button"
                variant="secondary"
                onClick={handleStartTotp}
                disabled={totpBusy}
                className="h-11 px-5 rounded-xl font-black uppercase tracking-widest text-xs"
              >
                Enable Authenticator
              </Button>
            )
          )}
        </div>

        {totpSecret && (
          <form onSubmit={handleVerifyTotp} className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-4">
            <div className="space-y-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                1. Add this secret key to your authenticator app:
              </p>
              <code className="block p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono text-xs font-bold tracking-widest select-all break-all">
                {totpSecret}
              </code>
              {totpUri && (
                <p className="text-[10px] text-slate-400 break-all font-mono pt-1">
                  URI: {totpUri}
                </p>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                value={totpVerifyCode}
                onChange={(e) => setTotpVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="Enter 6-digit code"
                className="flex-1 h-11 bg-white dark:bg-slate-900 rounded-xl px-4 font-mono text-sm font-black tracking-[0.3em] outline-none border border-slate-200 dark:border-slate-700"
              />
              <Button
                type="submit"
                disabled={totpBusy || totpVerifyCode.length !== 6}
                className="h-11 px-6 rounded-xl bg-emerald-600 text-white font-black uppercase tracking-widest text-xs"
              >
                Verify & Activate
              </Button>
            </div>
          </form>
        )}

        {recoveryCodes && (
          <div className="p-5 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-widest text-amber-700 dark:text-amber-400">
                Save Your One-Time Recovery Codes
              </span>
              <button
                type="button"
                onClick={() => setRecoveryCodes(null)}
                className="text-[10px] font-black uppercase tracking-widest text-slate-500 underline"
              >
                Dismiss
              </button>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-300">
              Store these codes in a password manager. Each code can be used once if you lose access to your authenticator.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {recoveryCodes.map((code) => (
                <code
                  key={code}
                  className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-amber-500/20 text-center font-mono text-xs font-bold tracking-wider select-all"
                >
                  {code}
                </code>
              ))}
            </div>
          </div>
        )}
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
