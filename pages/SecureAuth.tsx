import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Fingerprint, KeyRound, Lock, Smartphone, Terminal } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useSystem } from '../context/SystemContext';
import { Logo } from '../components/ui/Logo';
import { Button } from '../components/ui/Button';
import { LanguageSelector } from '../components/ui/LanguageSelector';
import { ThemeToggle } from '../components/ThemeToggle';
import {
  isWebAuthnSupported,
  getWebAuthnStatus,
  authenticateWithPasskey,
  loginWithPassword,
  WebAuthnStatus,
} from '../services/webauthn';

export const SecureAuth: React.FC = () => {
  const { login, user, loading: authLoading } = useAuth();
  const { t } = useLanguage();
  const { showNotification } = useSystem();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [requireFido2, setRequireFido2] = useState(false);
  const [totpStep, setTotpStep] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [status, setStatus] = useState<WebAuthnStatus | null>(null);
  const webAuthnSupported = isWebAuthnSupported();

  useEffect(() => {
    if (!authLoading && user) {
      navigate('/');
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    getWebAuthnStatus()
      .then((s) => setStatus(s))
      .catch(() => {});
  }, []);

  const mapAuthError = (err: any): string => {
    const msg = err?.message || String(err);
    if (err?.name === 'NotAllowedError') return 'Passkey prompt was cancelled or timed out.';
    if (msg === 'USER_NOT_FOUND') return t('msg_access_denied');
    if (msg === 'ACCESS_EXPIRED') return t('msg_access_expired');
    if (msg === 'INVALID_CREDENTIALS') return 'Invalid email or password.';
    if (msg === 'INVALID_TOTP_CODE') return 'Invalid 6-digit authenticator code.';
    if (msg === 'INVALID_RECOVERY_CODE') return 'Invalid or already used recovery code.';
    if (msg === 'PASSWORD_NOT_SET') return 'No password configured for this account. Ask an administrator or run scripts/change-password.sh on the host.';
    if (msg === 'NO_PASSKEY_REGISTERED') return 'No passkey enrolled for this account. Sign in with your password first and add a passkey in Admin > Security.';
    return msg || 'PROTOCOL_FAULT';
  };

  const completeLogin = async (result: { token: string; user: any }) => {
    await login(result.token, result.user);
    const userName = typeof result.user.name === 'object' ? (result.user.name as any)?.en : result.user.name;
    showNotification(`WELCOME ${(userName || result.user.email).toUpperCase()}`, 'SUCCESS');
    navigate('/');
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setAuthError('Please enter your email and password.');
      return;
    }
    setLoading(true);
    setAuthError(null);
    try {
      const result = await loginWithPassword({
        email: email.trim().toLowerCase(),
        password,
        requireFido2: requireFido2 && webAuthnSupported,
        totpCode: totpStep && !useRecoveryCode ? totpCode : undefined,
        recoveryCode: totpStep && useRecoveryCode ? recoveryCode : undefined,
      });
      if (result.totpRequired) {
        setTotpStep(true);
        setAuthError(null);
        return;
      }
      if (result.token && result.user) {
        await completeLogin({ token: result.token, user: result.user });
      }
    } catch (err: any) {
      setAuthError(mapAuthError(err));
      showNotification('AUTHENTICATION FAILED', 'ERROR');
    } finally {
      setLoading(false);
    }
  };

  const handlePasskeyLogin = async (useEmail: boolean) => {
    setLoading(true);
    setAuthError(null);
    try {
      const targetEmail = useEmail ? email.trim().toLowerCase() : undefined;
      if (useEmail && !targetEmail) {
        setAuthError('Please enter your email address.');
        setLoading(false);
        return;
      }
      const result = await authenticateWithPasskey(targetEmail);
      await completeLogin(result);
    } catch (e: any) {
      setAuthError(mapAuthError(e));
      showNotification('AUTHENTICATION FAILED', 'ERROR');
    } finally {
      setLoading(false);
    }
  };

  const serviceLinks = [
    { name: 'Gemini 3', url: 'https://deepmind.google/technologies/gemini/' },
    { name: 'Pl@ntNet', url: 'https://plantnet.org/' },
    { name: 'Trefle', url: 'https://trefle.io/' },
    { name: 'OPB', url: 'https://open.plantbook.io/login/' },
    { name: 'Serper', url: 'https://serper.dev/' },
  ];

  return (
    <div className="min-h-screen w-full flex flex-col bg-md-surface text-md-on-surface items-center justify-start md:justify-center p-6 font-sans relative overflow-y-auto transition-colors duration-300">
      <div className="absolute top-[-10%] left-[-10%] w-[45%] h-[45%] bg-md-primary-container/30 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[45%] h-[45%] bg-md-tertiary-container/25 blur-[120px] rounded-full pointer-events-none" />

      <div className="absolute top-[calc(1rem+env(safe-area-inset-top))] right-[calc(1rem+env(safe-area-inset-right))] md:top-8 md:right-8 z-20 flex items-center gap-2">
        <ThemeToggle />
        <LanguageSelector variant="filled" align="right" />
      </div>

      <div className="max-w-md w-full z-10 space-y-6 py-12 md:py-0">
        <div className="m3-card-elevated rounded-[28px] border border-md-outline-variant/40 p-7 md:p-9 space-y-6 relative overflow-hidden">
          <div className="text-center space-y-3">
            <div className="mx-auto h-16 w-16 rounded-2xl bg-md-primary-container text-md-on-primary-container p-2.5 flex items-center justify-center shadow-sm">
              <Logo className="w-full h-full" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-md-on-surface tracking-tight">
                Verdant
              </h2>
              <p className="text-xs font-medium text-md-on-surface-variant mt-1">
                Argon2id + FIDO2 Security
              </p>
            </div>
          </div>

          <div className="py-3 px-4 rounded-2xl bg-md-surface-container text-center space-y-1">
            <p className="text-sm leading-relaxed text-md-on-surface font-medium italic">
              "{t('genesis_quote')}"
            </p>
            <p className="text-[11px] text-md-primary font-semibold tracking-wide">{t('genesis_ref')}</p>
          </div>

          {status && !status.hasUsers && (
            <div className="p-4 bg-amber-100/70 dark:bg-amber-950/50 border border-amber-500/30 rounded-2xl text-left space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-800 dark:text-amber-300">
                <Terminal className="w-4 h-4" />
                Server Initialization Required
              </div>
              <p className="text-xs text-md-on-surface-variant leading-relaxed">
                No administrator account exists yet. Preset the Owner account on your Proxmox/Linux host:
              </p>
              <code className="block p-2.5 rounded-xl bg-md-surface-container-lowest text-md-primary text-xs font-mono border border-md-outline-variant/30">
                ./scripts/change-password.sh
              </code>
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="w-10 h-10 border-4 border-md-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-xs font-semibold text-md-primary tracking-wide animate-pulse">
                {t('sys_handshake')}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <form onSubmit={handlePasswordLogin} className="space-y-3.5">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (totpStep) {
                      setTotpStep(false);
                      setUseRecoveryCode(false);
                      setTotpCode('');
                      setRecoveryCode('');
                    }
                  }}
                  placeholder="personnel@domain.com"
                  className="w-full h-13 bg-md-surface-container-highest text-md-on-surface placeholder:text-md-on-surface-variant/70 rounded-2xl px-4 text-sm font-medium outline-none border border-md-outline/40 focus:border-md-primary focus:ring-2 focus:ring-md-primary/20 transition-all"
                />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (totpStep) {
                      setTotpStep(false);
                      setUseRecoveryCode(false);
                      setTotpCode('');
                      setRecoveryCode('');
                    }
                  }}
                  placeholder="Password (Argon2id)"
                  className="w-full h-13 bg-md-surface-container-highest text-md-on-surface placeholder:text-md-on-surface-variant/70 rounded-2xl px-4 text-sm font-medium outline-none border border-md-outline/40 focus:border-md-primary focus:ring-2 focus:ring-md-primary/20 transition-all"
                />
                {totpStep && (
                  <div className="p-4 rounded-2xl bg-md-primary-container/40 border border-md-primary/30 space-y-2.5 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-md-on-primary-container">
                        <Smartphone className="w-4 h-4" />
                        {useRecoveryCode ? 'One-Time Recovery Code' : '2FA Authenticator Code'}
                      </span>
                      <button
                        type="button"
                        onClick={() => { setUseRecoveryCode(!useRecoveryCode); setAuthError(null); }}
                        className="text-xs font-semibold text-md-primary hover:underline"
                      >
                        {useRecoveryCode ? 'Use 6-digit TOTP' : 'Use Recovery Code'}
                      </button>
                    </div>
                    {useRecoveryCode ? (
                      <input
                        type="text"
                        required
                        value={recoveryCode}
                        onChange={(e) => setRecoveryCode(e.target.value)}
                        placeholder="XXXX-XXXX"
                        className="w-full h-12 bg-md-surface-container-lowest text-md-on-surface rounded-xl px-4 text-sm font-mono font-semibold tracking-widest outline-none border border-md-outline/40 focus:border-md-primary"
                      />
                    ) : (
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]{6}"
                        maxLength={6}
                        required
                        value={totpCode}
                        onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="000000"
                        className="w-full h-12 bg-md-surface-container-lowest text-md-on-surface rounded-xl px-4 text-center text-lg font-mono font-bold tracking-[0.4em] outline-none border border-md-outline/40 focus:border-md-primary"
                      />
                    )}
                  </div>
                )}
                {webAuthnSupported && !totpStep && (
                  <label className="flex items-center gap-2.5 text-xs font-medium text-md-on-surface-variant cursor-pointer px-1">
                    <input
                      type="checkbox"
                      checked={requireFido2}
                      onChange={(e) => setRequireFido2(e.target.checked)}
                      className="w-4 h-4 rounded accent-md-primary"
                    />
                    Require FIDO2 2nd Factor
                  </label>
                )}
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  className="w-full"
                >
                  <Lock className="w-4 h-4" />
                  {totpStep ? 'Verify 2FA & Sign In' : 'Sign In with Password'}
                </Button>
              </form>

              {webAuthnSupported && (
                <>
                  <div className="relative flex items-center py-1">
                    <div className="flex-grow border-t border-md-outline-variant/50" />
                    <span className="flex-shrink mx-3 text-xs font-medium text-md-on-surface-variant">
                      Or FIDO2 Passkey
                    </span>
                    <div className="flex-grow border-t border-md-outline-variant/50" />
                  </div>

                  <div className="grid grid-cols-1 gap-2.5">
                    <Button
                      type="button"
                      variant="tonal"
                      size="lg"
                      onClick={() => handlePasskeyLogin(false)}
                      className="w-full"
                    >
                      <Fingerprint className="w-4 h-4" />
                      Sign in with Passkey
                    </Button>
                    {email.trim() && (
                      <Button
                        type="button"
                        variant="outlined"
                        size="md"
                        onClick={() => handlePasskeyLogin(true)}
                        className="w-full"
                      >
                        <KeyRound className="w-4 h-4" />
                        Verify Security Key for {email.trim()}
                      </Button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {authError && (
            <div className="p-4 bg-md-error-container text-md-on-error-container rounded-2xl text-center">
              <p className="text-xs font-semibold leading-relaxed">
                {authError}
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-4 pt-1">
          {serviceLinks.map((link) => (
            <a
              key={link.name}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-md-on-surface-variant hover:text-md-primary transition-colors"
            >
              {link.name}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
};
