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
    <div className="min-h-screen w-full flex flex-col bg-white dark:bg-slate-950 items-center justify-start md:justify-center p-6 font-sans relative overflow-y-auto transition-colors duration-500">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-500/5 blur-[120px] rounded-full pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/5 blur-[120px] rounded-full pointer-events-none"></div>

      <div className="absolute top-[calc(1rem+env(safe-area-inset-top))] right-[calc(1rem+env(safe-area-inset-right))] md:top-8 md:right-8 z-20 flex items-center gap-3">
        <ThemeToggle />
        <LanguageSelector variant="filled" align="right" />
      </div>

      <div className="max-w-md w-full z-10 space-y-8 md:space-y-10 py-12 md:py-0">
        <div className="bg-white dark:bg-slate-900 border-2 border-emerald-500/30 rounded-[32px] md:rounded-[40px] shadow-xl dark:shadow-[0_0_100px_rgba(16,185,129,0.1)] p-8 md:p-10 space-y-6 relative overflow-hidden transition-all duration-700 hover:border-emerald-500/50">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-emerald-500 to-transparent"></div>

          <div className="text-center space-y-4">
            <div className="mx-auto h-20 w-20 drop-shadow-[0_0_15px_rgba(16,185,129,0.4)] hover:scale-110 transition-transform duration-500">
              <Logo />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white tracking-[0.15em] uppercase leading-none italic">
                Verdant
                <span className="text-[10px] md:text-xs font-black italic tracking-[0.2em] text-slate-400 dark:text-white/40 mt-2 block">
                  Argon2id + FIDO2 Security
                </span>
              </h2>
            </div>
          </div>

          <div className="relative py-2.5 px-4 text-center">
            <div className="absolute inset-0 bg-emerald-500/5 rounded-[24px] blur-xl"></div>
            <div className="relative">
              <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-100 font-medium italic mb-1 tracking-tight">
                "{t('genesis_quote')}"
              </p>
              <p className="text-[9px] text-emerald-600 dark:text-emerald-500 font-black uppercase tracking-[0.3em]">{t('genesis_ref')}</p>
            </div>
          </div>

          <div className="h-px w-full bg-gradient-to-r from-transparent via-slate-200 dark:via-slate-700 to-transparent"></div>

          {status && !status.hasUsers && (
            <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-left space-y-1.5">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-400">
                <Terminal className="w-3.5 h-3.5" />
                Server Initialization Required
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                No administrator account exists yet. Preset the Owner account on your Proxmox/Linux host:
              </p>
              <code className="block p-2 rounded-lg bg-slate-900 text-emerald-400 text-[10px] font-mono">
                ./scripts/change-password.sh
              </code>
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center gap-4 py-6">
              <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-[10px] font-black text-emerald-600 dark:text-emerald-500 uppercase tracking-widest animate-pulse">
                {t('sys_handshake')}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <form onSubmit={handlePasswordLogin} className="space-y-3">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="personnel@domain.com"
                  className="w-full h-12 bg-slate-50 dark:bg-slate-800 rounded-xl px-4 text-sm font-bold outline-none border border-slate-200 dark:border-slate-700 dark:text-white focus:ring-2 focus:ring-emerald-500/30"
                />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password (Argon2id)"
                  className="w-full h-12 bg-slate-50 dark:bg-slate-800 rounded-xl px-4 text-sm font-bold outline-none border border-slate-200 dark:border-slate-700 dark:text-white focus:ring-2 focus:ring-emerald-500/30"
                />
                {totpStep && (
                  <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-2.5 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
                        <Smartphone className="w-3.5 h-3.5" />
                        {useRecoveryCode ? 'One-Time Recovery Code' : '2FA Authenticator Code'}
                      </span>
                      <button
                        type="button"
                        onClick={() => { setUseRecoveryCode(!useRecoveryCode); setAuthError(null); }}
                        className="text-[9px] font-black uppercase tracking-widest text-slate-500 hover:text-emerald-600 underline"
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
                        className="w-full h-11 bg-white dark:bg-slate-900 rounded-xl px-4 text-sm font-mono font-bold tracking-widest outline-none border border-emerald-500/30 dark:text-white"
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
                        className="w-full h-11 bg-white dark:bg-slate-900 rounded-xl px-4 text-center text-lg font-mono font-black tracking-[0.4em] outline-none border border-emerald-500/30 dark:text-white"
                      />
                    )}
                  </div>
                )}
                {webAuthnSupported && !totpStep && (
                  <label className="flex items-center gap-2 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer px-1">
                    <input
                      type="checkbox"
                      checked={requireFido2}
                      onChange={(e) => setRequireFido2(e.target.checked)}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    Require FIDO2 2nd Factor
                  </label>
                )}
                <Button
                  type="submit"
                  className="w-full h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase tracking-widest text-xs shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2"
                >
                  <Lock className="w-4 h-4" />
                  {totpStep ? 'Verify 2FA & Sign In' : 'Sign In with Password'}
                </Button>
              </form>

              {webAuthnSupported && (
                <>
                  <div className="relative flex items-center py-1">
                    <div className="flex-grow border-t border-slate-200 dark:border-slate-800"></div>
                    <span className="flex-shrink mx-3 text-[9px] font-black uppercase tracking-widest text-slate-400">
                      Or FIDO2 Passkey
                    </span>
                    <div className="flex-grow border-t border-slate-200 dark:border-slate-800"></div>
                  </div>

                  <div className="grid grid-cols-1 gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => handlePasskeyLogin(false)}
                      className="w-full h-11 rounded-xl border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2"
                    >
                      <Fingerprint className="w-4 h-4" />
                      Sign in with Passkey
                    </Button>
                    {email.trim() && (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => handlePasskeyLogin(true)}
                        className="w-full h-10 rounded-xl border border-slate-200 dark:border-slate-700 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2"
                      >
                        <KeyRound className="w-3.5 h-3.5 text-emerald-500" />
                        Verify Security Key for {email.trim()}
                      </Button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {authError && (
            <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-center">
              <p className="text-[10px] font-black text-rose-600 dark:text-rose-400 uppercase tracking-widest leading-relaxed">
                {authError}
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-4 pt-2 opacity-60">
          {serviceLinks.map((link) => (
            <a
              key={link.name}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-emerald-500 transition-colors"
            >
              {link.name}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
};
