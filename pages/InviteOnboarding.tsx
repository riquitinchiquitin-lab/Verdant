import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ShieldCheck,
  Lock,
  Fingerprint,
  Smartphone,
  CheckCircle2,
  AlertTriangle,
  Eye,
  EyeOff,
  Wand2,
  ArrowRight,
  Copy,
  Check,
} from 'lucide-react';
import { API_URL } from '../constants';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { Logo } from '../components/ui/Logo';
import { NistPasswordMeter } from '../components/NistPasswordMeter';
import {
  registerPasskey,
  isWebAuthnSupported,
  setupTotp,
  verifyTotpSetup,
} from '../services/webauthn';

interface InviteMetadata {
  valid: boolean;
  email: string;
  name: string;
  role: string;
  totpEnabled: boolean;
  passkeyCount: number;
  expiresAt: string;
}

export const InviteOnboarding: React.FC = () => {
  const { token: inviteToken } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { login, token: sessionToken, user, updateCurrentUser } = useAuth();

  const [loading, setLoading] = useState(true);
  const [inviteInfo, setInviteInfo] = useState<InviteMetadata | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Step 1: NIST Password Creation
  const [step, setStep] = useState<'PASSWORD' | 'SECURITY' | 'COMPLETE'>('PASSWORD');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);

  // Step 2A: Passkey Enrollment
  const [passkeyLabel, setPasskeyLabel] = useState('');
  const [registeringPasskey, setRegisteringPasskey] = useState(false);
  const [passkeyEnrolled, setPasskeyEnrolled] = useState(false);
  const [passkeyMessage, setPasskeyMessage] = useState<string | null>(null);

  // Step 2B: TOTP 2FA Enrollment
  const [totpSecret, setTotpSecret] = useState<string | null>(null);
  const [totpUri, setTotpUri] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [totpBusy, setTotpBusy] = useState(false);
  const [totpEnrolled, setTotpEnrolled] = useState(false);
  const [totpError, setTotpError] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [copiedRecovery, setCopiedRecovery] = useState(false);

  const webAuthnAvailable = isWebAuthnSupported();

  useEffect(() => {
    const verifyInvite = async () => {
      if (!inviteToken) {
        setInviteError('Missing invitation token.');
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(`${API_URL}/api/auth/invite/${encodeURIComponent(inviteToken)}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.valid) {
          setInviteError(
            'This onboarding invitation link has already been used or has expired. Ask your Verdant administrator to send a new SMS link.'
          );
        } else {
          setInviteInfo(data);
          setPasskeyEnrolled((data.passkeyCount || 0) > 0);
          setTotpEnrolled(Boolean(data.totpEnabled));
        }
      } catch {
        setInviteError('Unable to reach the Verdant security node. Please check your connection.');
      } finally {
        setLoading(false);
      }
    };
    verifyInvite();
  }, [inviteToken]);

  const generateBotanicalPassphrase = () => {
    const words = [
      'Cedar', 'Orchid', 'Fern', 'Bonsai', 'Maple', 'Willow', 'Cypress', 'Lotus',
      'Juniper', 'Sequoia', 'Banyan', 'Acacia', 'Linden', 'Myrtle', 'Spruce', 'Olive',
      'Ginkgo', 'Laurel', 'Magnolia', 'Camellia', 'Bamboo', 'Redwood', 'Clover', 'Thyme'
    ];
    const rand = new Uint32Array(4);
    window.crypto.getRandomValues(rand);
    const pw = `${words[rand[0] % words.length]}-${words[rand[1] % words.length]}-${words[rand[2] % words.length]}-${(rand[3] % 900) + 100}!`;
    setNewPassword(pw);
    setConfirmPassword(pw);
    setShowPassword(true);
    setPasswordError(null);
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteToken || savingPassword) return;
    setPasswordError(null);

    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters long (NIST SP 800-63B).');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.');
      return;
    }

    setSavingPassword(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/invite/${encodeURIComponent(inviteToken)}/set-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPasswordError(data.error || 'Password did not meet NIST SP 800-63B security requirements.');
        return;
      }

      if (data.token && data.user) {
        await login(data.token, data.user);
      }
      setStep('SECURITY');
    } catch (err: any) {
      setPasswordError(err?.message || 'Failed to save password.');
    } finally {
      setSavingPassword(false);
    }
  };

  const handleEnrollPasskey = async () => {
    const activeEmail = user?.email || inviteInfo?.email;
    if (!activeEmail || !sessionToken) return;
    setRegisteringPasskey(true);
    setPasskeyMessage(null);
    try {
      await registerPasskey({
        email: activeEmail,
        label: passkeyLabel.trim() || 'Mobile / Device Passkey',
        token: sessionToken,
      });
      setPasskeyEnrolled(true);
      setPasskeyMessage('✓ Biometric / FIDO2 Passkey registered!');
      updateCurrentUser({ passkeyCount: (user?.passkeyCount || 0) + 1 });
    } catch (err: any) {
      setPasskeyMessage(`⚠️ ${err?.message || 'Passkey enrollment cancelled or failed.'}`);
    } finally {
      setRegisteringPasskey(false);
    }
  };

  const handleInitTotp = async () => {
    if (!sessionToken) return;
    setTotpBusy(true);
    setTotpError(null);
    try {
      const data = await setupTotp(sessionToken);
      setTotpSecret(data.secret);
      setTotpUri(data.otpauthUri);
      setTotpCode('');
    } catch (err: any) {
      setTotpError(err?.message || 'Could not initialize 2FA.');
    } finally {
      setTotpBusy(false);
    }
  };

  const handleConfirmTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionToken || totpCode.length !== 6) return;
    setTotpBusy(true);
    setTotpError(null);
    try {
      const res = await verifyTotpSetup(sessionToken, totpCode);
      setTotpEnrolled(true);
      setTotpSecret(null);
      setTotpUri(null);
      setRecoveryCodes(res.recoveryCodes);
      updateCurrentUser({ totpEnabled: true, recoveryCodesRemaining: res.recoveryCodes.length });
    } catch (err: any) {
      setTotpError(err?.message || 'Invalid 6-digit verification code.');
    } finally {
      setTotpBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-md-surface p-6">
        <div className="w-12 h-12 border-4 border-md-primary border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-xs font-semibold uppercase tracking-widest text-md-on-surface-variant">
          Verifying Security Invitation...
        </p>
      </div>
    );
  }

  if (inviteError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-md-surface p-4">
        <div className="max-w-md w-full m3-card-elevated rounded-[32px] p-8 border border-md-outline-variant/40 text-center space-y-5">
          <div className="w-14 h-14 rounded-2xl bg-md-error-container text-md-on-error-container flex items-center justify-center mx-auto">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-bold text-md-on-surface">Invitation Link Expired or Used</h1>
          <p className="text-xs text-md-on-surface-variant leading-relaxed">{inviteError}</p>
          <Button variant="primary" className="w-full" onClick={() => navigate('/login')}>
            Go to Verdant Login
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-md-surface p-4 py-10">
      <div className="max-w-lg w-full m3-card-elevated rounded-[36px] p-6 sm:p-8 border border-md-outline-variant/40 space-y-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-md-primary-container text-md-on-primary-container flex items-center justify-center shrink-0">
            <Logo className="w-7 h-7" />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-md-primary">
              Verdant Botanical Systems · Security Onboarding
            </span>
            <h1 className="text-xl font-bold text-md-on-surface tracking-tight">
              Welcome, {inviteInfo?.name}
            </h1>
            <p className="text-xs text-md-on-surface-variant">{inviteInfo?.email}</p>
          </div>
        </div>

        {/* Step Indicator */}
        <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-md-surface-container-high border border-md-outline-variant/30 text-xs font-bold">
          <div
            className={`py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 ${
              step === 'PASSWORD'
                ? 'bg-md-primary text-md-on-primary shadow-sm'
                : 'text-emerald-600 dark:text-emerald-400'
            }`}
          >
            {step !== 'PASSWORD' ? <CheckCircle2 className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
            <span>1. NIST Password</span>
          </div>
          <div
            className={`py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 ${
              step === 'SECURITY'
                ? 'bg-md-primary text-md-on-primary shadow-sm'
                : 'text-md-on-surface-variant'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>2. 2FA &amp; Passkey</span>
          </div>
        </div>

        {/* STEP 1: NIST SP 800-63B PASSWORD CREATION */}
        {step === 'PASSWORD' && (
          <form onSubmit={handleSetPassword} className="space-y-4 animate-in fade-in">
            <div className="p-3.5 rounded-2xl bg-md-surface-container border border-md-outline-variant/30 flex items-center justify-between gap-2">
              <span className="text-xs text-md-on-surface-variant">
                Create your account password (screened against NIST SP 800-63B &amp; HIBP breach databases).
              </span>
              <button
                type="button"
                onClick={generateBotanicalPassphrase}
                className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold bg-md-primary-container text-md-on-primary-container hover:opacity-90"
              >
                <Wand2 className="w-3.5 h-3.5" />
                <span>Suggest</span>
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-md-on-surface-variant mb-1">
                  New Password (min. 8 characters, 15+ recommended)
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter strong password or passphrase..."
                    required
                    className="w-full h-12 bg-md-surface-container-high border border-md-outline-variant/50 rounded-2xl pl-4 pr-11 text-sm font-medium text-md-on-surface outline-none focus:ring-2 focus:ring-md-primary/30"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-md-on-surface-variant hover:text-md-on-surface"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-md-on-surface-variant mb-1">
                  Confirm Password
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm your password..."
                  required
                  className="w-full h-12 bg-md-surface-container-high border border-md-outline-variant/50 rounded-2xl px-4 text-sm font-medium text-md-on-surface outline-none focus:ring-2 focus:ring-md-primary/30"
                />
              </div>
            </div>

            <NistPasswordMeter password={newPassword} email={inviteInfo?.email} name={inviteInfo?.name} />

            {passwordError && (
              <div className="p-3 rounded-2xl bg-md-error-container text-md-on-error-container text-xs font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{passwordError}</span>
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              className="w-full h-12"
              isLoading={savingPassword}
              disabled={savingPassword || newPassword.length < 8}
            >
              <span>Save Password &amp; Continue to 2FA / Passkey</span>
              <ArrowRight className="w-4 h-4" />
            </Button>
          </form>
        )}

        {/* STEP 2: 2FA (TOTP) & FIDO2 PASSKEY ENROLLMENT */}
        {step === 'SECURITY' && (
          <div className="space-y-5 animate-in fade-in">
            <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Your Argon2id password is saved! Next, enable a Passkey or 6-digit 2FA app below.</span>
            </div>

            {/* Option A: FIDO2 Passkey (FaceID / TouchID / Fingerprint / YubiKey) */}
            <div className="p-4 rounded-2xl bg-md-surface-container border border-md-outline-variant/40 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-md-primary-container text-md-on-primary-container flex items-center justify-center shrink-0">
                    <Fingerprint className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-md-on-surface">
                      FIDO2 Passkey (FaceID / TouchID / Security Key)
                    </h3>
                    <p className="text-[11px] text-md-on-surface-variant">
                      Sign in instantly with your phone biometrics without typing a password.
                    </p>
                  </div>
                </div>
                {passkeyEnrolled && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                    Enrolled
                  </span>
                )}
              </div>

              {webAuthnAvailable ? (
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={passkeyLabel}
                    onChange={(e) => setPasskeyLabel(e.target.value)}
                    placeholder="Device name (e.g. iPhone FaceID)"
                    className="flex-1 h-10 bg-md-surface-container-high border border-md-outline-variant/50 rounded-xl px-3 text-xs text-md-on-surface outline-none"
                  />
                  <Button
                    type="button"
                    variant={passkeyEnrolled ? 'tonal' : 'primary'}
                    size="sm"
                    onClick={handleEnrollPasskey}
                    isLoading={registeringPasskey}
                  >
                    <Fingerprint className="w-4 h-4" />
                    <span>{passkeyEnrolled ? 'Add Another Passkey' : 'Register Passkey'}</span>
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Passkeys require HTTPS or a WebAuthn-compatible browser.
                </p>
              )}

              {passkeyMessage && (
                <p className="text-xs font-semibold text-md-primary">{passkeyMessage}</p>
              )}
            </div>

            {/* Option B: 6-Digit Authenticator App (TOTP 2FA) */}
            <div className="p-4 rounded-2xl bg-md-surface-container border border-md-outline-variant/40 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-md-secondary-container text-md-on-secondary-container flex items-center justify-center shrink-0">
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-md-on-surface">
                      Two-Factor Authenticator App (TOTP 2FA)
                    </h3>
                    <p className="text-[11px] text-md-on-surface-variant">
                      Google Authenticator, Apple Passwords, Authy, 1Password, or Bitwarden.
                    </p>
                  </div>
                </div>
                {totpEnrolled ? (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                    Active
                  </span>
                ) : (
                  !totpSecret && (
                    <Button
                      type="button"
                      variant="tonal"
                      size="sm"
                      onClick={handleInitTotp}
                      isLoading={totpBusy}
                    >
                      Set Up 2FA
                    </Button>
                  )
                )}
              </div>

              {totpSecret && (
                <form onSubmit={handleConfirmTotp} className="space-y-3 pt-1">
                  <div className="p-3 rounded-xl bg-md-surface border border-md-outline-variant/40 space-y-1.5">
                    <p className="text-[11px] font-semibold text-md-on-surface-variant">
                      Copy this secret key into your Authenticator app (or tap the link on mobile):
                    </p>
                    <code className="block p-2 rounded-lg bg-md-surface-container-high font-mono text-xs font-bold tracking-widest select-all break-all text-md-primary">
                      {totpSecret}
                    </code>
                    {totpUri && (
                      <a
                        href={totpUri}
                        className="inline-block text-[11px] font-bold text-emerald-600 dark:text-emerald-400 underline pt-1"
                      >
                        Open in Authenticator App on this phone →
                      </a>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="6-digit code"
                      className="flex-1 h-10 bg-md-surface-container-high border border-md-outline-variant/50 rounded-xl px-3 font-mono text-sm font-bold tracking-widest text-md-on-surface outline-none"
                    />
                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      disabled={totpBusy || totpCode.length !== 6}
                    >
                      Verify 2FA
                    </Button>
                  </div>
                </form>
              )}

              {totpError && (
                <p className="text-xs font-semibold text-rose-500">{totpError}</p>
              )}

              {recoveryCodes && (
                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-800 dark:text-amber-300">
                      Save Your 8 Emergency Recovery Codes
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(recoveryCodes.join('\n'));
                        setCopiedRecovery(true);
                        setTimeout(() => setCopiedRecovery(false), 2500);
                      }}
                      className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 dark:text-amber-300 underline"
                    >
                      {copiedRecovery ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedRecovery ? 'Copied' : 'Copy All'}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    {recoveryCodes.map((c) => (
                      <code
                        key={c}
                        className="p-1.5 rounded-lg bg-md-surface text-center font-mono text-[11px] font-bold select-all"
                      >
                        {c}
                      </code>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <Button
              type="button"
              variant="primary"
              className="w-full h-12"
              onClick={() => navigate('/')}
            >
              <span>Complete Setup &amp; Enter Verdant</span>
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
