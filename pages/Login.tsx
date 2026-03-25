import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { getGoogleClientId } from '../constants';
import { Logo } from '../components/ui/Logo';

declare global {
  interface Window {
    google: any;
  }
}

/**
 * VERDANT v0.9.0
 */
export const Login: React.FC = () => {
  const { login } = useAuth();
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const googleBtnRef = useRef<HTMLDivElement>(null);
  
  const isDarkMode = localStorage.getItem('verdant-theme') === 'dark';

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  useEffect(() => {
    const handleCredentialResponse = (response: any) => {
      setLoading(true);
      try {
        const base64Url = response.credential.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));

        const payload = JSON.parse(jsonPayload);
        
        login(response.credential, {
          id: payload.sub,
          email: payload.email,
          name: payload.name || 'Site Owner',
          role: 'OWNER', 
          houseId: null
        });

        navigate('/');
      } catch (e) {
        setAuthError("ENCRYPTED_HANDSHAKE_ERROR");
        setLoading(false);
      }
    };

    const getGoogleLocale = (lang: string) => {
      const mapping: Record<string, string> = {
        'en': 'en',
        'zh': 'zh-CN',
        'ja': 'ja',
        'ko': 'ko',
        'es': 'es',
        'fr': 'fr',
        'pt': 'pt-BR',
        'de': 'de',
        'id': 'id',
        'vi': 'vi',
        'tl': 'tl'
      };
      return mapping[lang] || 'en';
    };

    const initializeGoogle = () => {
      if (window.google && googleBtnRef.current) {
        console.log("[GSI] Initializing with locale:", getGoogleLocale(language));
        try {
          window.google.accounts.id.initialize({
            client_id: getGoogleClientId(),
            callback: handleCredentialResponse,
            auto_select: false,
            cancel_on_tap_outside: true,
            locale: getGoogleLocale(language)
          });
    
          window.google.accounts.id.renderButton(googleBtnRef.current, {
            theme: isDarkMode ? 'filled_black' : 'outline',
            size: 'large',
            shape: 'pill',
            width: '320',
            text: 'signin_with'
          });
        } catch (err) {
          console.error("GSI_INIT_FAULT", err);
        }
      } else {
        setTimeout(initializeGoogle, 500);
      }
    };

    initializeGoogle();
  }, [isDarkMode, login, navigate, language]);

  return (
    <div className="min-h-screen w-full flex flex-col bg-slate-100 dark:bg-[#020617] transition-all duration-1000 overflow-x-hidden overflow-y-auto">
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 md:px-6 md:py-12">
        
        <div className="max-w-md w-full bg-white/80 dark:bg-slate-900/80 backdrop-blur-3xl rounded-[48px] md:rounded-[64px] shadow-[0_80px_200px_-40px_rgba(0,0,0,0.15)] p-8 md:p-16 space-y-8 md:space-y-12 relative overflow-hidden border border-white dark:border-slate-800/50 animate-in fade-in zoom-in-95 duration-1000">
          
          <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500"></div>
          
          <div className="text-center space-y-6 md:space-y-10">
            <div className="mx-auto h-16 w-16 md:h-24 md:w-24 drop-shadow-2xl hover:scale-110 transition-transform duration-700">
              <Logo />
            </div>
            
            <div className="space-y-3 md:space-y-4">
              <h2 className="text-2xl md:text-4xl font-black text-slate-950 dark:text-white tracking-tighter uppercase leading-[0.8] flex flex-col items-center">
                <span className="opacity-40 text-sm md:text-xl tracking-[0.3em] mb-1 md:mb-2">{t('login_verdant')}</span>
                <span>{t('login_authentication')}</span>
              </h2>
              
              <div className="inline-flex items-center gap-2 px-3 py-1 md:px-4 md:py-1.5 bg-emerald-500/10 dark:bg-emerald-500/20 rounded-full border border-emerald-500/20">
                <span className="w-1 h-1 md:w-1.5 md:h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                <p className="text-[8px] md:text-[9px] text-emerald-600 dark:text-emerald-400 font-black uppercase tracking-[0.2em] md:tracking-[0.25em]">
                  {t('login_security_level')}
                </p>
              </div>
            </div>
          </div>

          <div className="h-px w-full bg-slate-200/50 dark:bg-slate-800"></div>

          <div className="space-y-8 md:space-y-14">
            <div className="text-center">
              <p className="text-[8px] md:text-[10px] font-black text-slate-400 dark:text-slate-600 uppercase tracking-[0.3em] md:tracking-[0.5em] mb-8 md:mb-12">
                {t('login_external_identity_provider')}
              </p>
              
              <div className="flex flex-col items-center min-h-[60px] md:min-h-[70px]">
                {loading ? (
                  <div className="flex flex-col items-center gap-4 md:gap-5 py-4 md:py-6">
                    <div className="w-10 h-10 md:w-12 md:h-12 border-[3px] md:border-[4px] border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-[8px] md:text-[10px] font-black text-emerald-500 uppercase tracking-[0.3em] md:tracking-[0.4em]">{t('login_handshake_protocol')}</p>
                  </div>
                ) : (
                  <div className="w-full flex justify-center transform hover:scale-[1.03] transition-all duration-300">
                    <div ref={googleBtnRef} />
                  </div>
                )}
              </div>
            </div>

            {authError && (
              <div className="p-4 md:p-5 bg-red-500/10 border border-red-500/20 rounded-2xl md:rounded-3xl text-center animate-bounce">
                <p className="text-[8px] md:text-[10px] font-black text-red-500 uppercase tracking-widest leading-relaxed">
                  {authError}
                </p>
              </div>
            )}
          </div>

          <div className="pt-8 md:pt-12 text-center grayscale opacity-30 border-t border-slate-100 dark:border-slate-800/50">
            <p className="text-[7px] md:text-[8px] text-slate-500 dark:text-slate-500 font-black uppercase tracking-[0.3em] md:tracking-[0.4em] mb-6 md:mb-8">
              {t('login_system_orchestration')}
            </p>
            <div className="flex flex-wrap justify-center items-center gap-x-6 md:gap-x-10 gap-y-4 md:gap-y-6">
                <span className="text-[8px] md:text-[9px] font-black uppercase tracking-[0.15em] md:tracking-[0.2em] text-slate-500">{t('login_gemini_3')}</span>
                <span className="text-[8px] md:text-[9px] font-black uppercase tracking-[0.15em] md:tracking-[0.2em] text-slate-500">{t('login_plantnet')}</span>
                <span className="text-[8px] md:text-[9px] font-black uppercase tracking-[0.15em] md:tracking-[0.2em] text-slate-500">{t('login_trefle')}</span>
                <span className="text-[8px] md:text-[9px] font-black uppercase tracking-[0.15em] md:tracking-[0.2em] text-slate-500">{t('login_opb')}</span>
            </div>
          </div>
        </div>
        
        <div className="mt-12 md:mt-20 max-w-sm mx-auto text-center px-6 md:px-10 animate-in fade-in slide-in-from-bottom-8 duration-1000">
          <p className="text-base md:text-lg leading-relaxed text-slate-400 dark:text-slate-500 font-medium italic mb-4 md:mb-5">
            "{t('genesis_quote')}"
          </p>
          <p className="text-[9px] md:text-[11px] text-emerald-600/50 dark:text-emerald-500/40 font-black uppercase tracking-[0.4em] md:tracking-[0.6em]">{t('genesis_ref')}</p>
          
          <div className="mt-16 md:mt-24 pt-8 md:pt-10 border-t border-slate-200 dark:border-slate-800 text-center opacity-30">
            <p className="text-[8px] md:text-[9px] text-slate-400 font-black uppercase tracking-[0.3em] md:tracking-[0.4em]">{t('login_copyright')}</p>
            <p className="text-[7px] md:text-[8px] text-slate-400 font-bold uppercase tracking-widest mt-3 md:mt-4">{t('login_autonomous_node')}</p>
          </div>
        </div>
      </div>
    </div>
  );
};