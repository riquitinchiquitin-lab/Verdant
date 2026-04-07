import React, { useState, useRef, useEffect, memo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { usePersonnel } from '../context/PersonnelContext';
import { useSystem } from '../context/SystemContext';
import { API_URL, getGoogleClientId } from '../constants';
import { Logo } from '../components/ui/Logo';
import { Button } from '../components/ui/Button';
import { LanguageSelector } from '../components/ui/LanguageSelector';

import { ThemeToggle } from '../components/ThemeToggle';

declare global {
  interface Window {
    google: any;
    __VERDANT_SYSTEM_HIT: (isError?: boolean) => void;
  }
}

const ROOT_OWNER_EMAIL = import.meta.env.VITE_ROOT_OWNER_EMAIL || "riquitin.chiquitin@gmail.com";

// Refined Google Button to resolve double-click issues and handle React 19 lifecycles
const GoogleLoginButton = memo(({ onResponse, isDarkMode, language }: { onResponse: (resp: any) => void, isDarkMode: boolean, language: string }) => {
    const btnRef = useRef<HTMLDivElement>(null);
    const initialized = useRef(false);
    const responseRef = useRef(onResponse);
    
    // Keep the response ref up to date without re-triggering initialization
    useEffect(() => {
        responseRef.current = onResponse;
    }, [onResponse]);

    useEffect(() => {
        const handleResponse = (resp: any) => {
            responseRef.current(resp);
        };

        const initGsi = () => {
            const clientId = getGoogleClientId();
            if (clientId === 'MISSING_CLIENT_ID') return;
            
            if (window.google?.accounts?.id && btnRef.current) {
                try {
                    // Always initialize if it's the first time or if we need to ensure it's set
                    window.google.accounts.id.initialize({
                        client_id: clientId,
                        callback: handleResponse,
                        auto_select: false,
                        use_fedcm_for_prompt: true,
                        itp_support: true,
                        locale: language
                    });
                    
                    // Always render the button to reflect theme/language changes
                    window.google.accounts.id.renderButton(btnRef.current, {
                        theme: isDarkMode ? 'filled_black' : 'outline',
                        size: 'large',
                        shape: 'pill',
                        width: '320',
                        text: 'signin_with'
                    });
                    
                    initialized.current = true;
                } catch (e) {
                    console.error("Verdant GSI Error:", e);
                }
            }
        };

        // Check immediately and then poll
        if (window.google?.accounts?.id) {
            initGsi();
        } else {
            const interval = setInterval(() => {
                if (window.google?.accounts?.id) {
                    initGsi();
                    clearInterval(interval);
                }
            }, 100);
            return () => clearInterval(interval);
        }
    }, [language, isDarkMode]);

    return (
        <div className="min-h-[44px] w-[320px] flex justify-center border border-dashed border-emerald-500/20 rounded-full">
            <div ref={btnRef} />
        </div>
    );
});

export const SecureAuth: React.FC = () => {
  const { login, user, loading: authLoading } = useAuth();
  const { t, language } = useLanguage();
  const { users } = usePersonnel(); 
  const { showNotification } = useSystem();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [configMissing, setConfigMissing] = useState(false);
  const [envLoaded, setEnvLoaded] = useState(false);

  // Redirect if already authenticated
  useEffect(() => {
    if (!authLoading && user) {
      navigate('/');
    }
  }, [user, authLoading, navigate]);
  
  const usersRef = useRef(users);
  useEffect(() => { usersRef.current = users; }, [users]);

  const [isDarkMode, setIsDarkMode] = useState(() => document.documentElement.classList.contains('dark'));

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDarkMode(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const checkConfig = () => {
      const clientId = getGoogleClientId();
      const isEnvAvailable = (window as any)._ENV_ !== undefined;
      setEnvLoaded(isEnvAvailable);

      if (clientId === 'MISSING_CLIENT_ID' || !clientId) {
        setConfigMissing(true);
        return false;
      } else {
        setConfigMissing(false);
        return true;
      }
    };

    // Initial check
    if (!checkConfig()) {
      // If missing, poll for a few seconds in case env-config.js is still loading
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        if (checkConfig() || attempts > 20) {
          clearInterval(interval);
        }
      }, 500);
      return () => clearInterval(interval);
    }
  }, []);

  const handleCredentialResponse = useCallback(async (response: any) => {
    setLoading(true);
    setAuthError(null);
    
    try {
      const base64Url = response.credential.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
          return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));

      const payload = JSON.parse(jsonPayload);
      const email = payload.email.toLowerCase();
      
      if (email === ROOT_OWNER_EMAIL) {
        login(response.credential, {
          id: payload.sub,
          email: payload.email,
          name: payload.name || 'System Founder',
          role: 'OWNER', 
          houseId: null
        });
        showNotification("FOUNDER AUTHENTICATED", "SUCCESS");
        navigate('/');
        return;
      }

      // NEW: Verify user via server endpoint instead of local list
      const verifyRes = await fetch(`${API_URL}/api/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      if (!verifyRes.ok) {
          setAuthError(t('msg_access_denied'));
          showNotification("ACCESS REJECTED", "ERROR");
          setLoading(false);
          return;
      }

      const existingRecord = await verifyRes.json();

      if (existingRecord.role === 'SEASONAL') {
        const now = new Date();
        const start = existingRecord.caretakerStart ? new Date(existingRecord.caretakerStart) : null;
        const end = existingRecord.caretakerEnd ? new Date(existingRecord.caretakerEnd) : null;
        
        if (start) start.setHours(0,0,0,0);
        if (end) end.setHours(23,59,59,999);

        if ((start && now < start) || (end && now > end)) {
          setAuthError(t('msg_access_expired'));
          showNotification("ACCESS EXPIRED", "ERROR");
          setLoading(false);
          return;
        }
      }

      login(response.credential, {
        id: existingRecord.id,
        email: payload.email,
        name: payload.name || existingRecord.name || 'Site Personnel',
        role: existingRecord.role, 
        houseId: existingRecord.houseId,
        personalAiKey: existingRecord.personalAiKey,
        personalAiKeyTestedAt: existingRecord.personalAiKeyTestedAt,
        caretakerStart: existingRecord.caretakerStart,
        caretakerEnd: existingRecord.caretakerEnd
      });

      showNotification(`WELCOME ${payload.name?.toUpperCase() || 'USER'}`, "SUCCESS");
      navigate('/');
    } catch (e) {
      console.error("Auth Exception:", e);
      setAuthError("PROTOCOL_FAULT");
      showNotification("PROTOCOL FAULT", "ERROR");
      setLoading(false);
    }
  }, [login, navigate, t, showNotification]);

  const serviceLinks = [
    { name: 'Gemini 3', url: 'https://deepmind.google/technologies/gemini/' },
    { name: 'Pl@ntNet', url: 'https://plantnet.org/' },
    { name: 'Trefle', url: 'https://trefle.io/' },
    { name: 'OPB', url: 'https://open.plantbook.io/login/' },
    { name: 'Serper', url: 'https://serper.dev/' }
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
        <div className="bg-white dark:bg-slate-900 border-2 border-emerald-500/30 rounded-[32px] md:rounded-[40px] shadow-xl dark:shadow-[0_0_100px_rgba(16,185,129,0.1)] p-8 md:p-12 space-y-8 md:space-y-12 relative overflow-hidden transition-all duration-700 hover:border-emerald-500/50">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-emerald-500 to-transparent"></div>
          
          <div className="text-center space-y-6 md:space-y-8">
            <div className="mx-auto h-20 w-20 md:h-24 md:w-24 drop-shadow-[0_0_15px_rgba(16,185,129,0.4)] hover:scale-110 transition-transform duration-500">
              <Logo />
            </div>
            <div className="space-y-3">
              <h2 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white tracking-[0.15em] uppercase leading-none italic">
                Verdant<br/>
                <span className="text-[10px] md:text-sm font-black italic tracking-[0.2em] md:tracking-[0.3em] text-slate-400 dark:text-white/40 mt-2 block">Multilingual Plant Management</span>
              </h2>
            </div>
          </div>

          {/* BIBLE VERSE SECTION */}
          <div className="relative py-3 px-4 md:py-4 md:px-6 text-center animate-in fade-in zoom-in-95 duration-1000 delay-300">
            <div className="absolute inset-0 bg-emerald-500/5 rounded-[24px] md:rounded-[32px] blur-xl"></div>
            <div className="relative">
              <span className="text-3xl md:text-4xl text-emerald-500/20 font-serif absolute -top-3 -left-1 md:-top-4 md:-left-2 italic">"</span>
              <p className="text-base md:text-lg leading-relaxed text-slate-700 dark:text-slate-100 font-medium italic mb-2 md:mb-3 tracking-tight">
                {t('genesis_quote')}
              </p>
              <p className="text-[9px] md:text-[10px] text-emerald-600 dark:text-emerald-500 font-black uppercase tracking-[0.3em] md:tracking-[0.5em]">{t('genesis_ref')}</p>
            </div>
          </div>

          <div className="h-px w-full bg-gradient-to-r from-transparent via-slate-200 dark:via-slate-700 to-transparent"></div>

          <div className="flex flex-col items-center gap-8 md:gap-10 min-h-[80px] md:min-h-[100px]">
            {configMissing ? (
              <div className="text-center space-y-6">
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed uppercase font-bold tracking-widest px-4">
                      {t('sys_config_desc')}
                  </p>
                  <div className="p-4 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-100 dark:border-white/5 font-mono text-[9px] text-emerald-600 dark:text-emerald-500 break-all space-y-1">
                      <div>ENV_SCRIPT: {envLoaded ? 'LOADED' : 'WAITING...'}</div>
                      <div>DETECTED_ID: {getGoogleClientId() || 'EMPTY_STRING'}</div>
                      {envLoaded && (window as any)._ENV_?._DIAGNOSTIC && (
                        <div className="mt-2 pt-2 border-t border-slate-200 dark:border-white/5 text-[7px] text-slate-400 dark:text-slate-500 space-y-0.5">
                          <div>CWD: {(window as any)._ENV_._DIAGNOSTIC.cwd}</div>
                          <div>ENV_FILE: {(window as any)._ENV_._DIAGNOSTIC.envExists ? 'FOUND' : 'NOT_FOUND'}</div>
                          <div>ENV_ID_PRESENT: {(window as any)._ENV_._DIAGNOSTIC.googleIdPresent ? 'YES' : 'NO'}</div>
                          <div className="mt-1 opacity-50">KEYS: {(window as any)._ENV_._DIAGNOSTIC.envKeys?.join(', ') || 'NONE'}</div>
                          <button 
                            onClick={() => window.location.reload()}
                            className="mt-2 w-full py-1 border border-emerald-500/20 rounded text-[6px] hover:bg-emerald-500/10 transition-colors"
                          >
                            FORCE_RELOAD
                          </button>
                        </div>
                      )}
                  </div>
                  <p className="text-[8px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-tight italic leading-relaxed px-4">
                      Note: Ensure your current URL ({window.location.origin}) is added to "Authorized JavaScript origins" in your Google Cloud Console.
                  </p>
                  <Button 
                    variant="ghost" 
                    className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-500"
                    onClick={() => window.location.reload()}
                  >
                    REFRESH_SYSTEM_CACHE
                  </Button>
              </div>
            ) : loading ? (
              <div className="flex flex-col items-center gap-4 py-4">
                <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-[10px] font-black text-emerald-600 dark:text-emerald-500 uppercase tracking-widest animate-pulse">{t('sys_handshake')}</p>
              </div>
            ) : (
              <div className="w-full flex flex-col items-center gap-6">
                <GoogleLoginButton onResponse={handleCredentialResponse} isDarkMode={isDarkMode} language={language} />
              </div>
            )}
          </div>

          {authError && (
            <div className="p-6 bg-red-500/10 border border-red-500/20 rounded-2xl text-center space-y-2 animate-bounce">
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

        {/* ORCHESTRATION LINKS FOOTER - RESTORED & UPDATED */}
        <div className="text-center space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-500">
          <div className="flex flex-col items-center gap-2">
            <p className="text-[8px] text-slate-400 dark:text-slate-500 font-black uppercase tracking-[0.4em]">System Orchestration</p>
            <p className="text-[7px] text-emerald-600/40 dark:text-emerald-500/30 font-black uppercase tracking-[0.2em]">Verdant Protocol v1.0</p>
          </div>
          <div className="flex flex-wrap justify-center items-center gap-x-8 gap-y-4 px-4">
            {serviceLinks.map(link => (
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
