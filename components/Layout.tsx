import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useSystem } from '../context/SystemContext';
import { usePlants } from '../context/PlantContext';
import { Logo } from './ui/Logo';
import { LanguageSelector } from './ui/LanguageSelector';
import { AddPlantModal } from './AddPlantModal';
import { QrScannerModal } from './QrScannerModal';
import { generatePlantDetails } from '../services/plantAi';
import { Button } from './ui/Button';

const NotificationToast: React.FC = () => {
  const { notification, clearNotification } = useSystem();
  if (!notification) return null;

  const typeStyles = {
    SUCCESS: 'bg-emerald-500 text-white',
    ERROR: 'bg-red-500 text-white',
    WARNING: 'bg-amber-500 text-white',
    INFO: 'bg-blue-600 text-white'
  };

  const icons = {
    SUCCESS: '✓',
    ERROR: '✕',
    WARNING: '⚠',
    INFO: 'ℹ'
  };

  return (
    <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[1000] animate-in slide-in-from-top-4 duration-500">
      <div className={`${typeStyles[notification.type]} px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 backdrop-blur-md bg-opacity-90 border border-white/20`}>
        <span className="font-black text-sm">{icons[notification.type]}</span>
        <p className="text-[10px] font-black uppercase tracking-widest whitespace-nowrap">{notification.message}</p>
        <button onClick={clearNotification} className="ml-2 opacity-50 hover:opacity-100 font-bold border border-white/20 rounded-full w-6 h-6 flex items-center justify-center">✕</button>
      </div>
    </div>
  );
};

const QuotaBar: React.FC = () => {
  const { rpm, limit, status } = useSystem();
  const { isSynced } = usePlants();
  const { t } = useLanguage();
  
  const percentage = Math.min(100, (rpm / limit) * 100);
  
  const barColor = 
    status === 'COOLDOWN' ? 'bg-red-500' : 
    status === 'BUSY' ? 'bg-amber-500' : 
    'bg-emerald-500';

  const textColor = 
    status === 'COOLDOWN' ? 'text-red-500' : 
    status === 'BUSY' ? 'text-amber-500' : 
    'text-emerald-500';

  return (
    <div className="px-6 py-4 border-t border-gray-100 dark:border-slate-800 space-y-4">
      <div className="space-y-2">
        <div className="flex justify-between items-center">
            <span className="text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">{t('sys_uplink')}</span>
            <span className={`text-[8px] font-black uppercase tracking-tighter ${textColor}`}>
            {status === 'COOLDOWN' ? t('sys_cooldown') : status === 'BUSY' ? t('sys_busy') : t('sys_stable')}
            </span>
        </div>
        <div className="h-1.5 w-full bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div 
            className={`h-full transition-all duration-1000 ${barColor}`} 
            style={{ width: `${percentage}%` }}
            />
        </div>
      </div>
      
      <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
              <div className={`w-1.5 h-1.5 rounded-full ${isSynced ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse' : 'bg-gray-300'}`}></div>
              <span className="text-[8px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">{t('sys_db_link')}</span>
          </div>
          <span className="text-[7px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tighter">
            {isSynced ? t('sys_proxmox_online') : t('sys_local_cache')}
          </span>
      </div>
    </div>
  );
};

const ThemeToggle: React.FC = () => {
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));

  const toggleTheme = () => {
    const newDark = !isDark;
    setIsDark(newDark);
    if (newDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('verdant-theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('verdant-theme', 'light');
    }
  };

  return (
    <button 
      onClick={toggleTheme}
      className="p-3 text-slate-500 dark:text-slate-400 hover:text-amber-500 dark:hover:text-amber-400 transition-all active:scale-90 border border-gray-100 dark:border-slate-800 rounded-xl"
      title="Toggle Appearance"
    >
      {isDark ? (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
        </svg>
      ) : (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      )}
    </button>
  );
};

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { logout, user, can } = useAuth();
  const { alertMessage, setAlertMessage, searchFilter, setSearchFilter, addPlant, getEffectiveApiKey } = usePlants();
  const { t, lv } = useLanguage();
  const { showNotification } = useSystem();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showInstallBtn, setShowInstallBtn] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const handleScanSuccess = async (data: string) => {
    setIsScannerOpen(false);
    const parts = data.split('|');
    if (parts.length >= 3) {
      const [sourceHouse, sourceId, species, family] = parts;
      setIsSyncing(true);
      showNotification("SYNCING SPECIMEN...", "INFO");
      try {
        const details = await generatePlantDetails(species, undefined, undefined, getEffectiveApiKey());
        const syncedPlant = {
          ...details,
          id: `p-synced-${Date.now()}`,
          species: species,
          family: family || details.family,
          houseId: user?.houseId || null, 
          createdAt: new Date().toISOString(),
          nickname: details.nickname || { en: species },
          images: details.images?.length ? details.images : ['https://images.unsplash.com/photo-1545239351-ef35f43d514b?q=80&w=1000&auto=format&fit=crop'],
          edible: details.edible || false,
          logs: []
        };
        await addPlant(syncedPlant as any);
        showNotification("SYNC SUCCESS", "SUCCESS");
      } catch (err) {
        showNotification("SYNC FAILED", "ERROR");
      } finally {
        setIsSyncing(false);
      }
    } else {
      showNotification("INVALID SYNC ID", "WARNING");
    }
  };

  useEffect(() => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
    if (isStandalone) {
      setShowInstallBtn(false);
      return;
    }

    const handlePromptAvailable = () => setShowInstallBtn(true);
    const handleInstalled = () => setShowInstallBtn(false);

    window.addEventListener('pwa-prompt-available', handlePromptAvailable);
    window.addEventListener('pwa-installed', handleInstalled);
    
    if ((window as any).deferredPwaPrompt) setShowInstallBtn(true);

    return () => {
      window.removeEventListener('pwa-prompt-available', handlePromptAvailable);
      window.removeEventListener('pwa-installed', handleInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    const promptEvent = (window as any).deferredPwaPrompt;
    if (!promptEvent) return;
    
    promptEvent.prompt();
    await promptEvent.userChoice;
    (window as any).deferredPwaPrompt = null;
    setShowInstallBtn(false);
  };

  const navItems = [
    { to: '/', label: t('menu_my_plants'), icon: '🌿' },
    { to: '/care', label: t('menu_care'), icon: '💧' },
    { to: '/tasks', label: t('menu_tasks'), icon: '📋' },
    { to: '/inventory', label: t('menu_inventory'), icon: '📦' },
    { to: '/labels', label: t('menu_labels'), icon: '🏷️' },
    { to: '/locations', label: t('stats_locations'), icon: '📍' },
  ];

  const isManager = ['OWNER', 'CO_CEO', 'LEAD_HAND'].includes(user?.role || '');
  if (isManager) {
    navItems.push({ to: '/admin', label: t('menu_admin'), icon: '⚙️' });
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950 flex transition-colors duration-500 overflow-hidden">
      <NotificationToast />
      {alertMessage && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-[200] bg-emerald-500 text-emerald-900 text-sm font-bold px-4 py-2 rounded-lg shadow-lg animate-in fade-in slide-in-from-bottom-4">
          {alertMessage}
        </div>
      )}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <aside className={`fixed lg:static inset-y-0 left-0 w-72 bg-white dark:bg-slate-900 border-r border-gray-100 dark:border-slate-800 z-50 transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 transition-transform duration-300 flex flex-col no-print`}>
        <AddPlantModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} onSave={addPlant} />
        <QrScannerModal isOpen={isScannerOpen} onClose={() => setIsScannerOpen(false)} onScanSuccess={handleScanSuccess} />

        <div className="p-8 pb-4">
          <Link to="/" className="flex items-center gap-4 group" onClick={() => setIsSidebarOpen(false)}>
            <div className="w-10 h-10 group-hover:scale-110 transition-transform duration-500">
                <Logo />
            </div>
            <h1 className="text-2xl font-black text-gray-900 dark:text-white tracking-tighter uppercase">{t('app_name')}</h1>
          </Link>
        </div>

        <nav className="flex-1 px-4 space-y-1 overflow-y-auto no-scrollbar pb-6">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setIsSidebarOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.1em] transition-all ${
                location.pathname === item.to 
                  ? 'bg-verdant text-white shadow-lg shadow-verdant/20' 
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <span className="text-base opacity-80">{item.icon}</span>
              {item.label}
            </Link>
          ))}

          {showInstallBtn && (
            <div className="px-2 pt-6">
              <button
                onClick={handleInstallClick}
                className="w-full flex flex-col items-center justify-center p-6 rounded-[32px] bg-blue-600 hover:bg-blue-700 text-white shadow-2xl shadow-blue-500/30 transition-all active:scale-95 group relative overflow-hidden border border-blue-400/50"
              >
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:rotate-12 transition-transform">
                   <svg className="w-12 h-12" fill="currentColor" viewBox="0 0 24 24"><path d="M19h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
                </div>
                <span className="text-2xl mb-2">📲</span>
                <span className="text-[10px] font-black uppercase tracking-[0.3em] leading-none mb-1">{t('sys_install_app')}</span>
                <span className="text-[7px] font-bold uppercase tracking-widest opacity-60">{t('sys_ready_standalone')}</span>
              </button>
            </div>
          )}
        </nav>

        <div className="mt-auto">
          <QuotaBar />
          <div className="p-6 border-t border-gray-100 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between px-2">
                <LanguageSelector direction="up" />
                <div className="flex items-center gap-1">
                    <ThemeToggle />
                    <button 
                      onClick={logout}
                      className="p-3 text-slate-500 dark:text-slate-400 hover:text-red-500 transition-all active:scale-90 border border-gray-100 dark:border-slate-800 rounded-xl"
                      title={t('menu_sign_out')}
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                      </svg>
                    </button>
                </div>
            </div>
            {user && (
                <div className="flex items-center gap-3 px-2">
                    <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-slate-800 flex items-center justify-center text-xs font-black text-slate-500 dark:text-slate-400 uppercase border border-gray-200 dark:border-slate-700">
                        {(lv(user.name) || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                        <p className="text-[10px] font-black text-gray-900 dark:text-white truncate uppercase tracking-tighter">{lv(user.name) || 'Anonymous'}</p>
                        <p className="text-[8px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">{t('role_' + user.role.toLowerCase())}</p>
                    </div>
                </div>
            )}
            <div className="px-2 pt-2 opacity-30">
               <a 
                 href="https://creativecommons.org/licenses/by-nc/4.0/" 
                 target="_blank" 
                 rel="noopener noreferrer"
                 className="text-[7px] font-bold text-slate-400 uppercase tracking-[0.2em] hover:text-emerald-500 transition-colors"
               >
                 Licensed under CC BY-NC 4.0
               </a>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col relative h-screen overflow-hidden bg-gray-50 dark:bg-slate-950 print:h-auto print:overflow-visible">
        <header className="h-16 md:h-20 bg-white dark:bg-slate-900 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between px-4 md:px-8 shrink-0 z-30 no-print gap-4">
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="lg:hidden p-2 text-gray-600 dark:text-slate-400 border border-gray-100 dark:border-slate-800 rounded-lg"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          
          <div className="flex-1 max-w-2xl relative group">
                <input 
                    type="text"
                    placeholder={t('search_placeholder') || "Search plants, inventory, tasks..."}
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    className="w-full h-10 md:h-12 pl-10 pr-12 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-xl md:rounded-2xl font-bold text-xs md:text-sm focus:ring-4 focus:ring-verdant/10 outline-none transition-all dark:text-white"
                />
                <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                
                {can('create_plants') && (
                    <button 
                        onClick={() => setIsScannerOpen(true)}
                        disabled={isSyncing}
                        className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 md:w-10 md:h-10 flex items-center justify-center text-slate-400 dark:text-slate-500 hover:text-verdant transition-all border border-gray-100 dark:border-slate-700 rounded-lg"
                        title={t('scan_sync')}
                    >
                        {isSyncing ? (
                            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h2M4 8h16M4 16h16M4 20h4M4 4h4m12 0h4M4 4v4m0 12v4m16-16v4m0 12v4" />
                            </svg>
                        )}
                    </button>
                )}
          </div>

          <div className="flex items-center gap-2 md:gap-4">
              {can('create_plants') && (
                  <Button className="shadow-xl shadow-verdant/20 h-10 md:h-12 px-3 md:px-6 rounded-xl md:rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-2 text-[10px] md:text-xs" onClick={() => setIsAddModalOpen(true)}>
                      <span className="text-lg md:text-xl">+</span>
                      <span className="hidden md:inline">{t('btn_add_plant')}</span>
                      <span className="md:hidden text-xl">🪴</span>
                  </Button>
              )}
              <div className="hidden md:block w-8 h-8">
                <Logo />
              </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto no-scrollbar pb-[env(safe-area-inset-bottom,4rem)] print:pb-0 print:overflow-visible">
            <div className="max-w-7xl mx-auto">
              {children}
            </div>
        </div>
      </main>
    </div>
  );
};