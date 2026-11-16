import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Fingerprint, KeyRound, ShieldCheck, UserPlus, Lock } from 'lucide-react';
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
  registerPasskey,
  loginWithPassword,
  setupPassword,
  WebAuthnStatus,
} from '../services/webauthn';

export const SecureAuth: React.FC = () => {
  const { login, user, loading: authLoading } = useAuth();
  const { t } = useLanguage();
  const { showNotification } = useSystem();
  const navigate = useNavigate();

  const [mode, setMode] = useState<'LOGIN' | 'ENROLL'>('LOGIN');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [requireFido2, setRequireFido2] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [deviceLabel, setDeviceLabel] = useState('');
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [status, setStatus] = useState<WebAuthnStatus | null>(null);
  const webAuthnSupported = isWebAuthnSupported();

  // Redirect if already authenticated
  useEffect(() => {
    if (!authLoading && user) {
      navigate('/');
    }
  }, [user, authLoading, navigate]);

  // Check server auth status on mount
  useEffect(() => {
    getWebAuthnStatus()
      .then((s) => {
        setStatus(s);
        if (!s.hasCredentials && !s.hasPasswords) {
          setMode('ENROLL');
          const rootEmail = (window as any)._ENV_?.ROOT_OWNER_EMAIL || import.meta.env.VITE_ROOT_OWNER_EMAIL || '';
          if (rootEmail) setEmail(rootEmail);
        }
      })
      .catch(() => {
        // Ignore transient status fetch errors
      });
  }, []);

  const mapAuthError = (err: any): string => {
    const msg = err?.message || String(err);
    if (err?.name === 'NotAllowedError') return 'Passkey prompt was cancelled or timed out.';
    if (msg === 'USER_NOT_FOUND') return t('msg_access_denied');
    if (msg === 'ACCESS_EXPIRED') return t('msg_access_expired');
    if (msg === 'INVALID_CREDENTIALS') return 'Invalid email or password.';
    if (msg === 'PASSWORD_TOO_SHORT') return 'Password must be at least 10 characters.';
    if (msg === 'PASSWORD_NOT_SET') return 'No password set for this account yet. Use "Setup / Enroll" to set one.';
    if (msg === 'PASSWORD_ALREADY_SET') return 'Password is already configured. Sign in to change it in Admin > Security.';
    if (msg === 'NO_PASSKEY_REGISTERED') return 'No passkey enrolled for this account yet. Use "Setup / Enroll" below.';
    if (msg === 'CREDENTIAL_ALREADY_REGISTERED') return 'This account already has a passkey enrolled. Sign in first to add another.';
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
      });
      await completeLogin(result);
    } catch (err: any) {
      const friendly = mapAuthError(err);
      setAuthError(friendly);
      if (err?.message === 'PASSWORD_NOT_SET') {
        setMode('ENROLL');
      }
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
      const friendly = mapAuthError(e);
      setAuthError(friendly);
      if (e?.message === 'NO_PASSKEY_REGISTERED') {
        setMode('ENROLL');
      }
      showNotification('AUTHENTICATION FAILED', 'ERROR');
    } finally {
      setLoading(false);
    }
  };

  const handleSetupPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setAuthError('Please enter your email address.');
      return;
    }
    if (password.length < 10) {
      setAuthError('Password must be at least 10 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setAuthError('Passwords do not match.');
      return;
    }
    setLoading(true);
    setAuthError(null);
    try {
      const result = await setupPassword({
        email: email.trim().toLowerCase(),
        password,
        name: displayName.trim() || undefined,
      });
      await completeLogin(result);
    } catch (err: any) {
      setAuthError(mapAuthError(err));
      showNotification('SETUP FAILED', 'ERROR');
    } finally {
      setLoading(false);
    }
  };

  const handleEnrollPasskey = async () => {
    if (!email.trim()) {
      setAuthError('Please enter your registered email address.');
      return;
    }
    setLoading(true);
    setAuthError(null);
    try {
      const result = await registerPasskey({
        email: email.trim().toLowerCase(),
        name: displayName.trim() || undefined,
        label: deviceLabel.trim() || undefined,
      });
      await completeLogin(result);
    } catch (err: any) {
      setAuthError(mapAuthError(err));
      showNotification('ENROLLMENT FAILED', 'ERROR');
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

      {/* Theme and Language Selectors Overlay */}
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

          {/* BIBLE VERSE SECTION */}
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

          {loading ? (
            <div className="flex flex-col items-center gap-4 py-6">
              <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-[10px] font-black text-emerald-600 dark:text-emerald-500 uppercase tracking-widest animate-pulse">
                {t('sys_handshake')}
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Mode Switcher */}
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-slate-800/70 rounded-2xl">
                <button
                  type="button"
                  onClick={() => { setMode('LOGIN'); setAuthError(null); }}
                  className={`py-2.5 px-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 ${
                    mode === 'LOGIN'
                      ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
                  }`}
                >
                  <Lock className="w-3.5 h-3.5" />
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => { setMode('ENROLL'); setAuthError(null); }}
                  className={`py-2.5 px-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 ${
                    mode === 'ENROLL'
                      ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
                  }`}
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  Setup / Enroll
                </button>
              </div>

              {mode === 'LOGIN' ? (
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
                    {webAuthnSupported && (
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
                      Sign In with Password
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
              ) : (
                <form onSubmit={handleSetupPassword} className="space-y-3">
                  {status && !status.hasPasswords && !status.hasCredentials && (
                    <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-[10px] font-bold text-emerald-700 dark:text-emerald-400 leading-relaxed">
                      First-time setup: Initialize your Owner account with an Argon2id password or FIDO2 passkey.
                    </div>
                  )}
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 block">
                      Authorized Email
                    </label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@domain.com"
                      className="w-full h-11 bg-slate-50 dark:bg-slate-800 rounded-xl px-4 text-sm font-bold outline-none border border-slate-200 dark:border-slate-700 dark:text-white focus:ring-2 focus:ring-emerald-500/30"
                    />
                  </div>
                  {status && !status.hasUsers && (
                    <div>
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 block">
                        Display Name
                      </label>
                      <input
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="System Founder"
                        className="w-full h-11 bg-slate-50 dark:bg-slate-800 rounded-xl px-4 text-sm font-bold outline-none border border-slate-200 dark:border-slate-700 dark:text-white focus:ring-2 focus:ring-emerald-500/30"
                      />
                    </div>
                  )}
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 block">
                      New Password (min 10 chars, Argon2id)
                    </label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••"
                      className="w-full h-11 bg-slate-50 dark:bg-slate-800 rounded-xl px-4 text-sm font-bold outline-none border border-slate-200 dark:border-slate-700 dark:text-white focus:ring-2 focus:ring-emerald-500/30"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 block">
                      Confirm Password
                    </label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••••"
                      className="w-full h-11 bg-slate-50 dark:bg-slate-800 rounded-xl px-4 text-sm font-bold outline-none border border-slate-200 dark:border-slate-700 dark:text-white focus:ring-2 focus:ring-emerald-500/30"
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase tracking-widest text-xs shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    Set Argon2id Password
                  </Button>

                  {webAuthnSupported && (
                    <>
                      <div className="relative flex items-center py-1">
                        <div className="flex-grow border-t border-slate-200 dark:border-slate-800"></div>
                        <span className="flex-shrink mx-3 text-[9px] font-black uppercase tracking-widest text-slate-400">
                          Or Enroll FIDO2 Key
                        </span>
                        <div className="flex-grow border-t border-slate-200 dark:border-slate-800"></div>
                      </div>
                      <input
                        type="text"
                        value={deviceLabel}
                        onChange={(e) => setDeviceLabel(e.target.value)}
                        placeholder="Key label (e.g. MacBook TouchID, YubiKey 5)"
                        className="w-full h-11 bg-slate-50 dark:bg-slate-800 rounded-xl px-4 text-sm font-bold outline-none border border-slate-200 dark:border-slate-700 dark:text-white focus:ring-2 focus:ring-emerald-500/30"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={handleEnrollPasskey}
                        className="w-full h-11 rounded-xl border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2"
                      >
                        <Fingerprint className="w-4 h-4" />
                        Enroll FIDO2 Passkey
                      </Button>
                    </>
                  )}
                </form>
              )}
            </div>
          )}

          {authError && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-center space-y-1.5">
              <p className="text-[10px] font-black text-red-500 uppercase tracking-widest leading-relaxed">
                {authError}
              </p>
              {authError === t('msg_access_denied') && (
                <p className="text-[9px] text-gray-500 dark:text-gray-400 font-bold uppercase tracking-tight italic leading-relaxed">
                  {t('msg_invite_required')}
                </p>
              )}
            </div>
          )}
        </div>

        {/* ORCHESTRATION LINKS FOOTER */}
        <div className="text-center space-y-6">
          <div className="flex flex-col items-center gap-2">
            <p className="text-[8px] text-slate-400 dark:text-slate-500 font-black uppercase tracking-[0.4em]">System Orchestration</p>
            <p className="text-[7px] text-emerald-600/40 dark:text-emerald-500/30 font-black uppercase tracking-[0.2em]">Verdant Protocol v1.0</p>
          </div>
          <div className="flex flex-wrap justify-center items-center gap-x-8 gap-y-4 px-4">
            {serviceLinks.map((link) => (
              <a
                key={link.name}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-500 transition-all hover:scale-110"
              >
                {link.name}
              </a>
            ))}
          </div>
          <div className="h-px w-12 bg-slate-200 dark:bg-slate-700 mx-auto opacity-40"></div>
          <p className="text-[9px] text-slate-400 dark:text-slate-500 font-black uppercase tracking-[0.5em] opacity-40">© 2026 VERDANT BOTANICAL SYSTEMS</p>
          <p className="text-[9px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-[0.15em] opacity-70 max-w-[300px] mx-auto leading-relaxed">
            Creative Commons Attribution-NonCommercial 4.0 International Public License
          </p>
        </div>
      </div>
    </div>
  );
};
