import React, { useState, useEffect, useCallback } from 'react';
import {
  Fingerprint,
  Plus,
  Trash2,
  KeyRound,
  Lock,
  Smartphone,
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Cpu,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSystem } from '../context/SystemContext';
import { fetchWithAuth } from '../services/api';
import {
  registerPasskey,
  authenticateWithPasskey,
  revokeAllPasskeys,
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

  const [testingKey, setTestingKey] = useState(false);
  const [revokingAll, setRevokingAll] = useState(false);

  const handleTestKey = async () => {
    if (!user?.email) return;
    setTestingKey(true);
    try {
      await authenticateWithPasskey(user.email);
      showNotification('FIDO2 KEY VERIFIED SUCCESSFULLY', 'SUCCESS');
    } catch (e: any) {
      showNotification(e?.message || 'FIDO2 KEY TEST FAILED', 'ERROR');
    } finally {
      setTestingKey(false);
    }
  };

  const handleRevokeAllPasskeys = async () => {
    if (!token || credentials.length === 0) return;
    setRevokingAll(true);
    try {
      await revokeAllPasskeys(token);
      setCredentials([]);
      await loadPolicy();
      showNotification('ALL PASSKEYS REVOKED', 'SUCCESS');
    } catch {
      showNotification('FAILED TO REVOKE PASSKEYS', 'ERROR');
    } finally {
      setRevokingAll(false);
    }
  };

  const isCompliant = credentials.length > 0 || Boolean(user?.totpEnabled);

  return (
    <div className="space-y-6">
      {/* Global FIDO2 Mandatory Policy Banner (Admin Only) */}
      {isAdmin && policy && (
        <div className="rounded-3xl p-5 md:p-6 bg-md-primary-container text-md-on-primary-container border border-md-primary/25 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-2xl bg-md-primary text-md-on-primary flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-bold uppercase tracking-wider">
                    Global Policy: FIDO2 Mandatory for All Users
                  </h3>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                      policy.allUsersRequired
                        ? 'bg-emerald-500/20 text-emerald-900 dark:text-emerald-200'
                        : 'bg-md-surface/60 text-md-on-surface-variant'
                    }`}
                  >
                    {policy.allUsersRequired ? 'Enforced' : 'Optional'}
                  </span>
                </div>
                <p className="text-xs opacity-85 mt-0.5">
                  Personnel compliance: <strong>{policy.compliantUsers} / {policy.totalUsers}</strong> users compliant
                </p>
              </div>
            </div>

            <Button
              type="button"
              variant={policy.allUsersRequired ? 'primary' : 'tonal'}
              size="sm"
              onClick={handleTogglePolicy}
              disabled={updatingPolicy}
              isLoading={updatingPolicy}
              className="shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              {policy.allUsersRequired ? 'Enforced (Click to Relax)' : 'Enforce for All'}
            </Button>
          </div>

          {policy.userCompliance && policy.userCompliance.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-md-on-primary-container/15">
              <span className="text-[11px] font-semibold opacity-75 mr-1">Status:</span>
              {policy.userCompliance.map((u) => (
                <span
                  key={u.id}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                    u.compliant
                      ? 'bg-md-surface text-md-on-surface'
                      : 'bg-amber-100 text-amber-950 dark:bg-amber-900/60 dark:text-amber-100'
                  }`}
                >
                  <span>{u.name}</span>
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                      u.compliant
                        ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                        : 'bg-amber-500/25 text-amber-800 dark:text-amber-200'
                    }`}
                  >
                    {u.compliant ? 'OK' : 'REQ'}
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Two-Factor Authentication (FIDO2 Standard) Summary + Test Key */}
      <div className="m3-card-elevated rounded-3xl p-5 md:p-6 border border-md-outline-variant/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-2xl bg-md-primary-container text-md-on-primary-container flex items-center justify-center shrink-0">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-bold text-md-on-surface">
                Two-Factor Authentication (FIDO2 Standard)
              </h3>
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                  isCompliant
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                    : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                }`}
              >
                {isCompliant ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                {isCompliant ? 'Compliant' : 'Key Required'}
              </span>
            </div>
            <p className="text-xs text-md-on-surface-variant mt-0.5">
              Phishing-resistant authentication adhering to FIDO Alliance &amp; W3C WebAuthn Level 3.
            </p>
          </div>
        </div>

        <Button
          type="button"
          variant="outlined"
          size="sm"
          onClick={handleTestKey}
          disabled={!isWebAuthnSupported() || credentials.length === 0 || testingKey}
          isLoading={testingKey}
        >
          <Fingerprint className="w-4 h-4" />
          Test Key
        </Button>
      </div>

      {/* Enroll a New Security Key or Passkey */}
      <div className="m3-card-elevated rounded-3xl p-5 md:p-6 border border-md-outline-variant/30 space-y-4">
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-md-on-surface">
            Enroll a New Security Key or Passkey
          </h4>
          <p className="text-xs text-md-on-surface-variant mt-0.5">
            Supports YubiKey (USB, NFC), Google Titan Key, Apple Touch ID / Face ID, Windows Hello, and Android Biometrics.
          </p>
        </div>

        {!isWebAuthnSupported() ? (
          <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">
            WebAuthn is not supported in this browser/context (requires HTTPS or localhost).
          </p>
        ) : (
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Key name (e.g., YubiKey 5C NFC, Work MacBook Touch ID)"
              className="flex-1 h-11 bg-md-surface-container-high border border-md-outline-variant/50 rounded-2xl px-4 text-sm font-medium text-md-on-surface outline-none focus:ring-2 focus:ring-md-primary/30"
            />
            <Button variant="primary" size="md" onClick={handleAddPasskey} disabled={adding} isLoading={adding}>
              <Plus className="w-4 h-4" />
              Enroll FIDO2 Key
            </Button>
          </div>
        )}
      </div>

      {/* Enrolled Keys List */}
      <div className="m3-card-elevated rounded-3xl p-5 md:p-6 border border-md-outline-variant/30 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-md-on-surface">
              Enrolled Keys ({credentials.length})
            </h4>
            <p className="text-xs text-md-on-surface-variant mt-0.5">
              Phishing-resistant hardware &amp; platform credentials
            </p>
          </div>
          {credentials.length > 0 && (
            <Button
              type="button"
              variant="danger"
              size="sm"
              onClick={handleRevokeAllPasskeys}
              disabled={revokingAll}
              isLoading={revokingAll}
            >
              Revoke All
            </Button>
          )}
        </div>

        {loading ? (
          <p className="text-xs text-md-on-surface-variant">Loading credentials...</p>
        ) : credentials.length === 0 ? (
          <div className="p-4 rounded-2xl bg-md-surface-container border border-md-outline-variant/30 text-xs text-md-on-surface-variant">
            No FIDO2 passkeys enrolled for this account yet.
          </div>
        ) : (
          <div className="space-y-2.5">
            {credentials.map((cred) => (
              <div
                key={cred.id}
                className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-md-surface-container border border-md-outline-variant/30"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-md-primary-container text-md-on-primary-container flex items-center justify-center shrink-0">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-md-on-surface truncate">
                      {cred.label || 'Passkey'}
                    </p>
                    <p className="text-xs text-md-on-surface-variant">
                      {cred.deviceType === 'multiDevice' ? 'Synced Passkey' : 'Device-Bound Key'} · Enrolled{' '}
                      {new Date(cred.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeletePasskey(cred.id)}
                  className="w-9 h-9 rounded-full flex items-center justify-center text-md-on-surface-variant hover:text-md-error hover:bg-md-error-container/40 transition-colors"
                  title="Remove passkey"
                  aria-label="Remove passkey"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 6-Digit 2nd Factor (TOTP) & Emergency Recovery Codes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="m3-card-elevated rounded-3xl p-5 md:p-6 border border-md-outline-variant/30 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-md-secondary-container text-md-on-secondary-container flex items-center justify-center shrink-0">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-bold text-md-on-surface">6-Digit 2nd Factor (TOTP)</h4>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      user?.totpEnabled
                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                        : 'bg-md-surface-container-high text-md-on-surface-variant'
                    }`}
                  >
                    {user?.totpEnabled ? 'Active' : 'Not Configured'}
                  </span>
                </div>
                <p className="text-xs text-md-on-surface-variant mt-0.5">
                  Use Google Authenticator, 1Password, or Bitwarden for 6-digit codes.
                </p>
              </div>
            </div>

            {user?.totpEnabled ? (
              <Button type="button" variant="danger" size="sm" onClick={handleDisableTotp} disabled={totpBusy}>
                Disable
              </Button>
            ) : (
              !totpSecret && (
                <Button type="button" variant="tonal" size="sm" onClick={handleStartTotp} disabled={totpBusy}>
                  Enable 6-Digit Code
                </Button>
              )
            )}
          </div>

          {totpSecret && (
            <form onSubmit={handleVerifyTotp} className="p-4 rounded-2xl bg-md-surface-container border border-md-outline-variant/40 space-y-3">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-md-on-surface-variant">
                  1. Add this secret key to your authenticator app:
                </p>
                <code className="block p-3 rounded-xl bg-md-surface border border-md-outline-variant/40 font-mono text-xs font-bold tracking-widest select-all break-all text-md-on-surface">
                  {totpSecret}
                </code>
                {totpUri && (
                  <p className="text-[11px] text-md-on-surface-variant break-all font-mono pt-1">{totpUri}</p>
                )}
              </div>
              <div className="flex flex-col sm:flex-row gap-2.5">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  value={totpVerifyCode}
                  onChange={(e) => setTotpVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="Enter 6-digit code"
                  className="flex-1 h-11 bg-md-surface border border-md-outline-variant/50 rounded-2xl px-4 font-mono text-sm font-bold tracking-[0.25em] outline-none text-md-on-surface"
                />
                <Button type="submit" variant="primary" size="md" disabled={totpBusy || totpVerifyCode.length !== 6}>
                  Verify &amp; Activate
                </Button>
              </div>
            </form>
          )}
        </div>

        <div className="m3-card-elevated rounded-3xl p-5 md:p-6 border border-md-outline-variant/30 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-bold text-md-on-surface">Emergency Recovery Codes</h4>
              <p className="text-xs text-md-on-surface-variant mt-0.5">
                Single-use emergency codes to regain access if your physical key is unavailable.
              </p>
            </div>
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-md-primary-container text-md-on-primary-container shrink-0">
              {user?.recoveryCodesRemaining ?? 0} remaining
            </span>
          </div>

          <Button
            type="button"
            variant="outlined"
            size="md"
            onClick={handleRegenerateRecovery}
            disabled={totpBusy}
            className="w-full"
          >
            <RefreshCw className="w-4 h-4" />
            Generate 8 New Codes
          </Button>

          {recoveryCodes && (
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-800 dark:text-amber-300">
                  Save Your One-Time Recovery Codes
                </span>
                <button
                  type="button"
                  onClick={() => setRecoveryCodes(null)}
                  className="text-xs font-semibold text-md-on-surface-variant underline"
                >
                  Dismiss
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {recoveryCodes.map((code) => (
                  <code
                    key={code}
                    className="p-2 rounded-xl bg-md-surface border border-amber-500/20 text-center font-mono text-xs font-bold tracking-wider select-all text-md-on-surface"
                  >
                    {code}
                  </code>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Argon2id + NIST SP 800-63B Password Section */}
      <div className="m3-card-elevated rounded-3xl p-5 md:p-6 border border-md-outline-variant/30 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-md-primary-container text-md-on-primary-container flex items-center justify-center shrink-0">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-base font-bold text-md-on-surface">Argon2id Account Password</h4>
            <p className="text-xs text-md-on-surface-variant">
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
                className="h-11 bg-md-surface-container-high border border-md-outline-variant/50 rounded-2xl px-4 text-sm font-medium outline-none text-md-on-surface"
              />
            )}
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password (min 8 chars, 15+ rec.)"
              className="h-11 bg-md-surface-container-high border border-md-outline-variant/50 rounded-2xl px-4 text-sm font-medium outline-none text-md-on-surface"
            />
            <Button type="submit" variant="tonal" size="md" disabled={savingPw || newPassword.length < 8}>
              {savingPw ? 'Saving...' : user?.hasPassword ? 'Update Password' : 'Set Password'}
            </Button>
          </div>
          <NistPasswordMeter password={newPassword} email={user?.email} />
        </form>
      </div>

      {/* Cryptographic Security Architecture Audit */}
      <div className="m3-card-elevated rounded-3xl p-5 md:p-6 border border-md-outline-variant/30 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-md-surface-container-high text-md-primary flex items-center justify-center shrink-0">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-base font-bold text-md-on-surface">Cryptographic Security Architecture</h4>
            <p className="text-xs text-md-on-surface-variant">
              Authenticated encryption and privacy-by-design storage guarantees
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          <div className="p-4 rounded-2xl bg-md-surface-container border border-md-outline-variant/30 space-y-1">
            <p className="text-xs font-bold text-md-primary">Cipher: AES-256-GCM</p>
            <p className="text-xs text-md-on-surface-variant leading-relaxed">
              Galois/Counter Mode (GCM) with 128-bit authentication tag guarantees confidentiality and tamper-proof data verification.
            </p>
          </div>
          <div className="p-4 rounded-2xl bg-md-surface-container border border-md-outline-variant/30 space-y-1">
            <p className="text-xs font-bold text-md-primary">Memory-Hard KDF: Argon2id</p>
            <p className="text-xs text-md-on-surface-variant leading-relaxed">
              Memory-hard key derivation with NIST SP 800-63B length/breach checks to neutralize GPU/ASIC cracking rigs.
            </p>
          </div>
          <div className="p-4 rounded-2xl bg-md-surface-container border border-md-outline-variant/30 space-y-1">
            <p className="text-xs font-bold text-md-primary">Storage at Rest: SQLite + Vault Key</p>
            <p className="text-xs text-md-on-surface-variant leading-relaxed">
              Encrypted database backups (`.enc`) and rotatable 50-character master vault key isolation.
            </p>
          </div>
          <div className="p-4 rounded-2xl bg-md-surface-container border border-md-outline-variant/30 space-y-1">
            <p className="text-xs font-bold text-md-primary">FIDO2 / WebAuthn Level 3</p>
            <p className="text-xs text-md-on-surface-variant leading-relaxed">
              Origin-bound asymmetric cryptography prevents credential phishing and replay attacks across devices.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
