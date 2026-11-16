import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Fingerprint, KeyRound, ShieldCheck, UserPlus, AlertTriangle } from 'lucide-react';
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
  WebAuthnStatus,
} from '../services/webauthn';

export const SecureAuth: React.FC = () => {
  const { login, user, loading: authLoading } = useAuth();
  const { t } = useLanguage();
  const { showNotification } = useSystem();
  const navigate = useNavigate();

  const [mode, setMode] = useState<'LOGIN' | 'ENROLL'>('LOGIN');
  const [email, setEmail] = useState('');
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

  // Check server WebAuthn status on mount
  useEffect(() => {
    getWebAuthnStatus()
      .then((s) => {
        setStatus(s);
        if (!s.hasCredentials) {
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
    if (msg === 'NO_PASSKEY_REGISTERED') return 'No passkey enrolled for this account yet. Switch to "Enroll Passkey" below.';
    if (msg === 'CREDENTIAL_ALREADY_REGISTERED') return 'This account already has a passkey enrolled. Sign in with your existing passkey to add another.';
    return msg || 'PROTOCOL_FAULT';
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
      await login(result.token, result.user);
      const userName = typeof result.user.name === 'object' ? (result.user.name as any)?.en : result.user.name;
      showNotification(`WELCOME ${(userName || result.user.email).toUpperCase()}`, 'SUCCESS');
      navigate('/');
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

  const handleEnrollPasskey = async (e: React.FormEvent) => {
    e.preventDefault();
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
      await login(result.token, result.user);
      showNotification('FIDO2 PASSKEY ENROLLED', 'SUCCESS');
      navigate('/');
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
        <div className="bg-white dark:bg-slate-900 border-2 border-emerald-500/30 rounded-[32px] md:rounded-[40px] shadow-xl dark:shadow-[0_0_100px_rgba(16,185,129,0.1)] p-8 md:p-10 space-y-7 relative overflow-hidden transition-all duration-700 hover:border-emerald-500/50">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-emerald-500 to-transparent"></div>

          <div className="text-center space-y-5">
            <div className="mx-auto h-20 w-20 drop-shadow-[0_0_15px_rgba(16,185,129,0.4)] hover:scale-110 transition-transform duration-500">
              <Logo />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white tracking-[0.15em] uppercase leading-none italic">
                Verdant
                <span className="text-[10px] md:text-xs font-black italic tracking-[0.2em] text-slate-400 dark:text-white/40 mt-2 block">
                  Self-Hosted FIDO2 / WebAuthn
                </span>
              </h2>
            </div>
          </div>

          {/* BIBLE VERSE SECTION */}
          <div className="relative py-3 px-4 text-center">
            <div className="absolute inset-0 bg-emerald-500/5 rounded-[24px] blur-xl"></div>
            <div className="relative">
              <p className="text-sm md:text-base leading-relaxed text-slate-700 dark:text-slate-100 font-medium italic mb-1.5 tracking-tight">
                "{t('genesis_quote')}"
              </p>
              <p className="text-[9px] text-emerald-600 dark:text-emerald-500 font-black uppercase tracking-[0.3em]">{t('genesis_ref')}</p>
            </div>
          </div>

          <div className="h-px w-full bg-gradient-to-r from-transparent via-slate-200 dark:via-slate-700 to-transparent"></div>

          {!webAuthnSupported ? (
            <div className="p-5 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-center space-y-2">
              <AlertTriangle className="w-6 h-6 text-amber-500 mx-auto" />
              <p className="text-xs font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest">
                WebAuthn Unavailable
              </p>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                FIDO2 passkeys require a secure context (HTTPS or localhost) and a modern browser.
              </p>
            </div>
          ) : loading ? (
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
                  <Fingerprint className="w-3.5 h-3.5" />
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
                  Enroll Key
                </button>
              </div>

              {mode === 'LOGIN' ? (
                <div className="space-y-4">
                  <Button
                    type="button"
                    onClick={() => handlePasskeyLogin(false)}
                    className="w-full h-14 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase tracking-widest text-xs shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-3"
                  >
                    <Fingerprint className="w-5 h-5" />
                    Sign in with Passkey
                  </Button>

                  <div className="relative flex items-center py-1">
                    <div className="flex-grow border-t border-slate-200 dark:border-slate-800"></div>
                    <span className="flex-shrink mx-3 text-[9px] font-black uppercase tracking-widest text-slate-400">
                      Or use account email
                    </span>
                    <div className="flex-grow border-t border-slate-200 dark:border-slate-800"></div>
                  </div>

                  <div className="space-y-3">
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="personnel@domain.com"
                      className="w-full h-12 bg-slate-50 dark:bg-slate-800 rounded-xl px-4 text-sm font-bold outline-none border border-slate-200 dark:border-slate-700 dark:text-white focus:ring-2 focus:ring-emerald-500/30"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => handlePasskeyLogin(true)}
                      className="w-full h-11 rounded-xl border border-slate-200 dark:border-slate-700 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2"
                    >
                      <KeyRound className="w-4 h-4 text-emerald-500" />
                      Verify with Security Key
                    </Button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleEnrollPasskey} className="space-y-3.5">
                  {status && !status.hasCredentials && (
                    <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-[10px] font-bold text-emerald-700 dark:text-emerald-400 leading-relaxed">
                      First-time setup: Enroll a passkey or FIDO2 hardware key to initialize your Owner account.
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
                      className="w-full h-12 bg-slate-50 dark:bg-slate-800 rounded-xl px-4 text-sm font-bold outline-none border border-slate-200 dark:border-slate-700 dark:text-white focus:ring-2 focus:ring-emerald-500/30"
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
                        className="w-full h-12 bg-slate-50 dark:bg-slate-800 rounded-xl px-4 text-sm font-bold outline-none border border-slate-200 dark:border-slate-700 dark:text-white focus:ring-2 focus:ring-emerald-500/30"
                      />
                    </div>
                  )}
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 block">
                      Device / Key Label (Optional)
                    </label>
                    <input
                      type="text"
                      value={deviceLabel}
                      onChange={(e) => setDeviceLabel(e.target.value)}
                      placeholder="e.g. MacBook TouchID, YubiKey 5"
                      className="w-full h-12 bg-slate-50 dark:bg-slate-800 rounded-xl px-4 text-sm font-bold outline-none border border-slate-200 dark:border-slate-700 dark:text-white focus:ring-2 focus:ring-emerald-500/30"
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full h-13 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase tracking-widest text-xs shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 mt-2"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    Enroll FIDO2 Passkey
                  </Button>
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
